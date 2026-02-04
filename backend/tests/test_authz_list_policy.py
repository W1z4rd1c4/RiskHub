import pytest
from httpx import AsyncClient

from app.models import Department


@pytest.mark.asyncio
async def test_users_lookup_department_filter_out_of_scope_returns_empty_list(
    db_session,
    client_employee: AsyncClient,
):
    other_department = Department(name="Other Dept (lookup)", code="LKP-2", description="Other dept")
    db_session.add(other_department)
    await db_session.commit()
    await db_session.refresh(other_department)

    resp = await client_employee.get(f"/api/v1/users/lookup?department_id={other_department.id}")
    assert resp.status_code == 200
    assert resp.json() == []

