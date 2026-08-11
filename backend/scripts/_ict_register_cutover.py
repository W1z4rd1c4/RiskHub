"""Offline-only authorization window for the manifest-pinned ICT cutover (#53)."""

from __future__ import annotations

import hashlib
import json
import os
import stat
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any, Protocol, cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from app.core.activity_logger import log_activity
from app.models import (
    ActivityLog,
    ApprovalRequest,
    ApprovalScenario,
    ApprovalStatus,
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Department,
    GlobalConfig,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Risk,
    RiskAssetLink,
    RiskProcessLink,
    Role,
    Threat,
    ThreatRiskLink,
    User,
    Vendor,
    VendorContract,
    VendorRiskLink,
    VendorSubOutsourcing,
)
from app.models.activity_log import ActivityAction, ActivityEntityType

CUTOVER_AUTHORIZATION_REFERENCE = "#53"
CUTOVER_IMPORT_ACTOR_EMAIL = "risk.manager@riskhub.local"
CUTOVER_ACCOUNTABILITY_DEPARTMENT_CODE = "RISK"
CUTOVER_ACCOUNTABILITY_DEPARTMENT_NAME = "Risk Management"
CUTOVER_ACCOUNTABILITY_MAP_SCHEMA_VERSION = 2
CUTOVER_ACCOUNTABILITY_MAP_VERSION = "synthetic-demo-v2-2026-08-11"
CUTOVER_ACCOUNTABILITY_MAP_SHA256 = "56eadf535139ce38815f1448c87b03b17faa46c44bb0057f385b5f2373e50a5a"
CUTOVER_ACCOUNTABILITY_PROCESS_COUNT = 148
CUTOVER_ACCOUNTABILITY_ASSET_COUNT = 183
CUTOVER_SOURCE_MANIFEST_SHA256 = "f97b40d7e0483a347aa5ab36a170d9036ca91c3d7c273f6c1a615b808f945167"
CUTOVER_SOURCE_MANIFEST_VERSION = 1
CUTOVER_SOURCE_VERSION = "v6-2026-07-13"
CUTOVER_SYNTHETIC_ACCOUNTABILITY_RATIONALE = (
    "Synthetic demo accountability; not evidence of real Process or Asset ownership."
)
CUTOVER_SCENARIO_KEYS = (
    "protected_asset_edit",
    "protected_process_edit",
    "protected_vendor_edit",
)
ICT_REGISTER_RISK_PROCESS = "ICT registr"
ICT_REGISTER_RISK_CODES = tuple(f"RIZ-{index:03d}" for index in range(1, 9))
CUTOVER_COMPLETION_DESCRIPTION = "ICT Register cutover #53 completed with an immutable state digest"
CUTOVER_STATE_MODELS = (
    Vendor,
    VendorContract,
    VendorSubOutsourcing,
    Process,
    Asset,
    ProcessAssetLink,
    AssetAssetLink,
    AssetVendorLink,
    ProcessVendorLink,
    Threat,
    Risk,
    ThreatRiskLink,
    RiskAssetLink,
    RiskProcessLink,
    VendorRiskLink,
)


@dataclass(frozen=True, slots=True)
class CutoverTargetProfile:
    identities: dict[str, frozenset[tuple[object, ...]]]
    parameter_values: dict[str, str]
    fresh_parameter_values: dict[str, str]
    state_digest: str | None = None
    completion_digest: str | None = None
    completion_marker_present: bool = False
    accountability_map_digest: str | None = None
    completion_accountability_map_digest: str | None = None


def classify_cutover_target(
    actual: CutoverTargetProfile,
    expected: CutoverTargetProfile,
) -> str:
    """Accept only a pristine target or an exact prior cutover result."""
    is_empty = all(not identities for identities in actual.identities.values())
    is_fresh = (
        not actual.completion_marker_present
        and is_empty
        and all(
            actual.parameter_values.get(key, default) == default
            for key, default in expected.fresh_parameter_values.items()
        )
    )
    if is_fresh:
        return "fresh"
    if (
        actual.identities == expected.identities
        and actual.parameter_values == expected.parameter_values
        and actual.completion_marker_present
        and actual.state_digest is not None
        and actual.state_digest == actual.completion_digest
        and expected.accountability_map_digest is not None
        and actual.completion_accountability_map_digest == expected.accountability_map_digest
    ):
        return "exact"
    raise SystemExit(
        "ICT Register target is neither fresh nor an exact manifest match; " "reconcile drift before cutover"
    )


