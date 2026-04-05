import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.seed import seed_default_risk_types
from app.models import Department, User
from app.models.risk_type import RiskTypeConfig


@pytest.mark.asyncio
async def test_seed_default_risk_types_creates_system_defaults(db_session):
    summary = await seed_default_risk_types(db_session)
    await db_session.commit()

    assert summary == {"created": 2, "repaired": 0}

    result = await db_session.execute(
        select(RiskTypeConfig.code, RiskTypeConfig.display_name, RiskTypeConfig.is_system).order_by(RiskTypeConfig.sort_order)
    )
    rows = result.all()

    assert rows == [
        ("operational", "Operational", True),
        ("strategic", "Strategic", True),
    ]


@pytest.mark.asyncio
async def test_seed_default_risk_types_is_idempotent(db_session):
    await seed_default_risk_types(db_session)
    await db_session.commit()

    summary = await seed_default_risk_types(db_session)
    await db_session.commit()

    count = await db_session.scalar(select(func.count()).select_from(RiskTypeConfig))

    assert summary == {"created": 0, "repaired": 0}
    assert count == 2


@pytest.mark.asyncio
async def test_seed_default_risk_types_repairs_inactive_defaults_without_overwriting_metadata(db_session):
    db_session.add(
        RiskTypeConfig(
            code="operational",
            display_name="Legacy Operational",
            description="Legacy description",
            color="#123456",
            sort_order=0,
            is_active=False,
            is_system=False,
        )
    )
    await db_session.commit()

    summary = await seed_default_risk_types(db_session)
    await db_session.commit()

    operational = await db_session.scalar(select(RiskTypeConfig).where(RiskTypeConfig.code == "operational"))
    strategic = await db_session.scalar(select(RiskTypeConfig).where(RiskTypeConfig.code == "strategic"))

    assert summary == {"created": 1, "repaired": 1}
    assert operational is not None
    assert operational.is_active is True
    assert operational.is_system is True
    assert operational.display_name == "Legacy Operational"
    assert operational.description == "Legacy description"
    assert operational.color == "#123456"
    assert operational.sort_order == 0
    assert strategic is not None


@pytest.mark.asyncio
async def test_seed_default_risk_types_backfills_blank_builtin_metadata(db_session):
    db_session.add(
        RiskTypeConfig(
            code="operational",
            display_name="   ",
            description="",
            color=" ",
            sort_order=0,
            is_active=False,
            is_system=False,
        )
    )
    await db_session.commit()

    summary = await seed_default_risk_types(db_session)
    await db_session.commit()

    operational = await db_session.scalar(select(RiskTypeConfig).where(RiskTypeConfig.code == "operational"))

    assert summary == {"created": 1, "repaired": 1}
    assert operational is not None
    assert operational.display_name == "Operational"
    assert operational.description == "Operational risk"
    assert operational.color == "#3b82f6"
    assert operational.sort_order == 0
    assert operational.is_active is True
    assert operational.is_system is True


@pytest.mark.asyncio
async def test_seed_default_risk_types_restores_public_and_validation_contracts(
    client_employee: AsyncClient,
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
):
    db_session.add(
        RiskTypeConfig(
            code="operational",
            display_name="Legacy Operational",
            description="Legacy description",
            color="#123456",
            sort_order=3,
            is_active=False,
            is_system=False,
        )
    )
    await db_session.commit()

    summary = await seed_default_risk_types(db_session)
    await db_session.commit()

    assert summary == {"created": 1, "repaired": 1}

    public_response = await client_employee.get("/api/v1/riskhub/public-risk-types")
    assert public_response.status_code == 200
    public_codes = [item["code"] for item in public_response.json()]
    assert "operational" in public_codes

    create_response = await client_cro.post(
        "/api/v1/risks",
        json={
            "risk_id_code": "OPS-SEED-R01",
            "name": "Seed Repair Validation Risk",
            "process": "Seed Repair Process",
            "description": "Risk create should accept repaired operational type",
            "department_id": test_department.id,
            "owner_id": test_user_cro.id,
            "risk_type": "operational",
            "gross_probability": 2,
            "gross_impact": 2,
            "net_probability": 1,
            "net_impact": 1,
            "status": "active",
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["risk_type"] == "operational"
