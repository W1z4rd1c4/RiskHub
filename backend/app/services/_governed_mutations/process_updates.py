"""Governed Process edit intake for ADR-016."""

from __future__ import annotations

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import build_approval_queued_response
from app.core.audit import governed_mutation as audit_governed
from app.core.exceptions import ConflictError, ValidationError
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Asset,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Process,
    ProcessAssetLink,
    User,
)
from app.services._ict_register_lifecycle.projection import (
    load_governed_process_derived_blocks,
)
from app.services.outbox import OutboxService
from app.services.transaction_boundary import commit_service_boundary

from .asset_mutations import process_point_asset_impacts
from .composite_policy import effective_triggered_policy_roles, triggered_policy_snapshot
from .fixed_accountability_policy import (
    ACCOUNTABILITY_SCENARIO_KEY,
    load_fixed_accountability_scenario_for_update,
    validated_fixed_accountability_roles,
)
from .fixed_asset_policy import (
    ASSET_SCENARIO_KEY,
    load_fixed_asset_scenario_for_update,
    validated_fixed_asset_roles,
)
from .fixed_policy import (
    SCENARIO_KEY,
    load_fixed_process_scenario_for_update,
    validated_fixed_process_roles,
)
from .fixed_vendor_policy import (
    VENDOR_SCENARIO_KEY,
    load_fixed_vendor_scenario_for_update,
    validated_fixed_vendor_roles,
)
from .process_identity import (
    canonical_process_display_name,
    new_governed_process_proposal,
)
from .process_mutation_policy import (
    has_independent_process_approver,
    safe_process_department_label,
    safe_process_user_label,
)
from .vendor_impact import process_point_vendor_impacts, vendor_impact_is_protected


async def increment_process_downstream_asset_versions(
    db: AsyncSession,
    *,
    process_id: int,
) -> None:
    """Version every Asset whose derivation can change with a direct Process point mutation."""
    assets = list(
        (
            await db.execute(
                select(Asset)
                .join(ProcessAssetLink, ProcessAssetLink.asset_id == Asset.id)
                .where(ProcessAssetLink.process_id == process_id)
                .order_by(Asset.id)
                .with_for_update()
            )
        ).scalars()
    )
    for asset in assets:
        asset.governance_version += 1


