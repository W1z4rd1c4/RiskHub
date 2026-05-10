from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.dashboard.overview import DASHBOARD_OVERVIEW_CACHE
from app.api.v1.endpoints.orphaned_items import ORPHAN_OVERVIEW_CACHE
from app.api.v1.endpoints.users.summary import SHELL_SUMMARY_CACHE
from app.core.datetime_utils import utc_now
from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    Notification,
    NotificationType,
    OrphanedItem,
    Permission,
    Risk,
    RiskQuestionnaire,
    RolePermission,
    User,
)
from app.models.approval_request import ApprovalActionType
from app.models.risk import RiskStatus
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.schemas.dashboard import (
    ControlFrequencyTrend,
    DashboardOverviewResponse,
    DashboardSummaryResponse,
    IssueAgingBucket,
    IssueAgingResponse,
    IssueDashboardSummaryResponse,
    IssueSeverityBreakdownItem,
    IssueSeverityBreakdownResponse,
    KRIBreachTrendPoint,
    RiskDistributionResponse,
    RiskTrendPoint,
)


@pytest.fixture(autouse=True)
def clear_aggregate_caches() -> None:
    SHELL_SUMMARY_CACHE.clear()
    DASHBOARD_OVERVIEW_CACHE.clear()
    ORPHAN_OVERVIEW_CACHE.clear()


def _headers_for(user: User) -> dict[str, str]:
    return {"X-Mock-User-Id": str(user.id)}


async def _remove_role_permission(
    db_session: AsyncSession,
    *,
    role_id: int,
    resource: str,
    action: str,
) -> None:
    permission_ids = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(
            RolePermission.role_id == role_id,
            Permission.resource == resource,
            Permission.action == action,
        )
    )
    await db_session.execute(
        delete(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id.in_(permission_ids),
        )
    )
    await db_session.commit()


async def _add_role_permission(
    db_session: AsyncSession,
    *,
    role_id: int,
    resource: str,
    action: str,
) -> None:
    permission = (
        await db_session.execute(
            select(Permission).where(
                Permission.resource == resource,
                Permission.action == action,
            )
        )
    ).scalars().first()
    if permission is None:
        permission = Permission(resource=resource, action=action, description=f"{resource}:{action}")
        db_session.add(permission)
        await db_session.flush()
    db_session.add(RolePermission(role_id=role_id, permission_id=permission.id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_shell_summary_returns_expected_counts_and_governance_visibility(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user: User,
    test_user_cro: User,
    test_user_employee: User,
):
    now = utc_now()
    risk = Risk(
        risk_id_code="R-SHELL-001",
        name="Shell Summary Risk",
        process="Operations",
        description="",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.flush()

    db_session.add_all(
        [
            Notification(
                user_id=test_user_employee.id,
                type=NotificationType.QUESTIONNAIRE_SENT,
                title="Questionnaire sent",
                message="Please review your questionnaire",
            ),
            ApprovalRequest(
                resource_type=ApprovalResourceType.RISK,
                resource_id=risk.id,
                resource_name=risk.name,
                action_type=ApprovalActionType.EDIT,
                pending_changes={"name": {"old": risk.name, "new": "Updated"}},
                requested_by_id=test_user_employee.id,
                reason="Need approval",
                status=ApprovalStatus.PENDING,
            ),
            ApprovalRequest(
                resource_type=ApprovalResourceType.RISK,
                resource_id=risk.id,
                resource_name=risk.name,
                action_type=ApprovalActionType.EDIT,
                pending_changes={"description": {"old": "", "new": "Updated description"}},
                requested_by_id=test_user_employee.id,
                reason="Need privileged approval",
                status=ApprovalStatus.PENDING_PRIVILEGED,
            ),
            ApprovalRequest(
                resource_type=ApprovalResourceType.RISK,
                resource_id=risk.id,
                resource_name=risk.name,
                action_type=ApprovalActionType.EDIT,
                pending_changes={"category": {"old": "Operational", "new": "Strategic"}},
                requested_by_id=test_user.id,
                primary_approver_id=test_user_employee.id,
                reason="Primary approver queue item",
                status=ApprovalStatus.PENDING,
            ),
            RiskQuestionnaire(
                risk_id=risk.id,
                assigned_to_user_id=test_user_employee.id,
                sent_by_user_id=test_user_cro.id,
                status=RiskQuestionnaireStatus.sent,
                template_key="default",
                template_version="1",
                sent_at=now,
                due_at=now + timedelta(days=7),
            ),
            OrphanedItem(
                item_type="risk",
                item_id=risk.id,
                previous_owner_id=test_user.id,
                status="pending",
            ),
        ]
    )
    await db_session.commit()

    employee_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user_employee))
    assert employee_resp.status_code == 200
    employee_data = employee_resp.json()
    assert employee_data["unread_notifications_count"] == 1
    assert employee_data["pending_approvals_count"] == 3
    assert employee_data["questionnaire_inbox_count"] == 1
    assert employee_data["orphan_total_count"] == 0
    assert employee_data["can_view_governance"] is False

    cro_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user_cro))
    assert cro_resp.status_code == 200
    cro_data = cro_resp.json()
    assert cro_data["pending_approvals_count"] == 3
    assert cro_data["orphan_total_count"] == 1
    assert cro_data["can_view_governance"] is True


