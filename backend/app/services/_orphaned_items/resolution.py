from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import build_change_set, log_activity
from app.core.datetime_utils import utc_now
from app.core.exceptions import ConflictError, ValidationError
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.asset import Asset
from app.models.control import Control
from app.models.department import Department
from app.models.governed_mutation import GovernedMutationImpactLock
from app.models.key_risk_indicator import KeyRiskIndicator
from app.models.orphaned_item import OrphanedItem
from app.models.process import Process
from app.models.risk import Risk
from app.models.role import Role, RoleType
from app.models.threat import Threat
from app.models.user import User
from app.models.vendor import Vendor
from app.schemas.asset import AssetUpdate
from app.schemas.vendor import VendorUpdate
from app.services._asset_owner_lock import lock_asset_for_owner_mutation
from app.services._ict_register_lifecycle.asset_policy import (
    assert_active_asset_department,
    assert_active_asset_owner,
)
from app.services._ict_register_lifecycle.policy import (
    assert_active_owning_department,
    assert_active_process_owner,
)
from app.services._ict_register_lifecycle.threat_policy import assert_active_ciso_steward
from app.services._process_owner_lock import lock_process_for_owner_mutation
from app.services._threat_stewardship_lock import acquire_threat_steward_identity_locks
from app.services._vendor_owner_lock import lock_vendor_for_owner_mutation
from app.services.transaction_boundary import commit_service_boundary

from .governance import orphan_item_definition, orphan_resolution_requirements_projection
from .logging import logger
from .workflow import OrphanResolutionConflict, assert_orphan_still_matches_target_state


async def _get_fallback_owner_id(db: AsyncSession) -> int | None:
    """Find a fallback owner (first admin) for headless items."""
    from app.models.role import Role, RoleType

    result = await db.execute(select(User.id).join(Role).where(Role.name == RoleType.ADMIN).limit(1))
    return result.scalar_one_or_none()


@dataclass
class OrphanResolutionContext:
    orphan: OrphanedItem
    new_owner: User | None
    target_risk: Risk | None
    target_department_id: int | None


async def validate_resolution_context(
    db: AsyncSession,
    *,
    orphan_id: int,
    new_owner_id: int | None = None,
    department_id: int | None = None,
    target_risk_id: int | None = None,
    for_update: bool = False,
) -> OrphanResolutionContext:
    orphan_stmt = select(OrphanedItem).where(OrphanedItem.id == orphan_id)
    if for_update:
        orphan_stmt = orphan_stmt.with_for_update()
    result = await db.execute(orphan_stmt)
    orphan = result.scalar_one_or_none()

    if not orphan:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")
    orphan_item_definition(orphan.item_type)

    new_owner = None
    if new_owner_id is not None:
        owner_result = await db.execute(select(User).where(User.id == new_owner_id))
        new_owner = owner_result.scalar_one_or_none()
        if not new_owner:
            raise ValueError(f"New owner {new_owner_id} not found")
        if not new_owner.is_active:
            raise ValueError(f"New owner {new_owner_id} is not active")

    target_risk = None
    if target_risk_id is not None:
        target_risk_result = await db.execute(select(Risk).where(Risk.id == target_risk_id))
        target_risk = target_risk_result.scalar_one_or_none()
        if not target_risk:
            raise ValueError(f"Target risk {target_risk_id} not found")

    requirements = orphan_resolution_requirements_projection(orphan.item_type)

    if orphan.item_type == "risk":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned risks")
        if target_risk is not None:
            raise ValueError("target_risk_id is not supported for orphaned risks")
        target_department_id = department_id if department_id is not None else new_owner.department_id
        if target_department_id is None:
            raise ValueError("department_id is required when the new owner has no department")
        if new_owner.department_id is not None and target_department_id != new_owner.department_id:
            raise ValueError("Risk reassignment must stay within the new owner's department")
        return OrphanResolutionContext(orphan, new_owner, None, target_department_id)

    if orphan.item_type == "control":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned controls")
        target_department_id = department_id if department_id is not None else new_owner.department_id
        if target_department_id is None:
            raise ValueError("department_id is required when the new owner has no department")
        if new_owner.department_id is not None and target_department_id != new_owner.department_id:
            raise ValueError("Control reassignment must stay within the new owner's department")
        if target_risk is not None and target_risk.department_id != target_department_id:
            raise ValueError("target_risk_id must belong to the target department")
        return OrphanResolutionContext(orphan, new_owner, target_risk, target_department_id)

    if orphan.item_type == "kri":
        if target_risk is None:
            raise ValueError("target_risk_id is required to resolve orphaned KRIs")
        target_department_id = department_id if department_id is not None else target_risk.department_id
        if target_department_id != target_risk.department_id:
            raise ValueError("KRI reassignment must stay within the target risk department")
        return OrphanResolutionContext(orphan, new_owner, target_risk, target_department_id)

    if orphan.item_type == "threat":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned threats")
        steward_state = (
            await db.execute(
                select(
                    User.is_active.label("user_is_active"),
                    Role.is_active.label("role_is_active"),
                    Role.name,
                )
                .join(Role, Role.id == User.role_id)
                .where(User.id == new_owner.id)
            )
        ).one()
        if not steward_state.user_is_active or not steward_state.role_is_active or steward_state.name != RoleType.CISO:
            raise ValueError("Threat steward must be an active CISO")
        if department_id is not None or target_risk is not None:
            raise ValueError("Threat reassignment does not accept department_id or target_risk_id")
        return OrphanResolutionContext(orphan, new_owner, None, None)

    if orphan.item_type == "process":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned processes")
        if target_risk is not None:
            raise ValueError("target_risk_id is not supported for orphaned processes")
        process = (await db.execute(select(Process).where(Process.id == orphan.item_id))).scalar_one_or_none()
        if process is None:
            raise ValueError(f"Process {orphan.item_id} no longer exists")
        target_department_id = department_id if department_id is not None else process.owning_department_id
        if target_department_id is None:
            raise ValueError("department_id is required for orphaned processes")
        department_is_active = await db.scalar(
            select(Department.is_active).where(Department.id == target_department_id)
        )
        if department_is_active is not True:
            raise ValueError("Owning department must be active")
        return OrphanResolutionContext(
            orphan,
            new_owner,
            None,
            target_department_id,
        )

    if orphan.item_type == "asset":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned Assets")
        if target_risk is not None:
            raise ValueError("target_risk_id is not supported for orphaned Assets")
        if orphan.responsibility_role not in {"business_owner", "ict_owner"}:
            raise ValueError("Asset orphan responsibility_role is invalid")
        try:
            await assert_active_asset_owner(
                db,
                user_id=new_owner.id,
                acquire_identity_lock=False,
            )
        except ValidationError as exc:
            raise ValueError(str(exc)) from exc
        asset = await db.get(Asset, orphan.item_id)
        if asset is None:
            raise ValueError(f"Asset {orphan.item_id} no longer exists")
        target_department_id = department_id or asset.owning_department_id
        if target_department_id is None:
            raise ValueError("department_id is required for orphaned Assets")
        department_is_active = await db.scalar(
            select(Department.is_active).where(Department.id == target_department_id)
        )
        if department_is_active is not True:
            raise ValueError("Owning department must be active")
        return OrphanResolutionContext(
            orphan,
            new_owner,
            None,
            target_department_id,
        )

    if orphan.item_type == "vendor":
        if new_owner is None:
            raise ValueError("new_owner_id is required to resolve orphaned Vendors")
        if orphan.responsibility_role != "outsourcing_owner":
            raise ValueError("Vendor orphan responsibility_role is invalid")
        if department_id is not None or target_risk is not None:
            raise ValueError("Vendor reassignment does not accept department_id or target_risk_id")
        vendor = await db.get(Vendor, orphan.item_id)
        if vendor is None:
            raise ValueError(f"Vendor {orphan.item_id} no longer exists")
        return OrphanResolutionContext(orphan, new_owner, None, None)

    raise ValueError(f"Unsupported orphaned item type: {requirements.item_type}")


