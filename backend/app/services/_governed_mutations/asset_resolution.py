"""Intake and atomic resolution for protected Asset mutations (#86)."""

from __future__ import annotations

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError, ValidationError
from app.core.permissions import (
    can_read_risk_id,
    can_read_vendor,
    has_permission,
)
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    Asset,
    AssetAssetLink,
    AssetVendorLink,
    Department,
    OrphanedItem,
    Risk,
    RiskAssetLink,
    User,
    Vendor,
)
from app.schemas.asset import AssetCreate, AssetUpdate
from app.services._ict_register_lifecycle.asset_policy import (
    can_read_asset_record,
    can_update_asset_record,
)

from .asset_identity import (
    ASSET_ARCHIVE_KIND,
    ASSET_CREATE_KIND,
    ASSET_EDIT_KIND,
    ASSET_RELATIONSHIP_PREFIX,
)
from .asset_impact import existing_asset_impacts as _existing_asset_impacts
from .asset_mutations import _creation_impact, acquire_asset_creation_name_lock
from .asset_resolution_policy import (
    commit_asset_boundary as _commit_asset_boundary,
)
from .asset_resolution_policy import (
    expire_asset_approval as _expire_asset_approval,
)
from .asset_resolution_policy import (
    load_asset_envelope as _load_asset_envelope,
)
from .asset_resolution_policy import (
    load_live_asset_resolution_policy as _load_live_asset_resolution_policy,
)
from .asset_resolution_policy import (
    reload_asset_approval as _reload_asset_approval,
)
from .asset_resolution_replay import (
    asset_edit_references_are_live as _asset_edit_references_are_live,
)
from .asset_resolution_replay import (
    relationship_replay_stale_reason as _relationship_replay_stale_reason,
)
from .terminal_transitions import finalize_governed_terminal_transition


