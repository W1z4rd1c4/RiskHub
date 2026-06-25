import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Control, Department, OrphanedItem, Risk, Role, User
from app.models.risk import RiskStatus
from app.models.scheduler_job_run import SchedulerJobRun
from app.models.user import AccessScope
from app.services._orphaned_items import get_orphan_detail, get_pending_orphans_with_details


@pytest.mark.asyncio
async def test_orphaned_items_list_does_not_scan_uncategorised(
    client_cro: AsyncClient,
    db_session: AsyncSession,
):
    before = (await db_session.execute(select(func.count(OrphanedItem.id)))).scalar() or 0
    resp = await client_cro.get("/api/v1/orphaned-items/")
    assert resp.status_code == 200
    after = (await db_session.execute(select(func.count(OrphanedItem.id)))).scalar() or 0
    assert after == before


@pytest.mark.asyncio
async def test_orphaned_items_scan_creates_orphans_for_uncategorised(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    uncat = Department(name="Uncategorised", code="UNCAT", description="System")
    db_session.add(uncat)
    await db_session.commit()
    await db_session.refresh(uncat)

    risk = Risk(
        risk_id_code="UNCAT-R001",
        name="Uncat Risk",
        process="Test",
        description="",
        category="Test",
        department_id=uncat.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    control = Control(
        name="Uncat Control",
        description="",
        data_source=None,
        methodology_reference=None,
        control_form="manual",
        process_owner_position=None,
        control_owner_id=test_user.id,
        executor_position=None,
        frequency="monthly",
        risk_level=3,
        output_description=None,
        report_recipient=None,
        documentation_location=None,
        department_id=uncat.id,
        status="draft",
        created_by_id=test_user.id,
        updated_by_id=test_user.id,
    )
    db_session.add_all([risk, control])
    await db_session.commit()

    resp = await client_cro.post("/api/v1/orphaned-items/scan")
    assert resp.status_code == 200
    assert resp.json()["flagged"] >= 2

    last_scan = (
        await db_session.execute(
            select(SchedulerJobRun)
            .where(SchedulerJobRun.job_name == "orphan_scan")
            .order_by(SchedulerJobRun.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    assert last_scan is not None
    assert last_scan.trigger_type == "manual"
    assert last_scan.status == "succeeded"

    count = (
        await db_session.execute(select(func.count(OrphanedItem.id)).where(OrphanedItem.status == "pending"))
    ).scalar() or 0
    assert count >= 2


@pytest.mark.asyncio
async def test_orphaned_items_overview_returns_stats_items_and_scan_status(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    department = Department(name="Uncategorised", code="UNCAT", description="System")
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)

    risk = Risk(
        risk_id_code="UNCAT-R002",
        name="Overview Risk",
        process="Test",
        description="",
        category="Test",
        department_id=department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.commit()

    scan_resp = await client_cro.post("/api/v1/orphaned-items/scan")
    assert scan_resp.status_code == 200

    overview_resp = await client_cro.get("/api/v1/orphaned-items/overview")
    assert overview_resp.status_code == 200
    data = overview_resp.json()
    assert data["stats"]["total_count"] >= 1
    assert data["scan_status"] == "succeeded"
    assert data["last_scan_at"] is not None
    assert any(item["item_name"] == "Overview Risk" for item in data["items"])


@pytest.mark.asyncio
async def test_overview_emits_null_identifier_for_control_orphans(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Controls have no human code, so the overview emits item_identifier=None.

    This is the contract the frontend orphanedItemsOverviewSchema relies on
    (item_identifier is nullable). Pinning it here means a future backend change
    that started emitting a non-null control identifier fails this guard instead
    of silently breaking the Governance page.
    """
    department = Department(name="Uncategorised", code="UNCAT", description="System")
    db_session.add(department)
    await db_session.commit()
    await db_session.refresh(department)

    control = Control(
        name="Overview Control",
        description="",
        department_id=department.id,
        control_owner_id=test_user.id,
        status="active",
    )
    db_session.add(control)
    await db_session.commit()

    scan_resp = await client_cro.post("/api/v1/orphaned-items/scan")
    assert scan_resp.status_code == 200

    overview_resp = await client_cro.get("/api/v1/orphaned-items/overview")
    assert overview_resp.status_code == 200
    data = overview_resp.json()

    control_items = [item for item in data["items"] if item["item_type"] == "control"]
    assert control_items, "expected the uncategorised control to be flagged as an orphan"
    assert all(item["item_identifier"] is None for item in control_items)
    assert data["stats"]["control_count"] >= 1


@pytest.mark.asyncio
async def test_orphan_stats_denies_non_operator_business_users(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
):
    role = Role(name="basic", display_name="Basic", description="No perms needed for stats")
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)

    user = User(
        name="Dept User",
        email="dept-user-orphans@test.com",
        department_id=test_department.id,
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.DEPARTMENT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    resp = await client.get("/api/v1/orphaned-items/stats", headers={"X-Mock-User-Id": str(user.id)})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Insufficient permissions"


@pytest.mark.asyncio
async def test_orphan_stats_returns_counts_for_governance_operator(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    test_user_cro: User,
):
    dept2 = Department(name="Second Department", code="D2", description="Second")
    db_session.add(dept2)
    await db_session.commit()
    await db_session.refresh(dept2)

    risk_in = Risk(
        risk_id_code="R-IN-001",
        name="In Risk",
        process="Test",
        description="",
        category="Test",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    risk_out = Risk(
        risk_id_code="R-OUT-001",
        name="Out Risk",
        process="Test",
        description="",
        category="Test",
        department_id=dept2.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add_all([risk_in, risk_out])
    await db_session.commit()
    await db_session.refresh(risk_in)
    await db_session.refresh(risk_out)

    db_session.add_all(
        [
            OrphanedItem(item_type="risk", item_id=risk_in.id, previous_owner_id=test_user.id, status="pending"),
            OrphanedItem(item_type="risk", item_id=risk_out.id, previous_owner_id=test_user.id, status="pending"),
        ]
    )
    await db_session.commit()

    resp = await client.get("/api/v1/orphaned-items/stats", headers={"X-Mock-User-Id": str(test_user_cro.id)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_count"] == 2
    assert data["control_count"] == 0
    assert data["total_count"] == 2


@pytest.mark.asyncio
async def test_orphan_list_and_detail_are_scoped_by_current_department(
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    test_user_cro: User,
):
    test_user_cro.access_scope = AccessScope.DEPARTMENT
    test_user_cro.department_id = test_department.id

    dept2 = Department(name="Orphan Hidden Department", code="OHID", description="Hidden")
    db_session.add(dept2)
    await db_session.flush()

    risk_in = Risk(
        risk_id_code="R-ORPH-IN",
        name="Scoped Orphan Risk",
        process="Test",
        description="",
        category="Test",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    risk_out = Risk(
        risk_id_code="R-ORPH-OUT",
        name="Hidden Orphan Risk",
        process="Test",
        description="",
        category="Test",
        department_id=dept2.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add_all([risk_in, risk_out])
    await db_session.flush()
    orphan_in = OrphanedItem(item_type="risk", item_id=risk_in.id, previous_owner_id=test_user.id, status="pending")
    orphan_out = OrphanedItem(item_type="risk", item_id=risk_out.id, previous_owner_id=test_user.id, status="pending")
    db_session.add_all([orphan_in, orphan_out])
    await db_session.flush()
    orphan_out_id = orphan_out.id
    await db_session.commit()

    items = await get_pending_orphans_with_details(db_session, current_user=test_user_cro)
    names = {item["item_name"] for item in items}
    assert "Scoped Orphan Risk" in names
    assert "Hidden Orphan Risk" not in names
    assert items[0]["capabilities"]["can_resolve"] is True

    hidden_detail = await get_orphan_detail(db_session, orphan_out_id, current_user=test_user_cro)
    assert hidden_detail is None


@pytest.mark.asyncio
async def test_stale_orphan_resolution_rejects_without_overwriting_target(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    test_department: Department,
    test_user: User,
    test_user_employee: User,
    test_user_cro: User,
):
    risk = Risk(
        risk_id_code="R-STALE-ORPH",
        name="Stale Orphan Risk",
        process="Test",
        description="",
        category="Test",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.flush()
    orphan = OrphanedItem(item_type="risk", item_id=risk.id, previous_owner_id=test_user.id, status="pending")
    db_session.add(orphan)
    await db_session.flush()
    orphan_id = orphan.id

    risk.owner_id = test_user_employee.id
    await db_session.commit()

    response = await client_cro.post(
        f"/api/v1/orphaned-items/{orphan_id}/resolve",
        json={"new_owner_id": test_user_cro.id, "department_id": test_department.id},
    )
    assert response.status_code == 409

    await db_session.refresh(risk)
    await db_session.refresh(orphan)
    assert risk.owner_id == test_user_employee.id
    assert orphan.status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/orphaned-items/"),
        ("get", "/api/v1/orphaned-items/overview"),
        ("get", "/api/v1/orphaned-items/stats"),
    ],
)
async def test_platform_admin_is_denied_governance_business_endpoints(
    client_platform_admin: AsyncClient,
    method: str,
    path: str,
):
    response = await getattr(client_platform_admin, method)(path)

    assert response.status_code == 403
    assert response.json()["detail"] == "Platform admins cannot access Governance business data"
