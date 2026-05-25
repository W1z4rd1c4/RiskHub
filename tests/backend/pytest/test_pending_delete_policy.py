from __future__ import annotations

import inspect

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ValidationError
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus, Department, User
from app.services._entity_mutation_lifecycle import policy
from app.services._entity_mutation_lifecycle.policy import (
    assert_no_existing_pending_delete_request,
    assert_no_pending_delete,
    prepare_control_update,
    prepare_kri_update,
    prepare_risk_update,
)
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk


def test_pending_delete_assertions_share_one_query_helper() -> None:
    source = inspect.getsource(policy)

    assert source.count("select(ApprovalRequest)") == 1
    assert source.count("_get_pending_delete_request(") == 3


@pytest.mark.parametrize(
    "resource_type",
    [
        ApprovalResourceType.RISK,
        ApprovalResourceType.CONTROL,
        ApprovalResourceType.KRI,
    ],
)
@pytest.mark.asyncio
async def test_pending_delete_assertions_preserve_active_completed_and_pending_contracts(
    db_session: AsyncSession,
    test_user_employee: User,
    resource_type: ApprovalResourceType,
) -> None:
    active_resource_id = 7000 + len(resource_type.value)
    completed_resource_id = active_resource_id + 100
    pending_resource_id = active_resource_id + 200

    await assert_no_pending_delete(
        db_session,
        resource_type=resource_type,
        resource_id=active_resource_id,
        detail="Cannot update while deletion is pending approval",
    )
    await assert_no_existing_pending_delete_request(
        db_session,
        resource_type=resource_type,
        resource_id=active_resource_id,
    )

    db_session.add(
        ApprovalRequest(
            resource_type=resource_type,
            resource_id=completed_resource_id,
            resource_name=f"Completed {resource_type.value}",
            action_type=ApprovalActionType.DELETE,
            requested_by_id=test_user_employee.id,
            reason="Completed archive request",
            status=ApprovalStatus.APPROVED,
        )
    )
    await db_session.commit()

    await assert_no_pending_delete(
        db_session,
        resource_type=resource_type,
        resource_id=completed_resource_id,
        detail="Cannot update while deletion is pending approval",
    )
    await assert_no_existing_pending_delete_request(
        db_session,
        resource_type=resource_type,
        resource_id=completed_resource_id,
    )

    db_session.add(
        ApprovalRequest(
            resource_type=resource_type,
            resource_id=pending_resource_id,
            resource_name=f"Pending {resource_type.value}",
            action_type=ApprovalActionType.DELETE,
            requested_by_id=test_user_employee.id,
            reason="Pending archive request",
            status=ApprovalStatus.PENDING,
        )
    )
    await db_session.commit()

    with pytest.raises(ConflictError) as update_exc:
        await assert_no_pending_delete(
            db_session,
            resource_type=resource_type,
            resource_id=pending_resource_id,
            detail="Cannot update while deletion is pending approval",
        )
    assert update_exc.value.detail == "Cannot update while deletion is pending approval"

    with pytest.raises(ValidationError) as archive_exc:
        await assert_no_existing_pending_delete_request(
            db_session,
            resource_type=resource_type,
            resource_id=pending_resource_id,
        )
    assert archive_exc.value.detail == "Deletion request already pending"


async def _create_policy_resource(
    db_session: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    state: str,
    department: Department,
    owner: User,
):
    is_archived = state == "archived"
    suffix = f"{resource_type.value}-{state}"
    if resource_type == ApprovalResourceType.RISK:
        return await create_test_risk(
            db_session,
            department_id=department.id,
            owner_id=owner.id,
            risk_id_code=f"R-PDEL-{suffix}".upper(),
            name=f"Pending delete policy {suffix}",
            overrides={"is_archived": is_archived},
        )
    if resource_type == ApprovalResourceType.CONTROL:
        return await create_test_control(
            db_session,
            department_id=department.id,
            owner_id=owner.id,
            name=f"Pending delete policy {suffix}",
            overrides={"is_archived": is_archived},
        )

    risk = await create_test_risk(
        db_session,
        department_id=department.id,
        owner_id=owner.id,
        risk_id_code=f"R-PDEL-KRI-{state}".upper(),
        name=f"Pending delete policy KRI parent {state}",
    )
    return await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name=f"Pending delete policy KRI {state}",
        overrides={"is_archived": is_archived},
    )


