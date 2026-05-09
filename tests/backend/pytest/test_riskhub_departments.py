import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.riskhub import departments as department_endpoint
from app.models import User, Vendor
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
async def test_create_department_rolls_back_when_activity_log_fails(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
):
    async def fail_log_activity(*args, **kwargs):
        raise RuntimeError("simulated activity log failure")

    monkeypatch.setattr("app.api.v1.endpoints.riskhub.departments.log_activity", fail_log_activity)

    with pytest.raises(RuntimeError, match="simulated activity log failure"):
        await client_cro.post(
            "/api/v1/riskhub/departments",
            json={"name": "Rollback Department", "code": "ROLLBACK_DEPT"},
        )

    await db_session.rollback()
    persisted = (
        await db_session.execute(select(Department).where(Department.code == "ROLLBACK_DEPT"))
    ).scalar_one_or_none()
    assert persisted is None


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


@pytest.mark.asyncio
async def test_update_inactive_department_rejected(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    dept = Department(name="Inactive Department", code="INACTIVE_DEPT", is_active=False)
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    response = await client_cro.patch(
        f"/api/v1/riskhub/departments/{dept.id}",
        json={"name": "Should Not Update"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot update inactive department"


@pytest.mark.asyncio
async def test_create_department_rejects_inactive_manager(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
):
    manager = User(
        email="inactive-manager@example.com",
        hashed_password="hash",
        name="Inactive Manager",
        role_id=test_user_employee.role_id,
        department_id=test_user_employee.department_id,
        is_active=False,
    )
    db_session.add(manager)
    await db_session.commit()
    await db_session.refresh(manager)

    response = await client_cro.post(
        "/api/v1/riskhub/departments",
        json={"name": "Managed Department", "code": "MGR_DEPT", "manager_id": manager.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Department manager can only be assigned after department creation"


@pytest.mark.asyncio
async def test_create_department_rejects_manager_who_cannot_belong_to_new_department(
    client_cro: AsyncClient,
    test_user_employee: User,
):
    response = await client_cro.post(
        "/api/v1/riskhub/departments",
        json={"name": "Preassigned Manager", "code": "PRE_MGR", "manager_id": test_user_employee.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Department manager can only be assigned after department creation"


@pytest.mark.asyncio
async def test_update_department_rejects_manager_from_another_department(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
):
    target_dept = Department(name="Target Department", code="TARGET_DEPT", is_active=True)
    db_session.add(target_dept)
    await db_session.commit()
    await db_session.refresh(target_dept)

    response = await client_cro.patch(
        f"/api/v1/riskhub/departments/{target_dept.id}",
        json={"manager_id": test_user_employee.id},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Department manager must belong to the selected department"


@pytest.mark.asyncio
async def test_update_department_accepts_active_manager_from_same_department(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
):
    target_dept = Department(name="Owned Department", code="OWNED_DEPT", is_active=True)
    db_session.add(target_dept)
    await db_session.flush()
    manager = User(
        email="department-manager@example.com",
        hashed_password="hash",
        name="Department Manager",
        role_id=test_user_employee.role_id,
        department_id=target_dept.id,
        is_active=True,
    )
    db_session.add(manager)
    await db_session.commit()
    await db_session.refresh(target_dept)
    await db_session.refresh(manager)

    response = await client_cro.patch(
        f"/api/v1/riskhub/departments/{target_dept.id}",
        json={"manager_id": manager.id},
    )

    assert response.status_code == 200
    assert response.json()["manager_id"] == manager.id
    assert response.json()["manager_name"] == "Department Manager"


@pytest.mark.asyncio
async def test_update_department_locks_org_chart_before_manager_validation(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user_employee: User,
    monkeypatch,
):
    target_dept = Department(name="Locked Department", code="LOCKED_DEPT", is_active=True)
    db_session.add(target_dept)
    await db_session.flush()
    manager = User(
        email="locked-department-manager@example.com",
        hashed_password="hash",
        name="Locked Department Manager",
        role_id=test_user_employee.role_id,
        department_id=target_dept.id,
        is_active=True,
    )
    db_session.add(manager)
    await db_session.commit()
    await db_session.refresh(target_dept)
    await db_session.refresh(manager)

    events: list[str] = []

    async def capture_lock(db):
        events.append("lock")

    async def capture_validate(db, manager_id, *, department_id):
        events.append("validate")

    monkeypatch.setattr(department_endpoint, "acquire_org_chart_lock", capture_lock, raising=False)
    monkeypatch.setattr(department_endpoint, "validate_department_manager", capture_validate)

    response = await client_cro.patch(
        f"/api/v1/riskhub/departments/{target_dept.id}",
        json={"manager_id": manager.id},
    )

    assert response.status_code == 200
    assert events == ["lock", "validate"]
    assert response.json()["manager_id"] == manager.id


@pytest.mark.asyncio
async def test_delete_department_blocked_by_vendor(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user_cro: User,
):
    dept = Department(name="Vendor Department", code="VENDOR_DEPT", is_active=True)
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    vendor = Vendor(
        name="Department Vendor",
        process="IT",
        subprocess=None,
        department_id=dept.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    response = await client_cro.delete(f"/api/v1/riskhub/departments/{dept.id}")

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot delete department with 1 vendors"


@pytest.mark.asyncio
async def test_department_response_includes_full_delete_blocker_counts(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user_cro: User,
):
    dept = Department(name="Blocker Department", code="BLOCKER_DEPT", is_active=True)
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    vendor = Vendor(
        name="Blocker Vendor",
        process="IT",
        subprocess=None,
        department_id=dept.id,
        outsourcing_owner_user_id=test_user_cro.id,
        vendor_type="ict",
        risk_score_1_5=3,
        supports_important_core_insurance_function=False,
        dora_relevant=True,
        is_significant_vendor=False,
        has_alternative_providers=False,
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    response = await client_cro.get("/api/v1/riskhub/departments")

    assert response.status_code == 200
    department = next(item for item in response.json() if item["id"] == dept.id)
    assert department["kri_count"] == 0
    assert department["vendor_count"] == 1
    assert department["pending_orphan_count"] == 0
    assert department["capabilities"]["can_delete"] is False
