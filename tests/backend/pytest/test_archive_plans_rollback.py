from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, KeyRiskIndicator, Risk, User
from app.models.risk import RiskStatus
from app.services._entity_mutation_lifecycle.archive_plans import (
    archive_control_detail,
    archive_kri_detail,
    archive_risk_detail,
)


class RollbackTrackingSession:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self.rollback_count = 0

    def __getattr__(self, name: str):
        return getattr(self._session, name)

    async def rollback(self) -> None:
        self.rollback_count += 1
        await self._session.rollback()


@pytest.mark.asyncio
async def test_direct_risk_archive_rolls_back_when_audit_fails(
    db_session: AsyncSession,
    test_department,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    risk = Risk(
        risk_id_code="R-ARCH-RB",
        name="Rollback Risk Archive",
        process="Rollback",
        description="desc",
        category="Testing",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    risk_id = risk.id

    async def fail_audit(*args, **kwargs) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr("app.services._entity_mutation_lifecycle.archive_plans.risk_archived", fail_audit)
    tracking_db = RollbackTrackingSession(db_session)

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await archive_risk_detail(db=tracking_db, risk_id=risk_id, reason="rollback", current_user=test_user)

    assert tracking_db.rollback_count == 1
    persisted = await db_session.scalar(select(Risk).where(Risk.id == risk_id))
    assert persisted is not None
    assert persisted.is_archived is False


@pytest.mark.asyncio
async def test_direct_control_archive_rolls_back_when_audit_fails(
    db_session: AsyncSession,
    test_department,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    control = Control(
        name="Rollback Control Archive",
        description="desc",
        department_id=test_department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    control_id = control.id

    async def fail_audit(*args, **kwargs) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr("app.services._entity_mutation_lifecycle.archive_plans.control_archived", fail_audit)
    tracking_db = RollbackTrackingSession(db_session)

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await archive_control_detail(db=tracking_db, control_id=control_id, reason="rollback", current_user=test_user)

    assert tracking_db.rollback_count == 1
    persisted = await db_session.scalar(select(Control).where(Control.id == control_id))
    assert persisted is not None
    assert persisted.is_archived is False


@pytest.mark.asyncio
async def test_direct_kri_archive_rolls_back_when_audit_fails(
    db_session: AsyncSession,
    test_risk: Risk,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    kri = KeyRiskIndicator(
        risk_id=test_risk.id,
        metric_name="Rollback KRI Archive",
        description="desc",
        current_value=50.0,
        lower_limit=0.0,
        upper_limit=100.0,
        unit="%",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    kri_id = kri.id

    async def fail_audit(*args, **kwargs) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr("app.services._entity_mutation_lifecycle.archive_plans.kri_archived", fail_audit)
    tracking_db = RollbackTrackingSession(db_session)

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await archive_kri_detail(db=tracking_db, kri_id=kri_id, reason="rollback", current_user=test_user)

    assert tracking_db.rollback_count == 1
    persisted = await db_session.scalar(select(KeyRiskIndicator).where(KeyRiskIndicator.id == kri_id))
    assert persisted is not None
    assert persisted.is_archived is False