async def _prepare_policy_resource_update(
    db_session: AsyncSession,
    *,
    resource_type: ApprovalResourceType,
    resource_id: int,
    current_user: User,
) -> None:
    if resource_type == ApprovalResourceType.RISK:
        await prepare_risk_update(
            db_session,
            risk_id=resource_id,
            update_data={"description": "Updated by pending-delete policy test"},
            current_user=current_user,
        )
        return
    if resource_type == ApprovalResourceType.CONTROL:
        await prepare_control_update(
            db_session,
            control_id=resource_id,
            update_data={"description": "Updated by pending-delete policy test"},
            current_user=current_user,
        )
        return

    await prepare_kri_update(
        db_session,
        kri_id=resource_id,
        update_data={"description": "Updated by pending-delete policy test"},
        current_user=current_user,
    )


@pytest.mark.parametrize(
    ("resource_type", "archive_error_type", "archive_detail", "pending_detail"),
    [
        (
            ApprovalResourceType.RISK,
            ValidationError,
            "Cannot update archived risk. Please restore it before applying changes.",
            "Cannot update risk while deletion is pending approval",
        ),
        (
            ApprovalResourceType.CONTROL,
            ValidationError,
            "Cannot update archived control. Please restore it before applying changes.",
            "Cannot update control while deletion is pending approval",
        ),
        (
            ApprovalResourceType.KRI,
            ConflictError,
            "Cannot update archived KRI",
            "Cannot update KRI while deletion is pending approval",
        ),
    ],
)
@pytest.mark.asyncio
async def test_prepare_update_paths_share_active_archived_and_pending_delete_contracts(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
    resource_type: ApprovalResourceType,
    archive_error_type: type[Exception],
    archive_detail: str,
    pending_detail: str,
) -> None:
    active_resource = await _create_policy_resource(
        db_session,
        resource_type=resource_type,
        state="active",
        department=test_department,
        owner=test_user_cro,
    )
    await _prepare_policy_resource_update(
        db_session,
        resource_type=resource_type,
        resource_id=active_resource.id,
        current_user=test_user_cro,
    )

    archived_resource = await _create_policy_resource(
        db_session,
        resource_type=resource_type,
        state="archived",
        department=test_department,
        owner=test_user_cro,
    )
    with pytest.raises(archive_error_type) as archive_exc:
        await _prepare_policy_resource_update(
            db_session,
            resource_type=resource_type,
            resource_id=archived_resource.id,
            current_user=test_user_cro,
        )
    assert archive_exc.value.detail == archive_detail

    pending_resource = await _create_policy_resource(
        db_session,
        resource_type=resource_type,
        state="pending",
        department=test_department,
        owner=test_user_cro,
    )
    db_session.add(
        ApprovalRequest(
            resource_type=resource_type,
            resource_id=pending_resource.id,
            resource_name=f"Pending delete policy {resource_type.value}",
            action_type=ApprovalActionType.DELETE,
            requested_by_id=test_user_cro.id,
            reason="Pending delete policy coverage",
            status=ApprovalStatus.PENDING,
        )
    )
    await db_session.commit()

    with pytest.raises(ConflictError) as pending_exc:
        await _prepare_policy_resource_update(
            db_session,
            resource_type=resource_type,
            resource_id=pending_resource.id,
            current_user=test_user_cro,
        )
    assert pending_exc.value.detail == pending_detail