@pytest.mark.asyncio
async def test_shell_summary_cache_is_scoped_per_user_and_expires(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    test_user_cro: User,
):
    db_session.add(
        Notification(
            user_id=test_user.id,
            type=NotificationType.APPROVAL_PENDING,
            title="Approval pending",
            message="Review approval",
        )
    )
    await db_session.commit()

    first_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user))
    assert first_resp.status_code == 200
    assert first_resp.json()["unread_notifications_count"] == 1

    other_user_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user_cro))
    assert other_user_resp.status_code == 200
    assert other_user_resp.json()["unread_notifications_count"] == 0

    db_session.add(
        Notification(
            user_id=test_user.id,
            type=NotificationType.APPROVAL_RESOLVED,
            title="Approval resolved",
            message="Resolved",
        )
    )
    await db_session.commit()

    cached_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user))
    assert cached_resp.status_code == 200
    assert cached_resp.json()["unread_notifications_count"] == 1

    SHELL_SUMMARY_CACHE.expire_all()
    refreshed_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user))
    assert refreshed_resp.status_code == 200
    assert refreshed_resp.json()["unread_notifications_count"] == 2


@pytest.mark.asyncio
async def test_shell_summary_unread_notifications_count_excludes_inaccessible_linked_resources(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user_cro: User,
    test_user_employee: User,
):
    hidden_department = Department(
        name="Shell Hidden Department",
        code="SHELL-HIDDEN",
        description="Out-of-scope shell notification test department",
    )
    db_session.add(hidden_department)
    await db_session.flush()

    hidden_risk = Risk(
        risk_id_code="R-SHELL-HIDDEN-001",
        name="Shell Hidden Risk",
        process="Operations",
        description="Hidden linked risk",
        category="Operational",
        department_id=hidden_department.id,
        owner_id=test_user_cro.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(hidden_risk)
    await db_session.flush()

    db_session.add_all(
        [
            Notification(
                user_id=test_user_employee.id,
                type=NotificationType.KRI_DUE_SOON,
                title="Visible generic reminder",
                message="Visible reminder",
            ),
            Notification(
                user_id=test_user_employee.id,
                type=NotificationType.APPROVAL_PENDING,
                title="Hidden linked risk",
                message="Hidden linked resource",
                resource_type="risk",
                resource_id=hidden_risk.id,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    assert response.json()["unread_notifications_count"] == 1


@pytest.mark.asyncio
async def test_shell_summary_cache_key_includes_effective_permissions(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    test_user_employee: User,
):
    risk = Risk(
        risk_id_code="R-SHELL-PERM-001",
        name="Shell Permission Risk",
        process="Operations",
        description="",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk)
    await db_session.flush()
    db_session.add(
        RiskQuestionnaire(
            risk_id=risk.id,
            assigned_to_user_id=test_user_employee.id,
            sent_by_user_id=test_user_cro.id,
            status=RiskQuestionnaireStatus.sent,
            template_key="default",
            template_version="1",
            sent_at=utc_now(),
            due_at=utc_now() + timedelta(days=7),
        )
    )
    await db_session.commit()

    first_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user_employee))
    assert first_resp.status_code == 200
    assert first_resp.json()["questionnaire_inbox_count"] == 1

    await _remove_role_permission(
        db_session,
        role_id=test_user_employee.role_id,
        resource="risks",
        action="read",
    )
    db_session.expire(test_user_employee.role, ["permissions"])

    refreshed_resp = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user_employee))
    assert refreshed_resp.status_code == 200
    assert refreshed_resp.json()["questionnaire_inbox_count"] == 0