async def resolve_orphan(
    db: AsyncSession,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None = None,
    department_id: int | None = None,
    target_risk_id: int | None = None,
) -> OrphanedItem:
    """
    Resolve an orphaned item by assigning a new owner.

    Args:
        db: Database session
        orphan_id: ID of the orphaned_item record
        resolved_by_id: ID of admin who resolved this
        new_owner_id: Optional ID of new owner to assign
        department_id: Optional department to assign
        target_risk_id: Optional risk ID to link item to

    Returns:
        Updated OrphanedItem record

    Raises:
        ValueError: If orphan not found or already resolved
    """
    orphan_type = await db.scalar(select(OrphanedItem.item_type).where(OrphanedItem.id == orphan_id))
    if orphan_type == "process":
        return await _resolve_process_orphan(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
        )
    if orphan_type == "asset":
        return await _resolve_asset_orphan(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
        )
    if orphan_type == "vendor":
        return await _resolve_vendor_orphan(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
        )

    context = await validate_resolution_context(
        db,
        orphan_id=orphan_id,
        new_owner_id=new_owner_id,
        department_id=department_id,
        target_risk_id=target_risk_id,
        for_update=True,
    )
    orphan = context.orphan
    target_risk = context.target_risk
    target_dept_id = context.target_department_id
    resolving_user = await db.get(User, resolved_by_id)

    # Update the actual item's owner and department
    if orphan.item_type == "risk":
        risk_result = await db.execute(select(Risk).where(Risk.id == orphan.item_id).with_for_update())
        risk = risk_result.scalar_one_or_none()
        if not risk:
            raise ValueError(f"Risk {orphan.item_id} no longer exists")
        await assert_orphan_still_matches_target_state(db, orphan=orphan, target_entity=risk)
        risk_changes = build_change_set(
            risk,
            {
                "owner_id": new_owner_id,
                "department_id": target_dept_id,
            },
        )
        risk.owner_id = new_owner_id
        risk.department_id = target_dept_id
        await log_activity(
            db,
            entity_type=ActivityEntityType.RISK,
            entity_id=risk.id,
            entity_name=risk.name,
            safe_entity_label=risk.risk_id_code,
            action=ActivityAction.UPDATE,
            actor=resolving_user,
            department_id=target_dept_id,
            changes=risk_changes,
            description=f"Resolved orphaned risk via governance workflow #{orphan.id}",
        )
        logger.info("Reassigned risk %s to user %s, dept %s", risk.id, new_owner_id, target_dept_id)

    elif orphan.item_type == "control":
        control_result = await db.execute(select(Control).where(Control.id == orphan.item_id).with_for_update())
        control = control_result.scalar_one_or_none()
        if not control:
            raise ValueError(f"Control {orphan.item_id} no longer exists")
        await assert_orphan_still_matches_target_state(db, orphan=orphan, target_entity=control)
        control_changes = build_change_set(
            control,
            {
                "control_owner_id": new_owner_id,
                "department_id": target_dept_id,
            },
        )
        control.control_owner_id = new_owner_id
        control.department_id = target_dept_id

        if target_risk is not None:
            from app.models.risk import ControlRiskLink

            link_res = await db.execute(
                select(ControlRiskLink).where(
                    ControlRiskLink.control_id == control.id,
                    ControlRiskLink.risk_id == target_risk.id,
                )
            )
            if not link_res.scalar_one_or_none():
                link = ControlRiskLink(
                    control_id=control.id,
                    risk_id=target_risk.id,
                    effectiveness="partially_effective",
                )
                db.add(link)
                control_changes = control_changes or {}
                control_changes["target_risk_id"] = {"old": None, "new": target_risk.id}

        await log_activity(
            db,
            entity_type=ActivityEntityType.CONTROL,
            entity_id=control.id,
            entity_name=control.name,
            action=ActivityAction.UPDATE,
            actor=resolving_user,
            department_id=target_dept_id,
            changes=control_changes,
            description=f"Resolved orphaned control via governance workflow #{orphan.id}",
        )
        logger.info("Reassigned control %s to user %s, dept %s", control.id, new_owner_id, target_dept_id)

    elif orphan.item_type == "kri":
        kri_result = await db.execute(
            select(KeyRiskIndicator).where(KeyRiskIndicator.id == orphan.item_id).with_for_update()
        )
        kri = kri_result.scalar_one_or_none()
        if not kri:
            raise ValueError(f"KRI {orphan.item_id} no longer exists")
        await assert_orphan_still_matches_target_state(db, orphan=orphan, target_entity=kri)
        if target_risk is None:
            raise ValueError("target_risk_id is required to resolve orphaned KRIs")
        kri_changes = build_change_set(kri, {"risk_id": target_risk.id})
        kri.risk_id = target_risk.id
        await log_activity(
            db,
            entity_type=ActivityEntityType.KRI,
            entity_id=kri.id,
            entity_name=kri.metric_name,
            safe_entity_label=kri.metric_name,
            action=ActivityAction.UPDATE,
            actor=resolving_user,
            department_id=target_dept_id,
            changes=kri_changes,
            description=f"Resolved orphaned KRI via governance workflow #{orphan.id}",
        )
        logger.info("Resolved KRI %s by linking to risk %s", kri.id, target_risk.id)

    elif orphan.item_type == "threat":
        threat = (
            await db.execute(select(Threat).where(Threat.id == orphan.item_id).with_for_update())
        ).scalar_one_or_none()
        if not threat:
            raise ValueError(f"Threat {orphan.item_id} no longer exists")
        # Match ordinary Threat reassignment lock order: establish the exact
        # current steward under the Threat row lock, then acquire the current
        # and proposed identities once in deterministic order. Revalidate the
        # proposed CISO after waiting for those locks.
        await acquire_threat_steward_identity_locks(
            db,
            user_ids=(threat.threat_steward_user_id, new_owner_id),
        )
        try:
            new_steward = await assert_active_ciso_steward(
                db,
                user_id=int(new_owner_id),
                acquire_identity_lock=False,
            )
        except ValidationError as exc:
            raise ValueError("Threat steward must be an active CISO") from exc
        await assert_orphan_still_matches_target_state(db, orphan=orphan, target_entity=threat)
        threat_changes = build_change_set(
            threat,
            {"threat_steward_user_id": new_owner_id},
        )
        threat.threat_steward = new_steward
        await log_activity(
            db,
            entity_type=ActivityEntityType.THREAT,
            entity_id=threat.id,
            entity_name=threat.name,
            action=ActivityAction.UPDATE,
            actor=resolving_user,
            department_id=None,
            changes=threat_changes,
            description=f"Resolved orphaned threat via governance workflow #{orphan.id}",
        )
        logger.info("Reassigned threat %s to CISO user %s", threat.id, new_owner_id)

    # Mark orphan as resolved
    orphan.status = "resolved"
    orphan.resolved_at = utc_now()
    orphan.resolved_by_id = resolved_by_id
    orphan.new_owner_id = new_owner_id

    await commit_service_boundary(db, boundary="orphaned_items.resolve")

    return orphan


