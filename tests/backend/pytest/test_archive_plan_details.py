from __future__ import annotations

import inspect
import json

import pytest
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, Department, User
from app.services._entity_mutation_lifecycle import archive_plans
from app.services._entity_mutation_lifecycle.archive_plans import (
    archive_control_detail,
    archive_kri_detail,
    archive_risk_detail,
)
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk


async def _create_archive_targets(
    db: AsyncSession,
    *,
    department: Department,
    owner: User,
    suffix: str,
):
    risk = await create_test_risk(
        db,
        risk_id_code=f"R-W7-ARCH-{suffix}",
        name=f"W7 Archive Risk {suffix}",
        department_id=department.id,
        owner_id=owner.id,
    )
    control = await create_test_control(
        db,
        department_id=department.id,
        owner_id=owner.id,
        name=f"W7 Archive Control {suffix}",
    )
    kri_parent = await create_test_risk(
        db,
        risk_id_code=f"R-W7-KRI-{suffix}",
        name=f"W7 Archive KRI Parent {suffix}",
        department_id=department.id,
        owner_id=owner.id,
    )
    kri = await create_test_kri(db, risk_id=kri_parent.id, metric_name=f"W7 Archive KRI {suffix}")
    return risk, control, kri


@pytest.mark.asyncio
async def test_archive_detail_direct_archive_sets_actor_metadata_for_all_entities(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
) -> None:
    risk, control, kri = await _create_archive_targets(
        db_session,
        department=test_department,
        owner=test_user_cro,
        suffix="DIRECT",
    )

    cases = (
        (risk, archive_risk_detail, {"risk_id": risk.id, "reason": "Archive risk"}),
        (control, archive_control_detail, {"control_id": control.id, "reason": "Archive control"}),
        (kri, archive_kri_detail, {"kri_id": kri.id, "reason": "Archive KRI"}),
    )

    for entity, archive_detail, kwargs in cases:
        outcome = await archive_detail(db=db_session, current_user=test_user_cro, **kwargs)

        assert outcome.kind == "applied"
        assert outcome.response.status_code == status.HTTP_204_NO_CONTENT
        await db_session.refresh(entity)
        assert entity.is_archived is True
        assert entity.archived_by_id == test_user_cro.id
        assert entity.archived_at is not None

    assert control.updated_by_id == test_user_cro.id


@pytest.mark.asyncio
async def test_archive_detail_existing_archived_entities_keep_no_content_contract(
    db_session: AsyncSession,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_cro: User,
) -> None:
    risk, control, kri = await _create_archive_targets(
        db_session,
        department=test_department,
        owner=test_user_cro,
        suffix="EXISTING",
    )
    for entity in (risk, control, kri):
        entity.mark_archived(test_user_approval_requester)
    await db_session.commit()

    cases = (
        (risk, archive_risk_detail, {"risk_id": risk.id, "reason": "Archive existing risk"}),
        (control, archive_control_detail, {"control_id": control.id, "reason": "Archive existing control"}),
        (kri, archive_kri_detail, {"kri_id": kri.id, "reason": "Archive existing KRI"}),
    )

    for entity, archive_detail, kwargs in cases:
        outcome = await archive_detail(db=db_session, current_user=test_user_cro, **kwargs)

        assert outcome.kind == "applied"
        assert outcome.response.status_code == status.HTTP_204_NO_CONTENT
        await db_session.refresh(entity)
        assert entity.is_archived is True
        assert entity.archived_by_id == test_user_cro.id


@pytest.mark.asyncio
async def test_archive_detail_approval_queue_response_and_duplicate_detail_for_all_entities(
    db_session: AsyncSession,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_cro: User,
) -> None:
    risk, control, kri = await _create_archive_targets(
        db_session,
        department=test_department,
        owner=test_user_cro,
        suffix="QUEUED",
    )

    cases = (
        (ApprovalResourceType.RISK, risk.id, archive_risk_detail, {"risk_id": risk.id, "reason": "Queue risk"}),
        (
            ApprovalResourceType.CONTROL,
            control.id,
            archive_control_detail,
            {"control_id": control.id, "reason": "Queue control"},
        ),
        (ApprovalResourceType.KRI, kri.id, archive_kri_detail, {"kri_id": kri.id, "reason": "Queue KRI"}),
    )

    for resource_type, resource_id, archive_detail, kwargs in cases:
        outcome = await archive_detail(db=db_session, current_user=test_user_approval_requester, **kwargs)

        assert outcome.kind == "approval_queued"
        assert outcome.response.status_code == status.HTTP_202_ACCEPTED
        payload = json.loads(outcome.response.body)
        assert payload["message"] == "Deletion request submitted for approval"
        assert payload["action_type"] == "delete"

        approval = await db_session.get(ApprovalRequest, payload["approval_id"])
        assert approval is not None
        assert approval.resource_type == resource_type
        assert approval.resource_id == resource_id
        assert approval.action_type == ApprovalActionType.DELETE

        with pytest.raises(ValidationError, match="Deletion request already pending"):
            await archive_detail(db=db_session, current_user=test_user_approval_requester, **kwargs)


def test_archive_detail_functions_share_internal_descriptor_and_helpers() -> None:
    source = inspect.getsource(archive_plans)

    assert "_ArchiveDetailDescriptor" in source
    assert source.count("create_approval_request_with_audit(") == 1
    assert source.count("build_approval_queued_response(") == 1
    assert source.count("await db.commit()") == 1

    for function_name in ("archive_risk_detail", "archive_control_detail", "archive_kri_detail"):
        function_source = inspect.getsource(getattr(archive_plans, function_name))
        assert "_archive_detail(" in function_source
