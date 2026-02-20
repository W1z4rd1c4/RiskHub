import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department


@pytest.mark.asyncio
async def test_create_department(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test creating a new department."""
    data = {"name": "Test Dept", "code": "TEST_DEPT"}

    response = await client_cro.post("/api/v1/riskhub/departments", json=data)
    assert response.status_code == 201
    result = response.json()
    assert result["name"] == "Test Dept"
    assert result["is_active"] is True


@pytest.mark.asyncio
async def test_delete_department_soft(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test soft deletion of a department."""
    # Create dept first
    dept = Department(name="To Delete", code="DEL", is_active=True)
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    response = await client_cro.delete(f"/api/v1/riskhub/departments/{dept.id}")
    assert response.status_code == 200

    # Verify it's soft deleted
    result = await db_session.execute(select(Department).where(Department.id == dept.id))
    updated_dept = result.scalar_one()
    assert updated_dept.is_active is False


@pytest.mark.asyncio
async def test_delete_system_department_blocked(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that system departments cannot be deleted."""
    # Create a system department
    dept = Department(name="System Dept", code="SYSTEM", is_active=True, is_system=True)
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    response = await client_cro.delete(f"/api/v1/riskhub/departments/{dept.id}")
    assert response.status_code == 400
    assert "Cannot delete system departments" in response.json()["detail"]

    # Verify department is still active
    result = await db_session.execute(select(Department).where(Department.id == dept.id))
    existing_dept = result.scalar_one()
    assert existing_dept.is_active is True


@pytest.mark.asyncio
async def test_create_department_duplicate_code(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that duplicate department codes return 400."""
    # Create first department
    dept = Department(name="First Dept", code="DUPLICATE", is_active=True)
    db_session.add(dept)
    await db_session.commit()

    # Try to create another with same code
    data = {"name": "Second Dept", "code": "DUPLICATE"}

    response = await client_cro.post("/api/v1/riskhub/departments", json=data)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_department_duplicate_code(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that updating department to duplicate code returns 400."""
    # Create two departments
    dept1 = Department(name="Dept One", code="CODE_ONE", is_active=True)
    dept2 = Department(name="Dept Two", code="CODE_TWO", is_active=True)
    db_session.add(dept1)
    db_session.add(dept2)
    await db_session.commit()
    await db_session.refresh(dept2)

    # Try to update dept2 with dept1's code
    data = {"code": "CODE_ONE"}

    response = await client_cro.patch(f"/api/v1/riskhub/departments/{dept2.id}", json=data)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_department_same_code_allowed(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    """Test that updating department with its own code doesn't error."""
    # Create department
    dept = Department(name="Self Update", code="SELF_CODE", is_active=True)
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Update with same code (should be allowed)
    data = {"code": "SELF_CODE", "name": "Updated Name"}

    response = await client_cro.patch(f"/api/v1/riskhub/departments/{dept.id}", json=data)
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"
