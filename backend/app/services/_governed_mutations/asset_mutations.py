"""Intake and atomic resolution for protected Asset mutations (#86)."""

from __future__ import annotations

from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from sqlalchemy import or_, select, text
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
    Permission,
    Risk,
    Role,
    RolePermission,
    User,
)
from app.models.user import AccessScope
from app.schemas.asset import AssetCreate, AssetUpdate
from app.services._ict_register_lifecycle.derivation import (
    AssetDerivationInput,
    IctRegisterGraph,
    derive_ict_register,
)
from app.services._ict_register_reference.parameters import (
    load_ict_workbook_parameter_set_for_update,
)
from app.services.outbox import OutboxService
from app.services.transaction_boundary import commit_service_boundary

from .asset_identity import (
    ASSET_ARCHIVE_KIND,
    ASSET_CREATE_KIND,
    ASSET_EDIT_KIND,
    ASSET_RELATIONSHIP_PREFIX,
)
from .asset_identity import (
    is_asset_governed_kind as is_asset_governed_kind,
)
from .asset_identity import (
    valid_asset_approval_ids as valid_asset_approval_ids,
)
from .asset_identity import (
    valid_asset_governed_envelope as valid_asset_governed_envelope,
)
from .asset_impact import (
    existing_asset_impacts as _existing_asset_impacts,
)
from .asset_impact import (
    impact_from_derived,
)
from .asset_impact import (
    process_asset_composite_impact as process_asset_composite_impact,
)
from .asset_impact import (
    process_point_asset_impacts as process_point_asset_impacts,
)
from .composite_policy import (
    effective_triggered_policy_roles,
    triggered_policy_snapshot,
)
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
from .fixed_vendor_policy import (
    VENDOR_SCENARIO_KEY,
    load_fixed_vendor_scenario_for_update,
    validated_fixed_vendor_roles,
)
from .vendor_impact import (
    asset_point_vendor_impacts,
    asset_relationship_vendor_impacts,
    vendor_impact_is_protected,
)


