import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.approval_helpers import check_control_requires_privileged_approval
from app.core.permissions import is_high_risk_for_approval_async
from app.models import Control, ControlRiskLink, Risk
from app.models.global_config import GlobalConfig, clear_config_cache
from app.services.report_service import count_high_risks


@pytest.fixture(autouse=True)
def clear_cache():
    clear_config_cache()
    yield
    clear_config_cache()


@pytest.mark.asyncio
async def test_is_high_risk_for_approval_async_respects_threshold(
    db_session: AsyncSession,
    test_department,
    test_user_cro,
):
    config = GlobalConfig(
        key="high_risk_min_net_score",
        value="3",
        value_type="int",
        category="risk_thresholds",
        display_name="High Risk Threshold",
    )
    db_session.add(config)
    await db_session.commit()
    clear_config_cache()

    risk = Risk(
        risk_id_code="TH-001",
        name="Threshold Risk",
        process="Threshold Process",
        description="Threshold risk",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
        is_priority=False,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    assert await is_high_risk_for_approval_async(risk, db_session) is True

    config.value = "10"
    await db_session.commit()
    clear_config_cache()

    assert await is_high_risk_for_approval_async(risk, db_session) is False


@pytest.mark.asyncio
async def test_check_control_requires_privileged_approval_respects_threshold(
    db_session: AsyncSession,
    test_department,
    test_user_cro,
):
    config = GlobalConfig(
        key="high_risk_min_net_score",
        value="3",
        value_type="int",
        category="risk_thresholds",
        display_name="High Risk Threshold",
    )
    db_session.add(config)
    await db_session.commit()
    clear_config_cache()

    risk = Risk(
        risk_id_code="TH-CTRL-001",
        name="Linked Risk",
        process="Threshold Process",
        description="Linked risk",
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
        is_priority=False,
    )
    control = Control(
        name="Threshold Control",
        description="Control linked to a threshold risk",
        department_id=test_department.id,
        status="active",
    )
    db_session.add_all([risk, control])
    await db_session.commit()
    await db_session.refresh(risk)
    await db_session.refresh(control)

    link = ControlRiskLink(control_id=control.id, risk_id=risk.id)
    db_session.add(link)
    await db_session.commit()

    assert await check_control_requires_privileged_approval(db_session, control.id) is True

    config.value = "10"
    await db_session.commit()
    clear_config_cache()

    assert await check_control_requires_privileged_approval(db_session, control.id) is False


def test_count_high_risks_helper_uses_threshold():
    class DummyRisk:
        def __init__(self, net_probability: int, net_impact: int):
            self.net_probability = net_probability
            self.net_impact = net_impact

    risks = [
        DummyRisk(2, 2),  # 4
        DummyRisk(2, 5),  # 10
        DummyRisk(4, 4),  # 16
    ]

    assert count_high_risks(risks, high_threshold=10) == 2
    assert count_high_risks(risks, high_threshold=16) == 1
