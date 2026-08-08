"""Intake for protected direct Vendor mutations (#87)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import build_approval_queued_response
from app.core.audit import governed_mutation as audit_governed
from app.core.exceptions import ApprovalScenarioConfigurationError, ConflictError, ValidationError
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    GovernedMutationImpactLock,
    GovernedMutationProposal,
    Permission,
    Role,
    RolePermission,
    User,
    Vendor,
)
from app.models.user import AccessScope
from app.schemas.vendor import VendorCreate, VendorUpdate
from app.services._vendor_governance.projection import load_vendor_derived_blocks
from app.services.outbox import OutboxService
from app.services.transaction_boundary import commit_service_boundary

from .composite_policy import (
    effective_triggered_policy_roles,
    triggered_policy_snapshot,
)
from .fixed_accountability_policy import (
    ACCOUNTABILITY_SCENARIO_KEY,
    load_fixed_accountability_scenario_for_update,
    validated_fixed_accountability_roles,
)
from .fixed_vendor_policy import (
    VENDOR_SCENARIO_KEY,
    load_fixed_vendor_scenario,
    load_fixed_vendor_scenario_for_update,
    validated_fixed_vendor_roles,
)
from .vendor_identity import (
    VENDOR_ARCHIVE_KIND,
    VENDOR_CREATE_KIND,
    VENDOR_EDIT_KIND,
)

_PROTECTED_TIERS = frozenset({"critical", "significant"})


async def acquire_vendor_creation_name_lock(
    db: AsyncSession,
    *,
    vendor_name: str,
) -> None:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": f"riskhub:vendor:create:{vendor_name}"},
        )


def _required_reason(value: str | None) -> str:
    reason = (value or "").strip()
    if not reason:
        raise ValidationError(
            "A request reason is mandatory for a protected Vendor mutation",
            code="governed_mutation_reason_required",
            status_code=422,
        )
    return reason


def _impact(block) -> dict[str, object]:
    return {"tier": block.tier}


async def _creation_impact(db: AsyncSession, payload: VendorCreate) -> dict[str, object]:
    values = payload.model_dump(exclude={"request_reason"})
    vendor = Vendor(id=0, **values)
    return _impact((await load_vendor_derived_blocks(db, [vendor]))[0])


async def _existing_vendor_impacts(
    db: AsyncSession,
    *,
    vendor: Vendor,
    updates: dict[str, object],
) -> tuple[dict[str, object], dict[str, object]]:
    before = _impact((await load_vendor_derived_blocks(db, [vendor]))[vendor.id])
    original = {field: getattr(vendor, field) for field in updates}
    try:
        for field, value in updates.items():
            setattr(vendor, field, value.value if hasattr(value, "value") else value)
        with db.no_autoflush:
            after = _impact((await load_vendor_derived_blocks(db, [vendor]))[vendor.id])
    finally:
        for field, value in original.items():
            setattr(vendor, field, value)
    return before, after


def _is_protected(*impacts: dict[str, object]) -> bool:
    return any(impact.get("tier") in _PROTECTED_TIERS for impact in impacts)


async def protected_vendor_ids_requiring_approval(
    db: AsyncSession,
    vendors: Sequence[Vendor],
) -> list[int]:
    """Vendor ids whose relationship mutations the fixed protection policy governs.

    Same predicate as ``submit_vendor_relationship_mutation_if_required``: a
    protected current tier plus an enabled fixed Vendor scenario. Like that
    governed path, a missing scenario row fails closed for protected tiers
    (``ApprovalScenarioConfigurationError``) instead of allowing the write.
    """
    if not vendors:
        return []
    blocks = await load_vendor_derived_blocks(db, list(vendors))
    protected_ids = [vendor.id for vendor in vendors if _is_protected(_impact(blocks[vendor.id]))]
    if not protected_ids:
        return []
    scenario = await load_fixed_vendor_scenario(db)
    if scenario is None:
        raise ApprovalScenarioConfigurationError(
            "The fixed protected Vendor approval scenario is missing"
        )
    if not scenario.requires_approval:
        return []
    return protected_ids


async def _has_independent_approver(
    db: AsyncSession,
    *,
    requester_id: int,
    roles: list[str],
) -> bool:
    return (
        await db.scalar(
            select(User.id)
            .join(Role, Role.id == User.role_id)
            .join(RolePermission, RolePermission.role_id == Role.id)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(
                User.is_active.is_(True),
                User.id != requester_id,
                User.access_scope == AccessScope.GLOBAL,
                Role.is_active.is_(True),
                Role.name.in_(roles),
                or_(Permission.resource == "approvals", Permission.resource == "*"),
                or_(Permission.action == "write", Permission.action == "*"),
            )
            .limit(1)
        )
    ) is not None


async def _assert_no_duplicate_vendor_creation(
    db: AsyncSession,
    *,
    vendor_name: str,
) -> None:
    duplicate = await db.scalar(
        select(GovernedMutationProposal.id)
        .join(
            ApprovalRequest,
            ApprovalRequest.id == GovernedMutationProposal.approval_request_id,
        )
        .where(
            GovernedMutationProposal.mutation_kind == VENDOR_CREATE_KIND,
            GovernedMutationProposal.primary_resource_name == vendor_name,
            ApprovalRequest.status.in_(
                (ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)
            ),
        )
        .limit(1)
    )
    if duplicate is not None:
        raise ConflictError(
            "A governed Vendor creation is already pending",
            code="vendor_pending_mutation",
        )


async def assert_no_pending_vendor_mutation(
    db: AsyncSession,
    *,
    vendor_id: int,
) -> None:
    pending = await db.scalar(
        select(GovernedMutationImpactLock.id)
        .where(
            GovernedMutationImpactLock.resource_type == "vendor",
            GovernedMutationImpactLock.resource_id == vendor_id,
            GovernedMutationImpactLock.released_at.is_(None),
        )
        .limit(1)
    )
    if pending is not None:
        raise ConflictError(
            "A governed Vendor change is already pending",
            code="vendor_pending_mutation",
        )


async def _safe_vendor_snapshot(
    db: AsyncSession,
    vendor: Vendor,
    *,
    fields: set[str] | None = None,
) -> dict[str, object]:
    selected = fields or (set(VendorCreate.model_fields) - {"request_reason"})
    snapshot = {
        field: jsonable_encoder(getattr(vendor, field))
        for field in selected
        if hasattr(vendor, field)
    }
    if "outsourcing_owner_user_id" in selected:
        snapshot.pop("outsourcing_owner_user_id", None)
        owner = await db.get(User, vendor.outsourcing_owner_user_id)
        snapshot["outsourcing_owner"] = owner.name if owner else "Unknown user"
    if "department_id" in selected:
        snapshot.pop("department_id", None)
        department = (
            await db.get(Department, vendor.department_id)
            if vendor.department_id is not None
            else None
        )
        snapshot["owning_department"] = (
            department.name if department else "Unknown department"
        )
    return snapshot


async def _safe_vendor_creation_snapshot(
    db: AsyncSession,
    raw_after: dict[str, object],
) -> dict[str, object]:
    safe_after = dict(raw_after)
    owner_id = safe_after.pop("outsourcing_owner_user_id", None)
    department_id = safe_after.pop("department_id", None)
    owner = await db.get(User, owner_id) if type(owner_id) is int else None
    department = (
        await db.get(Department, department_id)
        if type(department_id) is int
        else None
    )
    safe_after["outsourcing_owner"] = owner.name if owner else "Unknown user"
    safe_after["owning_department"] = (
        department.name if department else "Unknown department"
    )
    return safe_after


async def _safe_vendor_edit_snapshots(
    db: AsyncSession,
    *,
    vendor: Vendor,
    raw_after: dict[str, object],
) -> tuple[dict[str, object], dict[str, object]]:
    before = await _safe_vendor_snapshot(db, vendor, fields=set(raw_after))
    after = dict(before)
    reference_fields = {
        "outsourcing_owner_user_id": (
            "outsourcing_owner",
            User,
            "Unknown user",
        ),
        "department_id": (
            "owning_department",
            Department,
            "Unknown department",
        ),
    }
    for field, value in raw_after.items():
        reference_field = reference_fields.get(field)
        if reference_field is None:
            after[field] = value
            continue
        safe_field, model, fallback = reference_field
        reference = await db.get(model, value)
        after[safe_field] = reference.name if reference else fallback
    return before, after


async def _enqueue(
    db: AsyncSession,
    *,
    approval: ApprovalRequest,
    proposal: GovernedMutationProposal,
    actor: User,
    department_id: int | None,
    changes: dict[str, dict[str, object]],
    boundary: str,
) -> None:
    await audit_governed.proposal_submitted(
        db,
        actor=actor,
        approval=approval,
        proposal=proposal,
        department_id=department_id,
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
    await commit_service_boundary(db, boundary=boundary)


async def submit_vendor_creation_if_required(
    *,
    db: AsyncSession,
    payload: VendorCreate,
    current_user: User,
) -> object | None:
    impact = await _creation_impact(db, payload)
    if not _is_protected(impact):
        return None
    scenario = await load_fixed_vendor_scenario_for_update(db)
    if not scenario.requires_approval:
        return None
    reason = _required_reason(payload.request_reason)
    roles = validated_fixed_vendor_roles(scenario)
    if not await _has_independent_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
    ):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    await _assert_no_duplicate_vendor_creation(db, vendor_name=payload.name)
    raw_after = jsonable_encoder(payload.model_dump(exclude={"request_reason"}))
    safe_after = await _safe_vendor_creation_snapshot(db, raw_after)
    pending = {
        field: {"old": None, "new": safe_after[field]} for field in sorted(safe_after)
    }
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.VENDOR,
        resource_id=None,
        resource_name=payload.name,
        action_type=ApprovalActionType.CREATE,
        pending_changes=pending,
        scenario_key=VENDOR_SCENARIO_KEY,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=VENDOR_CREATE_KIND,
        primary_resource_type="vendor",
        primary_resource_id=None,
        primary_resource_name=payload.name,
        scenario_snapshot={
            "key": VENDOR_SCENARIO_KEY,
            "requires_approval": True,
            "approver_roles": roles,
        },
        base_versions={},
        before_snapshot={},
        after_snapshot=safe_after,
        derived_impact_snapshot={"before": None, "after": impact},
        proposed_changes={"after": raw_after},
        impacted_resources_snapshot=[],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    await _enqueue(
        db,
        approval=approval,
        proposal=proposal,
        actor=current_user,
        department_id=payload.department_id,
        changes=pending,
        boundary="governed_mutation.vendor.create.submit",
    )
    return build_approval_queued_response(
        message="Protected Vendor creation submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.CREATE.value,
        pending_fields=list(pending),
        pending_changes=pending,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def submit_vendor_edit_if_required(
    *,
    db: AsyncSession,
    vendor: Vendor,
    payload: VendorUpdate,
    current_user: User,
    updates: dict[str, object],
    orphan_resolution: tuple[int, int] | None = None,
) -> object | None:
    await assert_no_pending_vendor_mutation(db, vendor_id=vendor.id)
    current_impact, proposed_impact = await _existing_vendor_impacts(
        db,
        vendor=vendor,
        updates=updates,
    )
    triggered_scenarios: list[str] = []
    triggered_policies: list[dict[str, object]] = []
    if _is_protected(current_impact, proposed_impact):
        vendor_scenario = await load_fixed_vendor_scenario_for_update(db)
        if vendor_scenario.requires_approval:
            vendor_roles = validated_fixed_vendor_roles(vendor_scenario)
            triggered_scenarios.append(VENDOR_SCENARIO_KEY)
            triggered_policies.append(
                triggered_policy_snapshot(VENDOR_SCENARIO_KEY, vendor_roles)
            )
    if "outsourcing_owner_user_id" in updates:
        accountability_scenario = (
            await load_fixed_accountability_scenario_for_update(db)
        )
        if accountability_scenario.requires_approval:
            accountability_roles = validated_fixed_accountability_roles(
                accountability_scenario
            )
            triggered_scenarios.append(ACCOUNTABILITY_SCENARIO_KEY)
            triggered_policies.append(
                triggered_policy_snapshot(
                    ACCOUNTABILITY_SCENARIO_KEY,
                    accountability_roles,
                )
            )
    if not triggered_scenarios:
        return None
    reason = _required_reason(payload.request_reason)
    roles = effective_triggered_policy_roles(triggered_policies)
    if not await _has_independent_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
    ):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    raw_before = {
        field: jsonable_encoder(getattr(vendor, field)) for field in updates
    }
    raw_after = jsonable_encoder(updates)
    before, after = await _safe_vendor_edit_snapshots(
        db,
        vendor=vendor,
        raw_after=raw_after,
    )
    pending = {
        field: {"old": before.get(field), "new": after.get(field)}
        for field in sorted(set(before) | set(after))
        if before.get(field) != after.get(field)
    }
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.VENDOR,
        resource_id=vendor.id,
        resource_name=vendor.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending,
        scenario_key=triggered_scenarios[0],
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    impact = {
        "resource_type": "vendor",
        "resource_id": vendor.id,
        "resource_name": vendor.name,
        "base_governance_version": vendor.governance_version,
    }
    scenario_snapshot: dict[str, object] = {
        "key": triggered_scenarios[0],
        "requires_approval": True,
        "approver_roles": roles,
    }
    if ACCOUNTABILITY_SCENARIO_KEY in triggered_scenarios:
        scenario_snapshot["triggered_policies"] = triggered_policies
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=VENDOR_EDIT_KIND,
        primary_resource_type="vendor",
        primary_resource_id=vendor.id,
        primary_resource_name=vendor.name,
        scenario_snapshot=scenario_snapshot,
        base_versions={"vendor": vendor.governance_version},
        before_snapshot=before,
        after_snapshot=after,
        derived_impact_snapshot={"before": current_impact, "after": proposed_impact},
        proposed_changes={"before": raw_before, "after": raw_after},
        impacted_resources_snapshot=[impact],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    db.add(
        GovernedMutationImpactLock(
            proposal_id=proposal.id,
            resource_type="vendor",
            resource_id=vendor.id,
            base_governance_version=vendor.governance_version,
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
    await _enqueue(
        db,
        approval=approval,
        proposal=proposal,
        actor=current_user,
        department_id=vendor.department_id,
        changes=pending,
        boundary="governed_mutation.vendor.edit.submit",
    )
    return build_approval_queued_response(
        message="Protected Vendor edit submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.EDIT.value,
        pending_fields=list(pending),
        pending_changes=pending,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def submit_vendor_archive_if_required(
    *,
    db: AsyncSession,
    vendor: Vendor,
    current_user: User,
    request_reason: str | None,
) -> object | None:
    await assert_no_pending_vendor_mutation(db, vendor_id=vendor.id)
    current_impact = _impact(
        (await load_vendor_derived_blocks(db, [vendor]))[vendor.id]
    )
    if not _is_protected(current_impact):
        return None
    scenario = await load_fixed_vendor_scenario_for_update(db)
    if not scenario.requires_approval:
        return None
    reason = _required_reason(request_reason)
    roles = validated_fixed_vendor_roles(scenario)
    if not await _has_independent_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
    ):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    pending = {"is_archived": {"old": False, "new": True}}
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.VENDOR,
        resource_id=vendor.id,
        resource_name=vendor.name,
        action_type=ApprovalActionType.DELETE,
        pending_changes=pending,
        scenario_key=VENDOR_SCENARIO_KEY,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    impact = {
        "resource_type": "vendor",
        "resource_id": vendor.id,
        "resource_name": vendor.name,
        "base_governance_version": vendor.governance_version,
    }
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=VENDOR_ARCHIVE_KIND,
        primary_resource_type="vendor",
        primary_resource_id=vendor.id,
        primary_resource_name=vendor.name,
        scenario_snapshot={
            "key": VENDOR_SCENARIO_KEY,
            "requires_approval": True,
            "approver_roles": roles,
        },
        base_versions={"vendor": vendor.governance_version},
        before_snapshot={"is_archived": False},
        after_snapshot={"is_archived": True},
        derived_impact_snapshot={"before": current_impact, "after": current_impact},
        proposed_changes={
            "before": {"is_archived": False},
            "after": {"is_archived": True},
        },
        impacted_resources_snapshot=[impact],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    db.add(
        GovernedMutationImpactLock(
            proposal_id=proposal.id,
            resource_type="vendor",
            resource_id=vendor.id,
            base_governance_version=vendor.governance_version,
        )
    )
    await _enqueue(
        db,
        approval=approval,
        proposal=proposal,
        actor=current_user,
        department_id=vendor.department_id,
        changes=pending,
        boundary="governed_mutation.vendor.archive.submit",
    )
    return build_approval_queued_response(
        message="Protected Vendor archive submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.DELETE.value,
        pending_fields=["is_archived"],
        pending_changes=pending,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def submit_vendor_child_mutation_if_required(
    *,
    db: AsyncSession,
    vendor: Vendor,
    mutation_kind: str,
    child_id: int | None,
    before: dict[str, object] | None,
    after: dict[str, object] | None,
    current_user: User,
    request_reason: str | None,
) -> object | None:
    """Queue one Contract/Sub-outsourcing mutation under the Vendor aggregate."""
    from .vendor_identity import VENDOR_CHILD_KINDS

    if mutation_kind not in VENDOR_CHILD_KINDS:
        raise ValidationError("Unsupported governed Vendor child mutation")
    await assert_no_pending_vendor_mutation(db, vendor_id=vendor.id)
    current_impact, _ = await _existing_vendor_impacts(
        db,
        vendor=vendor,
        updates={},
    )
    if not _is_protected(current_impact):
        return None
    scenario = await load_fixed_vendor_scenario_for_update(db)
    if not scenario.requires_approval:
        return None
    reason = _required_reason(request_reason)
    roles = validated_fixed_vendor_roles(scenario)
    if not await _has_independent_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
    ):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    safe_before = jsonable_encoder(before)
    safe_after = jsonable_encoder(after)
    pending = {
        "child_mutation": {
            "old": safe_before,
            "new": safe_after,
        }
    }
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.VENDOR,
        resource_id=vendor.id,
        resource_name=vendor.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending,
        scenario_key=VENDOR_SCENARIO_KEY,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    impact = {
        "resource_type": "vendor",
        "resource_id": vendor.id,
        "resource_name": vendor.name,
        "base_governance_version": vendor.governance_version,
    }
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=mutation_kind,
        primary_resource_type="vendor",
        primary_resource_id=vendor.id,
        primary_resource_name=vendor.name,
        scenario_snapshot={
            "key": VENDOR_SCENARIO_KEY,
            "requires_approval": True,
            "approver_roles": roles,
        },
        base_versions={"vendor": vendor.governance_version},
        before_snapshot={"child_mutation": safe_before},
        after_snapshot={"child_mutation": safe_after},
        derived_impact_snapshot={
            "before": current_impact,
            "after": current_impact,
        },
        proposed_changes={
            "operation": {
                "child_id": child_id,
                "before": safe_before,
                "after": safe_after,
            }
        },
        impacted_resources_snapshot=[impact],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    db.add(
        GovernedMutationImpactLock(
            proposal_id=proposal.id,
            resource_type="vendor",
            resource_id=vendor.id,
            base_governance_version=vendor.governance_version,
        )
    )
    await _enqueue(
        db,
        approval=approval,
        proposal=proposal,
        actor=current_user,
        department_id=vendor.department_id,
        changes=pending,
        boundary="governed_mutation.vendor.child.submit",
    )
    return build_approval_queued_response(
        message="Protected Vendor child mutation submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.EDIT.value,
        pending_fields=["child_mutation"],
        pending_changes=pending,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def submit_vendor_relationship_mutation_if_required(
    *,
    db: AsyncSession,
    vendor: Vendor,
    mutation_kind: str,
    entity_id: int,
    entity_name: str,
    current_user: User,
    request_reason: str | None,
) -> object | None:
    """Queue one Risk/Control/KRI relationship mutation under the Vendor aggregate."""
    from .vendor_identity import VENDOR_RELATIONSHIP_KINDS

    if mutation_kind not in VENDOR_RELATIONSHIP_KINDS:
        raise ValidationError("Unsupported governed Vendor relationship mutation")
    await assert_no_pending_vendor_mutation(db, vendor_id=vendor.id)
    current_impact, _ = await _existing_vendor_impacts(
        db,
        vendor=vendor,
        updates={},
    )
    if not _is_protected(current_impact):
        return None
    scenario = await load_fixed_vendor_scenario_for_update(db)
    if not scenario.requires_approval:
        return None
    reason = _required_reason(request_reason)
    roles = validated_fixed_vendor_roles(scenario)
    if not await _has_independent_approver(
        db,
        requester_id=current_user.id,
        roles=roles,
    ):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    _, _, resource, action = mutation_kind.split(".")
    adding = action == "add"
    relationship_target_before = None if adding else entity_name
    relationship_target_after = entity_name if adding else None
    pending = {
        f"linked_{resource}": {
            "old": not adding,
            "new": adding,
        },
        "relationship_target": {
            "old": relationship_target_before,
            "new": relationship_target_after,
        },
    }
    before_snapshot = {
        f"linked_{resource}": not adding,
        "relationship_target": relationship_target_before,
    }
    after_snapshot = {
        f"linked_{resource}": adding,
        "relationship_target": relationship_target_after,
    }
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.VENDOR,
        resource_id=vendor.id,
        resource_name=vendor.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending,
        scenario_key=VENDOR_SCENARIO_KEY,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    impact = {
        "resource_type": "vendor",
        "resource_id": vendor.id,
        "resource_name": vendor.name,
        "base_governance_version": vendor.governance_version,
    }
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=mutation_kind,
        primary_resource_type="vendor",
        primary_resource_id=vendor.id,
        primary_resource_name=vendor.name,
        scenario_snapshot={
            "key": VENDOR_SCENARIO_KEY,
            "requires_approval": True,
            "approver_roles": roles,
        },
        base_versions={"vendor": vendor.governance_version},
        before_snapshot=before_snapshot,
        after_snapshot=after_snapshot,
        derived_impact_snapshot={
            "before": current_impact,
            "after": current_impact,
        },
        proposed_changes={
            "operation": {
                "entity_id": entity_id,
                "entity_name": entity_name,
            }
        },
        impacted_resources_snapshot=[impact],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    db.add(
        GovernedMutationImpactLock(
            proposal_id=proposal.id,
            resource_type="vendor",
            resource_id=vendor.id,
            base_governance_version=vendor.governance_version,
        )
    )
    await _enqueue(
        db,
        approval=approval,
        proposal=proposal,
        actor=current_user,
        department_id=vendor.department_id,
        changes=pending,
        boundary="governed_mutation.vendor.relationship.submit",
    )
    return build_approval_queued_response(
        message="Protected Vendor relationship submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.EDIT.value,
        pending_fields=list(pending),
        pending_changes=pending,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


__all__ = [
    "acquire_vendor_creation_name_lock",
    "assert_no_pending_vendor_mutation",
    "protected_vendor_ids_requiring_approval",
    "submit_vendor_archive_if_required",
    "submit_vendor_creation_if_required",
    "submit_vendor_child_mutation_if_required",
    "submit_vendor_edit_if_required",
    "submit_vendor_relationship_mutation_if_required",
]