def _digest_value(value: object) -> object:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, dict):
        return {str(key): _digest_value(nested) for key, nested in sorted(value.items(), key=lambda item: str(item[0]))}
    if isinstance(value, list | tuple):
        return [_digest_value(nested) for nested in value]
    return value


async def cutover_state_digest(
    db: AsyncSession,
    *,
    parameter_keys: tuple[str, ...],
) -> str:
    """Hash every persisted field owned by the exact-manifest cutover."""
    state: dict[str, list[list[object]]] = {}
    for model in CUTOVER_STATE_MODELS:
        columns = tuple(model.__table__.columns)
        rows = (await db.execute(select(*columns))).all()
        normalized = [[_digest_value(value) for value in row] for row in rows]
        state[model.__tablename__] = sorted(
            normalized,
            key=lambda row: json.dumps(row, sort_keys=True, default=str),
        )

    config_columns = tuple(GlobalConfig.__table__.columns)
    config_rows = (await db.execute(select(*config_columns).where(GlobalConfig.key.in_(parameter_keys)))).all()
    state[GlobalConfig.__tablename__] = sorted(
        [[_digest_value(value) for value in row] for row in config_rows],
        key=lambda row: json.dumps(row, sort_keys=True, default=str),
    )

    scenario_columns = tuple(ApprovalScenario.__table__.columns)
    scenario_rows = (
        await db.execute(select(*scenario_columns).where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS)))
    ).all()
    state[ApprovalScenario.__tablename__] = sorted(
        [[_digest_value(value) for value in row] for row in scenario_rows],
        key=lambda row: json.dumps(row, sort_keys=True, default=str),
    )
    payload = json.dumps(state, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _load_cutover_completion_marker(
    db: AsyncSession,
) -> tuple[bool, str | None, str | None]:
    completion_log = (
        await db.execute(
            select(ActivityLog)
            .where(
                ActivityLog.entity_type == ActivityEntityType.CONFIG.value,
                ActivityLog.entity_name == "ICT Register cutover",
                ActivityLog.action == ActivityAction.UPDATE.value,
                ActivityLog.description == CUTOVER_COMPLETION_DESCRIPTION,
            )
            .order_by(ActivityLog.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if completion_log is None:
        return False, None, None
    changes = completion_log.changes
    if not isinstance(changes, dict):
        return True, None, None
    value_change = changes.get("value")
    if not isinstance(value_change, dict):
        return True, None, None
    marker = value_change.get("new")
    if not isinstance(marker, str):
        return True, None, None
    try:
        marker_payload = json.loads(marker)
    except json.JSONDecodeError:
        return True, None, None
    if not isinstance(marker_payload, dict):
        return True, None, None
    digest = marker_payload.get("state_sha256")
    map_digest = marker_payload.get("accountability_map_sha256")
    code_change = changes.get("code")
    if not isinstance(code_change, dict) or code_change.get("new") != map_digest:
        return True, None, None
    return (
        True,
        digest if isinstance(digest, str) else None,
        map_digest if isinstance(map_digest, str) else None,
    )


async def load_cutover_target_profile(
    db: AsyncSession,
    *,
    parameter_keys: tuple[str, ...],
) -> CutoverTargetProfile:
    """Read the complete persisted natural-key graph used by the one-shot cutover."""

    async def tuples(statement) -> frozenset[tuple[object, ...]]:
        return frozenset(tuple(row) for row in (await db.execute(statement)).all())

    process_key = (Process.l0_area, Process.l1_process, Process.l2_subprocess)
    identities = {
        "vendors": await tuples(select(Vendor.name)),
        "processes": await tuples(select(*process_key)),
        "assets": await tuples(select(Asset.name)),
        "contracts": await tuples(
            select(Vendor.name, VendorContract.contract_reference).join(Vendor, Vendor.id == VendorContract.vendor_id)
        ),
        "process_asset_links": await tuples(
            select(*process_key, Asset.name)
            .select_from(ProcessAssetLink)
            .join(Process, Process.id == ProcessAssetLink.process_id)
            .join(Asset, Asset.id == ProcessAssetLink.asset_id)
        ),
        "asset_asset_links": await tuples(select(AssetAssetLink.id)),
        "asset_vendor_links": await tuples(
            select(Asset.name, Vendor.name, AssetVendorLink.ict_service_code)
            .select_from(AssetVendorLink)
            .join(Asset, Asset.id == AssetVendorLink.asset_id)
            .join(Vendor, Vendor.id == AssetVendorLink.vendor_id)
        ),
        "process_vendor_links": await tuples(
            select(*process_key, Vendor.name)
            .select_from(ProcessVendorLink)
            .join(Process, Process.id == ProcessVendorLink.process_id)
            .join(Vendor, Vendor.id == ProcessVendorLink.vendor_id)
        ),
        "sub_outsourcing": await tuples(select(VendorSubOutsourcing.id)),
        "threats": await tuples(select(Threat.name)),
        "risks": await tuples(select(Risk.risk_id_code).where(Risk.risk_id_code.in_(ICT_REGISTER_RISK_CODES))),
        "threat_risk_links": await tuples(
            select(Threat.name, Risk.risk_id_code)
            .select_from(ThreatRiskLink)
            .join(Threat, Threat.id == ThreatRiskLink.threat_id)
            .join(Risk, Risk.id == ThreatRiskLink.risk_id)
            .where(Risk.process == ICT_REGISTER_RISK_PROCESS)
        ),
        "risk_asset_links": await tuples(
            select(Risk.risk_id_code, Asset.name)
            .select_from(RiskAssetLink)
            .join(Risk, Risk.id == RiskAssetLink.risk_id)
            .join(Asset, Asset.id == RiskAssetLink.asset_id)
            .where(Risk.process == ICT_REGISTER_RISK_PROCESS)
        ),
        "risk_process_links": await tuples(
            select(Risk.risk_id_code, *process_key)
            .select_from(RiskProcessLink)
            .join(Risk, Risk.id == RiskProcessLink.risk_id)
            .join(Process, Process.id == RiskProcessLink.process_id)
            .where(Risk.process == ICT_REGISTER_RISK_PROCESS)
        ),
        "risk_vendor_links": await tuples(
            select(Risk.risk_id_code, Vendor.name)
            .select_from(VendorRiskLink)
            .join(Risk, Risk.id == VendorRiskLink.risk_id)
            .join(Vendor, Vendor.id == VendorRiskLink.vendor_id)
            .where(Risk.process == ICT_REGISTER_RISK_PROCESS)
        ),
        "pending_approvals": await tuples(
            select(ApprovalRequest.id).where(
                ApprovalRequest.status.in_((ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED))
            )
        ),
    }
    parameter_rows = (
        await db.execute(select(GlobalConfig.key, GlobalConfig.value).where(GlobalConfig.key.in_(parameter_keys)))
    ).all()
    parameter_values = dict(cast(list[tuple[str, str]], parameter_rows))
    marker_present, completion_digest, completion_map_digest = await _load_cutover_completion_marker(db)
    return CutoverTargetProfile(
        identities=identities,
        parameter_values=parameter_values,
        fresh_parameter_values={},
        state_digest=await cutover_state_digest(
            db,
            parameter_keys=parameter_keys,
        ),
        completion_digest=completion_digest,
        completion_marker_present=marker_present,
        completion_accountability_map_digest=completion_map_digest,
    )


ProcessKey = tuple[str, str, str | None]
AssetKey = str


class AccountabilitySeed(Protocol):
    SRC: dict[str, list[dict[str, Any]]]


@dataclass(frozen=True, slots=True)
class ICTRegisterAccountabilityMap:
    digest: str
    synthetic_owner_email: str
    owning_department_code: str
    owning_department_name: str
    process_source_owners: dict[ProcessKey, str]
    asset_source_owners: dict[AssetKey, str]


@dataclass(frozen=True, slots=True)
class ResolvedICTRegisterAccountability:
    owner_user_id: int
    owning_department_id: int


def _normalize_l2(value: object) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def _normalize_source_owner(value: object) -> str:
    return " ".join(str(value).split()).casefold()


def _read_accountability_map(path: Path) -> bytes:
    try:
        descriptor = os.open(
            os.path.abspath(path),
            os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK,
        )
    except FileNotFoundError as exc:
        raise SystemExit(f"ICT Register accountability map not found: {path}") from exc
    except OSError as exc:
        raise SystemExit("ICT Register accountability map must be a non-symlink regular file") from exc
    file_stat = os.fstat(descriptor)
    if not stat.S_ISREG(file_stat.st_mode):
        os.close(descriptor)
        raise SystemExit("ICT Register accountability map must be a regular file")
    with os.fdopen(descriptor, "rb") as map_file:
        return map_file.read()


def load_ict_register_accountability_map(
    path: Path,
    *,
    seed: AccountabilitySeed,
    expected_digest: str,
    expected_process_count: int = CUTOVER_ACCOUNTABILITY_PROCESS_COUNT,
    expected_asset_count: int = CUTOVER_ACCOUNTABILITY_ASSET_COUNT,
) -> ICTRegisterAccountabilityMap:
    """Validate the explicit synthetic Process-and-Asset accountability sidecar."""
    contents = _read_accountability_map(path)
    digest = hashlib.sha256(contents).hexdigest()
    if digest != expected_digest:
        raise SystemExit("ICT Register accountability map SHA-256 does not match the authorized digest")
    try:
        document = json.loads(contents)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SystemExit("ICT Register accountability map is not valid UTF-8 JSON") from exc
    if not isinstance(document, dict):
        raise SystemExit("ICT Register accountability map root must be an object")
    expected_metadata = {
        "schema_version": CUTOVER_ACCOUNTABILITY_MAP_SCHEMA_VERSION,
        "mapping_version": CUTOVER_ACCOUNTABILITY_MAP_VERSION,
        "synthetic": True,
        "source_manifest_version": CUTOVER_SOURCE_MANIFEST_VERSION,
        "source_version": CUTOVER_SOURCE_VERSION,
        "source_manifest_sha256": CUTOVER_SOURCE_MANIFEST_SHA256,
        "authorization_reference": CUTOVER_AUTHORIZATION_REFERENCE,
        "rationale": CUTOVER_SYNTHETIC_ACCOUNTABILITY_RATIONALE,
    }
    metadata = document.get("metadata")
    if metadata != expected_metadata:
        if isinstance(metadata, dict) and (
            metadata.get("source_manifest_version") != CUTOVER_SOURCE_MANIFEST_VERSION
            or metadata.get("source_version") != CUTOVER_SOURCE_VERSION
            or metadata.get("source_manifest_sha256") != CUTOVER_SOURCE_MANIFEST_SHA256
        ):
            raise SystemExit("ICT Register accountability map source identity does not match the cutover manifest")
        raise SystemExit("ICT Register accountability map metadata does not match the authorized synthetic profile")
    expected_document_fields = {
        "metadata",
        "synthetic_owner_email",
        "owning_department",
        "processes",
        "assets",
    }
    if set(document) != expected_document_fields:
        raise SystemExit("ICT Register accountability map must contain Process and Asset assignments")
    if document.get("synthetic_owner_email") != CUTOVER_IMPORT_ACTOR_EMAIL:
        raise SystemExit("ICT Register accountability map must name the seeded Risk Manager")
    expected_department = {
        "code": CUTOVER_ACCOUNTABILITY_DEPARTMENT_CODE,
        "name": CUTOVER_ACCOUNTABILITY_DEPARTMENT_NAME,
    }
    if document.get("owning_department") != expected_department:
        raise SystemExit("ICT Register accountability map must name the Risk Management department")
    rows = document.get("processes")
    if not isinstance(rows, list):
        raise SystemExit("ICT Register accountability map processes must be an array")

    expected_source_owners: dict[ProcessKey, str] = {}
    for source_row in seed.SRC["processes"]:
        key = (
            str(source_row["l0"]),
            str(source_row["l1"]),
            _normalize_l2(source_row.get("l2")),
        )
        if key in expected_source_owners:
            raise SystemExit("Manifest source contains duplicate Process natural keys")
        expected_source_owners[key] = str(source_row.get("owner", ""))
    if len(expected_source_owners) != expected_process_count:
        raise SystemExit(f"Manifest source must contain exactly {expected_process_count} Process natural keys")

    source_owners: dict[ProcessKey, str] = {}
    expected_row_fields = {
        "l0",
        "l1",
        "l2",
        "source_owner",
        "process_owner_email",
        "owning_department_code",
        "owning_department_name",
    }
    for row in rows:
        if not isinstance(row, dict) or set(row) != expected_row_fields:
            raise SystemExit("Every Process accountability row must carry the complete explicit assignment")
        if not isinstance(row["l0"], str) or not isinstance(row["l1"], str):
            raise SystemExit("Every Process accountability row requires explicit text natural keys")
        key = (row["l0"], row["l1"], _normalize_l2(row["l2"]))
        if key in source_owners:
            raise SystemExit(f"Process accountability map contains duplicate natural key {key!r}")
        source_owner = row["source_owner"]
        if not isinstance(source_owner, str) or not source_owner.strip():
            raise SystemExit(f"Process accountability map has a blank source_owner for {key!r}")
        if (
            row["process_owner_email"] != CUTOVER_IMPORT_ACTOR_EMAIL
            or row["owning_department_code"] != CUTOVER_ACCOUNTABILITY_DEPARTMENT_CODE
            or row["owning_department_name"] != CUTOVER_ACCOUNTABILITY_DEPARTMENT_NAME
        ):
            raise SystemExit(f"Process accountability map row {key!r} does not carry the explicit synthetic identity")
        source_owners[key] = source_owner

    if len(source_owners) != expected_process_count:
        raise SystemExit(f"Process accountability map must contain exactly {expected_process_count} explicit rows")
    if set(source_owners) != set(expected_source_owners):
        raise SystemExit("Process accountability map must have exact Process natural-key set equality")
    for key, source_owner in source_owners.items():
        if _normalize_source_owner(source_owner) != _normalize_source_owner(expected_source_owners[key]):
            raise SystemExit(f"Process accountability map source_owner drift for {key!r}")

    asset_rows = document.get("assets")
    if not isinstance(asset_rows, list):
        raise SystemExit("ICT Register accountability map Assets must be an array")
    expected_asset_owners: dict[AssetKey, tuple[str, str]] = {}
    for source_row in seed.SRC["assets"]:
        asset_key = str(source_row["key"])
        if asset_key in expected_asset_owners:
            raise SystemExit("Manifest source contains duplicate Asset natural keys")
        expected_asset_owners[asset_key] = (
            str(source_row["display"]),
            str(source_row.get("owner", "")),
        )
    if len(expected_asset_owners) != expected_asset_count:
        raise SystemExit(f"Manifest source must contain exactly {expected_asset_count} Asset natural keys")

    asset_source_owners: dict[AssetKey, str] = {}
    expected_asset_row_fields = {
        "key",
        "display",
        "source_owner",
        "business_owner_email",
        "ict_owner_email",
        "owning_department_code",
        "owning_department_name",
    }
    for row in asset_rows:
        if not isinstance(row, dict) or set(row) != expected_asset_row_fields:
            raise SystemExit("Every Asset accountability row must carry the complete explicit assignment")
        asset_key = row["key"]
        if not isinstance(asset_key, str) or not asset_key.strip() or not isinstance(row["display"], str):
            raise SystemExit("Every Asset accountability row requires explicit text natural keys")
        if asset_key in asset_source_owners:
            raise SystemExit("ICT Register accountability map contains duplicate Asset natural key " f"{asset_key!r}")
        source_owner = row["source_owner"]
        if not isinstance(source_owner, str) or not source_owner.strip():
            raise SystemExit("ICT Register accountability map has a blank Asset source_owner for " f"{asset_key!r}")
        if (
            row["business_owner_email"] != CUTOVER_IMPORT_ACTOR_EMAIL
            or row["ict_owner_email"] != CUTOVER_IMPORT_ACTOR_EMAIL
            or row["owning_department_code"] != CUTOVER_ACCOUNTABILITY_DEPARTMENT_CODE
            or row["owning_department_name"] != CUTOVER_ACCOUNTABILITY_DEPARTMENT_NAME
        ):
            raise SystemExit(
                f"Asset accountability map row {asset_key!r} does not carry the explicit synthetic identity"
            )
        expected_asset = expected_asset_owners.get(asset_key)
        if expected_asset is None or row["display"] != expected_asset[0]:
            raise SystemExit("ICT Register accountability map must have exact Asset natural-key set equality")
        asset_source_owners[asset_key] = source_owner

    if len(asset_source_owners) != expected_asset_count:
        raise SystemExit(
            "ICT Register accountability map must contain exactly " f"{expected_asset_count} explicit Asset rows"
        )
    if set(asset_source_owners) != set(expected_asset_owners):
        raise SystemExit("ICT Register accountability map must have exact Asset natural-key set equality")
    for asset_key, source_owner in asset_source_owners.items():
        if _normalize_source_owner(source_owner) != _normalize_source_owner(expected_asset_owners[asset_key][1]):
            raise SystemExit(f"ICT Register accountability map Asset source_owner drift for {asset_key!r}")

    return ICTRegisterAccountabilityMap(
        digest=digest,
        synthetic_owner_email=CUTOVER_IMPORT_ACTOR_EMAIL,
        owning_department_code=CUTOVER_ACCOUNTABILITY_DEPARTMENT_CODE,
        owning_department_name=CUTOVER_ACCOUNTABILITY_DEPARTMENT_NAME,
        process_source_owners=source_owners,
        asset_source_owners=asset_source_owners,
    )


async def resolve_ict_register_accountability(
    db: AsyncSession,
    mapping: ICTRegisterAccountabilityMap,
) -> ResolvedICTRegisterAccountability:
    """Resolve the sidecar's stable identities to current database IDs."""
    owner = (
        await db.execute(
            select(User)
            .join(Role, Role.id == User.role_id)
            .options(contains_eager(User.role))
            .where(func.lower(User.email) == mapping.synthetic_owner_email)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if owner is None:
        raise SystemExit("ICT Register accountability map requires the seeded Risk Manager")
    if not owner.is_active or owner.role is None or not owner.role.is_active or owner.role.name != "risk_manager":
        raise SystemExit("Accountability owner must be the active non-admin seeded Risk Manager")
    department = (
        await db.execute(
            select(Department)
            .where(
                Department.code == mapping.owning_department_code,
                Department.name == mapping.owning_department_name,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if department is None:
        raise SystemExit("ICT Register accountability map requires the Risk Management department")
    if not department.is_active:
        raise SystemExit("ICT Register accountability map requires the active Risk Management department")
    if owner.department_id != department.id:
        raise SystemExit("Accountability owner must be assigned to the active Risk Management department")
    return ResolvedICTRegisterAccountability(
        owner_user_id=owner.id,
        owning_department_id=department.id,
    )


def apply_ict_register_accountability(
    seed: AccountabilitySeed,
    mapping: ICTRegisterAccountabilityMap,
    *,
    owner_user_id: int,
    owning_department_id: int,
) -> None:
    """Attach resolved canonical IDs to every manifest Process and Asset row."""
    for row in seed.SRC["processes"]:
        key = (str(row["l0"]), str(row["l1"]), _normalize_l2(row.get("l2")))
        if key not in mapping.process_source_owners:
            raise SystemExit(f"ICT Register accountability map is missing Process {key!r}")
        row["process_owner_user_id"] = owner_user_id
        row["owning_department_id"] = owning_department_id
    for row in seed.SRC["assets"]:
        asset_key = str(row["key"])
        if asset_key not in mapping.asset_source_owners:
            raise SystemExit(f"ICT Register accountability map is missing Asset {asset_key!r}")
        row["business_owner_user_id"] = owner_user_id
        row["ict_owner_user_id"] = owner_user_id
        row["owning_department_id"] = owning_department_id


@dataclass(frozen=True, slots=True)
class CutoverAuthorization:
    authorizer_email: str
    reference: str
    reason: str


@dataclass(frozen=True, slots=True)
class ScenarioSnapshot:
    display_name: str
    description: str
    requires_approval: bool
    approver_roles: tuple[str, ...]
    updated_at: datetime
    updated_by_id: int | None

    @classmethod
    def capture(cls, scenario: ApprovalScenario) -> ScenarioSnapshot:
        return cls(
            display_name=scenario.display_name,
            description=scenario.description,
            requires_approval=scenario.requires_approval,
            approver_roles=tuple(str(role) for role in scenario.approver_roles),
            updated_at=scenario.updated_at,
            updated_by_id=scenario.updated_by_id,
        )

    def restore(self, scenario: ApprovalScenario) -> None:
        scenario.display_name = self.display_name
        scenario.description = self.description
        scenario.requires_approval = self.requires_approval
        scenario.approver_roles = list(self.approver_roles)
        scenario.updated_at = self.updated_at
        scenario.updated_by_id = self.updated_by_id


def validate_cutover_authorization(
    *,
    actor: User,
    authorizer: User,
    authorized_by: str,
    authorization_reference: str,
) -> CutoverAuthorization:
    """Validate the one approved actor/authorizer/reference tuple."""
    normalized_email = authorized_by.strip().lower()
    normalized_reference = authorization_reference.strip()
    if not normalized_email:
        raise SystemExit("Cutover authorizer email must be nonblank")
    if not normalized_reference:
        raise SystemExit("Cutover authorization reference must be nonblank")
    if normalized_reference != CUTOVER_AUTHORIZATION_REFERENCE:
        raise SystemExit(f"Cutover authorization reference must be {CUTOVER_AUTHORIZATION_REFERENCE}")
    if actor.email.lower() != CUTOVER_IMPORT_ACTOR_EMAIL:
        raise SystemExit(f"Cutover actor must be the seeded Risk Manager {CUTOVER_IMPORT_ACTOR_EMAIL}")
    actor_role = getattr(actor, "role", None)
    if not actor.is_active or actor_role is None or not actor_role.is_active or actor_role.name != "risk_manager":
        raise SystemExit("Cutover actor must be the active seeded Risk Manager")
    if normalized_email != authorizer.email.lower():
        raise SystemExit("Cutover authorizer email does not match the loaded user")
    if authorizer.id == actor.id:
        raise SystemExit("Cutover authorizer must be distinct from the import actor")
    authorizer_role = getattr(authorizer, "role", None)
    if (
        not authorizer.is_active
        or authorizer_role is None
        or not authorizer_role.is_active
        or authorizer_role.name != "cro"
    ):
        raise SystemExit("Cutover authorizer must be an active CRO")
    return CutoverAuthorization(
        authorizer_email=normalized_email,
        reference=normalized_reference,
        reason="Independent CRO authorization for the exact-manifest ICT Register cutover",
    )


def require_postgresql_cutover(db: AsyncSession) -> None:
    """Fail closed unless apply mode owns a PostgreSQL transaction."""
    if db.get_bind().dialect.name != "postgresql":
        raise SystemExit("ICT Register apply mode requires PostgreSQL")


@dataclass(slots=True)
class AuthorizedCutoverWindow:
    db: AsyncSession
    authorizer: User
    authorization: CutoverAuthorization
    scenarios: tuple[ApprovalScenario, ...]
    snapshots: dict[str, ScenarioSnapshot]
    accountability_map_digest: str

    async def _audit(
        self,
        *,
        action: ActivityAction,
        description: str,
        changes: dict[str, dict[str, object]] | None = None,
    ) -> None:
        audit_changes = dict(changes or {})
        audit_changes["code"] = {
            "old": None,
            "new": self.accountability_map_digest,
        }
        await log_activity(
            self.db,
            entity_type=ActivityEntityType.CONFIG,
            entity_id=0,
            entity_name="ICT Register cutover",
            safe_entity_label="ICT Register cutover",
            safe_description=description,
            safe_description_siem=description,
            action=action,
            actor=self.authorizer,
            changes=audit_changes,
            description=description,
        )
        await self.db.flush()

    async def audit_authorization(self) -> None:
        await self._audit(
            action=ActivityAction.APPROVE,
            description=(
                f"ICT Register cutover {self.authorization.reference} authorized by "
                f"an independent active CRO. Reason: {self.authorization.reason}"
            ),
        )

    async def suspend(self) -> None:
        original = {key: snapshot.requires_approval for key, snapshot in self.snapshots.items()}
        for scenario in self.scenarios:
            scenario.requires_approval = False
        await self._audit(
            action=ActivityAction.UPDATE,
            description="ICT Register cutover #53 approval scenarios suspended",
            changes={"requires_approval": {"old": original, "new": False}},
        )

    async def restore(self) -> None:
        restored = {key: snapshot.requires_approval for key, snapshot in self.snapshots.items()}
        for scenario in self.scenarios:
            self.snapshots[scenario.key].restore(scenario)
        await self._audit(
            action=ActivityAction.UPDATE,
            description="ICT Register cutover #53 approval scenarios restored",
            changes={"requires_approval": {"old": False, "new": restored}},
        )

    async def complete(self, state_digest: str) -> None:
        completion_marker = json.dumps(
            {
                "accountability_map_sha256": self.accountability_map_digest,
                "state_sha256": state_digest,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        await self._audit(
            action=ActivityAction.UPDATE,
            description=CUTOVER_COMPLETION_DESCRIPTION,
            changes={"value": {"old": None, "new": completion_marker}},
        )


async def load_authorized_cutover_window(
    db: AsyncSession,
    *,
    actor: User,
    authorized_by: str,
    authorization_reference: str,
    accountability_map_digest: str,
) -> AuthorizedCutoverWindow:
    """Lock and snapshot the exact fixed scenarios after validating the CRO."""
    normalized_email = authorized_by.strip().lower()
    authorizer = (
        await db.execute(
            select(User)
            .join(Role, Role.id == User.role_id)
            .options(contains_eager(User.role))
            .where(func.lower(User.email) == normalized_email)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if authorizer is None:
        raise SystemExit("Cutover authorizer must identify an active CRO")
    authorization = validate_cutover_authorization(
        actor=actor,
        authorizer=authorizer,
        authorized_by=authorized_by,
        authorization_reference=authorization_reference,
    )
    scenarios = tuple(
        (
            await db.execute(
                select(ApprovalScenario)
                .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
                .order_by(ApprovalScenario.key)
                .with_for_update()
            )
        ).scalars()
    )
    if tuple(scenario.key for scenario in scenarios) != CUTOVER_SCENARIO_KEYS:
        raise SystemExit("Cutover requires all three fixed protected scenarios")
    return AuthorizedCutoverWindow(
        db=db,
        authorizer=authorizer,
        authorization=authorization,
        scenarios=scenarios,
        snapshots={scenario.key: ScenarioSnapshot.capture(scenario) for scenario in scenarios},
        accountability_map_digest=accountability_map_digest,
    )


__all__ = [
    "CUTOVER_AUTHORIZATION_REFERENCE",
    "CUTOVER_IMPORT_ACTOR_EMAIL",
    "CUTOVER_ACCOUNTABILITY_ASSET_COUNT",
    "CUTOVER_ACCOUNTABILITY_MAP_SHA256",
    "CUTOVER_ACCOUNTABILITY_PROCESS_COUNT",
    "CUTOVER_SCENARIO_KEYS",
    "AuthorizedCutoverWindow",
    "CutoverTargetProfile",
    "ICTRegisterAccountabilityMap",
    "ResolvedICTRegisterAccountability",
    "apply_ict_register_accountability",
    "classify_cutover_target",
    "cutover_state_digest",
    "load_authorized_cutover_window",
    "load_cutover_target_profile",
    "load_ict_register_accountability_map",
    "require_postgresql_cutover",
    "resolve_ict_register_accountability",
    "validate_cutover_authorization",
]