@pytest.mark.asyncio
async def test_shell_summary_degrades_when_questionnaire_inbox_has_bad_data_shape(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    test_user_employee: User,
):
    from app.api.v1.endpoints.users import summary as users_summary_module

    async def raise_bad_data_shape(db, current_user):  # noqa: ANN001
        raise ValueError("corrupt questionnaire status")

    monkeypatch.setattr(users_summary_module, "_count_questionnaire_inbox", raise_bad_data_shape)

    response = await client.get("/api/v1/users/me/shell-summary", headers=_headers_for(test_user_employee))

    assert response.status_code == 200
    assert response.json()["questionnaire_inbox_count"] == 0


@pytest.mark.asyncio
async def test_dashboard_overview_returns_expected_shape(
    client: AsyncClient,
    test_user: User,
):
    response = await client.get("/api/v1/dashboard/overview", headers=_headers_for(test_user))
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "department_metrics" in data
    assert "gross_distribution" in data
    assert "net_distribution" in data
    assert "control_trends" in data
    assert "risk_trends" in data
    assert "kri_breach_trends" in data
    assert "generated_at" in data


@pytest.mark.asyncio
async def test_dashboard_overview_omits_issue_widgets_without_issue_permission(
    client: AsyncClient,
    test_user_employee: User,
):
    response = await client.get("/api/v1/dashboard/overview", headers=_headers_for(test_user_employee))
    assert response.status_code == 200
    data = response.json()
    assert data["issue_summary"] is None
    assert data["issue_aging"] is None
    assert data["issue_severity"] is None