async def acquire_asset_name_lock(
    db: AsyncSession,
    *,
    asset_name: str,
) -> None:
    """Serialize Asset creation and rename decisions by exact persisted name."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            # The key retains the legacy 'create' namespace for compatibility.
            {"lock_key": f"riskhub:asset:create:{asset_name}"},
        )


async def duplicate_asset_display_name_exists(
    db: AsyncSession,
    *,
    asset_name: str,
    exclude_asset_id: int | None = None,
) -> bool:
    """Exact-name duplicate check shared by Asset creation and rename paths."""
    query = select(Asset.id).where(Asset.name == asset_name)
    if exclude_asset_id is not None:
        query = query.where(Asset.id != exclude_asset_id)
    return await db.scalar(query.limit(1)) is not None


def _required_reason(value: str | None) -> str:
    reason = (value or "").strip()
    if not reason:
        raise ValidationError(
            "A request reason is mandatory for a protected Asset mutation",
            code="governed_mutation_reason_required",
            status_code=422,
        )
    return reason


def _asset_derivation_input(payload: AssetCreate) -> AssetDerivationInput:
    values = payload.model_dump(exclude={"request_reason"})
    accepted = AssetDerivationInput.__dataclass_fields__.keys()
    return AssetDerivationInput(
        id=0,
        **{key: value for key, value in values.items() if key in accepted and key not in {"id"}},
    )


async def _creation_impact(db: AsyncSession, payload: AssetCreate) -> dict[str, object]:
    parameters = await load_ict_workbook_parameter_set_for_update(db)
    derived = derive_ict_register(
        IctRegisterGraph(assets=(_asset_derivation_input(payload),)),
        parameters,
    ).assets[0]
    return impact_from_derived(derived)


async def _has_independent_approver(db: AsyncSession, *, requester_id: int, roles: list[str]) -> bool:
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


async def _assert_no_duplicate_asset_creation(
    db: AsyncSession,
    *,
    asset_name: str,
) -> None:
    duplicate = await db.scalar(
        select(GovernedMutationProposal.id)
        .join(ApprovalRequest, ApprovalRequest.id == GovernedMutationProposal.approval_request_id)
        .where(
            GovernedMutationProposal.mutation_kind == ASSET_CREATE_KIND,
            GovernedMutationProposal.primary_resource_name == asset_name,
            ApprovalRequest.status.in_((ApprovalStatus.PENDING, ApprovalStatus.PENDING_PRIVILEGED)),
        )
        .limit(1)
    )
    if duplicate is not None:
        raise ConflictError(
            "A governed Asset creation is already pending",
            code="asset_pending_mutation",
        )


def _safe_creation_snapshot(
    payload: AssetCreate, *, business_owner: User, ict_owner: User, department: Department
) -> dict[str, object]:
    values = jsonable_encoder(payload.model_dump(exclude={"request_reason"}))
    values.pop("business_owner_user_id", None)
    values.pop("ict_owner_user_id", None)
    values.pop("owning_department_id", None)
    values.update(
        {
            "business_owner": business_owner.name,
            "ict_owner": ict_owner.name,
            "owning_department": department.name,
        }
    )
    return values


async def submit_asset_creation_if_required(
    *,
    db: AsyncSession,
    payload: AssetCreate,
    current_user: User,
    business_owner: User,
    ict_owner: User,
    department: Department,
    name_lock_acquired: bool = False,
):
    if not name_lock_acquired:
        await acquire_asset_name_lock(db, asset_name=payload.name)
    impact = await _creation_impact(db, payload)
    protected = impact["cif"] == "yes" or impact["resulting_criticality"] == "critical"
    if not protected:
        return None
    scenario = await load_fixed_asset_scenario_for_update(db)
    if not scenario.requires_approval:
        return None
    reason = _required_reason(payload.request_reason)
    roles = validated_fixed_asset_roles(scenario)
    if not await _has_independent_approver(db, requester_id=current_user.id, roles=roles):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    proposed_after = jsonable_encoder(payload.model_dump(exclude={"request_reason"}))
    await _assert_no_duplicate_asset_creation(db, asset_name=payload.name)
    safe_after = _safe_creation_snapshot(
        payload,
        business_owner=business_owner,
        ict_owner=ict_owner,
        department=department,
    )
    pending_changes = {field: {"old": None, "new": safe_after[field]} for field in sorted(safe_after)}
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.ASSET,
        resource_id=None,
        resource_name=payload.name,
        action_type=ApprovalActionType.CREATE,
        pending_changes=pending_changes,
        scenario_key=ASSET_SCENARIO_KEY,
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
        mutation_kind=ASSET_CREATE_KIND,
        primary_resource_type="asset",
        primary_resource_id=None,
        primary_resource_name=payload.name,
        scenario_snapshot={
            "key": ASSET_SCENARIO_KEY,
            "requires_approval": True,
            "approver_roles": roles,
        },
        base_versions={},
        before_snapshot={},
        after_snapshot=safe_after,
        derived_impact_snapshot={"before": None, "after": impact},
        proposed_changes={"after": proposed_after},
        impacted_resources_snapshot=[],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    await audit_governed.proposal_submitted(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=department.id,
        changes=pending_changes,
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_created:{approval.id}:pending",
        payload={"approval_id": approval.id},
    )
    await commit_service_boundary(db, boundary="governed_mutation.asset.create.submit")
    return build_approval_queued_response(
        message="Protected Asset creation submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.CREATE.value,
        pending_fields=list(pending_changes),
        pending_changes=pending_changes,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def assert_no_pending_asset_mutation(db: AsyncSession, *, asset_id: int) -> None:
    pending = await db.scalar(
        select(GovernedMutationImpactLock.id)
        .where(
            GovernedMutationImpactLock.resource_type == "asset",
            GovernedMutationImpactLock.resource_id == asset_id,
            GovernedMutationImpactLock.released_at.is_(None),
        )
        .limit(1)
    )
    if pending is not None:
        raise ConflictError(
            "A governed Asset change is already pending",
            code="asset_pending_mutation",
        )


async def _safe_asset_snapshot(
    db: AsyncSession,
    asset: Asset,
) -> dict[str, object]:
    fields = set(AssetCreate.model_fields) - {"request_reason"}
    snapshot = {field: jsonable_encoder(getattr(asset, field)) for field in fields}
    snapshot.pop("business_owner_user_id", None)
    snapshot.pop("ict_owner_user_id", None)
    snapshot.pop("owning_department_id", None)
    business_owner = await db.get(User, asset.business_owner_user_id)
    ict_owner = await db.get(User, asset.ict_owner_user_id)
    owning_department = await db.get(Department, asset.owning_department_id)
    snapshot.update(
        {
            "business_owner": (
                business_owner.name if business_owner is not None else "Unknown user"
            ),
            "ict_owner": ict_owner.name if ict_owner is not None else "Unknown user",
            "owning_department": (
                owning_department.name
                if owning_department is not None
                else "Unknown department"
            ),
        }
    )
    return snapshot


async def submit_asset_edit_if_required(
    *,
    db: AsyncSession,
    asset: Asset,
    payload: AssetUpdate,
    current_user: User,
    updates: dict[str, object],
    orphan_resolution: tuple[int, int] | None = None,
):
    await assert_no_pending_asset_mutation(db, asset_id=asset.id)
    current_impact, proposed_impact = await _existing_asset_impacts(db, asset=asset, updates=updates)
    impacted_vendors, vendor_rows = await asset_point_vendor_impacts(
        db,
        asset=asset,
        updates=updates,
    )
    vendor_protected = any(
        vendor_impact_is_protected(block)
        for row in vendor_rows
        for block in (row["before"], row["after"])
    )
    protected = (
        current_impact["cif"] == "yes"
        or proposed_impact["cif"] == "yes"
        or current_impact["resulting_criticality"] == "critical"
        or proposed_impact["resulting_criticality"] == "critical"
    )
    accountability_changed = bool(
        set(updates)
        & {
            "business_owner_user_id",
            "ict_owner_user_id",
            "owning_department_id",
        }
    )
    triggered_scenarios: list[str] = []
    triggered_policies: list[dict[str, object]] = []
    if protected:
        scenario = await load_fixed_asset_scenario_for_update(db)
        if scenario.requires_approval:
            asset_roles = validated_fixed_asset_roles(scenario)
            triggered_scenarios.append(ASSET_SCENARIO_KEY)
            triggered_policies.append(
                triggered_policy_snapshot(ASSET_SCENARIO_KEY, asset_roles)
            )
    if vendor_protected:
        vendor_scenario = await load_fixed_vendor_scenario_for_update(db)
        if vendor_scenario.requires_approval:
            vendor_roles = validated_fixed_vendor_roles(vendor_scenario)
            triggered_scenarios.append(VENDOR_SCENARIO_KEY)
            triggered_policies.append(
                triggered_policy_snapshot(VENDOR_SCENARIO_KEY, vendor_roles)
            )
    if accountability_changed:
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
    if not await _has_independent_approver(db, requester_id=current_user.id, roles=roles):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    before = await _safe_asset_snapshot(db, asset)
    proposed_values = dict(updates)
    raw_before = {field: jsonable_encoder(getattr(asset, field)) for field in updates}
    after = dict(before)
    for field, value in proposed_values.items():
        if field in after:
            after[field] = jsonable_encoder(value)
    safe_reference_fields = {
        "business_owner_user_id": ("business_owner", User, "Unknown user"),
        "ict_owner_user_id": ("ict_owner", User, "Unknown user"),
        "owning_department_id": ("owning_department", Department, "Unknown department"),
    }
    for raw_field, (safe_field, model, fallback) in safe_reference_fields.items():
        if raw_field not in proposed_values:
            continue
        reference = await db.get(model, proposed_values[raw_field])
        after[safe_field] = reference.name if reference is not None else fallback
    pending_changes: dict[str, dict[str, object]] = {}
    for field in sorted(updates):
        safe_field = safe_reference_fields.get(field, (field, None, None))[0]
        pending_changes[safe_field] = {
            "old": before.get(safe_field),
            "new": after.get(safe_field),
        }
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.ASSET,
        resource_id=asset.id,
        resource_name=asset.name,
        action_type=ApprovalActionType.EDIT,
        pending_changes=pending_changes,
        scenario_key=triggered_scenarios[0],
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    impact_resource = {
        "resource_type": "asset",
        "resource_id": asset.id,
        "resource_name": asset.name,
        "base_governance_version": asset.governance_version,
    }
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=ASSET_EDIT_KIND,
        primary_resource_type="asset",
        primary_resource_id=asset.id,
        primary_resource_name=asset.name,
        scenario_snapshot={
            "key": triggered_scenarios[0],
            "requires_approval": True,
            "approver_roles": roles,
            **(
                {"triggered_policies": triggered_policies}
                if triggered_scenarios != [ASSET_SCENARIO_KEY]
                else {}
            ),
        },
        base_versions={
            "asset": asset.governance_version,
            **{
                f"vendor:{vendor.id}": vendor.governance_version
                for vendor in impacted_vendors
            },
        },
        before_snapshot=before,
        after_snapshot=after,
        derived_impact_snapshot=(
            {
                "assets": [
                    {
                        "resource_id": asset.id,
                        "before": current_impact,
                        "after": proposed_impact,
                    }
                ],
                "vendors": vendor_rows,
            }
            if VENDOR_SCENARIO_KEY in triggered_scenarios
            else {"before": current_impact, "after": proposed_impact}
        ),
        proposed_changes={
            "before": raw_before,
            "after": jsonable_encoder(proposed_values),
            **(
                {"triggered_scenarios": triggered_scenarios}
                if triggered_scenarios != [ASSET_SCENARIO_KEY]
                else {}
            ),
        },
        impacted_resources_snapshot=[
            impact_resource,
            *[
                {
                    "resource_type": "vendor",
                    "resource_id": vendor.id,
                    "resource_name": vendor.name,
                    "base_governance_version": vendor.governance_version,
                }
                for vendor in impacted_vendors
            ],
        ],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    db.add(
        GovernedMutationImpactLock(
            proposal_id=proposal.id,
            resource_type="asset",
            resource_id=asset.id,
            base_governance_version=asset.governance_version,
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
    for vendor in impacted_vendors:
        db.add(
            GovernedMutationImpactLock(
                proposal_id=proposal.id,
                resource_type="vendor",
                resource_id=vendor.id,
                base_governance_version=vendor.governance_version,
            )
        )
    await audit_governed.proposal_submitted(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=asset.owning_department_id,
        changes=pending_changes,
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_created:{approval.id}:pending",
        payload={"approval_id": approval.id},
    )
    await commit_service_boundary(db, boundary="governed_mutation.asset.edit.submit")
    return build_approval_queued_response(
        message="Protected Asset edit submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.EDIT.value,
        pending_fields=list(pending_changes),
        pending_changes=pending_changes,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def submit_asset_archive_if_required(
    *, db: AsyncSession, asset: Asset, current_user: User, request_reason: str | None
):
    locked_assets = await _lock_impacted_assets_for_submission(db, assets=[asset])
    asset = locked_assets[asset.id]
    await assert_no_pending_asset_mutation(db, asset_id=asset.id)
    current_impact, _ = await _existing_asset_impacts(db, asset=asset, updates={})
    impacted_vendors, vendor_rows = await asset_point_vendor_impacts(
        db,
        asset=asset,
        updates={},
        archive=True,
    )
    vendor_protected = any(
        vendor_impact_is_protected(block)
        for row in vendor_rows
        for block in (row["before"], row["after"])
    )
    protected = current_impact["cif"] == "yes" or current_impact["resulting_criticality"] == "critical"
    if not protected:
        return None
    scenario = await load_fixed_asset_scenario_for_update(db)
    if not scenario.requires_approval:
        return None
    reason = _required_reason(request_reason)
    asset_roles = validated_fixed_asset_roles(scenario)
    triggered_scenarios = [ASSET_SCENARIO_KEY]
    triggered_policies = [triggered_policy_snapshot(ASSET_SCENARIO_KEY, asset_roles)]
    if vendor_protected:
        vendor_scenario = await load_fixed_vendor_scenario_for_update(db)
        if vendor_scenario.requires_approval:
            vendor_roles = validated_fixed_vendor_roles(vendor_scenario)
            triggered_scenarios.append(VENDOR_SCENARIO_KEY)
            triggered_policies.append(
                triggered_policy_snapshot(VENDOR_SCENARIO_KEY, vendor_roles)
            )
    roles = effective_triggered_policy_roles(triggered_policies)
    if not await _has_independent_approver(db, requester_id=current_user.id, roles=roles):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    pending_changes = {"is_archived": {"old": False, "new": True}}
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.ASSET,
        resource_id=asset.id,
        resource_name=asset.name,
        action_type=ApprovalActionType.DELETE,
        pending_changes=pending_changes,
        scenario_key=ASSET_SCENARIO_KEY,
        scenario_approver_roles=roles,
        requested_by_id=current_user.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        requires_privileged_approval=False,
    )
    db.add(approval)
    await db.flush()
    impact_resource = {
        "resource_type": "asset",
        "resource_id": asset.id,
        "resource_name": asset.name,
        "base_governance_version": asset.governance_version,
    }
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=ASSET_ARCHIVE_KIND,
        primary_resource_type="asset",
        primary_resource_id=asset.id,
        primary_resource_name=asset.name,
        scenario_snapshot={
            "key": ASSET_SCENARIO_KEY,
            "requires_approval": True,
            "approver_roles": roles,
            **(
                {"triggered_policies": triggered_policies}
                if len(triggered_scenarios) > 1
                else {}
            ),
        },
        base_versions={
            "asset": asset.governance_version,
            **{
                f"vendor:{vendor.id}": vendor.governance_version
                for vendor in impacted_vendors
            },
        },
        before_snapshot={"is_archived": False},
        after_snapshot={"is_archived": True},
        derived_impact_snapshot=(
            {
                "assets": [
                    {
                        "resource_id": asset.id,
                        "before": current_impact,
                        "after": current_impact,
                    }
                ],
                "vendors": vendor_rows,
            }
            if len(triggered_scenarios) > 1
            else {"before": current_impact, "after": current_impact}
        ),
        proposed_changes={
            "before": {"is_archived": False},
            "after": {"is_archived": True},
            **(
                {"triggered_scenarios": triggered_scenarios}
                if len(triggered_scenarios) > 1
                else {}
            ),
        },
        impacted_resources_snapshot=[
            impact_resource,
            *[
                {
                    "resource_type": "vendor",
                    "resource_id": vendor.id,
                    "resource_name": vendor.name,
                    "base_governance_version": vendor.governance_version,
                }
                for vendor in impacted_vendors
            ],
        ],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
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
    await audit_governed.proposal_submitted(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=asset.owning_department_id,
        changes=pending_changes,
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_created:{approval.id}:pending",
        payload={"approval_id": approval.id},
    )
    await commit_service_boundary(db, boundary="governed_mutation.asset.archive.submit")
    return build_approval_queued_response(
        message="Protected Asset archive submitted for independent approval",
        approval_id=approval.id,
        action_type=ApprovalActionType.DELETE.value,
        pending_fields=["is_archived"],
        pending_changes=pending_changes,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def submit_asset_link_mutation_if_required(
    *,
    db: AsyncSession,
    asset: Asset,
    impacted_assets: list[Asset],
    operation: dict[str, object],
    current_user: User,
    request_reason: str | None,
):
    """Queue one immutable protected Asset-link operation and lock every Asset."""
    unique_assets = await _lock_impacted_assets_for_submission(
        db,
        assets=[*impacted_assets, asset],
    )
    asset = unique_assets[asset.id]
    if operation.get("relationship_type") == "risk":
        risk_id = operation.get("related_resource_id")
        if type(risk_id) is not int:
            raise ValidationError("Governed Risk reference is invalid")
        risk = (
            await db.execute(
                select(Risk)
                .where(Risk.id == risk_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if risk is None or risk.is_archived:
            raise ConflictError("Cannot mutate an Asset link from an archived Risk")
    for impacted in unique_assets.values():
        await assert_no_pending_asset_mutation(db, asset_id=impacted.id)
    derived_rows: list[dict[str, object]] = []
    protected = False
    for impacted in sorted(unique_assets.values(), key=lambda item: item.id):
        block, _ = await _existing_asset_impacts(db, asset=impacted, updates={})
        protected = protected or block["cif"] == "yes" or block["resulting_criticality"] == "critical"
        derived_rows.append({"resource_id": impacted.id, "before": block, "after": block})
    impacted_vendors, vendor_rows = await asset_relationship_vendor_impacts(
        db,
        asset=asset,
        operation=operation,
    )
    vendor_protected = any(
        vendor_impact_is_protected(block)
        for row in vendor_rows
        for block in (row["before"], row["after"])
    )
    triggered_scenarios: list[str] = []
    triggered_policies: list[dict[str, object]] = []
    if protected:
        scenario = await load_fixed_asset_scenario_for_update(db)
        if scenario.requires_approval:
            asset_roles = validated_fixed_asset_roles(scenario)
            triggered_scenarios.append(ASSET_SCENARIO_KEY)
            triggered_policies.append(
                triggered_policy_snapshot(ASSET_SCENARIO_KEY, asset_roles)
            )
    if vendor_protected:
        vendor_scenario = await load_fixed_vendor_scenario_for_update(db)
        if vendor_scenario.requires_approval:
            vendor_roles = validated_fixed_vendor_roles(vendor_scenario)
            triggered_scenarios.append(VENDOR_SCENARIO_KEY)
            triggered_policies.append(
                triggered_policy_snapshot(VENDOR_SCENARIO_KEY, vendor_roles)
            )
    if not triggered_scenarios:
        return None
    if VENDOR_SCENARIO_KEY not in triggered_scenarios:
        impacted_vendors = []
        vendor_rows = []
    reason = _required_reason(request_reason)
    roles = effective_triggered_policy_roles(triggered_policies)
    if not await _has_independent_approver(db, requester_id=current_user.id, roles=roles):
        raise ValidationError(
            "No independent configured Risk Manager or CRO is available",
            code="governed_mutation_independent_approver_required",
        )
    kind = f"{ASSET_RELATIONSHIP_PREFIX}{operation['relationship_type']}.{operation['action']}"
    pending = {"relationship": {"old": operation.get("before"), "new": operation.get("after")}}
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.ASSET,
        resource_id=asset.id,
        resource_name=asset.name,
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
    impacts = [
        {
            "resource_type": "asset",
            "resource_id": item.id,
            "resource_name": item.name,
            "base_governance_version": item.governance_version,
        }
        for item in sorted(unique_assets.values(), key=lambda row: row.id)
    ]
    proposal = GovernedMutationProposal(
        proposal_id=str(uuid4()),
        proposal_version=1,
        schema_version=1,
        approval_request_id=approval.id,
        mutation_kind=kind,
        primary_resource_type="asset",
        primary_resource_id=asset.id,
        primary_resource_name=asset.name,
        scenario_snapshot={
            "key": triggered_scenarios[0],
            "requires_approval": True,
            "approver_roles": roles,
            **(
                {"triggered_policies": triggered_policies}
                if VENDOR_SCENARIO_KEY in triggered_scenarios
                else {}
            ),
        },
        base_versions={
            **{
                f"asset:{item.id}": item.governance_version
                for item in unique_assets.values()
            },
            **{
                f"vendor:{vendor.id}": vendor.governance_version
                for vendor in impacted_vendors
            },
        },
        before_snapshot={"relationship": operation.get("before")},
        after_snapshot={"relationship": operation.get("after")},
        derived_impact_snapshot={
            "assets": derived_rows,
            **({"vendors": vendor_rows} if vendor_rows else {}),
        },
        proposed_changes={
            "operation": jsonable_encoder(operation),
            **(
                {"triggered_scenarios": triggered_scenarios}
                if VENDOR_SCENARIO_KEY in triggered_scenarios
                else {}
            ),
        },
        impacted_resources_snapshot=[
            *impacts,
            *[
                {
                    "resource_type": "vendor",
                    "resource_id": vendor.id,
                    "resource_name": vendor.name,
                    "base_governance_version": vendor.governance_version,
                }
                for vendor in impacted_vendors
            ],
        ],
        requested_by_id=current_user.id,
    )
    proposal.approval_request = approval
    db.add(proposal)
    await db.flush()
    for item in unique_assets.values():
        db.add(
            GovernedMutationImpactLock(
                proposal_id=proposal.id,
                resource_type="asset",
                resource_id=item.id,
                base_governance_version=item.governance_version,
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
    await audit_governed.proposal_submitted(
        db,
        actor=current_user,
        approval=approval,
        proposal=proposal,
        department_id=asset.owning_department_id,
        changes=pending,
    )
    await OutboxService.enqueue(
        db,
        event_type="approval.request_created",
        aggregate_type="approval_request",
        aggregate_id=approval.id,
        idempotency_key=f"approval.request_created:{approval.id}:pending",
        payload={"approval_id": approval.id},
    )
    await commit_service_boundary(db, boundary="governed_mutation.asset.link.submit")
    return build_approval_queued_response(
        message="Protected Asset link submitted for independent approval",
        approval_id=approval.id,
        action_type="edit",
        pending_fields=["relationship"],
        pending_changes=pending,
        proposal_id=proposal.proposal_id,
        proposal_version=proposal.proposal_version,
    )


async def _lock_impacted_assets_for_submission(
    db: AsyncSession,
    *,
    assets: list[Asset],
) -> dict[int, Asset]:
    """Own the sorted, unique Asset row locks before checking pending visibility."""
    asset_ids = sorted({item.id for item in assets})
    locked = list(
        (
            await db.execute(
                select(Asset)
                .where(Asset.id.in_(asset_ids))
                .order_by(Asset.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    if [item.id for item in locked] != asset_ids:
        raise ValidationError("An impacted Asset is no longer available")
    return {item.id: item for item in locked}


async def approve_asset_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    from .asset_resolution import approve_asset_mutation as resolve

    return await resolve(db, approval_id=approval_id, current_user=current_user, resolution_notes=resolution_notes)


async def cancel_asset_mutation(db: AsyncSession, *, approval_id: int, current_user: User) -> ApprovalRequest:
    from .asset_resolution import cancel_asset_mutation as cancel

    return await cancel(db, approval_id=approval_id, current_user=current_user)


async def reject_asset_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    from .asset_resolution import reject_asset_mutation as reject

    return await reject(db, approval_id=approval_id, current_user=current_user, resolution_notes=resolution_notes)
