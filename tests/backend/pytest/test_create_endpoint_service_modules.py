from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ServiceFailure
from app.models import Department, Risk, User
from app.schemas.risk import RiskCreate
from app.services import risk_identifier
from app.services._entity_mutation_lifecycle import (
    create_control_detail,
    create_kri_detail,
    create_risk_detail,
)
from app.services._issue_workflow.execution import create_contextual_issue_detail, create_issue_detail


def test_create_service_interfaces_are_exported() -> None:
    assert callable(create_risk_detail)
    assert callable(create_control_detail)
    assert callable(create_kri_detail)
    assert callable(create_issue_detail)
    assert callable(create_contextual_issue_detail)


async def _seed_risk_with_code(
    db: AsyncSession,
    *,
    code: str,
    department: Department,
    owner: User,
) -> None:
    db.add(
        Risk(
            risk_id_code=code,
            name=f"Existing {code}",
            process="Collision",
            description="Existing risk for retry collision",
            category="Operational",
            department_id=department.id,
            owner_id=owner.id,
            risk_type="operational",
            gross_probability=1,
            gross_impact=1,
            net_probability=1,
            net_impact=1,
            status="active",
        )
    )
    await db.commit()


@pytest.mark.asyncio
async def test_create_risk_detail_retries_generated_code_collision(
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_risk_with_code(db_session, code="COLL-R01", department=test_department, owner=test_user)
    generated_codes = iter(["COLL-R01", "COLL-R02"])

    async def fake_generate_risk_id_code(_db: AsyncSession, _process: str) -> str:
        return next(generated_codes)

    monkeypatch.setattr(risk_identifier, "generate_risk_id_code", fake_generate_risk_id_code)

    response = await create_risk_detail(
        db=db_session,
        risk_data=RiskCreate(
            name="Retried risk",
            process="Collision",
            description="Risk created after generated code retry",
            department_id=test_department.id,
            owner_id=test_user.id,
            risk_type="operational",
            category="Operational",
            gross_probability=2,
            gross_impact=3,
            net_probability=1,
            net_impact=2,
        ),
        current_user=test_user,
    )

    assert response.risk_id_code == "COLL-R02"
    persisted_codes = (
        await db_session.execute(select(Risk.risk_id_code).where(Risk.risk_id_code.in_(["COLL-R01", "COLL-R02"])))
    ).scalars()
    assert sorted(persisted_codes.all()) == ["COLL-R01", "COLL-R02"]


@pytest.mark.asyncio
async def test_create_risk_detail_reports_final_generated_code_conflict(
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_risk_with_code(db_session, code="STUCK-R01", department=test_department, owner=test_user)

    async def fake_generate_risk_id_code(_db: AsyncSession, _process: str) -> str:
        return "STUCK-R01"

    monkeypatch.setattr(risk_identifier, "generate_risk_id_code", fake_generate_risk_id_code)

    with pytest.raises(ServiceFailure) as exc_info:
        await create_risk_detail(
            db=db_session,
            risk_data=RiskCreate(
                name="Uncreatable risk",
                process="Stuck",
                description="Risk whose generated code always collides",
                department_id=test_department.id,
                owner_id=test_user.id,
                risk_type="operational",
            ),
            current_user=test_user,
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_create_risk_detail_reports_user_provided_code_conflict(
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    seed_risk_types,
) -> None:
    await _seed_risk_with_code(db_session, code="MANUAL-R01", department=test_department, owner=test_user)

    with pytest.raises(ConflictError) as exc_info:
        await create_risk_detail(
            db=db_session,
            risk_data=RiskCreate(
                risk_id_code="MANUAL-R01",
                name="Duplicate manual risk",
                process="Manual",
                description="Risk with explicit duplicate code",
                department_id=test_department.id,
                owner_id=test_user.id,
                risk_type="operational",
            ),
            current_user=test_user,
        )

    assert exc_info.value.status_code == 409
