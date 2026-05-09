"""Factory-produced ownership resolvers preserve legacy free-function behavior."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ControlRiskLink, Department, User
from tests.backend.pytest.factories import create_test_control, create_test_kri, create_test_risk

pytestmark = pytest.mark.contract


@dataclass(frozen=True)
class KriOwnershipCase:
    user_id: int
    kri_id: int
    risk_id: int


@dataclass(frozen=True)
class ControlOwnershipCase:
    user_id: int
    control_id: int
    risk_id: int


@pytest_asyncio.fixture
async def kri_fixture_matrix(
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    test_user_cro: User,
) -> list[KriOwnershipCase]:
    active_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-FAC-KRI-ACTIVE",
        name="Factory active KRI risk",
    )
    archived_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-FAC-KRI-ARCHIVED",
        name="Factory archived KRI risk",
    )
    other_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-FAC-KRI-OTHER",
        name="Factory other-owner KRI risk",
    )
    active_kri = await create_test_kri(
        db_session,
        risk_id=active_risk.id,
        metric_name="Factory active KRI",
        overrides={"reporting_owner_id": test_user_employee.id},
    )
    archived_kri = await create_test_kri(
        db_session,
        risk_id=archived_risk.id,
        metric_name="Factory archived KRI",
        overrides={
            "reporting_owner_id": test_user_employee.id,
            "is_archived": True,
        },
    )
    other_kri = await create_test_kri(
        db_session,
        risk_id=other_risk.id,
        metric_name="Factory other-owner KRI",
        overrides={"reporting_owner_id": test_user_cro.id},
    )
    return [
        KriOwnershipCase(test_user_employee.id, active_kri.id, active_risk.id),
        KriOwnershipCase(test_user_employee.id, archived_kri.id, archived_risk.id),
        KriOwnershipCase(test_user_employee.id, other_kri.id, other_risk.id),
    ]


@pytest_asyncio.fixture
async def control_fixture_matrix(
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    test_user_cro: User,
) -> list[ControlOwnershipCase]:
    linked_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-FAC-CTRL-LINKED",
        name="Factory linked control risk",
    )
    other_owner_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-FAC-CTRL-OTHER",
        name="Factory other-owner control risk",
    )
    unlinked_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="R-OWN-FAC-CTRL-UNLINKED",
        name="Factory unlinked control risk",
    )
    owned_linked_control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        name="Factory owned linked control",
    )
    other_linked_control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        name="Factory other linked control",
    )
    owned_unlinked_control = await create_test_control(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        name="Factory owned unlinked control",
    )
    db_session.add_all(
        [
            ControlRiskLink(control_id=owned_linked_control.id, risk_id=linked_risk.id),
            ControlRiskLink(control_id=other_linked_control.id, risk_id=other_owner_risk.id),
        ]
    )
    await db_session.commit()
    return [
        ControlOwnershipCase(test_user_employee.id, owned_linked_control.id, linked_risk.id),
        ControlOwnershipCase(test_user_employee.id, other_linked_control.id, other_owner_risk.id),
        ControlOwnershipCase(test_user_employee.id, owned_unlinked_control.id, unlinked_risk.id),
    ]


@pytest.mark.asyncio
async def test_kri_factory_resolvers_equivalent(
    db_session: AsyncSession,
    kri_fixture_matrix: list[KriOwnershipCase],
) -> None:
    from app.core._permissions import ownership as legacy
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator

    kri_resolvers = make_ownership_resolvers(
        model=KeyRiskIndicator,
        owner_column="reporting_owner_id",
        archived_column="is_archived",
        bridge=None,
    )
    for case in kri_fixture_matrix:
        assert await kri_resolvers.is_owner(db_session, case.user_id, case.kri_id) == (
            await legacy.is_kri_reporting_owner(db_session, case.user_id, case.kri_id)
        )
        assert await kri_resolvers.is_target_owner(db_session, case.user_id, case.risk_id) == (
            await legacy.is_risk_kri_reporting_owner(db_session, case.user_id, case.risk_id)
        )
        assert sorted(await kri_resolvers.ids_where_owner(db_session, case.user_id)) == sorted(
            await legacy.get_kri_ids_where_reporting_owner(db_session, case.user_id)
        )
        assert sorted(await kri_resolvers.target_ids_where_owner(db_session, case.user_id)) == sorted(
            await legacy.get_risk_ids_where_kri_reporting_owner(db_session, case.user_id)
        )


@pytest.mark.asyncio
async def test_control_factory_resolvers_equivalent(
    db_session: AsyncSession,
    control_fixture_matrix: list[ControlOwnershipCase],
) -> None:
    from app.core._permissions import ownership as legacy
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import Control, ControlRiskLink

    control_resolvers = make_ownership_resolvers(
        model=Control,
        owner_column="control_owner_id",
        archived_column=None,
        bridge=(ControlRiskLink, "control_id", "risk_id"),
    )
    for case in control_fixture_matrix:
        assert await control_resolvers.is_owner(db_session, case.user_id, case.control_id) == (
            await legacy.is_control_owner(db_session, case.user_id, case.control_id)
        )
        assert await control_resolvers.is_target_owner(db_session, case.user_id, case.risk_id) == (
            await legacy.is_risk_control_owner(db_session, case.user_id, case.risk_id)
        )
        assert sorted(await control_resolvers.ids_where_owner(db_session, case.user_id)) == sorted(
            await legacy.get_control_ids_where_owner(db_session, case.user_id)
        )
        assert sorted(await control_resolvers.target_ids_where_owner(db_session, case.user_id)) == sorted(
            await legacy.get_risk_ids_where_control_owner(db_session, case.user_id)
        )


def test_archived_filter_applied_per_method() -> None:
    """KRI risk-scope methods filter is_archived=False; KRI-direct methods do not."""
    from app.core._permissions._ownership_factory import make_ownership_resolvers
    from app.models import KeyRiskIndicator

    resolvers = make_ownership_resolvers(
        model=KeyRiskIndicator,
        owner_column="reporting_owner_id",
        archived_column="is_archived",
        bridge=None,
    )

    assert resolvers.archived_filter_methods == frozenset({"is_target_owner", "target_ids_where_owner"})
