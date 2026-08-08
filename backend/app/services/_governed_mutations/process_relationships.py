"""Canonical validation and application for governed Process relationships."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import asset as audit_asset
from app.core.audit import process as audit_process
from app.core.audit import risk as audit_risk
from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.models import (
    Asset,
    Control,
    ControlRiskLink,
    KeyRiskIndicator,
    OrphanedItem,
    Process,
    ProcessAssetLink,
    ProcessVendorLink,
    Risk,
    RiskProcessLink,
    User,
    Vendor,
)
from app.services._asset_owner_lock import acquire_asset_owner_identity_locks
from app.services._ict_register_lifecycle.asset_policy import (
    assert_asset_readable,
    can_update_asset_record,
)
from app.services._ict_register_lifecycle.policy import (
    assert_process_readable,
    can_update_process_record,
)
from app.services._ict_register_lifecycle.threat_links import require_risk_end_access
from app.services._process_owner_lock import acquire_process_owner_identity_locks
from app.services._vendor_governance.policy import assert_vendor_not_pending_governance
from app.services._vendor_owner_lock import acquire_vendor_owner_identity_locks

from .process_identity import canonical_process_display_name

if TYPE_CHECKING:
    from sqlalchemy.engine import Row

RelationshipType = Literal["risk", "asset", "vendor"]
RelationshipAction = Literal["add", "update", "remove"]

_ASSET_ATTRIBUTES = frozenset({"significance", "spof", "is_primary", "note"})
_VENDOR_ATTRIBUTES = frozenset({"direct_service_description", "note"})


@dataclass(frozen=True, slots=True)
class RelationshipAuthorizationSnapshot:
    relationship_type: RelationshipType
    related_resource_id: int
    owner_user_ids: tuple[int, ...]
    department_ids: tuple[int, ...]
    related_state: tuple[object, ...]


async def snapshot_process_relationship_authorization(
    db: AsyncSession,
    *,
    process_ids: set[int],
    operation: object,
) -> RelationshipAuthorizationSnapshot:
    """Discover the authorization lock set before acquiring identity locks."""
    data = validate_process_relationship_operation(operation)
    relationship_type: RelationshipType = data["relationship_type"]
    related_id = int(data["related_resource_id"])
    process_rows = list(
        (
            await db.execute(
                select(Process.id, Process.process_owner_user_id, Process.owning_department_id)
                .where(Process.id.in_(process_ids))
                .order_by(Process.id)
            )
        ).all()
    )
    if {row.id for row in process_rows} != process_ids:
        raise ConflictError("An impacted Process no longer exists")

    process_owner_ids = {row.process_owner_user_id for row in process_rows}
    department_ids = {row.owning_department_id for row in process_rows if row.owning_department_id is not None}
    related_owner_ids: set[int] = set()
    row: Row[Any] | None
    related_state: tuple[object, ...]
    if relationship_type == "risk":
        row = (
            await db.execute(
                select(Risk.id, Risk.owner_id, Risk.department_id, Risk.is_archived).where(Risk.id == related_id)
            )
        ).one_or_none()
        if row is None:
            raise ConflictError("Referenced Risk is no longer eligible")
        related_state = (row.owner_id, row.department_id, row.is_archived)
        related_owner_ids = {row.owner_id} if row.owner_id is not None else set()
        if row.department_id is not None:
            department_ids.add(row.department_id)
    elif relationship_type == "asset":
        row = (
            await db.execute(
                select(
                    Asset.id,
                    Asset.business_owner_user_id,
                    Asset.ict_owner_user_id,
                    Asset.owning_department_id,
                    Asset.is_archived,
                ).where(Asset.id == related_id)
            )
        ).one_or_none()
        if row is None:
            raise ConflictError("Referenced Asset is no longer eligible")
        related_state = (
            row.business_owner_user_id,
            row.ict_owner_user_id,
            row.owning_department_id,
            row.is_archived,
        )
        related_owner_ids = {
            owner_id for owner_id in (row.business_owner_user_id, row.ict_owner_user_id) if owner_id is not None
        }
        if row.owning_department_id is not None:
            department_ids.add(row.owning_department_id)
    else:
        row = (
            await db.execute(
                select(
                    Vendor.id,
                    Vendor.outsourcing_owner_user_id,
                    Vendor.department_id,
                    Vendor.is_archived,
                ).where(Vendor.id == related_id)
            )
        ).one_or_none()
        if row is None:
            raise ConflictError("Referenced Vendor is no longer eligible")
        related_state = (row.outsourcing_owner_user_id, row.department_id, row.is_archived)
        related_owner_ids = {row.outsourcing_owner_user_id}
        if row.department_id is not None:
            department_ids.add(row.department_id)

    # Match the identity-lifecycle namespace order: Process -> Asset -> Vendor.
    await acquire_process_owner_identity_locks(db, user_ids=process_owner_ids)
    if relationship_type == "asset":
        await acquire_asset_owner_identity_locks(db, user_ids=related_owner_ids)
    if relationship_type == "vendor":
        await acquire_vendor_owner_identity_locks(db, user_ids=related_owner_ids)
    return RelationshipAuthorizationSnapshot(
        relationship_type=relationship_type,
        related_resource_id=related_id,
        owner_user_ids=tuple(sorted(process_owner_ids | related_owner_ids)),
        department_ids=tuple(sorted(department_ids)),
        related_state=related_state,
    )


async def lock_process_relationship_authorization_rows(
    db: AsyncSession,
    *,
    snapshot: RelationshipAuthorizationSnapshot,
) -> None:
    """Lock and verify every related row used by requester authorization."""
    related_id = snapshot.related_resource_id
    row: Risk | Asset | Vendor | None
    state: tuple[object, ...] | None
    if snapshot.relationship_type == "risk":
        row = (
            await db.execute(
                select(Risk).where(Risk.id == related_id).with_for_update().execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        state = None if row is None else (row.owner_id, row.department_id, row.is_archived)
        # Risk visibility can be inherited from owned KRIs or linked Controls;
        # lock those ownership/bridge rows before the final canonical recheck.
        await db.execute(
            select(KeyRiskIndicator)
            .where(KeyRiskIndicator.risk_id == related_id)
            .order_by(KeyRiskIndicator.id)
            .with_for_update()
        )
        control_links = list(
            (
                await db.execute(
                    select(ControlRiskLink)
                    .where(ControlRiskLink.risk_id == related_id)
                    .order_by(ControlRiskLink.id)
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        control_ids = sorted({link.control_id for link in control_links})
        await db.execute(select(Control).where(Control.id.in_(control_ids)).order_by(Control.id).with_for_update())
    elif snapshot.relationship_type == "asset":
        row = (
            await db.execute(
                select(Asset).where(Asset.id == related_id).with_for_update().execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        state = (
            None
            if row is None
            else (
                row.business_owner_user_id,
                row.ict_owner_user_id,
                row.owning_department_id,
                row.is_archived,
            )
        )
        await db.execute(
            select(OrphanedItem)
            .where(OrphanedItem.item_type == "asset", OrphanedItem.item_id == related_id)
            .order_by(OrphanedItem.id)
            .with_for_update()
        )
    else:
        row = (
            await db.execute(
                select(Vendor)
                .where(Vendor.id == related_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        state = None if row is None else (row.outsourcing_owner_user_id, row.department_id, row.is_archived)
        await db.execute(
            select(OrphanedItem)
            .where(
                OrphanedItem.item_type == "vendor",
                OrphanedItem.item_id == related_id,
            )
            .order_by(OrphanedItem.id)
            .with_for_update()
        )
    if state != snapshot.related_state:
        raise ConflictError(
            "Relationship authorization scope changed concurrently; retry",
            code="approval_actor_scope_changed",
        )
    if snapshot.relationship_type == "vendor":
        await assert_vendor_not_pending_governance(db, vendor_id=related_id)


def process_impact_resource(
    process: Process,
    *,
    can_view_identity: bool = True,
) -> dict[str, object]:
    """Build one stable, display-safe Process impact-lock snapshot."""
    label = f"{process.f_code} — {process.l1_process}".strip() if can_view_identity else "Restricted Process"
    return {
        "resource_type": "process",
        "resource_id": process.id,
        "resource_name": label,
        "base_governance_version": process.governance_version,
    }


async def lock_process_relationship_targets(
    db: AsyncSession,
    *,
    process_ids: set[int],
    current_user: User,
    readable_process_id: int,
    allow_archived: bool = False,
) -> dict[int, Process]:
    """Lock every impacted Process in canonical identity/id order.

    Relationship entrypoints can be managed from Risk or Asset, so they do
    not require Process write authority. They still require canonical Process
    visibility and serialize with owner deactivation and ordinary Process
    mutations before proposal intake or direct application.
    """
    if readable_process_id not in process_ids or not process_ids:
        raise ValidationError("Invalid governed relationship impact set")
    optimistic = dict(
        (await db.execute(select(Process.id, Process.process_owner_user_id).where(Process.id.in_(process_ids))))
        .tuples()
        .all()
    )
    if set(optimistic) != process_ids:
        raise NotFoundError("Process not found")
    await acquire_process_owner_identity_locks(db, user_ids=optimistic.values())
    locked = list(
        (
            await db.execute(
                select(Process)
                .where(Process.id.in_(process_ids))
                .order_by(Process.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    by_id = {process.id: process for process in locked}
    if any(by_id[process_id].process_owner_user_id != owner_id for process_id, owner_id in optimistic.items()):
        raise ConflictError("Process ownership changed concurrently; retry")
    requested = by_id[readable_process_id]
    if requested.is_archived and not allow_archived:
        raise ConflictError("Cannot mutate relationships of an archived Process")
    if not can_update_process_record(current_user, requested):
        # Risk/Asset-managed entrypoints require read, not Process write.
        await assert_process_readable(
            db,
            process_id=readable_process_id,
            current_user=current_user,
        )
    return by_id


def _strict_positive_int(value: object, *, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValidationError(f"Invalid governed relationship {field}")
    return value


def _strict_mapping(value: object, *, field: str) -> dict[str, Any]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise ValidationError(f"Invalid governed relationship {field}")
    return value


def validate_process_relationship_operation(
    operation: object,
    *,
    process_id: int | None = None,
) -> dict[str, Any]:
    """Fail closed on a corrupt or unsupported immutable operation envelope."""
    data = _strict_mapping(operation, field="operation")
    allowed_keys = {
        "relationship_type",
        "action",
        "kind",
        "process_id",
        "related_resource_id",
        "related_resource_name",
        "link_id",
        "demoted_process_id",
        "before",
        "after",
    }
    if set(data) - allowed_keys:
        raise ValidationError("Unsupported governed relationship operation fields")

    relationship_type = data.get("relationship_type")
    if relationship_type not in {"risk", "asset", "vendor"}:
        raise ValidationError("Unsupported governed Process relationship")
    action = data.get("action")
    allowed_actions = {"risk": {"add", "remove"}, "asset": {"add", "update", "remove"}, "vendor": {"add", "remove"}}
    if action not in allowed_actions[relationship_type]:
        raise ValidationError("Unsupported governed Process relationship action")
    expected_kind = f"process.link.{relationship_type}.{action}"
    if data.get("kind") != expected_kind:
        raise ValidationError("Governed relationship mutation kind mismatch")

    operation_process_id = _strict_positive_int(data.get("process_id"), field="process_id")
    if process_id is not None and operation_process_id != process_id:
        raise ValidationError("Governed relationship Process identity mismatch")
    _strict_positive_int(data.get("related_resource_id"), field="related_resource_id")
    related_name = data.get("related_resource_name")
    if not isinstance(related_name, str) or not related_name.strip() or related_name.strip().isdigit():
        raise ValidationError("Invalid governed relationship display identity")

    if action == "add":
        allowed_before = ({"linked": False},) if relationship_type == "risk" else (None, {})
        if data.get("link_id") is not None or data.get("before") not in allowed_before:
            raise ValidationError("Invalid governed relationship add operation")
    else:
        _strict_positive_int(data.get("link_id"), field="link_id")

    before = _strict_mapping(data.get("before", {}), field="before")
    after = _strict_mapping(data.get("after", {}), field="after")
    demoted_process_id = data.get("demoted_process_id")
    if demoted_process_id is not None:
        demoted_process_id = _strict_positive_int(
            demoted_process_id,
            field="demoted_process_id",
        )
        if (
            relationship_type != "asset"
            or action not in {"add", "update"}
            or after.get("is_primary") is not True
            or demoted_process_id == operation_process_id
        ):
            raise ValidationError("Invalid governed primary Process demotion")
    if relationship_type == "asset":
        if set(before) - _ASSET_ATTRIBUTES or set(after) - _ASSET_ATTRIBUTES:
            raise ValidationError("Unsupported governed Process-Asset attributes")
        if action == "add" and not after:
            raise ValidationError("Missing governed Process-Asset attributes")
        if action == "update" and (not before or not after or before == after):
            raise ValidationError("Invalid governed Process-Asset update")
        if action == "remove" and not before:
            raise ValidationError("Missing governed Process-Asset removal snapshot")
    elif relationship_type == "vendor":
        if set(before) - _VENDOR_ATTRIBUTES or set(after) - _VENDOR_ATTRIBUTES:
            raise ValidationError("Unsupported governed Process-Vendor attributes")
        if action == "add" and set(after) != _VENDOR_ATTRIBUTES:
            raise ValidationError("Incomplete governed Process-Vendor attributes")
        if action == "remove" and set(before) != _VENDOR_ATTRIBUTES:
            raise ValidationError("Incomplete governed Process-Vendor removal snapshot")
    elif before != {"linked": action == "remove"} or after != {"linked": action == "add"}:
        raise ValidationError("Invalid governed Risk relationship state")
    if (
        relationship_type == "asset"
        and action in {"add", "update"}
        and after.get("is_primary") is True
        and data.get("demoted_process_id") is None
    ):
        # No demotion key is valid only when the Asset had no other primary.
        pass
    return data


async def validate_process_relationship_requester(
    db: AsyncSession,
    *,
    process: Process,
    operation: object,
    requester: User,
) -> None:
    """Revalidate the original endpoint authority without using resolver rights."""
    data = validate_process_relationship_operation(operation, process_id=process.id)
    related_id = int(data["related_resource_id"])
    relationship_type = str(data["relationship_type"])

    await assert_process_readable(db, process_id=process.id, current_user=requester)
    if relationship_type == "risk":
        await require_risk_end_access(
            db,
            risk_id=related_id,
            current_user=requester,
            other_resource="processes",
            require_write=True,
        )
        return
    if relationship_type == "asset":
        asset = await assert_asset_readable(db, asset_id=related_id, current_user=requester)
        if asset.is_archived or not can_update_asset_record(requester, asset):
            raise AuthorizationError("Permission denied: assets:write")
        pending_orphan = await db.scalar(
            select(OrphanedItem.id)
            .where(
                OrphanedItem.item_type == "asset",
                OrphanedItem.item_id == asset.id,
                OrphanedItem.status == "pending",
            )
            .limit(1)
        )
        if pending_orphan is not None:
            raise ConflictError("Orphaned Asset responsibility must be reassigned through governance")
        return
    if not can_update_process_record(requester, process):
        raise AuthorizationError("Permission denied: processes:write")
    if not check_permission(requester, "vendors", "read"):
        raise AuthorizationError("Permission denied: vendors:read")
    vendor = await db.get(Vendor, related_id)
    if vendor is None or not can_read_vendor(vendor, requester):
        raise NotFoundError("Vendor not found")
    await assert_vendor_not_pending_governance(db, vendor_id=related_id)


def _asset_link_snapshot(link: ProcessAssetLink) -> dict[str, Any]:
    return {
        "significance": link.significance,
        "spof": link.spof,
        "is_primary": link.is_primary,
        "note": link.note,
    }


def _vendor_link_snapshot(link: ProcessVendorLink) -> dict[str, Any]:
    return {
        "direct_service_description": link.direct_service_description,
        "note": link.note,
    }


async def apply_process_relationship_operation(
    db: AsyncSession,
    *,
    process: Process,
    operation: object,
    current_user: User,
) -> dict[str, dict[str, object]]:
    """Apply one already-authorized immutable relationship operation.

    The caller owns transaction, proposal audit, outbox, and approval state.
    Reference and link state are locked and revalidated here immediately before
    mutation. ``current_user`` is intentionally not used for authorization;
    it is the independently authorized resolver recorded on the domain audit.
    """
    data = validate_process_relationship_operation(operation, process_id=process.id)
    relationship_type = str(data["relationship_type"])
    action = str(data["action"])
    related_id = int(data["related_resource_id"])
    link_id = data.get("link_id")
    demoted_process_id = data.get("demoted_process_id")
    process_label = canonical_process_display_name(process.f_code, process.l1_process)
    before = dict(data.get("before", {}))
    after = dict(data.get("after", {}))

    if process.is_archived and action != "remove":
        raise ConflictError("Cannot mutate relationships of an archived Process")

    existing: RiskProcessLink | ProcessAssetLink | ProcessVendorLink | None
    if relationship_type == "risk":
        risk = (await db.execute(select(Risk).where(Risk.id == related_id).with_for_update())).scalar_one_or_none()
        if risk is None or (action == "add" and risk.is_archived):
            raise ConflictError("Referenced Risk is no longer eligible")
        existing = (
            await db.execute(
                select(RiskProcessLink)
                .where(
                    RiskProcessLink.risk_id == related_id,
                    RiskProcessLink.process_id == process.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if action == "add":
            if existing is not None:
                raise ConflictError("Risk-Process link state changed while approval was pending")
            db.add(RiskProcessLink(risk_id=related_id, process_id=process.id))
        else:
            if existing is None or existing.id != link_id:
                raise ConflictError("Risk-Process link state changed while approval was pending")
            await db.delete(existing)

    elif relationship_type == "asset":
        asset = (await db.execute(select(Asset).where(Asset.id == related_id).with_for_update())).scalar_one_or_none()
        if asset is None or asset.is_archived:
            raise ConflictError("Referenced Asset is no longer eligible")
        links = list(
            (
                await db.execute(
                    select(ProcessAssetLink)
                    .where(ProcessAssetLink.asset_id == related_id)
                    .order_by(ProcessAssetLink.id)
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        existing = next((row for row in links if row.process_id == process.id), None)
        current_primary = next((row for row in links if row.is_primary), None)
        current_demoted_id = (
            current_primary.process_id
            if current_primary is not None and current_primary.process_id != process.id
            else None
        )
        if current_demoted_id != demoted_process_id:
            raise ConflictError("Asset primary Process changed while approval was pending")
        demoted_process = None
        demoted_process_version_before = None
        if demoted_process_id is not None:
            demoted_process = (
                await db.execute(
                    select(Process)
                    .where(Process.id == demoted_process_id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalar_one_or_none()
            if demoted_process is None:
                raise ConflictError("Impacted primary Process no longer exists")
            demoted_process_version_before = demoted_process.governance_version
        if action == "add":
            if existing is not None:
                raise ConflictError("Process-Asset link state changed while approval was pending")
            if after.get("is_primary") is True:
                await db.execute(
                    update(ProcessAssetLink)
                    .where(ProcessAssetLink.asset_id == related_id, ProcessAssetLink.is_primary.is_(True))
                    .values(is_primary=False)
                )
            db.add(ProcessAssetLink(asset_id=related_id, process_id=process.id, **after))
        elif action == "update":
            if existing is None or existing.id != link_id or _asset_link_snapshot(existing) != before:
                raise ConflictError("Process-Asset link state changed while approval was pending")
            if after.get("is_primary") is True:
                await db.execute(
                    update(ProcessAssetLink)
                    .where(ProcessAssetLink.asset_id == related_id, ProcessAssetLink.is_primary.is_(True))
                    .values(is_primary=False)
                )
            for field, value in after.items():
                setattr(existing, field, value)
        else:
            if existing is None or existing.id != link_id or _asset_link_snapshot(existing) != before:
                raise ConflictError("Process-Asset link state changed while approval was pending")
            await db.delete(existing)

    else:
        vendor = (
            await db.execute(select(Vendor).where(Vendor.id == related_id).with_for_update())
        ).scalar_one_or_none()
        if vendor is None or (action == "add" and vendor.is_archived):
            raise ConflictError("Referenced Vendor is no longer eligible")
        existing = (
            await db.execute(
                select(ProcessVendorLink)
                .where(
                    ProcessVendorLink.process_id == process.id,
                    ProcessVendorLink.vendor_id == related_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if action == "add":
            if existing is not None:
                raise ConflictError("Process-Vendor link state changed while approval was pending")
            db.add(ProcessVendorLink(process_id=process.id, vendor_id=related_id, **after))
        else:
            if existing is None or existing.id != link_id or _vendor_link_snapshot(existing) != before:
                raise ConflictError("Process-Vendor link state changed while approval was pending")
            await db.delete(existing)

    process.governance_version += 1
    if relationship_type == "asset" and demoted_process_id is not None:
        assert demoted_process is not None
        demoted_process.governance_version += 1
    await db.flush()
    if relationship_type == "risk":
        assert risk is not None
        if action == "add":
            await audit_risk.risk_link_created(
                db,
                actor=current_user,
                risk=risk,
                link_kind="process",
                target_id=process.id,
                target_label=process_label,
            )
        else:
            await audit_risk.risk_link_deleted(
                db,
                actor=current_user,
                risk=risk,
                link_kind="process",
                target_id=process.id,
                target_label=process_label,
            )
    elif relationship_type == "asset":
        assert asset is not None
        if action == "add":
            await audit_asset.asset_link_created(
                db,
                actor=current_user,
                asset=asset,
                link_kind="process",
                target_id=process.id,
                target_label=process_label,
            )
        elif action == "update":
            attribute_changes = {
                field: {"old": before.get(field), "new": after.get(field)}
                for field in sorted(set(before) | set(after))
                if before.get(field) != after.get(field)
            }
            await audit_asset.asset_link_updated(
                db,
                actor=current_user,
                asset=asset,
                link_kind="process",
                target_id=process.id,
                changes=attribute_changes,
                target_label=process_label,
            )
        else:
            await audit_asset.asset_link_deleted(
                db,
                actor=current_user,
                asset=asset,
                link_kind="process",
                target_id=process.id,
                target_label=process_label,
            )
        if demoted_process_id is not None:
            assert demoted_process is not None
            assert demoted_process_version_before is not None
            await audit_asset.asset_link_updated(
                db,
                actor=current_user,
                asset=asset,
                link_kind="process",
                target_id=demoted_process.id,
                target_label=canonical_process_display_name(
                    demoted_process.f_code,
                    demoted_process.l1_process,
                ),
                changes={
                    "is_primary": {"old": True, "new": False},
                    "process_governance_version": {
                        "old": demoted_process_version_before,
                        "new": demoted_process.governance_version,
                    },
                    "replacement_primary_process": {
                        "old": None,
                        "new": process_label,
                    },
                },
            )
    else:
        if action == "add":
            await audit_process.process_link_created(
                db,
                actor=current_user,
                process=process,
                link_kind="vendor",
                target_id=related_id,
                target_label=str(data["related_resource_name"]),
            )
        else:
            await audit_process.process_link_deleted(
                db,
                actor=current_user,
                process=process,
                link_kind="vendor",
                target_id=related_id,
                target_label=str(data["related_resource_name"]),
            )
    label = str(data["related_resource_name"])
    return {
        f"{relationship_type}_relationship": {
            "old": label if action in {"update", "remove"} else None,
            "new": label if action in {"add", "update"} else None,
        }
    }


__all__ = [
    "apply_process_relationship_operation",
    "lock_process_relationship_authorization_rows",
    "lock_process_relationship_targets",
    "process_impact_resource",
    "snapshot_process_relationship_authorization",
    "validate_process_relationship_operation",
    "validate_process_relationship_requester",
]