async def assert_no_pending_process_mutation(db: AsyncSession, *, process_id: int) -> None:
    active = (
        await db.execute(
            select(GovernedMutationImpactLock.id)
            .where(
                GovernedMutationImpactLock.resource_type == "process",
                GovernedMutationImpactLock.resource_id == process_id,
                GovernedMutationImpactLock.released_at.is_(None),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if active is not None:
        approval_id = (
            await db.execute(
                select(ApprovalRequest.id)
                .join(GovernedMutationProposal)
                .join(GovernedMutationImpactLock)
                .where(GovernedMutationImpactLock.id == active)
            )
        ).scalar_one()
        raise ConflictError(
            f"A governed Process change is already pending (approval {approval_id})",
            code="process_pending_mutation",
        )


async def active_governed_process_mutation_ids(
    db: AsyncSession,
    *,
    process_ids: set[int],
) -> set[int]:
    """Batch-project active Process impact locks for authoritative UI gating."""
    if not process_ids:
        return set()
    rows = await db.execute(
        select(GovernedMutationImpactLock.resource_id)
        .where(
            GovernedMutationImpactLock.resource_type == "process",
            GovernedMutationImpactLock.resource_id.in_(process_ids),
            GovernedMutationImpactLock.released_at.is_(None),
        )
        .distinct()
    )
    return set(rows.scalars().all())


async def _change_snapshots(
    db: AsyncSession,
    process: Process,
    updates: dict[str, object],
    *,
    proposed_owner: User | None,
    proposed_department: Department | None,
) -> tuple[dict, dict, dict, dict, dict]:
    raw_before = {field: jsonable_encoder(getattr(process, field)) for field in sorted(updates)}
    raw_after = {field: jsonable_encoder(value) for field, value in sorted(updates.items())}
    before = dict(raw_before)
    after = dict(raw_after)
    if "process_owner_user_id" in updates:
        current_owner = await db.get(User, process.process_owner_user_id)
        before["process_owner_user_id"] = safe_process_user_label(current_owner)
        after["process_owner_user_id"] = safe_process_user_label(proposed_owner)
    if "owning_department_id" in updates:
        current_department = await db.get(
            Department,
            process.owning_department_id,
        )
        before["owning_department_id"] = safe_process_department_label(
            current_department
        )
        after["owning_department_id"] = safe_process_department_label(proposed_department)
    changes = {
        field: {"old": before[field], "new": after[field]}
        for field in sorted(updates)
        if raw_before[field] != raw_after[field]
    }
    return before, after, changes, raw_before, raw_after


async def submit_process_mutation_if_required(
    *,
    db: AsyncSession,
    process: Process,
    updates: dict[str, object],
    request_reason: str | None,
    current_user: User,
    proposed_owner: User | None = None,
    proposed_department: Department | None = None,
    orphan_resolution: tuple[int, int] | None = None,
) -> JSONResponse | None:
    """Queue a protected mutation, or return ``None`` for direct application."""
    before, after, changes, raw_before, raw_after = await _change_snapshots(
        db,
        process,
        updates,
        proposed_owner=proposed_owner,
        proposed_department=proposed_department,
    )
    if not changes:
        return None

    impacted_assets, asset_derived_rows = await process_point_asset_impacts(
        db,
        process=process,
        updates=updates,
    )
    impacted_vendors, vendor_derived_rows = await process_point_vendor_impacts(
        db,
        process=process,
        updates=updates,
    )
    current_block, proposed_block = await load_governed_process_derived_blocks(
        db,
        process,
        updates=updates,
    )

    process_protected = current_block.cif == "yes" or proposed_block.cif == "yes"
    asset_protected = any(
        block["cif"] == "yes" or block["resulting_criticality"] == "critical"
        for row in asset_derived_rows
        for block in (row["before"], row["after"])
    )
    vendor_protected = any(
        vendor_impact_is_protected(block)
        for row in vendor_derived_rows
        for block in (row["before"], row["after"])
    )
    triggered_scenarios: list[str] = []
    triggered_policies = []
    if process_protected:
        process_scenario = await load_fixed_process_scenario_for_update(db)
        if process_scenario.requires_approval:
            triggered_scenarios.append(SCENARIO_KEY)
            process_roles = validated_fixed_process_roles(process_scenario)
            triggered_policies.append(triggered_policy_snapshot(SCENARIO_KEY, process_roles))
    if asset_protected:
        asset_scenario = await load_fixed_asset_scenario_for_update(db)
        if asset_scenario.requires_approval:
            triggered_scenarios.append(ASSET_SCENARIO_KEY)
            asset_roles = validated_fixed_asset_roles(asset_scenario)
            triggered_policies.append(triggered_policy_snapshot(ASSET_SCENARIO_KEY, asset_roles))
    if vendor_protected:
        vendor_scenario = await load_fixed_vendor_scenario_for_update(db)
        if vendor_scenario.requires_approval:
            triggered_scenarios.append(VENDOR_SCENARIO_KEY)
            vendor_roles = validated_fixed_vendor_roles(vendor_scenario)
            triggered_policies.append(
                triggered_policy_snapshot(VENDOR_SCENARIO_KEY, vendor_roles)
            )
    accountability_changed = bool(
        set(changes) & {"process_owner_user_id", "owning_department_id"}
    )
    if accountability_changed:
        accountability_scenario = (
            await load_fixed_accountability_scenario_for_update(db)
        )
        if accountability_scenario.requires_approval:
            triggered_scenarios.append(ACCOUNTABILITY_SCENARIO_KEY)
            accountability_roles = validated_fixed_accountability_roles(
                accountability_scenario
            )
            triggered_policies.append(
                triggered_policy_snapshot(
                    ACCOUNTABILITY_SCENARIO_KEY,
                    accountability_roles,
                )
            )
    if not triggered_scenarios:
        return None
    roles = effective_triggered_policy_roles(triggered_policies)

    reason = (request_reason or "").strip()
    if not reason:
        raise ValidationError(
            "A request reason is mandatory for a protected Process change",
            code="governed_mutation_reason_required",
            status_code=422,
        )
    if not await has_independent_process_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
        process=process,
    ):
        raise ConflictError(
            "No independent Risk Manager or CRO is available to approve this change",
            code="governed_mutation_approver_missing",
        )

    process_display_name = canonical_process_display_name(
        process.f_code,
        process.l1_process,
    )
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=process.id,
        resource_name=process_display_name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=changes,
        scenario_key=triggered_scenarios[0],
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    try:
        await db.flush()
        process_derived = {
            "before": {
                "cif": current_block.cif,
                "criticality_class": current_block.criticality_class,
            },
            "after": {
                "cif": proposed_block.cif,
                "criticality_class": proposed_block.criticality_class,
            },
        }
        asset_impacts = [
            {
                "resource_type": "asset",
                "resource_id": asset.id,
                "resource_name": asset.name,
                "base_governance_version": asset.governance_version,
            }
            for asset in impacted_assets
        ]
        vendor_impacts = [
            {
                "resource_type": "vendor",
                "resource_id": vendor.id,
                "resource_name": vendor.name,
                "base_governance_version": vendor.governance_version,
            }
            for vendor in impacted_vendors
        ]
        proposal = new_governed_process_proposal(
            approval_request_id=approval.id,
            requested_by_id=current_user.id,
            process_id=process.id,
            process_name=process_display_name,
            approver_roles=roles,
            base_governance_version=process.governance_version,
            before_snapshot=before,
            after_snapshot=after,
            raw_before=raw_before,
            raw_after=raw_after,
            derived_impact_snapshot=(
                {
                    "processes": [{"resource_id": process.id, **process_derived}],
                    **({"assets": asset_derived_rows} if asset_derived_rows else {}),
                    **({"vendors": vendor_derived_rows} if vendor_derived_rows else {}),
                }
                if asset_impacts or vendor_impacts
                else process_derived
            ),
            asset_impacts=asset_impacts,
            vendor_impacts=vendor_impacts,
            scenario_key=triggered_scenarios[0],
            triggered_scenarios=triggered_scenarios,
            triggered_policies=triggered_policies,
        )
        db.add(proposal)
        await db.flush()
        db.add(
            GovernedMutationImpactLock(
                proposal_id=proposal.id,
                resource_type="process",
                resource_id=process.id,
                base_governance_version=process.governance_version,
            )
        )
        if orphan_resolution is not None:
            orphan_id, previous_owner_id = orphan_resolution
            db.add(
                GovernedMutationImpactLock(
                    proposal_id=proposal.id,
                    resource_type="orphaned_item",
                    resource_id=orphan_id,
                    base_governance_version=previous_owner_id,
                )
            )
        for asset in impacted_assets:
            db.add(
                GovernedMutationImpactLock(
                    proposal_id=proposal.id,
                    resource_type="asset",
                    resource_id=asset.id,
                    base_governance_version=asset.governance_version,
                )
            )
        for vendor in impacted_vendors:
            db.add(
                GovernedMutationImpactLock(
                    proposal_id=proposal.id,
                    resource_type="vendor",
                    resource_id=vendor.id,
                    base_governance_version=vendor.governance_version,
                )
            )
        await db.flush()
        await audit_governed.proposal_submitted(
            db,
            actor=current_user,
            approval=approval,
            proposal=proposal,
            department_id=process.owning_department_id,
            changes=changes,
        )
        await OutboxService.enqueue(
            db,
            event_type="approval.request_created",
            aggregate_type="approval_request",
            aggregate_id=approval.id,
            idempotency_key=f"approval.request_created:{approval.id}:pending",
            payload={"approval_id": approval.id},
        )
        await commit_service_boundary(db, boundary="governed_mutation.process_submit")
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(
            "A governed Process change is already pending",
            code="process_pending_mutation",
        ) from exc

    return build_approval_queued_response(
        message="Protected Process change submitted for independent approval",
        approval_id=approval.id,
        action_type="edit",
        pending_fields=list(changes),
        pending_changes=changes,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )
