from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.exceptions import AuthorizationError, ConflictError
from app.models import ApprovalActionType, ApprovalRequest, ApprovalResourceType, ApprovalStatus
from app.services._entity_mutation_lifecycle import direct_apply
from app.services._entity_mutation_lifecycle.policy import (
    assert_no_pending_delete,
    raise_missing_permission,
)


def test_missing_permission_uses_authorization_domain_error():
    with pytest.raises(AuthorizationError) as exc_info:
        raise_missing_permission("risks", "write")

    assert exc_info.value.detail == "Permission denied: risks:write"


@pytest.mark.asyncio
async def test_pending_delete_uses_conflict_domain_error(db_session):
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=101,
        resource_name="Pending Delete Risk",
        action_type=ApprovalActionType.DELETE,
        requested_by_id=1,
        reason="Already pending",
        status=ApprovalStatus.PENDING,
    )
    db_session.add(approval)
    await db_session.commit()

    with pytest.raises(ConflictError) as exc_info:
        await assert_no_pending_delete(
            db_session,
            resource_type=ApprovalResourceType.RISK,
            resource_id=101,
            detail="Cannot update risk while deletion is pending approval",
        )

    assert exc_info.value.detail == "Cannot update risk while deletion is pending approval"


@pytest.mark.asyncio
async def test_risk_direct_update_rolls_back_when_audit_logging_fails(monkeypatch: pytest.MonkeyPatch):
    db = _FakeDb()
    risk = SimpleNamespace(
        id=1,
        name="Rollback Risk",
        description="Rollback test",
        risk_id_code="RSK-ROLLBACK",
        department_id=10,
        gross_probability=1,
        gross_impact=2,
        gross_score=2,
        net_probability=1,
        net_impact=2,
        net_score=2,
    )

    async def fail_risk_updated(*_args, **_kwargs) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(direct_apply, "risk_updated", fail_risk_updated)

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await direct_apply.apply_risk_update_directly(
            db,
            risk=risk,
            update_data={"gross_probability": 3},
            current_user=SimpleNamespace(id=99),
        )

    assert db.commits == 0
    assert db.rollbacks == 1


class _FakeDb:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    async def refresh(self, _instance) -> None:
        raise AssertionError("refresh should not run after rollback")
