from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Issue, IssueException, Role, User, Vendor

from .issues_api_helpers import _create_department_scoped_user, _create_global_user

pytest_plugins = ("tests.backend.pytest.api.v1.issues_api_support",)


@pytest.mark.asyncio
async def test_issue_lookup_endpoints_return_business_names(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
    test_role_employee: Role,
    second_department: Department,
):
    same_department_owner = await _create_department_scoped_user(
        db_session,
        email="issue.lookup.same.scope@test.com",
        name="Same Department Owner",
        department_id=test_department.id,
        role_id=test_role_employee.id,
    )
    await _create_department_scoped_user(
        db_session,
        email="issue.lookup.out.scope@test.com",
        name="Out of Scope Owner",
        department_id=second_department.id,
        role_id=test_role_employee.id,
    )
    global_owner = await _create_global_user(
        db_session,
        email="issue.lookup.global@test.com",
        name="Global Owner",
        department_id=second_department.id,
        role_id=test_role_employee.id,
    )

    departments_resp = await auth_client.get("/api/v1/issues/lookups/departments")
    assert departments_resp.status_code == 200
    departments = departments_resp.json()
    assert any(item["name"] == test_department.name and item["code"] == test_department.code for item in departments)

    owners_resp = await auth_client.get(
        "/api/v1/issues/lookups/owners",
        params={"department_id": test_department.id},
    )
    assert owners_resp.status_code == 200
    owner_names = {item["name"] for item in owners_resp.json()}
    assert test_user.name not in owner_names
    assert same_department_owner.name in owner_names
    assert global_owner.name in owner_names
    assert "Out of Scope Owner" not in owner_names


@pytest.mark.asyncio
async def test_issue_list_supports_linked_vendor_filter(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    vendor = Vendor(
        name="Linked Vendor Filter",
        process="IT",
        department_id=test_department.id,
        outsourcing_owner_user_id=test_user.id,
        vendor_type="ict",
        status="active",
    )
    db_session.add(vendor)
    await db_session.commit()

    contextual_resp = await auth_client.post(
        "/api/v1/issues/contextual",
        json={
            "entity_type": "vendor",
            "entity_id": vendor.id,
            "title": "Vendor linked issue",
            "severity": "medium",
        },
    )
    assert contextual_resp.status_code == 201
    contextual_issue_id = contextual_resp.json()["id"]

    manual_resp = await auth_client.post(
        "/api/v1/issues",
        json={
            "title": "Manual issue",
            "severity": "low",
            "department_id": test_department.id,
            "source_type": "manual",
        },
    )
    assert manual_resp.status_code == 201

    filtered_resp = await auth_client.get("/api/v1/issues", params={"linked_vendor_id": vendor.id})
    assert filtered_resp.status_code == 200
    filtered_ids = {item["id"] for item in filtered_resp.json()["items"]}
    assert contextual_issue_id in filtered_ids
    assert manual_resp.json()["id"] not in filtered_ids


@pytest.mark.asyncio
async def test_issue_list_supports_high_critical_severity_group_and_precedence(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
):
    high_issue = Issue(
        title="Severity group high",
        description="Included by high_critical",
        severity="high",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        opened_at=datetime.now(UTC),
    )
    critical_issue = Issue(
        title="Severity group critical",
        description="Included by high_critical",
        severity="critical",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        opened_at=datetime.now(UTC),
    )
    medium_issue = Issue(
        title="Severity group medium",
        description="Excluded from high_critical",
        severity="medium",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        opened_at=datetime.now(UTC),
    )
    db_session.add_all([high_issue, critical_issue, medium_issue])
    await db_session.commit()

    grouped_resp = await auth_client.get(
        "/api/v1/issues",
        params={"severity_group": "high_critical", "include_closed": "false"},
    )
    assert grouped_resp.status_code == 200
    grouped_ids = {item["id"] for item in grouped_resp.json()["items"]}
    assert high_issue.id in grouped_ids
    assert critical_issue.id in grouped_ids
    assert medium_issue.id not in grouped_ids

    precedence_resp = await auth_client.get(
        "/api/v1/issues",
        params={"severity": "low", "severity_group": "high_critical", "include_closed": "false"},
    )
    assert precedence_resp.status_code == 200
    precedence_ids = {item["id"] for item in precedence_resp.json()["items"]}
    assert high_issue.id in precedence_ids
    assert critical_issue.id in precedence_ids
    assert medium_issue.id not in precedence_ids


@pytest.mark.asyncio
async def test_issue_list_exclude_active_exceptions_matches_unsuppressed_logic(
    db_session: AsyncSession,
    auth_client: AsyncClient,
    test_department: Department,
    test_user: User,
):
    now = datetime.now(UTC).replace(microsecond=0)
    visible_issue = Issue(
        title="Visible high/critical issue",
        description="Should remain visible when excluding active exceptions",
        severity="critical",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=4),
    )
    suppressed_issue = Issue(
        title="Suppressed high/critical issue",
        description="Should be filtered when excluding active exceptions",
        severity="high",
        status="open",
        source_type="manual",
        department_id=test_department.id,
        owner_user_id=test_user.id,
        created_by_id=test_user.id,
        opened_at=now - timedelta(days=5),
    )
    db_session.add_all([visible_issue, suppressed_issue])
    await db_session.flush()

    db_session.add(
        IssueException(
            issue_id=suppressed_issue.id,
            status="approved",
            reason="Approved temporary exception",
            requested_by_id=test_user.id,
            approved_by_id=test_user.id,
            requested_at=now - timedelta(days=2),
            approved_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=7),
        )
    )
    await db_session.commit()

    baseline_resp = await auth_client.get(
        "/api/v1/issues",
        params={"severity_group": "high_critical", "include_closed": "false"},
    )
    assert baseline_resp.status_code == 200
    baseline_ids = {item["id"] for item in baseline_resp.json()["items"]}
    assert visible_issue.id in baseline_ids
    assert suppressed_issue.id in baseline_ids

    filtered_resp = await auth_client.get(
        "/api/v1/issues",
        params={
            "severity_group": "high_critical",
            "exclude_active_exceptions": "true",
            "include_closed": "false",
        },
    )
    assert filtered_resp.status_code == 200
    filtered_ids = {item["id"] for item in filtered_resp.json()["items"]}
    assert visible_issue.id in filtered_ids
    assert suppressed_issue.id not in filtered_ids
