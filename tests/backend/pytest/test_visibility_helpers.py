import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_kri_id, can_read_risk_id, can_read_vendor_id
from app.models import Department, KeyRiskIndicator, Permission, Risk, Role, RolePermission, User, Vendor
from app.models.risk import RiskStatus
from app.models.user import AccessScope


@pytest_asyncio.fixture
async def other_department(db_session: AsyncSession) -> Department:
    dept = Department(name="Other Department (Visibility)", code="OTHV", description="Other dept for visibility tests")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest_asyncio.fixture
async def dept_scoped_user_with_vendor_risk_read(
    db_session: AsyncSession,
    test_department: Department,
) -> User:
    role = Role(
        name="visibility_tester", display_name="Visibility Tester", description="Role for visibility helper tests"
    )
    db_session.add(role)
    await db_session.commit()

    perms = [
        Permission(resource="vendors", action="read", description="Read vendors"),
        Permission(resource="risks", action="read", description="Read risks"),
    ]
    db_session.add_all(perms)
    await db_session.commit()
    for p in perms:
        await db_session.refresh(p)
    db_session.add_all([RolePermission(role_id=role.id, permission_id=p.id) for p in perms])
    await db_session.commit()

    user = User(
        name="Dept Scoped Visibility User",
        email="visibility_dept@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest.mark.asyncio
async def test_can_read_vendor_id_blocks_out_of_scope_department(
    db_session: AsyncSession,
    other_department: Department,
    dept_scoped_user_with_vendor_risk_read: User,
    test_user: User,
):
    vendor = Vendor(
        name="Other Dept Vendor",
        process="Proc",
        department_id=other_department.id,
        outsourcing_owner_user_id=test_user.id,
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    allowed = await can_read_vendor_id(db_session, dept_scoped_user_with_vendor_risk_read, vendor.id)
    assert allowed is False


@pytest.mark.asyncio
async def test_can_read_vendor_id_allows_owner_exception(
    db_session: AsyncSession,
    other_department: Department,
    dept_scoped_user_with_vendor_risk_read: User,
):
    vendor = Vendor(
        name="Other Dept Vendor (Owned)",
        process="Proc",
        department_id=other_department.id,
        outsourcing_owner_user_id=dept_scoped_user_with_vendor_risk_read.id,
    )
    db_session.add(vendor)
    await db_session.commit()
    await db_session.refresh(vendor)

    allowed = await can_read_vendor_id(db_session, dept_scoped_user_with_vendor_risk_read, vendor.id)
    assert allowed is True


@pytest.mark.asyncio
async def test_can_read_risk_id_allows_direct_owner_exception(
    db_session: AsyncSession,
    other_department: Department,
    dept_scoped_user_with_vendor_risk_read: User,
):
    risk = Risk(
        risk_id_code="R-VIS-OWNER-001",
        name="Other Dept Risk (direct owner)",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=other_department.id,
        owner_id=dept_scoped_user_with_vendor_risk_read.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    allowed = await can_read_risk_id(db_session, dept_scoped_user_with_vendor_risk_read, risk.id)
    assert allowed is True


@pytest.mark.asyncio
async def test_can_read_risk_id_blocks_out_of_scope_non_owner(
    db_session: AsyncSession,
    other_department: Department,
    test_user: User,
    dept_scoped_user_with_vendor_risk_read: User,
):
    risk = Risk(
        risk_id_code="R-VIS-NONOWNER-001",
        name="Other Dept Risk (non-owner)",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=other_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    allowed = await can_read_risk_id(db_session, dept_scoped_user_with_vendor_risk_read, risk.id)
    assert allowed is False


@pytest.mark.asyncio
async def test_can_read_kri_id_blocks_out_of_scope_risk(
    db_session: AsyncSession,
    other_department: Department,
    test_user: User,
    dept_scoped_user_with_vendor_risk_read: User,
):
    risk = Risk(
        risk_id_code="R-VIS-KRI-001",
        name="Other Dept Risk (KRI visibility)",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=other_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="KRI visibility",
        description="desc",
        current_value=1.0,
        lower_limit=0.0,
        upper_limit=10.0,
        unit="count",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    allowed = await can_read_kri_id(db_session, dept_scoped_user_with_vendor_risk_read, kri.id)
    assert allowed is False


@pytest.mark.asyncio
async def test_can_read_kri_id_inherits_direct_risk_owner_exception(
    db_session: AsyncSession,
    other_department: Department,
    dept_scoped_user_with_vendor_risk_read: User,
):
    risk = Risk(
        risk_id_code="R-VIS-KRI-OWNER-001",
        name="Other Dept Risk (KRI owner visibility)",
        process="Test Process",
        description="desc",
        category="Test Category",
        department_id=other_department.id,
        owner_id=dept_scoped_user_with_vendor_risk_read.id,
        risk_type="operational",
        status=RiskStatus.active.value,
        gross_probability=3,
        gross_impact=3,
        net_probability=2,
        net_impact=2,
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)

    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name="KRI owner visibility",
        description="desc",
        current_value=1.0,
        lower_limit=0.0,
        upper_limit=10.0,
        unit="count",
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)

    allowed = await can_read_kri_id(db_session, dept_scoped_user_with_vendor_risk_read, kri.id)
    assert allowed is True