async def approve_asset_mutation(
    db: AsyncSession, *, approval_id: int, current_user: User, resolution_notes: str
) -> ApprovalRequest:
    approval, proposal, locks = await _load_asset_envelope(db, approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(f"Cannot resolve request with status: {approval.status.value}")
    if proposal.mutation_kind == ASSET_CREATE_KIND:
        try:
            creation_payload = AssetCreate.model_validate(proposal.proposed_changes["after"])
        except (KeyError, TypeError, ValueError):
            creation_payload = None
        if creation_payload is not None:
            await acquire_asset_creation_name_lock(db, asset_name=creation_payload.name)
    resolver, requester, policy_stale_reason = await _load_live_asset_resolution_policy(
        db,
        proposal=proposal,
        current_user=current_user,
    )
    if policy_stale_reason is not None:
        return await _expire_asset_approval(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=policy_stale_reason,
            department_id=requester.department_id if requester else None,
        )
    assert requester is not None
    current_user = resolver
    if proposal.mutation_kind.startswith(ASSET_RELATIONSHIP_PREFIX):
        operation = proposal.proposed_changes.get("operation")
        asset_locks = [lock for lock in locks if lock.resource_type == "asset"]
        vendor_locks = [lock for lock in locks if lock.resource_type == "vendor"]
        asset_ids = sorted(lock.resource_id for lock in asset_locks)
        vendor_ids = sorted(lock.resource_id for lock in vendor_locks)
        assets = {
            row.id: row
            for row in (
                await db.execute(
                    select(Asset)
                    .options(selectinload(Asset.owning_department))
                    .where(Asset.id.in_(asset_ids))
                    .order_by(Asset.id)
                    .with_for_update()
                )
            ).scalars()
        }
        vendors = {
            row.id: row
            for row in (
                await db.execute(
                    select(Vendor)
                    .where(Vendor.id.in_(vendor_ids))
                    .order_by(Vendor.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars()
        }
        stale = bool(
            not isinstance(operation, dict)
            or not asset_ids
            or set(assets) != set(asset_ids)
            or set(vendors) != set(vendor_ids)
            or any(
                lock.base_governance_version
                != assets[lock.resource_id].governance_version
                for lock in asset_locks
            )
            or any(
                lock.base_governance_version
                != vendors[lock.resource_id].governance_version
                for lock in vendor_locks
            )
            or proposal.base_versions
            != {
                **{
                    f"asset:{item.id}": item.governance_version
                    for item in assets.values()
                },
                **{
                    f"vendor:{item.id}": item.governance_version
                    for item in vendors.values()
                },
            }
        )
        derived_rows = []
        risk: Risk | None = None
        if not stale:
            primary = assets.get(proposal.primary_resource_id)
            relationship_type = operation.get("relationship_type")
            stale = bool(
                primary is None
                or (relationship_type in {"asset", "vendor"} and not can_update_asset_record(requester, primary))
                or (
                    relationship_type == "asset"
                    and any(not can_read_asset_record(requester, item) for item in assets.values())
                )
            )
        if not stale:
            for item in assets.values():
                block, _ = await _existing_asset_impacts(db, asset=item, updates={})
                derived_rows.append({"resource_id": item.id, "before": block, "after": block})
            expected_impact: dict[str, object] = {"assets": derived_rows}
            if vendors:
                from .vendor_impact import (
                    asset_relationship_vendor_impacts,
                    vendor_impact_is_protected,
                )

                _, vendor_rows = await asset_relationship_vendor_impacts(
                    db,
                    asset=assets[proposal.primary_resource_id],
                    operation=operation,
                    vendors=list(vendors.values()),
                )
                expected_impact["vendors"] = vendor_rows
                vendor_protected = any(
                    vendor_impact_is_protected(block)
                    for row in vendor_rows
                    for block in (row["before"], row["after"])
                )
            else:
                vendor_protected = False
            stale = proposal.derived_impact_snapshot != expected_impact or (
                "protected_vendor_edit"
                in proposal.proposed_changes.get("triggered_scenarios", [])
                and not vendor_protected
            )
        if not stale and isinstance(operation, dict) and operation.get("relationship_type") == "risk":
            risk_id = operation.get("related_resource_id")
            if type(risk_id) is not int:
                stale = True
            else:
                risk = (await db.execute(select(Risk).where(Risk.id == risk_id).with_for_update())).scalar_one_or_none()
                stale = bool(
                    risk is None
                    or not has_permission(requester, "risks", "write")
                    or not await can_read_risk_id(db, requester, risk_id)
                    or not can_read_asset_record(requester, assets[proposal.primary_resource_id])
                )
        if not stale and isinstance(operation, dict) and operation.get("relationship_type") == "vendor":
            values = operation.get("after") or operation.get("before")
            vendor_id = values.get("vendor_id") if isinstance(values, dict) else None
            vendor = await db.get(Vendor, vendor_id) if type(vendor_id) is int else None
            stale = bool(vendor is None or not can_read_vendor(vendor, requester))
        if not stale:
            stale = bool(
                await _relationship_replay_stale_reason(
                    db,
                    proposal=proposal,
                    operation=operation,
                    assets=assets,
                )
            )
        if stale:
            await finalize_governed_terminal_transition(
                db,
                approval=approval,
                proposal=proposal,
                impact_locks=locks,
                actor=current_user,
                department_id=assets.get(proposal.primary_resource_id).owning_department_id
                if assets.get(proposal.primary_resource_id)
                else None,
                status=ApprovalStatus.EXPIRED,
                resolution_notes="Governed Asset link became stale",
            )
        else:
            assert isinstance(operation, dict)
            relationship_type = operation.get("relationship_type")
            action = operation.get("action")
            values = operation.get("after") if action == "add" else operation.get("before")
            if not isinstance(values, dict):
                raise ValidationError("Governed Asset link payload is stale")
            if relationship_type == "asset" and action == "add":
                db.add(AssetAssetLink(**values))
            elif relationship_type == "asset" and action == "remove":
                link = await db.get(AssetAssetLink, values.get("id"))
                if link is None:
                    raise ValidationError("Governed Asset link payload is stale")
                await db.delete(link)
            elif relationship_type == "vendor" and action == "add":
                db.add(AssetVendorLink(**values))
            elif relationship_type == "vendor" and action == "remove":
                link = await db.get(AssetVendorLink, values.get("id"))
                if link is None:
                    raise ValidationError("Governed Asset link payload is stale")
                await db.delete(link)
            elif relationship_type == "risk" and action == "add":
                if risk is None:
                    raise ValidationError("Governed Asset link payload is stale")
                db.add(
                    RiskAssetLink(
                        risk_id=risk.id,
                        asset_id=assets[proposal.primary_resource_id].id,
                    )
                )
            elif relationship_type == "risk" and action == "remove":
                link_id = values.get("id")
                link = (
                    await db.execute(select(RiskAssetLink).where(RiskAssetLink.id == link_id).with_for_update())
                ).scalar_one_or_none()
                if (
                    link is None
                    or risk is None
                    or link.risk_id != risk.id
                    or link.asset_id != assets[proposal.primary_resource_id].id
                ):
                    raise ValidationError("Governed Asset link payload is stale")
                await db.delete(link)
            else:
                raise ValidationError("Unsupported governed Asset link operation")
            for item in assets.values():
                item.governance_version += 1
            for item in vendors.values():
                item.governance_version += 1
            await finalize_governed_terminal_transition(
                db,
                approval=approval,
                proposal=proposal,
                impact_locks=locks,
                actor=current_user,
                department_id=assets[proposal.primary_resource_id].owning_department_id,
                status=ApprovalStatus.APPROVED,
                resolution_notes=resolution_notes,
                applied_changes=approval.pending_changes,
            )
        await _commit_asset_boundary(db, boundary="governed_mutation.asset.link.resolve")
        return await _reload_asset_approval(db, approval.id)
    if proposal.mutation_kind == ASSET_EDIT_KIND:
        asset_locks = [lock for lock in locks if lock.resource_type == "asset"]
        vendor_locks = [lock for lock in locks if lock.resource_type == "vendor"]
        orphan_locks = [
            lock for lock in locks if lock.resource_type == "orphaned_item"
        ]
        governed_orphan = None
        governed_orphans: list[OrphanedItem] = []
        if proposal.primary_resource_id is None or len(asset_locks) != 1:
            raise ValidationError("Governed Asset edit identity is stale")
        asset = (
            await db.execute(select(Asset).where(Asset.id == proposal.primary_resource_id).with_for_update())
        ).scalar_one_or_none()
        lock = asset_locks[0]
        vendor_ids = sorted(lock.resource_id for lock in vendor_locks)
        vendors = {
            row.id: row
            for row in (
                await db.execute(
                    select(Vendor)
                    .where(Vendor.id.in_(vendor_ids))
                    .order_by(Vendor.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars()
        }
        expected_base_versions = {
            "asset": asset.governance_version if asset is not None else None,
            **{
                f"vendor:{vendor.id}": vendor.governance_version
                for vendor in vendors.values()
            },
        }
        if (
            asset is None
            or not can_update_asset_record(requester, asset)
            or lock.resource_type != "asset"
            or lock.resource_id != asset.id
            or lock.base_governance_version != asset.governance_version
            or set(vendors) != set(vendor_ids)
            or any(
                item.base_governance_version != vendors[item.resource_id].governance_version
                for item in vendor_locks
            )
            or proposal.base_versions != expected_base_versions
        ):
            await finalize_governed_terminal_transition(
                db,
                approval=approval,
                proposal=proposal,
                impact_locks=locks,
                actor=current_user,
                department_id=asset.owning_department_id if asset else None,
                status=ApprovalStatus.EXPIRED,
                resolution_notes="Governed Asset version changed after submission",
            )
        else:
            proposed_updates = proposal.proposed_changes.get("after")
            expected_before = proposal.proposed_changes.get("before")
            malformed = not isinstance(proposed_updates, dict) or not isinstance(expected_before, dict)
            if not malformed:
                try:
                    replay = AssetUpdate.model_validate(proposed_updates)
                    normalized_updates = replay.model_dump(
                        exclude_unset=True,
                        exclude={"request_reason"},
                    )
                    malformed = bool(
                        "request_reason" in proposed_updates
                        or set(normalized_updates) != set(proposed_updates)
                        or set(expected_before) != set(proposed_updates)
                    )
                    proposed_updates = normalized_updates
                except (TypeError, ValueError):
                    malformed = True
            role_to_field = {
                "business_owner": "business_owner_user_id",
                "ict_owner": "ict_owner_user_id",
            }
            if not malformed and orphan_locks:
                if len(orphan_locks) == 1:
                    governed_orphan = (
                        await db.execute(
                            select(OrphanedItem)
                            .where(OrphanedItem.id == orphan_locks[0].resource_id)
                            .with_for_update()
                            .execution_options(populate_existing=True)
                        )
                    ).scalar_one_or_none()
                orphan_owner_field = role_to_field.get(
                    getattr(governed_orphan, "responsibility_role", None)
                )
                malformed = bool(
                    len(orphan_locks) != 1
                    or governed_orphan is None
                    or governed_orphan.item_type != "asset"
                    or governed_orphan.item_id != asset.id
                    or governed_orphan.status != "pending"
                    or governed_orphan.previous_owner_id
                    != orphan_locks[0].base_governance_version
                    or orphan_owner_field is None
                    or expected_before.get(orphan_owner_field)
                    != orphan_locks[0].base_governance_version
                    or orphan_owner_field not in proposed_updates
                )
                if not malformed and governed_orphan is not None:
                    governed_orphans.append(governed_orphan)
            if not malformed and not governed_orphans:
                changed_roles = [
                    (role, field)
                    for role, field in role_to_field.items()
                    if field in proposed_updates
                    and expected_before.get(field) != proposed_updates.get(field)
                ]
                for role, field in changed_roles:
                    late_orphan = (
                        await db.execute(
                            select(OrphanedItem)
                            .where(
                                OrphanedItem.item_type == "asset",
                                OrphanedItem.item_id == asset.id,
                                OrphanedItem.status == "pending",
                                OrphanedItem.responsibility_role == role,
                                OrphanedItem.previous_owner_id
                                == expected_before.get(field),
                            )
                            .order_by(OrphanedItem.id)
                            .with_for_update()
                            .execution_options(populate_existing=True)
                        )
                    ).scalars().first()
                    if late_orphan is not None:
                        governed_orphans.append(late_orphan)
            if malformed:
                await finalize_governed_terminal_transition(
                    db,
                    approval=approval,
                    proposal=proposal,
                    impact_locks=locks,
                    actor=current_user,
                    department_id=asset.owning_department_id,
                    status=ApprovalStatus.EXPIRED,
                    resolution_notes="Governed Asset edit payload is stale",
                )
            elif not await _asset_edit_references_are_live(
                db,
                proposed_updates=proposed_updates,
            ):
                await finalize_governed_terminal_transition(
                    db,
                    approval=approval,
                    proposal=proposal,
                    impact_locks=locks,
                    actor=current_user,
                    department_id=asset.owning_department_id,
                    status=ApprovalStatus.EXPIRED,
                    resolution_notes="A proposed Asset owner or Department is no longer active",
                )
            elif any(
                jsonable_encoder(getattr(asset, field, None)) != value for field, value in expected_before.items()
            ):
                await finalize_governed_terminal_transition(
                    db,
                    approval=approval,
                    proposal=proposal,
                    impact_locks=locks,
                    actor=current_user,
                    department_id=asset.owning_department_id,
                    status=ApprovalStatus.EXPIRED,
                    resolution_notes="Governed Asset approved state changed after submission",
                )
            else:
                current_impact, proposed_impact = await _existing_asset_impacts(
                    db, asset=asset, updates=proposed_updates
                )
                expected_impact: dict[str, object]
                if vendors:
                    from .vendor_impact import (
                        asset_point_vendor_impacts,
                        vendor_impact_is_protected,
                    )

                    _, vendor_rows = await asset_point_vendor_impacts(
                        db,
                        asset=asset,
                        updates=proposed_updates,
                        vendors=list(vendors.values()),
                    )
                    expected_impact = {
                        "assets": [
                            {
                                "resource_id": asset.id,
                                "before": current_impact,
                                "after": proposed_impact,
                            }
                        ],
                        "vendors": vendor_rows,
                    }
                    vendor_protected = any(
                        vendor_impact_is_protected(block)
                        for row in vendor_rows
                        for block in (row["before"], row["after"])
                    )
                else:
                    expected_impact = {
                        "before": current_impact,
                        "after": proposed_impact,
                    }
                    vendor_protected = False
                if expected_impact != proposal.derived_impact_snapshot or (
                    "protected_vendor_edit"
                    in proposal.proposed_changes.get("triggered_scenarios", [])
                    and not vendor_protected
                ):
                    await finalize_governed_terminal_transition(
                        db,
                        approval=approval,
                        proposal=proposal,
                        impact_locks=locks,
                        actor=current_user,
                        department_id=asset.owning_department_id,
                        status=ApprovalStatus.EXPIRED,
                        resolution_notes="Protected Asset derivation changed after submission",
                    )
                else:
                    for field, value in proposed_updates.items():
                        setattr(asset, field, value)
                    asset.governance_version += 1
                    for vendor in vendors.values():
                        vendor.governance_version += 1
                    for orphan in governed_orphans:
                        orphan.status = "resolved"
                        orphan.resolved_at = utc_now()
                        orphan.resolved_by_id = current_user.id
                        orphan.new_owner_id = proposed_updates[
                            f"{orphan.responsibility_role}_user_id"
                        ]
                    await finalize_governed_terminal_transition(
                        db,
                        approval=approval,
                        proposal=proposal,
                        impact_locks=locks,
                        actor=current_user,
                        department_id=asset.owning_department_id,
                        status=ApprovalStatus.APPROVED,
                        resolution_notes=resolution_notes,
                        applied_changes=approval.pending_changes,
                    )
        await _commit_asset_boundary(db, boundary="governed_mutation.asset.resolve")
        return await _reload_asset_approval(db, approval.id)
    if proposal.mutation_kind == ASSET_ARCHIVE_KIND:
        asset_locks = [lock for lock in locks if lock.resource_type == "asset"]
        vendor_locks = [lock for lock in locks if lock.resource_type == "vendor"]
        if proposal.primary_resource_id is None or len(asset_locks) != 1:
            raise ValidationError("Governed Asset archive identity is stale")
        asset = (
            await db.execute(select(Asset).where(Asset.id == proposal.primary_resource_id).with_for_update())
        ).scalar_one_or_none()
        lock = asset_locks[0]
        vendor_ids = sorted(item.resource_id for item in vendor_locks)
        vendors = {
            row.id: row
            for row in (
                await db.execute(
                    select(Vendor)
                    .where(Vendor.id.in_(vendor_ids))
                    .order_by(Vendor.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars()
        }
        stale = bool(
            asset is None
            or asset.is_archived
            or not has_permission(requester, "assets", "delete")
            or not can_read_asset_record(requester, asset)
            or lock.resource_type != "asset"
            or lock.resource_id != proposal.primary_resource_id
            or lock.base_governance_version != (asset.governance_version if asset else None)
            or set(vendors) != set(vendor_ids)
            or any(
                item.base_governance_version != vendors[item.resource_id].governance_version
                for item in vendor_locks
            )
            or proposal.base_versions
            != {
                "asset": asset.governance_version if asset else None,
                **{
                    f"vendor:{vendor.id}": vendor.governance_version
                    for vendor in vendors.values()
                },
            }
        )
        if stale:
            await finalize_governed_terminal_transition(
                db,
                approval=approval,
                proposal=proposal,
                impact_locks=locks,
                actor=current_user,
                department_id=asset.owning_department_id if asset else None,
                status=ApprovalStatus.EXPIRED,
                resolution_notes="Governed Asset archive became stale",
            )
        else:
            assert asset is not None
            current_impact, _ = await _existing_asset_impacts(db, asset=asset, updates={})
            if vendors:
                from .vendor_impact import (
                    asset_point_vendor_impacts,
                    vendor_impact_is_protected,
                )

                _, vendor_rows = await asset_point_vendor_impacts(
                    db,
                    asset=asset,
                    updates={},
                    archive=True,
                    vendors=list(vendors.values()),
                )
                expected_impact = {
                    "assets": [
                        {
                            "resource_id": asset.id,
                            "before": current_impact,
                            "after": current_impact,
                        }
                    ],
                    "vendors": vendor_rows,
                }
                vendor_protected = any(
                    vendor_impact_is_protected(block)
                    for row in vendor_rows
                    for block in (row["before"], row["after"])
                )
            else:
                expected_impact = {
                    "before": current_impact,
                    "after": current_impact,
                }
                vendor_protected = False
            if proposal.derived_impact_snapshot != expected_impact or (
                "protected_vendor_edit"
                in proposal.proposed_changes.get("triggered_scenarios", [])
                and not vendor_protected
            ):
                await finalize_governed_terminal_transition(
                    db,
                    approval=approval,
                    proposal=proposal,
                    impact_locks=locks,
                    actor=current_user,
                    department_id=asset.owning_department_id,
                    status=ApprovalStatus.EXPIRED,
                    resolution_notes="Protected Asset derivation changed after submission",
                )
            else:
                asset.is_archived = True
                asset.archived_at = utc_now()
                asset.archived_by_id = current_user.id
                asset.governance_version += 1
                for vendor in vendors.values():
                    vendor.governance_version += 1
                await finalize_governed_terminal_transition(
                    db,
                    approval=approval,
                    proposal=proposal,
                    impact_locks=locks,
                    actor=current_user,
                    department_id=asset.owning_department_id,
                    status=ApprovalStatus.APPROVED,
                    resolution_notes=resolution_notes,
                    applied_changes=approval.pending_changes,
                )
        await _commit_asset_boundary(db, boundary="governed_mutation.asset.resolve")
        return await _reload_asset_approval(db, approval.id)
    if proposal.mutation_kind != ASSET_CREATE_KIND:
        raise ValidationError("Unsupported governed Asset mutation")
    if proposal.primary_resource_id is not None or locks:
        raise ValidationError("Governed Asset creation identity is stale")
    try:
        payload = AssetCreate.model_validate(proposal.proposed_changes["after"])
    except (KeyError, TypeError, ValueError):
        return await _expire_asset_approval(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=current_user,
            reason="Governed Asset creation payload is stale",
            department_id=requester.department_id,
        )
    users = list(
        (
            await db.execute(
                select(User)
                .where(User.id.in_([payload.business_owner_user_id, payload.ict_owner_user_id]))
                .order_by(User.id)
                .with_for_update()
            )
        ).scalars()
    )
    if len({user.id for user in users if user.is_active}) != len(
        {payload.business_owner_user_id, payload.ict_owner_user_id}
    ):
        return await _expire_asset_approval(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=current_user,
            reason="A proposed Asset owner is no longer active",
            department_id=requester.department_id,
        )
    department = (
        await db.execute(select(Department).where(Department.id == payload.owning_department_id).with_for_update())
    ).scalar_one_or_none()
    if department is None or not department.is_active:
        return await _expire_asset_approval(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=current_user,
            reason="The proposed Asset Department is no longer active",
            department_id=requester.department_id,
        )
    if await db.scalar(select(Asset.id).where(Asset.name == payload.name).limit(1)) is not None:
        return await _expire_asset_approval(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=current_user,
            reason="An Asset with this name already exists",
            department_id=department.id,
        )
    current_impact = await _creation_impact(db, payload)
    if current_impact != proposal.derived_impact_snapshot.get("after"):
        await finalize_governed_terminal_transition(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=locks,
            actor=current_user,
            department_id=department.id,
            status=ApprovalStatus.EXPIRED,
            resolution_notes="Protected Asset derivation changed after submission",
        )
    else:
        asset = Asset(**payload.model_dump(exclude={"request_reason"}))
        db.add(asset)
        await db.flush()
        await finalize_governed_terminal_transition(
            db,
            approval=approval,
            proposal=proposal,
            impact_locks=locks,
            actor=current_user,
            department_id=department.id,
            status=ApprovalStatus.APPROVED,
            resolution_notes=resolution_notes,
            applied_changes=approval.pending_changes,
        )
    await _commit_asset_boundary(db, boundary="governed_mutation.asset.resolve")
    return await _reload_asset_approval(db, approval.id)


async def cancel_asset_mutation(db: AsyncSession, *, approval_id: int, current_user: User) -> ApprovalRequest:
    approval, proposal, locks = await _load_asset_envelope(db, approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(f"Cannot cancel request with status: {approval.status.value}")
    if approval.requested_by_id != current_user.id or proposal.requested_by_id != current_user.id:
        raise AuthorizationError("Only the requester may cancel a governed Asset mutation request")
    asset = (
        (
            await db.execute(select(Asset).where(Asset.id == proposal.primary_resource_id).with_for_update())
        ).scalar_one_or_none()
        if proposal.primary_resource_id is not None
        else None
    )
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=current_user,
        department_id=asset.owning_department_id if asset else current_user.department_id,
        status=ApprovalStatus.CANCELLED,
        resolution_notes="Cancelled by requester",
    )
    await _commit_asset_boundary(db, boundary="governed_mutation.asset.cancel")
    return await _reload_asset_approval(db, approval.id)


async def reject_asset_mutation(
    db: AsyncSession,
    *,
    approval_id: int,
    current_user: User,
    resolution_notes: str,
) -> ApprovalRequest:
    approval, proposal, locks = await _load_asset_envelope(db, approval_id)
    if approval.status != ApprovalStatus.PENDING:
        raise ValidationError(f"Cannot reject request with status: {approval.status.value}")
    resolver, requester, policy_stale_reason = await _load_live_asset_resolution_policy(
        db,
        proposal=proposal,
        current_user=current_user,
    )
    if policy_stale_reason is not None:
        return await _expire_asset_approval(
            db,
            approval=approval,
            proposal=proposal,
            locks=locks,
            actor=resolver,
            reason=policy_stale_reason,
            department_id=requester.department_id if requester else None,
        )
    current_user = resolver
    asset = (
        (
            await db.execute(select(Asset).where(Asset.id == proposal.primary_resource_id).with_for_update())
        ).scalar_one_or_none()
        if proposal.primary_resource_id is not None
        else None
    )
    await finalize_governed_terminal_transition(
        db,
        approval=approval,
        proposal=proposal,
        impact_locks=locks,
        actor=current_user,
        department_id=asset.owning_department_id if asset else current_user.department_id,
        status=ApprovalStatus.REJECTED,
        resolution_notes=resolution_notes,
    )
    await _commit_asset_boundary(db, boundary="governed_mutation.asset.reject")
    return await _reload_asset_approval(db, approval.id)
