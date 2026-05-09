"""Control join semantics: requires both ControlRiskLink and owner match."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import is_risk_control_owner
from app.models import ControlRiskLink, Department, Risk, User
from tests.backend.pytest.factories import create_test_control, create_test_risk

pytestmark = pytest.mark.contract


@pytest_asyncio.fixture
async def user(test_user_employee: User) -> User:
    return test_user_employee


@pytest_asyncio.fixture
async def other_risk(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
) -> Risk:
    return await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-CTRL-OTHER",
        name="Unlinked control risk",
    )


@pytest_asyncio.fixture
async def control_owned_by_user_linked_to_risk(
    db_session: AsyncSession,
    test_department: Department,
    user: User,
) -> ControlRiskLink:
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=user.id,
        risk_id_code="R-OWN-CTRL-LINKED",
        name="Linked owner risk",
    )
    control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=user.id,
        name="Linked owner control",
    )
    link = ControlRiskLink(control_id=control.id, risk_id=risk.id)
    db_session.add(link)
    await db_session.commit()
    await db_session.refresh(link)
    return link


@pytest_asyncio.fixture
async def control_linked_to_risk_owned_by_other(
    db_session: AsyncSession,
    test_department: Department,
    test_user_cro: User,
) -> ControlRiskLink:
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-CTRL-OTHER-OWNER",
        name="Linked other-owner risk",
    )
    control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        name="Linked other-owner control",
    )
    link = ControlRiskLink(control_id=control.id, risk_id=risk.id)
    db_session.add(link)
    await db_session.commit()
    await db_session.refresh(link)
    return link


@pytest_asyncio.fixture
async def control_owned_by_user_unlinked(
    db_session: AsyncSession,
    test_department: Department,
    user: User,
):
    return await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=user.id,
        name="Unlinked owner control",
    )


@pytest.mark.asyncio
async def test_is_risk_control_owner_requires_link_and_owner_match(
    db_session: AsyncSession,
    control_owned_by_user_linked_to_risk: ControlRiskLink,
    user: User,
) -> None:
    """Requires both a ControlRiskLink row and `control_owner_id == user_id`."""
    risk_id = control_owned_by_user_linked_to_risk.risk_id

    assert await is_risk_control_owner(db_session, user.id, risk_id) is True


@pytest.mark.asyncio
async def test_is_risk_control_owner_false_when_link_present_but_owner_differs(
    db_session: AsyncSession,
    control_linked_to_risk_owned_by_other: ControlRiskLink,
    user: User,
) -> None:
    risk_id = control_linked_to_risk_owned_by_other.risk_id

    assert await is_risk_control_owner(db_session, user.id, risk_id) is False


@pytest.mark.asyncio
async def test_is_risk_control_owner_false_when_owner_match_but_link_absent(
    db_session: AsyncSession,
    control_owned_by_user_unlinked,
    other_risk: Risk,
    user: User,
) -> None:
    """Owner matches a control, but no link to the target risk means False."""
    assert await is_risk_control_owner(db_session, user.id, other_risk.id) is False
