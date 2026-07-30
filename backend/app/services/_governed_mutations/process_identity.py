"""Strict immutable identity for the fixed governed Process workflow."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import JSON, Boolean, Integer, String, and_, case, false, func, literal, or_, select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement

from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    GovernedMutationProposal,
    Process,
)
from app.schemas.process import ProcessUpdate
from app.services._ict_register_reference import PROCESS_CONTROLLED_CODES_BY_FIELD

from .composite_policy import strict_triggered_policy_snapshots, triggered_policy_snapshot
from .fixed_accountability_policy import ACCOUNTABILITY_SCENARIO_KEY
from .fixed_asset_policy import ASSET_SCENARIO_KEY
from .fixed_policy import ALLOWED_APPROVER_ROLES, SCENARIO_KEY
from .fixed_vendor_policy import VENDOR_SCENARIO_KEY

PROCESS_MUTATION_KIND = "process.edit"
PROCESS_RESOURCE_TYPE = "process"
PROPOSAL_VERSION = 1
PROPOSAL_SCHEMA_VERSION = 1
PROCESS_DISPLAY_NAME_MAX_LENGTH = 255
_SAFE_IDENTITY_FIELDS = {"process_owner_user_id", "owning_department_id"}
_PROCESS_UPDATE_FIELDS = tuple(sorted(set(ProcessUpdate.model_fields) - {"request_reason"}))
_PROCESS_STRING_LIMITS = {
    "l0_area": (1, 255),
    "l1_process": (1, 255),
    "l2_subprocess": (0, 255),
    "preliminary_criticality": (0, 50),
    "cif_override": (0, 10),
    "licensed_activity": (0, 100),
    "bcm_link": (0, 50),
    "dr_test_result": (0, 50),
    "interruption_impact": (0, 50),
    "notes": (0, None),
}
_PROCESS_POSITIVE_INTEGER_FIELDS = {
    "process_owner_user_id",
    "owning_department_id",
}
_PROCESS_NONNEGATIVE_INTEGER_FIELDS = {"mtpd_hours", "rto_hours", "rpo_hours"}
_PROCESS_IMPACT_FIELDS = {
    "impact_client",
    "impact_market_operations",
    "impact_regulatory",
    "impact_financial",
    "impact_reputational",
}
_PROCESS_DATE_FIELDS = {"last_dr_test_date", "assessment_date"}
_REQUIRED_PROCESS_LABEL_FIELDS = {"l0_area", "l1_process"}
_REQUIRED_PROCESS_ID_FIELDS = {"process_owner_user_id", "owning_department_id"}
_DERIVED_CIF_VALUES = {"yes", "no"}
_DERIVED_CRITICALITY_VALUES = {"low", "medium", "high", "critical"}
_IDENTITY_WHITESPACE_CODEPOINTS = (
    *range(9, 14),
    *range(28, 33),
    133,
    160,
    5760,
    *range(8192, 8203),
    8232,
    8233,
    8239,
    8287,
    12288,
)


class InvalidGovernedProcessIdentity(ValueError):
    """The row is the fixed workflow but its immutable identity is malformed."""


@dataclass(frozen=True, slots=True)
class GovernedProcessIdentity:
    approval_request_id: int
    requested_by_id: int
    scenario_key: str
    approver_roles: tuple[str, ...]
    primary_resource_type: str
    primary_resource_id: int
    primary_resource_name: str
    base_governance_version: int
    action_type: ApprovalActionType
    pending_changes: dict[str, dict[str, Any]]
    triggered_scenarios: tuple[str, ...]
    triggered_policy_snapshots: tuple[dict[str, Any], ...]
    mutation_kind: str = PROCESS_MUTATION_KIND


def new_governed_process_proposal(
    *,
    approval_request_id: int,
    requested_by_id: int,
    process_id: int,
    process_name: str,
    approver_roles: list[str],
    base_governance_version: int,
    before_snapshot: dict[str, Any],
    after_snapshot: dict[str, Any],
    raw_before: dict[str, Any],
    raw_after: dict[str, Any],
    derived_impact_snapshot: dict[str, Any],
    asset_impacts: list[dict[str, Any]] | None = None,
    vendor_impacts: list[dict[str, Any]] | None = None,
    scenario_key: str = SCENARIO_KEY,
    triggered_scenarios: list[str] | None = None,
    triggered_policies: list[dict[str, Any]] | None = None,
) -> GovernedMutationProposal:
    """Canonical writer paired with the strict reader below."""
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=PROPOSAL_VERSION,
        schema_version=PROPOSAL_SCHEMA_VERSION,
        approval_request_id=approval_request_id,
        mutation_kind=PROCESS_MUTATION_KIND,
        primary_resource_type=PROCESS_RESOURCE_TYPE,
        primary_resource_id=process_id,
        primary_resource_name=process_name,
        scenario_snapshot={
            "key": scenario_key,
            "requires_approval": True,
            "approver_roles": list(approver_roles),
            "triggered_policies": list(triggered_policies or [triggered_policy_snapshot(scenario_key, approver_roles)]),
        },
        base_versions={
            "process": base_governance_version,
            **{f"asset:{item['resource_id']}": item["base_governance_version"] for item in (asset_impacts or [])},
            **{
                f"vendor:{item['resource_id']}": item["base_governance_version"]
                for item in (vendor_impacts or [])
            },
        },
        before_snapshot=dict(before_snapshot),
        after_snapshot=dict(after_snapshot),
        derived_impact_snapshot=dict(derived_impact_snapshot),
        proposed_changes={
            "before": dict(raw_before),
            "after": dict(raw_after),
            "triggered_scenarios": list(triggered_scenarios or [scenario_key]),
        },
        impacted_resources_snapshot=[
            *(asset_impacts or []),
            *(vendor_impacts or []),
            {
                "resource_type": PROCESS_RESOURCE_TYPE,
                "resource_id": process_id,
                "resource_name": process_name,
                "base_governance_version": base_governance_version,
            },
        ],
        requested_by_id=requested_by_id,
    )
    strict_governed_process_identity(proposal)
    return proposal


def canonical_process_display_name(f_code: str, l1_process: str) -> str:
    """Return the bounded Process label shared by the envelope and proposal."""
    if not isinstance(f_code, str) or not isinstance(l1_process, str):
        raise InvalidGovernedProcessIdentity("Process display label is malformed")
    canonical_code = f_code.strip()
    canonical_l1 = l1_process.strip()
    if not canonical_code or not canonical_l1 or "\x00" in canonical_code or "\x00" in canonical_l1:
        raise InvalidGovernedProcessIdentity("Process display label is malformed")
    prefix = f"{canonical_code} — "
    available = PROCESS_DISPLAY_NAME_MAX_LENGTH - len(prefix)
    if available < 1:
        raise InvalidGovernedProcessIdentity("Process display label is malformed")
    return prefix + canonical_l1[:available]


def is_exact_governed_process_proposal(
    proposal: GovernedMutationProposal | None,
) -> bool:
    return bool(
        proposal is not None
        and proposal.mutation_kind == PROCESS_MUTATION_KIND
        and proposal.primary_resource_type == PROCESS_RESOURCE_TYPE
    )


def _positive_int(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    return None


def _supported_plain_int(value: object, expected: int) -> bool:
    return type(value) is int and value == expected


def _canonical_uuid4(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        return False
    return parsed.version == 4 and str(parsed) == value


def _canonical_process_update_payload(value: dict[str, Any]) -> bool:
    if any(isinstance(item, str) and "\x00" in item for item in value.values()):
        return False
    try:
        raw_json = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        parsed = ProcessUpdate.model_validate_json(raw_json, strict=True)
        canonical_json = json.dumps(
            parsed.model_dump(mode="json", exclude_unset=True),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (PydanticValidationError, TypeError, ValueError):
        return False
    return raw_json == canonical_json


def _canonical_identity_text(value: object) -> bool:
    return bool(isinstance(value, str) and "\x00" not in value and value and value == value.strip())


def _required_process_fields_are_valid(
    value: dict[str, Any],
    *,
    require_identity_ids: bool,
) -> bool:
    for field in _REQUIRED_PROCESS_LABEL_FIELDS & value.keys():
        label = value[field]
        if not isinstance(label, str) or "\x00" in label or not label.strip():
            return False
    for field in _REQUIRED_PROCESS_ID_FIELDS & value.keys():
        if value[field] is None and not require_identity_ids:
            continue
        if _positive_int(value[field]) is None:
            return False
    return True


def _canonical_json_equal(left: object, right: object) -> bool:
    try:
        return json.dumps(
            left,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ) == json.dumps(
            right,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    except (TypeError, ValueError):
        return False


def _valid_derived_impact_snapshot(
    value: object,
    *,
    require_protected: bool = True,
) -> bool:
    if not isinstance(value, dict) or set(value) != {"before", "after"}:
        return False
    for block in value.values():
        if not isinstance(block, dict) or set(block) != {"cif", "criticality_class"}:
            return False
        cif = block["cif"]
        criticality = block["criticality_class"]
        if not isinstance(cif, str) or cif not in _DERIVED_CIF_VALUES:
            return False
        if criticality is not None and (
            not isinstance(criticality, str) or criticality not in _DERIVED_CRITICALITY_VALUES
        ):
            return False
    return not require_protected or any(
        block["cif"] == "yes" for block in value.values()
    )


def _valid_composite_point_impact(
    value: object,
    *,
    process_id: int,
    asset_ids: set[int],
    vendor_ids: set[int],
) -> bool:
    expected_keys = {
        "processes",
        *(("assets",) if asset_ids else ()),
        *(("vendors",) if vendor_ids else ()),
    }
    if not isinstance(value, dict) or set(value) != expected_keys:
        return False
    processes = value.get("processes")
    assets = value.get("assets", [])
    vendors = value.get("vendors", [])
    if (
        not isinstance(processes, list)
        or len(processes) != 1
        or not isinstance(assets, list)
        or not isinstance(vendors, list)
    ):
        return False
    process_row = processes[0]
    if (
        not isinstance(process_row, dict)
        or set(process_row) != {"resource_id", "before", "after"}
        or process_row.get("resource_id") != process_id
    ):
        return False
    process_blocks = {"before": process_row.get("before"), "after": process_row.get("after")}
    if not all(
        isinstance(block, dict)
        and set(block) == {"cif", "criticality_class"}
        and block.get("cif") in _DERIVED_CIF_VALUES
        and (block.get("criticality_class") is None or block.get("criticality_class") in _DERIVED_CRITICALITY_VALUES)
        for block in process_blocks.values()
    ):
        return False
    asset_row_ids: list[int] = []
    for row in assets:
        if not (
            isinstance(row, dict)
            and set(row) == {"resource_id", "before", "after"}
            and type(row.get("resource_id")) is int
            and row["resource_id"] > 0
            and all(
                isinstance(block, dict)
                and set(block) == {"cif", "resulting_criticality"}
                and block.get("cif") in _DERIVED_CIF_VALUES
                and block.get("resulting_criticality") in {None, *_DERIVED_CRITICALITY_VALUES}
                for block in (row.get("before"), row.get("after"))
            )
        ):
            return False
        asset_row_ids.append(row["resource_id"])
    valid_assets = asset_row_ids == sorted(asset_ids) and len(asset_row_ids) == len(asset_ids)
    vendor_row_ids: list[int] = []
    for row in vendors:
        if not (
            isinstance(row, dict)
            and set(row) == {"resource_id", "before", "after"}
            and type(row.get("resource_id")) is int
            and row["resource_id"] > 0
            and all(
                isinstance(block, dict)
                and set(block) == {"tier"}
                and block.get("tier") in {"critical", "significant", "standard"}
                for block in (row.get("before"), row.get("after"))
            )
        ):
            return False
        vendor_row_ids.append(row["resource_id"])
    valid_vendors = (
        vendor_row_ids == sorted(vendor_ids)
        and len(vendor_row_ids) == len(vendor_ids)
    )
    protected = (
        any(
            isinstance(row, dict)
            and any(
                isinstance(block, dict)
                and (
                    block.get("cif") == "yes"
                    or block.get("resulting_criticality") == "critical"
                )
                for block in (row.get("before"), row.get("after"))
            )
            for row in assets
        )
        or any(
            isinstance(row, dict)
            and any(
                isinstance(block, dict)
                and block.get("tier") in {"critical", "significant"}
                for block in (row.get("before"), row.get("after"))
            )
            for row in vendors
        )
        or any(block.get("cif") == "yes" for block in process_blocks.values())
    )
    return valid_assets and valid_vendors and protected


def _strict_governed_process_identity(
    proposal: GovernedMutationProposal | None,
) -> GovernedProcessIdentity | None:
    """Return the fixed identity, None for legacy, and raise for malformed fixed rows."""
    if not is_exact_governed_process_proposal(proposal):
        return None
    assert proposal is not None

    scenario = proposal.scenario_snapshot
    roles: list[str] | None = None
    if (
        isinstance(scenario, dict)
        and set(scenario) == {"key", "requires_approval", "approver_roles", "triggered_policies"}
        and scenario.get("key") in {
            SCENARIO_KEY,
            ASSET_SCENARIO_KEY,
            VENDOR_SCENARIO_KEY,
            ACCOUNTABILITY_SCENARIO_KEY,
        }
        and scenario.get("requires_approval") is True
        and isinstance(scenario.get("approver_roles"), list)
    ):
        raw_roles = scenario["approver_roles"]
        if all(isinstance(role, str) for role in raw_roles):
            roles = list(raw_roles)

    operation = proposal.proposed_changes
    before_snapshot = proposal.before_snapshot
    after_snapshot = proposal.after_snapshot
    operation_valid = bool(
        isinstance(operation, dict)
        and set(operation) == {"before", "after", "triggered_scenarios"}
        and isinstance(operation.get("before"), dict)
        and isinstance(operation.get("after"), dict)
        and isinstance(before_snapshot, dict)
        and isinstance(after_snapshot, dict)
    )
    if not operation_valid:
        raise InvalidGovernedProcessIdentity("Malformed governed Process operation")
    raw_before: dict[str, Any] = operation["before"]
    raw_after: dict[str, Any] = operation["after"]
    triggered_scenarios = operation.get("triggered_scenarios")
    if not (
        isinstance(scenario, dict)
        and isinstance(triggered_scenarios, list)
        and triggered_scenarios
        and all(isinstance(key, str) for key in triggered_scenarios)
        and len(triggered_scenarios) == len(set(triggered_scenarios))
        and set(triggered_scenarios).issubset(
            {
                SCENARIO_KEY,
                ASSET_SCENARIO_KEY,
                VENDOR_SCENARIO_KEY,
                ACCOUNTABILITY_SCENARIO_KEY,
            }
        )
        and triggered_scenarios[0] == scenario.get("key")
    ):
        raise InvalidGovernedProcessIdentity("Governed Process policy snapshot is malformed")
    if roles is None:
        raise InvalidGovernedProcessIdentity("Governed Process policy roles are malformed")
    try:
        triggered_policy_snapshots = strict_triggered_policy_snapshots(
            scenario.get("triggered_policies"),
            scenario_keys=triggered_scenarios,
            effective_roles=roles,
        )
    except ValueError as exc:
        raise InvalidGovernedProcessIdentity("Governed Process policy snapshot is malformed") from exc
    field_names = set(raw_before)
    if (
        not field_names
        or not field_names.issubset(_PROCESS_UPDATE_FIELDS)
        or set(raw_after) != field_names
        or set(before_snapshot) != field_names
        or set(after_snapshot) != field_names
    ):
        raise InvalidGovernedProcessIdentity("Inconsistent governed Process snapshots")
    if any(
        not _canonical_json_equal(before_snapshot[field], raw_before[field])
        or not _canonical_json_equal(after_snapshot[field], raw_after[field])
        for field in field_names - _SAFE_IDENTITY_FIELDS
    ):
        raise InvalidGovernedProcessIdentity("Governed Process snapshot diverges from operation")
    if any(
        not _canonical_identity_text(before_snapshot[field]) or not _canonical_identity_text(after_snapshot[field])
        for field in field_names & _SAFE_IDENTITY_FIELDS
    ):
        raise InvalidGovernedProcessIdentity("Governed Process identity labels are malformed")
    if not _canonical_process_update_payload(raw_before) or not _canonical_process_update_payload(raw_after):
        raise InvalidGovernedProcessIdentity("Governed Process update is invalid")
    if not _required_process_fields_are_valid(
        raw_before,
        require_identity_ids=False,
    ) or not _required_process_fields_are_valid(
        raw_after,
        require_identity_ids=True,
    ):
        raise InvalidGovernedProcessIdentity("Governed Process required fields are invalid")

    base_versions = proposal.base_versions
    base_version = base_versions.get("process") if isinstance(base_versions, dict) else None
    primary_resource_id = _positive_int(proposal.primary_resource_id)
    requested_by_id = _positive_int(proposal.requested_by_id)
    approval_request_id = _positive_int(proposal.approval_request_id)
    raw_resource_name = proposal.primary_resource_name
    resource_name = raw_resource_name if _canonical_identity_text(raw_resource_name) else ""
    expected_impact = [
        {
            "resource_type": PROCESS_RESOURCE_TYPE,
            "resource_id": primary_resource_id,
            "resource_name": resource_name,
            "base_governance_version": base_version,
        }
    ]
    extra_impacts = proposal.impacted_resources_snapshot[:-1]
    asset_ids = {
        item.get("resource_id")
        for item in extra_impacts
        if isinstance(item, dict) and item.get("resource_type") == "asset"
    }
    vendor_ids = {
        item.get("resource_id")
        for item in extra_impacts
        if isinstance(item, dict) and item.get("resource_type") == "vendor"
    }
    composite_valid = bool(
        extra_impacts
        and all(
            isinstance(item, dict)
            and set(item)
            == {
                "resource_type",
                "resource_id",
                "resource_name",
                "base_governance_version",
            }
            and item.get("resource_type") in {"asset", "vendor"}
            and _positive_int(item.get("resource_id"))
            and _positive_int(item.get("base_governance_version"))
            and _canonical_identity_text(item.get("resource_name"))
            for item in extra_impacts
        )
        and [
            (item["resource_type"], item["resource_id"])
            for item in extra_impacts
        ]
        == sorted(
            [
                *(("asset", asset_id) for asset_id in asset_ids),
                *(("vendor", vendor_id) for vendor_id in vendor_ids),
            ]
        )
        and set(base_versions or {})
        == {
            "process",
            *(f"asset:{asset_id}" for asset_id in asset_ids),
            *(f"vendor:{vendor_id}" for vendor_id in vendor_ids),
        }
        and all(
            base_versions[f"{item['resource_type']}:{item['resource_id']}"]
            == item["base_governance_version"]
            for item in extra_impacts
        )
        and _valid_composite_point_impact(
            proposal.derived_impact_snapshot,
            process_id=primary_resource_id or 0,
            asset_ids=asset_ids,
            vendor_ids=vendor_ids,
        )
    )
    if (
        not _canonical_uuid4(proposal.proposal_id)
        or not _supported_plain_int(proposal.proposal_version, PROPOSAL_VERSION)
        or not _supported_plain_int(proposal.schema_version, PROPOSAL_SCHEMA_VERSION)
        or approval_request_id is None
        or requested_by_id is None
        or primary_resource_id is None
        or not resource_name
        or len(resource_name) > PROCESS_DISPLAY_NAME_MAX_LENGTH
        or roles is None
        or not roles
        or len(roles) != len(set(roles))
        or not set(roles).issubset(ALLOWED_APPROVER_ROLES)
        or _positive_int(base_version) is None
        or not (
            (
                not extra_impacts
                and set(base_versions or {}) == {"process"}
                and _valid_derived_impact_snapshot(
                    proposal.derived_impact_snapshot,
                    require_protected=not (
                        ACCOUNTABILITY_SCENARIO_KEY in triggered_scenarios
                        and field_names.issubset(_SAFE_IDENTITY_FIELDS)
                    ),
                )
            )
            or composite_valid
        )
        or not _canonical_json_equal(
            proposal.impacted_resources_snapshot,
            [*extra_impacts, *expected_impact],
        )
    ):
        raise InvalidGovernedProcessIdentity("Malformed governed Process identity")

    pending_changes = {
        field: {"old": before_snapshot[field], "new": after_snapshot[field]}
        for field in sorted(field_names)
        if raw_before[field] != raw_after[field]
    }
    if not pending_changes:
        raise InvalidGovernedProcessIdentity("Governed Process proposal has no changes")

    return GovernedProcessIdentity(
        approval_request_id=approval_request_id,
        requested_by_id=requested_by_id,
        scenario_key=scenario["key"],
        approver_roles=tuple(roles),
        primary_resource_type=PROCESS_RESOURCE_TYPE,
        primary_resource_id=primary_resource_id,
        primary_resource_name=resource_name,
        base_governance_version=base_version,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        triggered_scenarios=tuple(triggered_scenarios),
        triggered_policy_snapshots=triggered_policy_snapshots,
    )


def strict_governed_process_identity(
    proposal: GovernedMutationProposal | None,
) -> GovernedProcessIdentity | None:
    """Total strict reader with one stable corruption exception."""
    try:
        return _strict_governed_process_identity(proposal)
    except InvalidGovernedProcessIdentity:
        raise
    except (AttributeError, IndexError, KeyError, TypeError) as exc:
        raise InvalidGovernedProcessIdentity("Malformed governed Process identity") from exc


class _JsonType(FunctionElement):
    type = String()
    inherit_cache = True


class _JsonArrayLength(FunctionElement):
    type = Integer()
    inherit_cache = True


class _JsonObjectLength(FunctionElement):
    type = Integer()
    inherit_cache = True


class _JsonFieldType(FunctionElement):
    type = String()
    inherit_cache = True


class _JsonFieldText(FunctionElement):
    type = String()
    inherit_cache = True


class _JsonFieldBoolean(FunctionElement):
    type = String()
    inherit_cache = True


class _JsonFieldArrayLength(FunctionElement):
    type = Integer()
    inherit_cache = True


class _JsonFieldArrayText(FunctionElement):
    type = String()
    inherit_cache = True


class _JsonFieldDocument(FunctionElement):
    type = JSON()
    inherit_cache = True


class _CanonicalUuid4(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonPositiveIntegerField(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonObjectKeySetEqual(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonFieldObjectMatchesDocument(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonDocumentsDiffer(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonImpactMatchesIdentity(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonObjectKeysAllowed(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonProcessBeforeUpdateValid(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonProcessAfterUpdateValid(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonOptionalTextFields(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonDerivedImpactValid(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonDerivedImpactShapeValid(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _IdentityTrim(FunctionElement):
    type = String()
    inherit_cache = True


class _TextNoNul(FunctionElement):
    type = Boolean()
    inherit_cache = True


@compiles(_JsonType, "sqlite")
def _compile_json_type_sqlite(element, compiler, **kw):
    return f"json_type({compiler.process(element.clauses, **kw)})"


@compiles(_JsonType, "postgresql")
def _compile_json_type_postgresql(element, compiler, **kw):
    return f"jsonb_typeof({compiler.process(element.clauses, **kw)})"


@compiles(_JsonArrayLength, "sqlite")
def _compile_json_array_length_sqlite(element, compiler, **kw):
    return f"json_array_length({compiler.process(element.clauses, **kw)})"


@compiles(_JsonArrayLength, "postgresql")
def _compile_json_array_length_postgresql(element, compiler, **kw):
    return f"jsonb_array_length({compiler.process(element.clauses, **kw)})"


def _compiled_arguments(element, compiler, **kw) -> list[str]:
    return [compiler.process(argument, **kw) for argument in element.clauses]


def _identity_trim_sql(value: str, *, dialect: str) -> str:
    character_function = "char" if dialect == "sqlite" else "chr"
    characters = " || ".join(f"{character_function}({codepoint})" for codepoint in _IDENTITY_WHITESPACE_CODEPOINTS)
    trim_function = "trim" if dialect == "sqlite" else "btrim"
    return f"{trim_function}({value}, {characters})"


@compiles(_IdentityTrim, "sqlite")
def _compile_identity_trim_sqlite(element, compiler, **kw):
    (value,) = _compiled_arguments(element, compiler, **kw)
    return _identity_trim_sql(value, dialect="sqlite")


@compiles(_IdentityTrim, "postgresql")
def _compile_identity_trim_postgresql(element, compiler, **kw):
    (value,) = _compiled_arguments(element, compiler, **kw)
    return _identity_trim_sql(value, dialect="postgresql")


@compiles(_TextNoNul, "sqlite")
def _compile_text_no_nul_sqlite(element, compiler, **kw):
    (value,) = _compiled_arguments(element, compiler, **kw)
    return f"instr({value}, char(0)) = 0"


@compiles(_TextNoNul, "postgresql")
def _compile_text_no_nul_postgresql(element, compiler, **kw):
    del element, compiler, kw
    return "true"


@compiles(_JsonObjectLength, "sqlite")
def _compile_json_object_length_sqlite(element, compiler, **kw):
    (document,) = _compiled_arguments(element, compiler, **kw)
    return f"(SELECT count(*) FROM json_each({document}))"


@compiles(_JsonObjectLength, "postgresql")
def _compile_json_object_length_postgresql(element, compiler, **kw):
    (document,) = _compiled_arguments(element, compiler, **kw)
    return f"(SELECT count(*) FROM jsonb_object_keys({document}))"


@compiles(_JsonFieldType, "sqlite")
def _compile_json_field_type_sqlite(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    raw_type = f"json_type({document}, '$.' || {field})"
    return f"CASE WHEN {raw_type} IN ('true', 'false') THEN 'boolean' ELSE {raw_type} END"


@compiles(_JsonFieldType, "postgresql")
def _compile_json_field_type_postgresql(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    raw_type = f"jsonb_typeof({document} -> {field})"
    return f"CASE WHEN {raw_type} = 'string' THEN 'text' ELSE {raw_type} END"


@compiles(_JsonFieldText, "sqlite")
def _compile_json_field_text_sqlite(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    return f"json_extract({document}, '$.' || {field})"


@compiles(_JsonFieldText, "postgresql")
def _compile_json_field_text_postgresql(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    return f"({document} ->> {field})"


@compiles(_JsonFieldBoolean, "sqlite")
def _compile_json_field_boolean_sqlite(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    raw_type = f"json_type({document}, '$.' || {field})"
    return f"CASE {raw_type} WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' END"


@compiles(_JsonFieldBoolean, "postgresql")
def _compile_json_field_boolean_postgresql(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    return f"({document} ->> {field})"


@compiles(_JsonFieldArrayLength, "sqlite")
def _compile_json_field_array_length_sqlite(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    return f"json_array_length({document}, '$.' || {field})"


@compiles(_JsonFieldArrayLength, "postgresql")
def _compile_json_field_array_length_postgresql(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    return f"jsonb_array_length({document} -> {field})"


@compiles(_JsonFieldArrayText, "sqlite")
def _compile_json_field_array_text_sqlite(element, compiler, **kw):
    document, field, index = _compiled_arguments(element, compiler, **kw)
    return f"json_extract({document}, '$.' || {field} || '[' || {index} || ']')"


@compiles(_JsonFieldArrayText, "postgresql")
def _compile_json_field_array_text_postgresql(element, compiler, **kw):
    document, field, index = _compiled_arguments(element, compiler, **kw)
    return f"(({document} -> {field}) ->> {index})"


@compiles(_JsonFieldDocument, "sqlite")
def _compile_json_field_document_sqlite(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    return f"json_extract({document}, '$.' || {field})"


@compiles(_JsonFieldDocument, "postgresql")
def _compile_json_field_document_postgresql(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    return f"({document} -> {field})"


@compiles(_CanonicalUuid4, "sqlite")
def _compile_canonical_uuid4_sqlite(element, compiler, **kw):
    (value,) = _compiled_arguments(element, compiler, **kw)
    hexdigit = "[0-9a-f]"
    pattern = hexdigit * 8 + "-" + hexdigit * 4 + "-4" + hexdigit * 3 + "-[89ab]" + hexdigit * 3 + "-" + hexdigit * 12
    return f"({value} GLOB '{pattern}')"


@compiles(_CanonicalUuid4, "postgresql")
def _compile_canonical_uuid4_postgresql(element, compiler, **kw):
    (value,) = _compiled_arguments(element, compiler, **kw)
    pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    return f"({value} ~ '{pattern}')"


@compiles(_JsonPositiveIntegerField, "sqlite")
def _compile_json_positive_integer_field_sqlite(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    path = f"'$.' || {field}"
    return (
        f"CASE WHEN json_type({document}, {path}) = 'integer' " f"THEN json_extract({document}, {path}) > 0 ELSE 0 END"
    )


@compiles(_JsonPositiveIntegerField, "postgresql")
def _compile_json_positive_integer_field_postgresql(element, compiler, **kw):
    document, field = _compiled_arguments(element, compiler, **kw)
    value = f"({document} ->> {field})"
    return f"CASE WHEN jsonb_typeof({document} -> {field}) = 'number' " f"THEN {value} ~ '^[1-9][0-9]*$' ELSE false END"


@compiles(_JsonObjectKeySetEqual, "sqlite")
def _compile_json_object_key_set_equal_sqlite(element, compiler, **kw):
    left, right = _compiled_arguments(element, compiler, **kw)
    return (
        "CASE WHEN json_type(" + left + ") = 'object' AND json_type(" + right + ") = 'object' THEN "
        "NOT EXISTS (SELECT key FROM json_each(" + left + ") EXCEPT SELECT key FROM json_each(" + right + ")) "
        "AND NOT EXISTS (SELECT key FROM json_each(" + right + ") EXCEPT SELECT key FROM json_each(" + left + ")) "
        "ELSE 0 END"
    )


@compiles(_JsonObjectKeySetEqual, "postgresql")
def _compile_json_object_key_set_equal_postgresql(element, compiler, **kw):
    left, right = _compiled_arguments(element, compiler, **kw)
    return (
        "CASE WHEN jsonb_typeof(" + left + ") = 'object' AND jsonb_typeof(" + right + ") = 'object' THEN "
        "NOT EXISTS (SELECT jsonb_object_keys(" + left + ") EXCEPT SELECT jsonb_object_keys(" + right + ")) "
        "AND NOT EXISTS (SELECT jsonb_object_keys(" + right + ") EXCEPT SELECT jsonb_object_keys(" + left + ")) "
        "ELSE false END"
    )


@compiles(_JsonFieldObjectMatchesDocument, "sqlite")
def _compile_json_field_object_matches_document_sqlite(element, compiler, **kw):
    container, field, document = _compiled_arguments(element, compiler, **kw)
    nested = f"json_extract({container}, '$.' || {field})"
    labels = "'process_owner_user_id', 'owning_department_id'"
    return (
        f"CASE WHEN json_type({container}, '$.' || {field}) = 'object' AND json_type({document}) = 'object' "
        f"THEN NOT EXISTS (SELECT key FROM json_each({nested}) WHERE key NOT IN ({labels}) "
        f"EXCEPT SELECT key FROM json_each({document}) WHERE key NOT IN ({labels})) "
        f"AND NOT EXISTS (SELECT key FROM json_each({document}) WHERE key NOT IN ({labels}) "
        f"EXCEPT SELECT key FROM json_each({nested}) WHERE key NOT IN ({labels})) "
        f"AND NOT EXISTS (SELECT 1 FROM json_each({nested}) AS left_value "
        f"JOIN json_each({document}) AS right_value ON right_value.key = left_value.key "
        f"WHERE left_value.key NOT IN ({labels}) AND "
        "(left_value.type != right_value.type OR left_value.atom IS NOT right_value.atom)) "
        "ELSE 0 END"
    )


@compiles(_JsonFieldObjectMatchesDocument, "postgresql")
def _compile_json_field_object_matches_document_postgresql(element, compiler, **kw):
    container, field, document = _compiled_arguments(element, compiler, **kw)
    nested = f"({container} -> {field})"
    return (
        f"CASE WHEN jsonb_typeof({nested}) = 'object' AND jsonb_typeof({document}) = 'object' "
        f"THEN ({nested} - 'process_owner_user_id' - 'owning_department_id') = "
        f"({document} - 'process_owner_user_id' - 'owning_department_id') ELSE false END"
    )


@compiles(_JsonDocumentsDiffer, "sqlite")
def _compile_json_documents_differ_sqlite(element, compiler, **kw):
    left, right = _compiled_arguments(element, compiler, **kw)
    return (
        f"CASE WHEN json_type({left}) = 'object' AND json_type({right}) = 'object' THEN "
        f"EXISTS (SELECT key FROM json_each({left}) EXCEPT SELECT key FROM json_each({right})) "
        f"OR EXISTS (SELECT key FROM json_each({right}) EXCEPT SELECT key FROM json_each({left})) "
        f"OR EXISTS (SELECT 1 FROM json_each({left}) AS left_value "
        f"JOIN json_each({right}) AS right_value ON right_value.key = left_value.key "
        "WHERE left_value.type != right_value.type OR left_value.atom IS NOT right_value.atom) "
        "ELSE 1 END"
    )


@compiles(_JsonDocumentsDiffer, "postgresql")
def _compile_json_documents_differ_postgresql(element, compiler, **kw):
    left, right = _compiled_arguments(element, compiler, **kw)
    return f"({left} != {right})"


@compiles(_JsonImpactMatchesIdentity, "sqlite")
def _compile_json_impact_matches_identity_sqlite(element, compiler, **kw):
    snapshot, resource_id, resource_name, base_versions = _compiled_arguments(element, compiler, **kw)
    item = f"json_extract({snapshot}, '$[0]')"
    return (
        f"CASE WHEN json_type({snapshot}) = 'array' THEN CASE WHEN json_array_length({snapshot}) = 1 "
        f"THEN CASE WHEN json_type({snapshot}, '$[0]') = 'object' THEN "
        f"(SELECT count(*) FROM json_each({item})) = 4 "
        f"AND json_type({snapshot}, '$[0].resource_type') = 'text' "
        f"AND json_extract({snapshot}, '$[0].resource_type') = 'process' "
        f"AND json_type({snapshot}, '$[0].resource_id') = 'integer' "
        f"AND json_extract({snapshot}, '$[0].resource_id') = {resource_id} "
        f"AND json_type({snapshot}, '$[0].resource_name') = 'text' "
        f"AND json_extract({snapshot}, '$[0].resource_name') = {resource_name} "
        f"AND json_type({snapshot}, '$[0].base_governance_version') = 'integer' "
        f"AND json_extract({snapshot}, '$[0].base_governance_version') = "
        f"json_extract({base_versions}, '$.process') "
        "ELSE 0 END ELSE 0 END ELSE 0 END"
    )


@compiles(_JsonImpactMatchesIdentity, "postgresql")
def _compile_json_impact_matches_identity_postgresql(element, compiler, **kw):
    snapshot, resource_id, resource_name, base_versions = _compiled_arguments(element, compiler, **kw)
    item = f"({snapshot} -> 0)"
    resource_id_text = f"({item} ->> 'resource_id')"
    base_version_text = f"({item} ->> 'base_governance_version')"
    return (
        f"CASE WHEN jsonb_typeof({snapshot}) = 'array' THEN CASE WHEN jsonb_array_length({snapshot}) = 1 "
        f"THEN CASE WHEN jsonb_typeof({item}) = 'object' THEN "
        f"(SELECT count(*) FROM jsonb_object_keys({item})) = 4 "
        f"AND jsonb_typeof({item} -> 'resource_type') = 'string' "
        f"AND ({item} ->> 'resource_type') = 'process' "
        f"AND jsonb_typeof({item} -> 'resource_id') = 'number' "
        f"AND CASE WHEN {resource_id_text} ~ '^[1-9][0-9]*$' "
        f"THEN CAST({resource_id_text} AS numeric) = {resource_id} ELSE false END "
        f"AND jsonb_typeof({item} -> 'resource_name') = 'string' "
        f"AND ({item} ->> 'resource_name') = {resource_name} "
        f"AND jsonb_typeof({item} -> 'base_governance_version') = 'number' "
        f"AND CASE WHEN {base_version_text} ~ '^[1-9][0-9]*$' "
        f"THEN {base_version_text} = ({base_versions} ->> 'process') ELSE false END "
        "ELSE false END ELSE false END ELSE false END"
    )


@compiles(_JsonObjectKeysAllowed, "sqlite")
def _compile_json_object_keys_allowed_sqlite(element, compiler, **kw):
    document, *allowed = _compiled_arguments(element, compiler, **kw)
    return (
        f"CASE WHEN json_type({document}) = 'object' THEN NOT EXISTS "
        f"(SELECT 1 FROM json_each({document}) WHERE key NOT IN ({', '.join(allowed)})) ELSE 0 END"
    )


@compiles(_JsonObjectKeysAllowed, "postgresql")
def _compile_json_object_keys_allowed_postgresql(element, compiler, **kw):
    document, *allowed = _compiled_arguments(element, compiler, **kw)
    return (
        f"CASE WHEN jsonb_typeof({document}) = 'object' THEN NOT EXISTS "
        f"(SELECT 1 FROM jsonb_object_keys({document}) AS keys(key) WHERE key NOT IN ({', '.join(allowed)})) "
        "ELSE false END"
    )


def _quoted_sql_values(values: object) -> str:
    return ", ".join("'" + str(value).replace("'", "''") + "'" for value in values)


def _compile_json_process_update_valid_sqlite(
    element,
    compiler,
    *,
    require_identity_ids: bool,
    **kw,
):
    (document,) = _compiled_arguments(element, compiler, **kw)
    conditions: list[str] = []
    for field in _PROCESS_UPDATE_FIELDS:
        path = f"'$.{field}'"
        value_type = f"json_type({document}, {path})"
        value = f"json_extract({document}, {path})"
        if field in PROCESS_CONTROLLED_CODES_BY_FIELD:
            allowed = _quoted_sql_values(sorted(PROCESS_CONTROLLED_CODES_BY_FIELD[field]))
            valid = f"{value_type} = 'text' AND {value} IN ({allowed})"
        elif field in _PROCESS_STRING_LIMITS:
            minimum, maximum = _PROCESS_STRING_LIMITS[field]
            length = f"length({value})"
            bounds = [f"{length} >= {minimum}"]
            if maximum is not None:
                bounds.append(f"{length} <= {maximum}")
            valid = f"{value_type} = 'text' AND instr({value}, char(0)) = 0 AND " + " AND ".join(bounds)
            if field in _REQUIRED_PROCESS_LABEL_FIELDS:
                valid += f" AND length({_identity_trim_sql(value, dialect='sqlite')}) > 0"
        elif field in _PROCESS_POSITIVE_INTEGER_FIELDS:
            valid = f"{value_type} = 'integer' AND {value} >= 1"
        elif field in _PROCESS_NONNEGATIVE_INTEGER_FIELDS:
            valid = f"{value_type} = 'integer' AND {value} >= 0"
        elif field in _PROCESS_IMPACT_FIELDS:
            valid = f"{value_type} = 'integer' AND {value} BETWEEN 1 AND 5"
        elif field in _PROCESS_DATE_FIELDS:
            valid = (
                f"{value_type} = 'text' AND {value} GLOB "
                "'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' "
                f"AND substr({value}, 1, 4) != '0000' "
                f"AND date({value}) = {value}"
            )
        else:  # pragma: no cover - all ProcessUpdate fields are classified
            valid = "0"
        required_fields = set(_REQUIRED_PROCESS_LABEL_FIELDS)
        if require_identity_ids:
            required_fields.update(_REQUIRED_PROCESS_ID_FIELDS)
        conditions.append(
            f"({value_type} IS NULL OR ({valid}))"
            if field in required_fields
            else f"({value_type} IS NULL OR {value_type} = 'null' OR ({valid}))"
        )
    return f"CASE WHEN json_type({document}) = 'object' THEN " + " AND ".join(conditions) + " ELSE 0 END"


@compiles(_JsonProcessBeforeUpdateValid, "sqlite")
def _compile_json_process_before_update_valid_sqlite(element, compiler, **kw):
    return _compile_json_process_update_valid_sqlite(
        element,
        compiler,
        require_identity_ids=False,
        **kw,
    )


@compiles(_JsonProcessAfterUpdateValid, "sqlite")
def _compile_json_process_after_update_valid_sqlite(element, compiler, **kw):
    return _compile_json_process_update_valid_sqlite(
        element,
        compiler,
        require_identity_ids=True,
        **kw,
    )


def _compile_json_process_update_valid_postgresql(
    element,
    compiler,
    *,
    require_identity_ids: bool,
    **kw,
):
    (document,) = _compiled_arguments(element, compiler, **kw)
    conditions: list[str] = []
    for field in _PROCESS_UPDATE_FIELDS:
        key = "'" + field.replace("'", "''") + "'"
        json_value = f"({document} -> {key})"
        value_type = f"jsonb_typeof({json_value})"
        value = f"({document} ->> {key})"
        if field in PROCESS_CONTROLLED_CODES_BY_FIELD:
            allowed = _quoted_sql_values(sorted(PROCESS_CONTROLLED_CODES_BY_FIELD[field]))
            valid = f"{value_type} = 'string' AND {value} IN ({allowed})"
        elif field in _PROCESS_STRING_LIMITS:
            minimum, maximum = _PROCESS_STRING_LIMITS[field]
            length = f"length({value})"
            bounds = [f"{length} >= {minimum}"]
            if maximum is not None:
                bounds.append(f"{length} <= {maximum}")
            valid = f"{value_type} = 'string' AND " + " AND ".join(bounds)
            if field in _REQUIRED_PROCESS_LABEL_FIELDS:
                valid += f" AND length({_identity_trim_sql(value, dialect='postgresql')}) > 0"
        elif field in (_PROCESS_POSITIVE_INTEGER_FIELDS | _PROCESS_NONNEGATIVE_INTEGER_FIELDS | _PROCESS_IMPACT_FIELDS):
            if field in _PROCESS_POSITIVE_INTEGER_FIELDS:
                range_check = "numeric_value >= 1"
            elif field in _PROCESS_NONNEGATIVE_INTEGER_FIELDS:
                range_check = "numeric_value >= 0"
            else:
                range_check = "numeric_value BETWEEN 1 AND 5"
            valid = (
                f"{value_type} = 'number' AND CASE WHEN {value} ~ '^-?[0-9]+$' "
                f"THEN (SELECT {range_check} FROM (SELECT CAST({value} AS numeric) AS numeric_value) numeric) "
                "ELSE false END"
            )
        elif field in _PROCESS_DATE_FIELDS:
            date_pattern = "'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'"
            year = f"CAST(substring({value} from 1 for 4) AS integer)"
            month = f"CAST(substring({value} from 6 for 2) AS integer)"
            day = f"CAST(substring({value} from 9 for 2) AS integer)"
            february_days = (
                f"CASE WHEN ({year} % 400 = 0 OR ({year} % 4 = 0 AND {year} % 100 != 0)) " "THEN 29 ELSE 28 END"
            )
            valid = (
                f"{value_type} = 'string' AND CASE WHEN {value} ~ {date_pattern} "
                f"THEN {year} >= 1 AND {day} <= CASE WHEN {month} = 2 THEN {february_days} "
                f"WHEN {month} IN (4, 6, 9, 11) THEN 30 ELSE 31 END "
                "ELSE false END"
            )
        else:  # pragma: no cover - all ProcessUpdate fields are classified
            valid = "false"
        required_fields = set(_REQUIRED_PROCESS_LABEL_FIELDS)
        if require_identity_ids:
            required_fields.update(_REQUIRED_PROCESS_ID_FIELDS)
        conditions.append(
            f"(NOT ({document} ? {key}) OR ({valid}))"
            if field in required_fields
            else f"(NOT ({document} ? {key}) OR {value_type} = 'null' OR ({valid}))"
        )
    return f"CASE WHEN jsonb_typeof({document}) = 'object' THEN " + " AND ".join(conditions) + " ELSE false END"


@compiles(_JsonProcessBeforeUpdateValid, "postgresql")
def _compile_json_process_before_update_valid_postgresql(element, compiler, **kw):
    return _compile_json_process_update_valid_postgresql(
        element,
        compiler,
        require_identity_ids=False,
        **kw,
    )


@compiles(_JsonProcessAfterUpdateValid, "postgresql")
def _compile_json_process_after_update_valid_postgresql(element, compiler, **kw):
    return _compile_json_process_update_valid_postgresql(
        element,
        compiler,
        require_identity_ids=True,
        **kw,
    )


@compiles(_JsonOptionalTextFields, "sqlite")
def _compile_json_optional_text_fields_sqlite(element, compiler, **kw):
    document, *fields = _compiled_arguments(element, compiler, **kw)
    conditions = []
    for field in fields:
        value = f"json_extract({document}, '$.' || {field})"
        canonical = _identity_trim_sql(value, dialect="sqlite")
        conditions.append(
            f"(json_type({document}, '$.' || {field}) IS NULL OR "
            f"(json_type({document}, '$.' || {field}) = 'text' AND "
            f"instr({value}, char(0)) = 0 AND length({canonical}) > 0 "
            f"AND {value} = {canonical}))"
        )
    return "(" + " AND ".join(conditions) + ")"


@compiles(_JsonOptionalTextFields, "postgresql")
def _compile_json_optional_text_fields_postgresql(element, compiler, **kw):
    document, *fields = _compiled_arguments(element, compiler, **kw)
    conditions = []
    for field in fields:
        value = f"({document} ->> {field})"
        canonical = _identity_trim_sql(value, dialect="postgresql")
        conditions.append(
            f"(NOT ({document} ? {field}) OR "
            f"(jsonb_typeof({document} -> {field}) = 'string' "
            f"AND length({canonical}) > 0 AND {value} = {canonical}))"
        )
    return "(" + " AND ".join(conditions) + ")"


def _json_derived_impact_sqlite(
    document: str,
    *,
    require_protected: bool,
) -> str:
    block_conditions: list[str] = []
    for block in ("before", "after"):
        path = f"'$.{block}'"
        nested = f"json_extract({document}, {path})"
        block_conditions.append(
            f"CASE WHEN json_type({document}, {path}) = 'object' THEN "
            f"(SELECT count(*) FROM json_each({nested})) = 2 "
            f"AND json_type({document}, '$.{block}.cif') = 'text' "
            f"AND json_extract({document}, '$.{block}.cif') IN ('yes', 'no') "
            f"AND json_type({document}, '$.{block}.criticality_class') IN ('text', 'null') "
            f"AND (json_type({document}, '$.{block}.criticality_class') = 'null' "
            f"OR json_extract({document}, '$.{block}.criticality_class') "
            "IN ('low', 'medium', 'high', 'critical')) "
            "ELSE 0 END"
        )
    protected = (
        f" AND (json_extract({document}, '$.before.cif') = 'yes' "
        f"OR json_extract({document}, '$.after.cif') = 'yes')"
        if require_protected
        else ""
    )
    return (
        f"CASE WHEN json_type({document}) = 'object' THEN "
        f"(SELECT count(*) FROM json_each({document})) = 2 AND "
        + " AND ".join(block_conditions)
        + protected
        + " ELSE 0 END"
    )


@compiles(_JsonDerivedImpactValid, "sqlite")
def _compile_json_derived_impact_valid_sqlite(element, compiler, **kw):
    (document,) = _compiled_arguments(element, compiler, **kw)
    return _json_derived_impact_sqlite(document, require_protected=True)


@compiles(_JsonDerivedImpactShapeValid, "sqlite")
def _compile_json_derived_impact_shape_valid_sqlite(element, compiler, **kw):
    (document,) = _compiled_arguments(element, compiler, **kw)
    return _json_derived_impact_sqlite(document, require_protected=False)


def _json_derived_impact_postgresql(
    document: str,
    *,
    require_protected: bool,
) -> str:
    block_conditions: list[str] = []
    for block in ("before", "after"):
        nested = f"({document} -> '{block}')"
        block_conditions.append(
            f"CASE WHEN jsonb_typeof({nested}) = 'object' THEN "
            f"(SELECT count(*) FROM jsonb_object_keys({nested})) = 2 "
            f"AND jsonb_typeof({nested} -> 'cif') = 'string' "
            f"AND ({nested} ->> 'cif') IN ('yes', 'no') "
            f"AND jsonb_typeof({nested} -> 'criticality_class') IN ('string', 'null') "
            f"AND (jsonb_typeof({nested} -> 'criticality_class') = 'null' "
            f"OR ({nested} ->> 'criticality_class') "
            "IN ('low', 'medium', 'high', 'critical')) "
            "ELSE false END"
        )
    protected = (
        f" AND (({document} -> 'before' ->> 'cif') = 'yes' "
        f"OR ({document} -> 'after' ->> 'cif') = 'yes')"
        if require_protected
        else ""
    )
    return (
        f"CASE WHEN jsonb_typeof({document}) = 'object' THEN "
        f"(SELECT count(*) FROM jsonb_object_keys({document})) = 2 AND "
        + " AND ".join(block_conditions)
        + protected
        + " ELSE false END"
    )


@compiles(_JsonDerivedImpactValid, "postgresql")
def _compile_json_derived_impact_valid_postgresql(element, compiler, **kw):
    (document,) = _compiled_arguments(element, compiler, **kw)
    return _json_derived_impact_postgresql(document, require_protected=True)


@compiles(_JsonDerivedImpactShapeValid, "postgresql")
def _compile_json_derived_impact_shape_valid_postgresql(
    element,
    compiler,
    **kw,
):
    (document,) = _compiled_arguments(element, compiler, **kw)
    return _json_derived_impact_postgresql(document, require_protected=False)


def exact_governed_process_proposal_exists_clause():
    return (
        select(GovernedMutationProposal.id)
        .where(
            GovernedMutationProposal.approval_request_id == ApprovalRequest.id,
            GovernedMutationProposal.mutation_kind == PROCESS_MUTATION_KIND,
            GovernedMutationProposal.primary_resource_type == PROCESS_RESOURCE_TYPE,
        )
        .exists()
    )


def any_governed_mutation_proposal_exists_clause():
    return (
        select(GovernedMutationProposal.id)
        .where(
            GovernedMutationProposal.approval_request_id == ApprovalRequest.id,
        )
        .exists()
    )


def _strict_sql_identity_predicate():
    scenario = GovernedMutationProposal.scenario_snapshot
    roles_field = literal("approver_roles")
    roles_type = _JsonFieldType(scenario, roles_field)
    roles_length = case(
        (roles_type == "array", _JsonFieldArrayLength(scenario, roles_field)),
        else_=0,
    )
    first_role = _JsonFieldArrayText(scenario, roles_field, literal(0))
    second_role = _JsonFieldArrayText(scenario, roles_field, literal(1))
    allowed = tuple(sorted(ALLOWED_APPROVER_ROLES))
    valid_roles = or_(
        and_(roles_length == 1, first_role.in_(allowed)),
        and_(
            roles_length == 2,
            first_role.in_(allowed),
            second_role.in_(allowed),
            first_role != second_role,
        ),
    )
    proposed_changes = GovernedMutationProposal.proposed_changes
    triggered_field = literal("triggered_scenarios")
    triggered_type = _JsonFieldType(proposed_changes, triggered_field)
    triggered_length = case(
        (triggered_type == "array", _JsonFieldArrayLength(proposed_changes, triggered_field)),
        else_=0,
    )
    first_trigger = _JsonFieldArrayText(proposed_changes, triggered_field, literal(0))
    second_trigger = _JsonFieldArrayText(proposed_changes, triggered_field, literal(1))
    scenario_key = _JsonFieldText(scenario, literal("key"))
    allowed_scenarios = (
        SCENARIO_KEY,
        ASSET_SCENARIO_KEY,
        ACCOUNTABILITY_SCENARIO_KEY,
    )
    operation_before = _JsonFieldDocument(proposed_changes, literal("before"))
    operation_after = _JsonFieldDocument(proposed_changes, literal("after"))
    base_versions = GovernedMutationProposal.base_versions
    before_snapshot = GovernedMutationProposal.before_snapshot
    after_snapshot = GovernedMutationProposal.after_snapshot
    return and_(
        _CanonicalUuid4(GovernedMutationProposal.proposal_id),
        GovernedMutationProposal.proposal_version == PROPOSAL_VERSION,
        GovernedMutationProposal.schema_version == PROPOSAL_SCHEMA_VERSION,
        GovernedMutationProposal.approval_request_id > 0,
        GovernedMutationProposal.requested_by_id > 0,
        GovernedMutationProposal.primary_resource_id > 0,
        func.length(_IdentityTrim(GovernedMutationProposal.primary_resource_name)) > 0,
        GovernedMutationProposal.primary_resource_name == _IdentityTrim(GovernedMutationProposal.primary_resource_name),
        func.length(GovernedMutationProposal.primary_resource_name) <= PROCESS_DISPLAY_NAME_MAX_LENGTH,
        _TextNoNul(GovernedMutationProposal.primary_resource_name),
        _JsonType(scenario) == "object",
        case(
            (_JsonType(scenario) == "object", _JsonObjectLength(scenario)),
            else_=-1,
        )
        == 4,
        _JsonFieldType(scenario, literal("key")) == "text",
        scenario_key.in_(allowed_scenarios),
        _JsonFieldType(scenario, literal("requires_approval")) == "boolean",
        _JsonFieldBoolean(scenario, literal("requires_approval")) == "true",
        valid_roles,
        _JsonType(proposed_changes) == "object",
        case(
            (
                _JsonType(proposed_changes) == "object",
                _JsonObjectLength(proposed_changes),
            ),
            else_=-1,
        )
        == 3,
        _JsonFieldType(proposed_changes, literal("before")) == "object",
        _JsonFieldType(proposed_changes, literal("after")) == "object",
        triggered_type == "array",
        or_(
            and_(
                triggered_length == 1,
                first_trigger.in_(allowed_scenarios),
                first_trigger == scenario_key,
            ),
            and_(
                triggered_length == 2,
                first_trigger.in_(allowed_scenarios),
                second_trigger.in_(allowed_scenarios),
                first_trigger != second_trigger,
                first_trigger == scenario_key,
            ),
        ),
        _JsonType(base_versions) == "object",
        case(
            (
                _JsonType(base_versions) == "object",
                _JsonObjectLength(base_versions),
            ),
            else_=-1,
        )
        == 1,
        _JsonPositiveIntegerField(base_versions, literal("process")),
        _JsonType(before_snapshot) == "object",
        _JsonType(after_snapshot) == "object",
        _JsonOptionalTextFields(
            before_snapshot,
            *(literal(field) for field in sorted(_SAFE_IDENTITY_FIELDS)),
        ),
        _JsonOptionalTextFields(
            after_snapshot,
            *(literal(field) for field in sorted(_SAFE_IDENTITY_FIELDS)),
        ),
        or_(
            _JsonDerivedImpactValid(
                GovernedMutationProposal.derived_impact_snapshot
            ),
            and_(
                or_(
                    first_trigger == ACCOUNTABILITY_SCENARIO_KEY,
                    second_trigger == ACCOUNTABILITY_SCENARIO_KEY,
                ),
                _JsonObjectKeysAllowed(
                    operation_after,
                    *(
                        literal(field)
                        for field in sorted(_SAFE_IDENTITY_FIELDS)
                    ),
                ),
                _JsonDerivedImpactShapeValid(
                    GovernedMutationProposal.derived_impact_snapshot
                ),
            ),
        ),
        _JsonObjectKeySetEqual(operation_before, operation_after),
        _JsonObjectKeySetEqual(operation_before, before_snapshot),
        _JsonObjectKeySetEqual(operation_after, after_snapshot),
        _JsonFieldObjectMatchesDocument(
            proposed_changes,
            literal("before"),
            before_snapshot,
        ),
        _JsonFieldObjectMatchesDocument(
            proposed_changes,
            literal("after"),
            after_snapshot,
        ),
        _JsonDocumentsDiffer(operation_before, operation_after),
        _JsonObjectKeysAllowed(
            operation_after,
            *(literal(field) for field in _PROCESS_UPDATE_FIELDS),
        ),
        _JsonProcessBeforeUpdateValid(operation_before),
        _JsonProcessAfterUpdateValid(operation_after),
        _JsonImpactMatchesIdentity(
            GovernedMutationProposal.impacted_resources_snapshot,
            GovernedMutationProposal.primary_resource_id,
            GovernedMutationProposal.primary_resource_name,
            base_versions,
        ),
    )


def valid_governed_process_proposal_exists_clause(
    *extra_conditions,
    join_process: bool = False,
):
    statement = select(GovernedMutationProposal.id)
    if join_process:
        statement = statement.join(
            Process,
            Process.id == GovernedMutationProposal.primary_resource_id,
        )
    return statement.where(
        GovernedMutationProposal.approval_request_id == ApprovalRequest.id,
        GovernedMutationProposal.mutation_kind == PROCESS_MUTATION_KIND,
        GovernedMutationProposal.primary_resource_type == PROCESS_RESOURCE_TYPE,
        _strict_sql_identity_predicate(),
        *extra_conditions,
    ).exists()


def governed_process_requester_clause(user_id: int | None):
    if user_id is None:
        return false()
    return valid_governed_process_proposal_exists_clause(GovernedMutationProposal.requested_by_id == user_id)


def governed_process_role_match_clause(role_name: str | None):
    if role_name not in ALLOWED_APPROVER_ROLES:
        return false()
    scenario = GovernedMutationProposal.scenario_snapshot
    roles_field = literal("approver_roles")
    return or_(
        _JsonFieldArrayText(scenario, roles_field, literal(0)) == role_name,
        _JsonFieldArrayText(scenario, roles_field, literal(1)) == role_name,
    )


__all__ = [
    "GovernedProcessIdentity",
    "InvalidGovernedProcessIdentity",
    "PROCESS_MUTATION_KIND",
    "PROCESS_RESOURCE_TYPE",
    "PROCESS_DISPLAY_NAME_MAX_LENGTH",
    "any_governed_mutation_proposal_exists_clause",
    "canonical_process_display_name",
    "exact_governed_process_proposal_exists_clause",
    "governed_process_requester_clause",
    "governed_process_role_match_clause",
    "is_exact_governed_process_proposal",
    "new_governed_process_proposal",
    "strict_governed_process_identity",
    "valid_governed_process_proposal_exists_clause",
]