async def _locked_accountability_policy(
    db: AsyncSession,
    *,
    request_reason: str | None,
) -> tuple[bool, str]:
    """Lock the fixed scenario only after the orphan accountability closure."""
    from app.services._governed_mutations.fixed_accountability_policy import (
        load_fixed_accountability_scenario_for_update,
    )

    scenario = await load_fixed_accountability_scenario_for_update(db)
    reason = (request_reason or "").strip()
    if scenario.requires_approval and not reason:
        raise ValidationError(
            "A request reason is mandatory for an accountability reassignment",
            code="governed_mutation_reason_required",
            status_code=422,
        )
    return scenario.requires_approval, reason


async def submit_orphan_reassignment(
    db: AsyncSession,
    orphan_id: int,
    resolved_by_id: int,
    *,
    new_owner_id: int | None = None,
    department_id: int | None = None,
    target_risk_id: int | None = None,
    request_reason: str | None = None,
) -> object:
    """Submit supported orphan reassignments through their resource workflow."""
    orphan_type = await db.scalar(
        select(OrphanedItem.item_type).where(OrphanedItem.id == orphan_id)
    )
    if orphan_type == "asset":
        return await _submit_asset_orphan_reassignment(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
            request_reason=request_reason,
        )
    if orphan_type == "vendor":
        return await _submit_vendor_orphan_reassignment(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
            request_reason=request_reason,
        )
    if orphan_type == "threat":
        return await _submit_threat_orphan_reassignment(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
            request_reason=request_reason,
        )
    if orphan_type != "process":
        return await resolve_orphan(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
        )
    if new_owner_id is None:
        raise ValueError("new_owner_id is required to resolve orphaned processes")
    if target_risk_id is not None:
        raise ValueError("target_risk_id is not supported for orphaned processes")

    preview = (
        await db.execute(
            select(
                OrphanedItem.item_id,
                OrphanedItem.status,
                OrphanedItem.previous_owner_id,
            ).where(OrphanedItem.id == orphan_id)
        )
    ).one_or_none()
    if preview is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if preview.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    process_snapshot = (
        await db.execute(
            select(
                Process.process_owner_user_id,
                Process.owning_department_id,
            ).where(Process.id == preview.item_id)
        )
    ).one_or_none()
    if process_snapshot is None:
        raise ValueError(f"Process {preview.item_id} no longer exists")
    process = await lock_process_for_owner_mutation(
        db,
        process_id=preview.item_id,
        user_ids=(process_snapshot.process_owner_user_id, new_owner_id),
        expected_owner_user_id=process_snapshot.process_owner_user_id,
    )
    if process is None:
        raise ValueError(f"Process {preview.item_id} no longer exists")

    from app.services._governed_mutations import assert_no_pending_process_mutation
    from app.services._governed_mutations.process_updates import (
        submit_process_mutation_if_required,
    )

    new_owner = await assert_active_process_owner(
        db,
        user_id=new_owner_id,
        acquire_identity_lock=False,
    )
    target_department_id = department_id or process.owning_department_id
    if target_department_id is None:
        raise ValueError("department_id is required for orphaned processes")
    owning_department = await assert_active_owning_department(
        db,
        department_id=target_department_id,
    )
    await assert_no_pending_process_mutation(db, process_id=process.id)
    orphan = (
        await db.execute(
            select(OrphanedItem)
            .where(OrphanedItem.id == orphan_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if orphan is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.item_type != "process" or orphan.item_id != process.id:
        raise ConflictError("Orphaned Process target changed concurrently; retry")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    await db.refresh(
        process,
        attribute_names=["process_owner", "owning_department"],
    )
    await assert_orphan_still_matches_target_state(
        db,
        orphan=orphan,
        target_entity=process,
    )
    requester = await db.get(User, resolved_by_id)
    if requester is None:
        raise ValueError(f"Resolving user {resolved_by_id} not found")
    queued = await submit_process_mutation_if_required(
        db=db,
        process=process,
        updates={
            "process_owner_user_id": new_owner_id,
            "owning_department_id": target_department_id,
        },
        request_reason=request_reason,
        current_user=requester,
        proposed_owner=new_owner,
        proposed_department=owning_department,
        orphan_resolution=(orphan.id, orphan.previous_owner_id),
    )
    if queued is not None:
        return queued
    return await _resolve_process_orphan(
        db,
        orphan_id=orphan_id,
        resolved_by_id=resolved_by_id,
        new_owner_id=new_owner_id,
        department_id=department_id,
        target_risk_id=target_risk_id,
    )


async def _submit_asset_orphan_reassignment(
    db: AsyncSession,
    *,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None,
    department_id: int | None,
    target_risk_id: int | None,
    request_reason: str | None,
) -> object:
    if new_owner_id is None:
        raise ValueError("new_owner_id is required to resolve orphaned Assets")
    if target_risk_id is not None:
        raise ValueError("target_risk_id is not supported for orphaned Assets")
    preview = (
        await db.execute(
            select(
                OrphanedItem.item_id,
                OrphanedItem.status,
                OrphanedItem.previous_owner_id,
                OrphanedItem.responsibility_role,
            ).where(OrphanedItem.id == orphan_id)
        )
    ).one_or_none()
    if preview is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if preview.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    if preview.responsibility_role not in {"business_owner", "ict_owner"}:
        raise ValueError("Asset orphan responsibility_role is invalid")
    snapshot = (
        await db.execute(
            select(
                Asset.business_owner_user_id,
                Asset.ict_owner_user_id,
                Asset.owning_department_id,
            ).where(Asset.id == preview.item_id)
        )
    ).one_or_none()
    if snapshot is None:
        raise ValueError(f"Asset {preview.item_id} no longer exists")
    expected_owner_ids = (
        snapshot.business_owner_user_id,
        snapshot.ict_owner_user_id,
    )
    asset = await lock_asset_for_owner_mutation(
        db,
        asset_id=preview.item_id,
        user_ids=(*expected_owner_ids, new_owner_id),
        expected_owner_user_ids=expected_owner_ids,
    )
    if asset is None:
        raise ValueError(f"Asset {preview.item_id} no longer exists")
    try:
        await assert_active_asset_owner(
            db,
            user_id=new_owner_id,
            acquire_identity_lock=False,
        )
        target_department_id = department_id or asset.owning_department_id
        if target_department_id is None:
            raise ValueError("department_id is required for orphaned Assets")
        await assert_active_asset_department(
            db,
            department_id=target_department_id,
        )
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc
    orphan = (
        await db.execute(
            select(OrphanedItem)
            .where(OrphanedItem.id == orphan_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if orphan is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.item_type != "asset" or orphan.item_id != asset.id:
        raise ConflictError("Orphaned Asset target changed concurrently; retry")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    if orphan.responsibility_role != preview.responsibility_role:
        raise ConflictError("Orphaned Asset responsibility changed concurrently; retry")
    await assert_orphan_still_matches_target_state(
        db,
        orphan=orphan,
        target_entity=asset,
    )
    requester = await db.get(User, resolved_by_id)
    if requester is None:
        raise ValueError(f"Resolving user {resolved_by_id} not found")
    owner_field = f"{orphan.responsibility_role}_user_id"
    updates = {owner_field: new_owner_id}
    if target_department_id != asset.owning_department_id:
        updates["owning_department_id"] = target_department_id
    from app.services._governed_mutations.asset_mutations import (
        submit_asset_edit_if_required,
    )

    queued = await submit_asset_edit_if_required(
        db=db,
        asset=asset,
        payload=AssetUpdate(**updates, request_reason=request_reason),
        current_user=requester,
        updates=updates,
        orphan_resolution=(orphan.id, orphan.previous_owner_id),
    )
    if queued is not None:
        return queued
    return await _resolve_asset_orphan(
        db,
        orphan_id=orphan_id,
        resolved_by_id=resolved_by_id,
        new_owner_id=new_owner_id,
        department_id=department_id,
        target_risk_id=target_risk_id,
    )


async def _submit_vendor_orphan_reassignment(
    db: AsyncSession,
    *,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None,
    department_id: int | None,
    target_risk_id: int | None,
    request_reason: str,
) -> object:
    if new_owner_id is None:
        raise ValueError("new_owner_id is required to resolve orphaned Vendors")
    if department_id is not None:
        raise ValueError("department_id is not supported for orphaned Vendors")
    if target_risk_id is not None:
        raise ValueError("target_risk_id is not supported for orphaned Vendors")
    preview = (
        await db.execute(
            select(
                OrphanedItem.item_id,
                OrphanedItem.status,
                OrphanedItem.previous_owner_id,
                OrphanedItem.responsibility_role,
            ).where(OrphanedItem.id == orphan_id)
        )
    ).one_or_none()
    if preview is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if preview.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    if preview.responsibility_role != "outsourcing_owner":
        raise ValueError("Vendor orphan responsibility_role is invalid")
    vendor_owner_id = await db.scalar(
        select(Vendor.outsourcing_owner_user_id).where(Vendor.id == preview.item_id)
    )
    if vendor_owner_id is None:
        raise ValueError(f"Vendor {preview.item_id} no longer exists")
    vendor = await lock_vendor_for_owner_mutation(
        db,
        vendor_id=preview.item_id,
        user_ids=(vendor_owner_id, new_owner_id),
        expected_owner_user_id=vendor_owner_id,
    )
    if vendor is None:
        raise ValueError(f"Vendor {preview.item_id} no longer exists")
    new_owner = await db.scalar(
        select(User).where(User.id == new_owner_id, User.is_active.is_(True))
    )
    if new_owner is None:
        raise ValueError(f"New owner {new_owner_id} is not active")
    orphan = (
        await db.execute(
            select(OrphanedItem)
            .where(OrphanedItem.id == orphan_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if orphan is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.item_type != "vendor" or orphan.item_id != vendor.id:
        raise ConflictError("Orphaned Vendor target changed concurrently; retry")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    if orphan.responsibility_role != "outsourcing_owner":
        raise ConflictError("Orphaned Vendor responsibility changed concurrently; retry")
    await assert_orphan_still_matches_target_state(
        db,
        orphan=orphan,
        target_entity=vendor,
    )
    requester = await db.get(User, resolved_by_id)
    if requester is None:
        raise ValueError(f"Resolving user {resolved_by_id} not found")
    from app.services._governed_mutations.vendor_mutations import (
        submit_vendor_edit_if_required,
    )

    queued = await submit_vendor_edit_if_required(
        db=db,
        vendor=vendor,
        payload=VendorUpdate(
            outsourcing_owner_user_id=new_owner_id,
            request_reason=request_reason,
        ),
        current_user=requester,
        updates={"outsourcing_owner_user_id": new_owner_id},
        orphan_resolution=(orphan.id, orphan.previous_owner_id),
    )
    if queued is not None:
        return queued
    return await resolve_orphan(
        db,
        orphan_id=orphan_id,
        resolved_by_id=resolved_by_id,
        new_owner_id=new_owner_id,
        department_id=department_id,
        target_risk_id=target_risk_id,
    )


async def _submit_threat_orphan_reassignment(
    db: AsyncSession,
    *,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None,
    department_id: int | None,
    target_risk_id: int | None,
    request_reason: str,
) -> object:
    if new_owner_id is None:
        raise ValueError("new_owner_id is required to resolve orphaned threats")
    if department_id is not None or target_risk_id is not None:
        raise ValueError(
            "Threat reassignment does not accept department_id or target_risk_id"
        )
    preview = (
        await db.execute(
            select(
                OrphanedItem.item_id,
                OrphanedItem.status,
                OrphanedItem.previous_owner_id,
            ).where(OrphanedItem.id == orphan_id)
        )
    ).one_or_none()
    if preview is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if preview.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    threat = (
        await db.execute(
            select(Threat)
            .where(Threat.id == preview.item_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if threat is None:
        raise ValueError(f"Threat {preview.item_id} no longer exists")
    await acquire_threat_steward_identity_locks(
        db,
        user_ids=(threat.threat_steward_user_id, new_owner_id),
    )
    try:
        new_steward = await assert_active_ciso_steward(
            db,
            user_id=new_owner_id,
            acquire_identity_lock=False,
        )
    except ValidationError as exc:
        raise ValueError("Threat steward must be an active CISO") from exc
    orphan = (
        await db.execute(
            select(OrphanedItem)
            .where(OrphanedItem.id == orphan_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if orphan is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.item_type != "threat" or orphan.item_id != threat.id:
        raise ConflictError("Orphaned Threat target changed concurrently; retry")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(
            f"Orphaned item {orphan_id} is already resolved"
        )
    requires_approval, request_reason = await _locked_accountability_policy(
        db,
        request_reason=request_reason,
    )
    if not requires_approval:
        return await resolve_orphan(
            db,
            orphan_id=orphan_id,
            resolved_by_id=resolved_by_id,
            new_owner_id=new_owner_id,
            department_id=department_id,
            target_risk_id=target_risk_id,
        )
    await assert_orphan_still_matches_target_state(
        db,
        orphan=orphan,
        target_entity=threat,
    )
    requester = await db.get(User, resolved_by_id)
    if requester is None:
        raise ValueError(f"Resolving user {resolved_by_id} not found")
    await db.refresh(threat, attribute_names=["threat_steward"])
    from app.services._governed_mutations.threat_mutations import (
        submit_threat_steward_edit_if_required,
    )

    queued = await submit_threat_steward_edit_if_required(
        db=db,
        threat=threat,
        current_user=requester,
        new_steward=new_steward,
        request_reason=request_reason,
        orphan_resolution=(orphan.id, orphan.previous_owner_id),
    )
    if queued is not None:
        return queued
    return await resolve_orphan(
        db,
        orphan_id=orphan_id,
        resolved_by_id=resolved_by_id,
        new_owner_id=new_owner_id,
        department_id=department_id,
        target_risk_id=target_risk_id,
    )


async def _resolve_process_orphan(
    db: AsyncSession,
    *,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None,
    department_id: int | None,
    target_risk_id: int | None,
) -> OrphanedItem:
    """Resolve Process ownership using identity -> Process -> orphan locks."""
    if new_owner_id is None:
        raise ValueError("new_owner_id is required to resolve orphaned processes")
    if target_risk_id is not None:
        raise ValueError("target_risk_id is not supported for orphaned processes")

    preview = (
        await db.execute(
            select(
                OrphanedItem.item_id,
                OrphanedItem.status,
                OrphanedItem.previous_owner_id,
            ).where(OrphanedItem.id == orphan_id)
        )
    ).one_or_none()
    if preview is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if preview.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")

    process_snapshot = (
        await db.execute(
            select(Process.process_owner_user_id, Process.owning_department_id).where(Process.id == preview.item_id)
        )
    ).one_or_none()
    if process_snapshot is None:
        raise ValueError(f"Process {preview.item_id} no longer exists")
    expected_owner_id = process_snapshot.process_owner_user_id

    process = await lock_process_for_owner_mutation(
        db,
        process_id=preview.item_id,
        user_ids=(expected_owner_id, new_owner_id),
        expected_owner_user_id=expected_owner_id,
    )
    if process is None:
        raise ValueError(f"Process {preview.item_id} no longer exists")

    from app.services._governed_mutations import assert_no_pending_process_mutation

    await assert_no_pending_process_mutation(db, process_id=process.id)

    orphan = (
        await db.execute(
            select(OrphanedItem)
            .where(OrphanedItem.id == orphan_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if orphan is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.item_type != "process" or orphan.item_id != process.id:
        raise ConflictError("Orphaned Process target changed concurrently; retry")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")

    new_process_owner = await assert_active_process_owner(
        db,
        user_id=int(new_owner_id),
        acquire_identity_lock=False,
    )
    target_dept_id = department_id or process.owning_department_id
    if target_dept_id is None:
        raise ValueError("department_id is required for orphaned processes")
    owning_department = await assert_active_owning_department(
        db,
        department_id=int(target_dept_id),
    )
    await assert_orphan_still_matches_target_state(
        db,
        orphan=orphan,
        target_entity=process,
    )

    process_changes = build_change_set(
        process,
        {
            "process_owner_user_id": new_owner_id,
            "owning_department_id": target_dept_id,
        },
    )
    process.process_owner = new_process_owner
    process.process_owner_user_id = new_owner_id
    process.owning_department = owning_department
    process.owning_department_id = target_dept_id
    process.governance_version += 1
    resolving_user = await db.get(User, resolved_by_id)
    await log_activity(
        db,
        entity_type=ActivityEntityType.PROCESS,
        entity_id=process.id,
        entity_name=f"{process.f_code} {process.l1_process}",
        safe_entity_label=process.f_code,
        action=ActivityAction.UPDATE,
        actor=resolving_user,
        department_id=target_dept_id,
        changes=process_changes,
        description=f"Resolved orphaned process via governance workflow #{orphan.id}",
    )

    orphan.status = "resolved"
    orphan.resolved_at = utc_now()
    orphan.resolved_by_id = resolved_by_id
    orphan.new_owner_id = new_owner_id
    await commit_service_boundary(db, boundary="orphaned_items.resolve")
    return orphan


async def _resolve_vendor_orphan(
    db: AsyncSession,
    *,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None,
    department_id: int | None,
    target_risk_id: int | None,
) -> OrphanedItem:
    """Resolve Vendor ownership using identity -> Vendor -> orphan locks."""
    if new_owner_id is None:
        raise ValueError("new_owner_id is required to resolve orphaned Vendors")
    if department_id is not None or target_risk_id is not None:
        raise ValueError("Vendor reassignment does not accept department_id or target_risk_id")

    preview = (
        await db.execute(
            select(
                OrphanedItem.item_type,
                OrphanedItem.item_id,
                OrphanedItem.status,
                OrphanedItem.previous_owner_id,
                OrphanedItem.responsibility_role,
            ).where(OrphanedItem.id == orphan_id)
        )
    ).one_or_none()
    if preview is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if preview.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")
    if preview.item_type != "vendor":
        raise ValueError(f"Orphaned item {orphan_id} is not a Vendor")
    if preview.responsibility_role != "outsourcing_owner":
        raise ValueError("Vendor orphan responsibility_role is invalid")

    expected_owner_id = await db.scalar(select(Vendor.outsourcing_owner_user_id).where(Vendor.id == preview.item_id))
    if expected_owner_id is None:
        raise ValueError(f"Vendor {preview.item_id} no longer exists")
    vendor = await lock_vendor_for_owner_mutation(
        db,
        vendor_id=preview.item_id,
        user_ids=(expected_owner_id, new_owner_id),
        expected_owner_user_id=expected_owner_id,
    )
    if vendor is None:
        raise ValueError(f"Vendor {preview.item_id} no longer exists")

    orphan = (
        await db.execute(select(OrphanedItem).where(OrphanedItem.id == orphan_id).with_for_update())
    ).scalar_one_or_none()
    if orphan is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.item_type != "vendor" or orphan.item_id != vendor.id:
        raise ConflictError("Orphaned Vendor target changed concurrently; retry")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")
    if orphan.previous_owner_id != preview.previous_owner_id:
        raise ConflictError("Orphaned Vendor owner evidence changed concurrently; retry")
    if orphan.responsibility_role != preview.responsibility_role:
        raise ConflictError("Orphaned Vendor responsibility changed concurrently; retry")

    new_owner = (
        await db.execute(select(User).where(User.id == new_owner_id, User.is_active.is_(True)))
    ).scalar_one_or_none()
    if new_owner is None:
        raise ValueError("Vendor owner must be an active user")
    await assert_orphan_still_matches_target_state(
        db,
        orphan=orphan,
        target_entity=vendor,
    )

    changes = build_change_set(
        vendor,
        {"outsourcing_owner_user_id": new_owner_id},
    )
    vendor.outsourcing_owner = new_owner
    vendor.outsourcing_owner_user_id = new_owner_id

    resolving_user = await db.get(User, resolved_by_id)
    await log_activity(
        db,
        entity_type=ActivityEntityType.VENDOR,
        entity_id=vendor.id,
        entity_name=vendor.name,
        safe_entity_label=f"VEND-{vendor.id}",
        action=ActivityAction.UPDATE,
        actor=resolving_user,
        department_id=vendor.department_id,
        changes=changes,
        description=f"Resolved orphaned Vendor via governance workflow #{orphan.id}",
    )

    orphan.status = "resolved"
    orphan.resolved_at = utc_now()
    orphan.resolved_by_id = resolved_by_id
    orphan.new_owner_id = new_owner_id
    await commit_service_boundary(db, boundary="orphaned_items.resolve")
    return orphan


async def _resolve_asset_orphan(
    db: AsyncSession,
    *,
    orphan_id: int,
    resolved_by_id: int,
    new_owner_id: int | None,
    department_id: int | None,
    target_risk_id: int | None,
) -> OrphanedItem:
    """Resolve one Asset responsibility using identity -> Asset -> orphan locks."""
    if new_owner_id is None:
        raise ValueError("new_owner_id is required to resolve orphaned Assets")
    if target_risk_id is not None:
        raise ValueError("target_risk_id is not supported for orphaned Assets")

    preview = (
        await db.execute(
            select(
                OrphanedItem.item_id,
                OrphanedItem.status,
                OrphanedItem.previous_owner_id,
                OrphanedItem.responsibility_role,
            ).where(OrphanedItem.id == orphan_id)
        )
    ).one_or_none()
    if preview is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if preview.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")
    if preview.responsibility_role not in {"business_owner", "ict_owner"}:
        raise ValueError("Asset orphan responsibility_role is invalid")

    snapshot = (
        await db.execute(
            select(
                Asset.business_owner_user_id,
                Asset.ict_owner_user_id,
                Asset.owning_department_id,
            ).where(Asset.id == preview.item_id)
        )
    ).one_or_none()
    if snapshot is None:
        raise ValueError(f"Asset {preview.item_id} no longer exists")
    expected_owner_ids = (
        snapshot.business_owner_user_id,
        snapshot.ict_owner_user_id,
    )
    asset = await lock_asset_for_owner_mutation(
        db,
        asset_id=preview.item_id,
        user_ids=(*expected_owner_ids, new_owner_id),
        expected_owner_user_ids=expected_owner_ids,
    )
    if asset is None:
        raise ValueError(f"Asset {preview.item_id} no longer exists")

    active_impact_lock = (
        await db.execute(
            select(GovernedMutationImpactLock.id)
            .where(
                GovernedMutationImpactLock.resource_type == "asset",
                GovernedMutationImpactLock.resource_id == asset.id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if active_impact_lock is not None:
        raise ConflictError(
            "A governed Asset change is pending; resolve it before reassigning ownership",
            code="asset_pending_mutation",
        )

    orphan = (
        await db.execute(
            select(OrphanedItem)
            .where(OrphanedItem.id == orphan_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if orphan is None:
        raise ValueError(f"Orphaned item {orphan_id} not found")
    if orphan.item_type != "asset" or orphan.item_id != asset.id:
        raise ConflictError("Orphaned Asset target changed concurrently; retry")
    if orphan.status != "pending":
        raise OrphanResolutionConflict(f"Orphaned item {orphan_id} is already resolved")
    if orphan.responsibility_role != preview.responsibility_role:
        raise ConflictError("Orphaned Asset responsibility changed concurrently; retry")

    try:
        new_owner = await assert_active_asset_owner(
            db,
            user_id=int(new_owner_id),
            acquire_identity_lock=False,
        )
        target_department_id = department_id or asset.owning_department_id
        if target_department_id is None:
            raise ValueError("department_id is required for orphaned Assets")
        owning_department = await assert_active_asset_department(
            db,
            department_id=int(target_department_id),
        )
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc

    await assert_orphan_still_matches_target_state(
        db,
        orphan=orphan,
        target_entity=asset,
    )
    owner_field = f"{orphan.responsibility_role}_user_id"
    changes = build_change_set(
        asset,
        {
            owner_field: new_owner_id,
            "owning_department_id": target_department_id,
        },
    )
    if orphan.responsibility_role == "business_owner":
        asset.business_owner = new_owner
        asset.business_owner_user_id = new_owner_id
    else:
        asset.ict_owner = new_owner
        asset.ict_owner_user_id = new_owner_id
    asset.owning_department = owning_department
    asset.owning_department_id = target_department_id
    asset.governance_version += 1

    resolving_user = await db.get(User, resolved_by_id)
    await log_activity(
        db,
        entity_type=ActivityEntityType.ASSET,
        entity_id=asset.id,
        entity_name=asset.name,
        safe_entity_label=f"AST-{asset.id}",
        action=ActivityAction.UPDATE,
        actor=resolving_user,
        department_id=target_department_id,
        changes=changes,
        description=("Resolved orphaned Asset " f"{orphan.responsibility_role} via governance workflow #{orphan.id}"),
    )

    orphan.status = "resolved"
    orphan.resolved_at = utc_now()
    orphan.resolved_by_id = resolved_by_id
    orphan.new_owner_id = new_owner_id
    await commit_service_boundary(db, boundary="orphaned_items.resolve")
    return orphan
