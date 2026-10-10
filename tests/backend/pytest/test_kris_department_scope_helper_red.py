from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User
from app.models.key_risk_indicator import KRIFrequency
from app.services._kri_history import clock
from app.services._kri_history.periods import latest_closed_period_for_date
from tests.backend.pytest.factories import create_test_kri, create_test_risk
from tests.backend.pytest.test_kri_due_population_http import freeze

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ("/api/v1/kris/due-soon", "/api/v1/kris/overdue"))
async def test_kri_due_window_department_scope_matches_register_authority(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
) -> None:
    # #245 moves scoping into the shared query. Exercise HTTP with real rows,
    # rather than stubbing a pre-scoped payload that bypasses query authority.
    freeze(monkeypatch, date(2026, 10, 24))
    other = Department(name="Due Scope Other", code="DUE-SCOPE-OTHER")
    db_session.add(other)
    await db_session.flush()
    other_department_id = other.id
    own_risk = await create_test_risk(
        db_session, department_id=test_department.id, owner_id=test_user_employee.id, risk_id_code="DUE-OWN"
    )
    other_risk = await create_test_risk(
        db_session, department_id=other.id, owner_id=test_user_cro.id, risk_id_code="DUE-OTHER"
    )
    own_kri = await create_test_kri(
        db_session, risk_id=own_risk.id, overrides={"frequency": "monthly", "last_period_end": None}
    )
    other_kri = await create_test_kri(
        db_session, risk_id=other_risk.id, overrides={"frequency": "monthly", "last_period_end": None}
    )

    async with client_factory(current_user=test_user_employee) as employee_client:
        unauthorized = await employee_client.get(endpoint, params={"department_id": other_department_id})
        own_department = await employee_client.get(endpoint, params={"department_id": test_department.id})
        implicit_scope = await employee_client.get(endpoint)

    assert unauthorized.status_code == 200
    assert unauthorized.json() == []
    assert own_department.status_code == 200
    assert [item["kri_id"] for item in own_department.json()] == [own_kri.id]
    assert implicit_scope.status_code == 200
    assert [item["kri_id"] for item in implicit_scope.json()] == [own_kri.id]

    async with client_factory(current_user=test_user_cro) as privileged_client:
        all_departments = await privileged_client.get(endpoint)
        filtered_other_department = await privileged_client.get(endpoint, params={"department_id": other_department_id})

    assert all_departments.status_code == 200
    assert [item["kri_id"] for item in all_departments.json()] == [own_kri.id, other_kri.id]
    assert filtered_other_department.status_code == 200
    assert [item["kri_id"] for item in filtered_other_department.json()] == [other_kri.id]


@pytest.mark.asyncio
async def test_kri_breaches_department_scope_matches_due_window_paths(
    client_factory,
    db_session: AsyncSession,
    test_department: Department,
    test_user_employee: User,
    test_user_cro: User,
) -> None:
    _, latest_period_end = latest_closed_period_for_date(clock.today(), KRIFrequency.quarterly.value)
    other_department = Department(name="KRI Scope Other Department", code="KRI-SCOPE-OTHER")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)

    own_risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_id_code="KRI-SCOPE-OWN",
        name="KRI Scope Own Risk",
    )
    other_risk = await create_test_risk(
        db_session,
        department_id=other_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="KRI-SCOPE-OTHER",
        name="KRI Scope Other Risk",
    )
    own_kri = await create_test_kri(
        db_session,
        risk_id=own_risk.id,
        metric_name="Own Breached KRI",
        overrides={
            "current_value": 150.0,
            "upper_limit": 100.0,
            "last_period_end": latest_period_end,
        },
    )
    other_kri = await create_test_kri(
        db_session,
        risk_id=other_risk.id,
        metric_name="Other Breached KRI",
        overrides={
            "current_value": 150.0,
            "upper_limit": 100.0,
            "last_period_end": latest_period_end,
        },
    )

    async with client_factory(current_user=test_user_employee) as employee_client:
        unauthorized = await employee_client.get(
            "/api/v1/kris/breaches",
            params={"department_id": other_department.id},
        )
        implicit_scope = await employee_client.get("/api/v1/kris/breaches")

    assert unauthorized.status_code == 200
    assert unauthorized.json() == []
    assert implicit_scope.status_code == 200
    implicit_ids = {item["id"] for item in implicit_scope.json()}
    assert own_kri.id in implicit_ids
    assert other_kri.id not in implicit_ids

    async with client_factory(current_user=test_user_cro) as privileged_client:
        filtered_other_department = await privileged_client.get(
            "/api/v1/kris/breaches",
            params={"department_id": other_department.id},
        )

    assert filtered_other_department.status_code == 200
    filtered_ids = {item["id"] for item in filtered_other_department.json()}
    assert other_kri.id in filtered_ids
    assert own_kri.id not in filtered_ids