@pytest.mark.asyncio
async def test_dashboard_overview_cache_returns_stale_data_until_expiry(
    client: AsyncClient,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.api.v1.endpoints.dashboard import overview as overview_module

    state = {"summary_total_controls": 1}

    async def fake_summary(**kwargs):
        return DashboardSummaryResponse(total_controls=state["summary_total_controls"], total_risks=0)

    async def fake_department_metrics(**kwargs):
        return []

    async def fake_distribution(**kwargs):
        return RiskDistributionResponse(distribution=[])

    async def fake_control_trends(**kwargs):
        return [ControlFrequencyTrend(period="2026-W10", execution_count=1)]

    async def fake_risk_trends(**kwargs):
        return [RiskTrendPoint(period="2026-03", total_new=1, critical_new=0)]

    async def fake_kri_trends(**kwargs):
        return [KRIBreachTrendPoint(period="2026-03", total_entries=1, breached_entries=0)]

    async def fake_issue_summary(**kwargs):
        return IssueDashboardSummaryResponse(open_issues=1, overdue_issues=0, high_severity_open=0, median_days_open=1)

    async def fake_issue_aging(**kwargs):
        return IssueAgingResponse(buckets=[IssueAgingBucket(bucket="0-7", count=1)])

    async def fake_issue_severity(**kwargs):
        return IssueSeverityBreakdownResponse(items=[IssueSeverityBreakdownItem(severity="low", count=1)])

    monkeypatch.setattr(overview_module, "get_dashboard_summary", fake_summary)
    monkeypatch.setattr(overview_module, "get_department_metrics", fake_department_metrics)
    monkeypatch.setattr(overview_module, "get_risk_distribution", fake_distribution)
    monkeypatch.setattr(overview_module, "build_control_trends", fake_control_trends)
    monkeypatch.setattr(overview_module, "get_risk_trends", fake_risk_trends)
    monkeypatch.setattr(overview_module, "get_kri_breach_trends", fake_kri_trends)
    monkeypatch.setattr(overview_module, "get_issue_summary", fake_issue_summary)
    monkeypatch.setattr(overview_module, "get_issue_aging", fake_issue_aging)
    monkeypatch.setattr(overview_module, "get_issues_by_severity", fake_issue_severity)

    first_resp = await client.get("/api/v1/dashboard/overview", headers=_headers_for(test_user))
    assert first_resp.status_code == 200
    assert DashboardOverviewResponse(**first_resp.json()).summary.total_controls == 1

    state["summary_total_controls"] = 2

    cached_resp = await client.get("/api/v1/dashboard/overview", headers=_headers_for(test_user))
    assert cached_resp.status_code == 200
    assert DashboardOverviewResponse(**cached_resp.json()).summary.total_controls == 1

    DASHBOARD_OVERVIEW_CACHE.expire_all()
    refreshed_resp = await client.get("/api/v1/dashboard/overview", headers=_headers_for(test_user))
    assert refreshed_resp.status_code == 200
    assert DashboardOverviewResponse(**refreshed_resp.json()).summary.total_controls == 2


@pytest.mark.asyncio
async def test_orphaned_items_overview_cache_returns_stale_data_until_expiry(
    client: AsyncClient,
    db_session: AsyncSession,
    test_department,
    test_user: User,
    test_user_cro: User,
):
    risk_one = Risk(
        risk_id_code="R-ORPH-001",
        name="Orphan Risk One",
        process="Ops",
        description="",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk_one)
    await db_session.flush()
    db_session.add(
        OrphanedItem(
            item_type="risk",
            item_id=risk_one.id,
            previous_owner_id=test_user.id,
            status="pending",
        )
    )
    await db_session.commit()

    first_resp = await client.get("/api/v1/orphaned-items/overview", headers=_headers_for(test_user_cro))
    assert first_resp.status_code == 200
    assert first_resp.json()["stats"]["total_count"] == 1

    risk_two = Risk(
        risk_id_code="R-ORPH-002",
        name="Orphan Risk Two",
        process="Ops",
        description="",
        category="Operational",
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_type="operational",
        gross_probability=2,
        gross_impact=2,
        net_probability=2,
        net_impact=2,
        status=RiskStatus.active.value,
    )
    db_session.add(risk_two)
    await db_session.flush()
    db_session.add(
        OrphanedItem(
            item_type="risk",
            item_id=risk_two.id,
            previous_owner_id=test_user.id,
            status="pending",
        )
    )
    await db_session.commit()

    cached_resp = await client.get("/api/v1/orphaned-items/overview", headers=_headers_for(test_user_cro))
    assert cached_resp.status_code == 200
    assert cached_resp.json()["stats"]["total_count"] == 1

    ORPHAN_OVERVIEW_CACHE.expire_all()
    refreshed_resp = await client.get("/api/v1/orphaned-items/overview", headers=_headers_for(test_user_cro))
    assert refreshed_resp.status_code == 200
    assert refreshed_resp.json()["stats"]["total_count"] == 2


@pytest.mark.asyncio
async def test_orphaned_items_overview_cache_key_includes_effective_permissions(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.api.v1.endpoints import orphaned_items as orphaned_items_module
    from app.core.permissions import get_effective_permissions

    async def fake_stats(db: AsyncSession, current_user: User) -> dict:
        permission_count = len(get_effective_permissions(current_user))
        return {
            "risk_count": permission_count,
            "control_count": 0,
            "kri_count": 0,
            "total_count": permission_count,
        }

    async def fake_items(**kwargs) -> list[dict]:
        return []

    monkeypatch.setattr(orphaned_items_module, "load_orphan_stats", fake_stats)
    monkeypatch.setattr(orphaned_items_module, "get_pending_orphans_with_details", fake_items)

    first_resp = await client.get("/api/v1/orphaned-items/overview", headers=_headers_for(test_user_cro))
    assert first_resp.status_code == 200
    assert first_resp.json()["stats"]["total_count"] == 1

    await _add_role_permission(
        db_session,
        role_id=test_user_cro.role_id,
        resource="reports",
        action="read",
    )
    db_session.expire(test_user_cro.role, ["permissions"])

    refreshed_resp = await client.get("/api/v1/orphaned-items/overview", headers=_headers_for(test_user_cro))
    assert refreshed_resp.status_code == 200
    assert refreshed_resp.json()["stats"]["total_count"] == 2
