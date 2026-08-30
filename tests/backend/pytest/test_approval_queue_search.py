from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    Department,
    Risk,
    User,
)


def _pending_approval(
    *,
    resource_id: int,
    resource_name: str,
    requester: User,
    created_at: datetime,
    reason: str = "Approval queue search fixture",
) -> ApprovalRequest:
    return ApprovalRequest(
        resource_type=ApprovalResourceType.RISK,
        resource_id=resource_id,
        resource_name=resource_name,
        requested_by_id=requester.id,
        reason=reason,
        status=ApprovalStatus.PENDING,
        created_at=created_at,
    )


def _risk(
    *,
    code: str,
    name: str,
    department: Department,
    owner: User,
) -> Risk:
    return Risk(
        risk_id_code=code,
        name=name,
        process="Approval queue search",
        description="Risk used to verify approval queue search visibility",
        category="Operational",
        department_id=department.id,
        owner_id=owner.id,
        risk_type="operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
        status="active",
    )


@pytest.mark.asyncio
async def test_approval_queue_search_trims_query_and_treats_blank_as_unfiltered(
    client_factory,
    db_session: AsyncSession,
    test_user_approval_requester: User,
    test_user_cro: User,
) -> None:
    created_at = datetime(2026, 8, 30, 10, 0, tzinfo=UTC)
    matching = _pending_approval(
        resource_id=910_001,
        resource_name="Quarterly Resilience Review",
        requester=test_user_approval_requester,
        created_at=created_at,
    )
    other = _pending_approval(
        resource_id=910_002,
        resource_name="Vendor Exit Plan",
        requester=test_user_approval_requester,
        created_at=created_at + timedelta(minutes=1),
    )
    db_session.add_all([matching, other])
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as client:
        searched = await client.get(
            "/api/v1/approvals",
            params={"status": "pending", "q": "  resilience  "},
        )
        blank = await client.get(
            "/api/v1/approvals",
            params={"status": "pending", "q": "   "},
        )

    assert searched.status_code == 200, searched.text
    assert searched.json()["total"] == 1
    assert [item["id"] for item in searched.json()["items"]] == [matching.id]

    assert blank.status_code == 200, blank.text
    assert blank.json()["total"] == 2
    assert [item["id"] for item in blank.json()["items"]] == [other.id, matching.id]


@pytest.mark.asyncio
@pytest.mark.postgres
@pytest.mark.parametrize(
    ("query", "literal_name", "wildcard_name"),
    (
        ("%", "Budget 100% complete", "Budget 100X complete"),
        ("_", "Queue_item review", "QueueXitem review"),
        ("\\", "Path \\ segment", "Path X segment"),
    ),
)
async def test_approval_queue_search_treats_like_metacharacters_as_literals(
    client_factory,
    db_session: AsyncSession,
    test_user_approval_requester: User,
    test_user_cro: User,
    query: str,
    literal_name: str,
    wildcard_name: str,
) -> None:
    created_at = datetime(2026, 8, 30, 11, 0, tzinfo=UTC)
    literal = _pending_approval(
        resource_id=920_001,
        resource_name=literal_name,
        requester=test_user_approval_requester,
        created_at=created_at,
    )
    wildcard = _pending_approval(
        resource_id=920_002,
        resource_name=wildcard_name,
        requester=test_user_approval_requester,
        created_at=created_at + timedelta(minutes=1),
    )
    db_session.add_all([literal, wildcard])
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get(
            "/api/v1/approvals",
            params={"status": "pending", "q": query},
        )

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert [item["id"] for item in response.json()["items"]] == [literal.id]


@pytest.mark.asyncio
async def test_approval_queue_search_uses_only_resource_and_requester_display_names(
    client_factory,
    db_session: AsyncSession,
    test_user_approval_requester: User,
    test_user_cro: User,
) -> None:
    test_user_approval_requester.name = "Visible Requester Needle"
    test_user_approval_requester.email = "email-only-needle@example.test"
    approval = _pending_approval(
        resource_id=930_117,
        resource_name="Visible Resource Needle",
        requester=test_user_approval_requester,
        created_at=datetime(2026, 8, 30, 12, 0, tzinfo=UTC),
        reason="reason-only-needle",
    )
    approval.pending_changes = {"notes": {"new": "json-only-needle"}}
    db_session.add(approval)
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as client:
        by_resource = await client.get("/api/v1/approvals", params={"q": "Resource Needle"})
        by_requester = await client.get("/api/v1/approvals", params={"q": "Requester Needle"})
        excluded = {
            query: await client.get("/api/v1/approvals", params={"q": query})
            for query in (
                "email-only-needle",
                "reason-only-needle",
                "json-only-needle",
                str(approval.id),
                str(approval.resource_id),
            )
        }

    for response in (by_resource, by_requester, *excluded.values()):
        assert response.status_code == 200, response.text
    assert [item["id"] for item in by_resource.json()["items"]] == [approval.id]
    assert [item["id"] for item in by_requester.json()["items"]] == [approval.id]
    for response in excluded.values():
        assert response.json()["items"] == []
        assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_approval_queue_search_preserves_actor_scope_before_count_and_pagination(
    client_factory,
    db_session: AsyncSession,
    seed_risk_types,
    test_department: Department,
    test_user_approval_requester: User,
    test_user_cro: User,
    test_user_directory_reader: User,
    test_user_employee: User,
    test_user_risk_manager: User,
) -> None:
    hidden_department = Department(name="Hidden Queue Department", code="QUEUE-HIDDEN")
    db_session.add(hidden_department)
    await db_session.flush()

    visible_risk = _risk(
        code="QUEUE-VISIBLE",
        name="Actor Scope Needle Visible",
        department=test_department,
        owner=test_user_cro,
    )
    hidden_risk = _risk(
        code="QUEUE-HIDDEN",
        name="Actor Scope Needle Hidden",
        department=hidden_department,
        owner=test_user_cro,
    )
    db_session.add_all([visible_risk, hidden_risk])
    await db_session.flush()

    created_at = datetime(2026, 8, 30, 13, 0, tzinfo=UTC)
    requester_owned = _pending_approval(
        resource_id=940_001,
        resource_name="Actor Scope Needle Requester",
        requester=test_user_approval_requester,
        created_at=created_at,
    )
    visible_department = _pending_approval(
        resource_id=visible_risk.id,
        resource_name=visible_risk.name,
        requester=test_user_cro,
        created_at=created_at + timedelta(minutes=1),
    )
    visible_department.scenario_key = "risk_delete"
    visible_department.scenario_approver_roles = ["employee"]
    hidden_department_approval = _pending_approval(
        resource_id=hidden_risk.id,
        resource_name=hidden_risk.name,
        requester=test_user_cro,
        created_at=created_at + timedelta(minutes=2),
    )
    hidden_department_approval.scenario_key = "risk_delete"
    hidden_department_approval.scenario_approver_roles = ["employee"]
    db_session.add_all([requester_owned, visible_department, hidden_department_approval])
    await db_session.commit()

    expectations = (
        (test_user_approval_requester, [requester_owned.id]),
        (
            test_user_risk_manager,
            [hidden_department_approval.id, visible_department.id, requester_owned.id],
        ),
        (
            test_user_cro,
            [hidden_department_approval.id, visible_department.id, requester_owned.id],
        ),
        (test_user_employee, [visible_department.id]),
        (test_user_directory_reader, []),
    )
    for actor, expected_ids in expectations:
        async with client_factory(current_user=actor) as client:
            response = await client.get(
                "/api/v1/approvals",
                params={
                    "status": "pending",
                    "q": "Actor Scope Needle",
                    "skip": 0,
                    "limit": 100,
                },
            )

        assert response.status_code == 200, response.text
        assert response.json()["total"] == len(expected_ids)
        assert [item["id"] for item in response.json()["items"]] == expected_ids


@pytest.mark.asyncio
async def test_approval_queue_search_keeps_tab_filters_and_page_total_in_parity(
    client_factory,
    db_session: AsyncSession,
    test_user_approval_requester: User,
) -> None:
    created_at = datetime(2026, 8, 30, 14, 0, tzinfo=UTC)
    pending = _pending_approval(
        resource_id=950_001,
        resource_name="Tab Search Needle Pending",
        requester=test_user_approval_requester,
        created_at=created_at,
    )
    approved = _pending_approval(
        resource_id=950_002,
        resource_name="Tab Search Needle Approved",
        requester=test_user_approval_requester,
        created_at=created_at + timedelta(minutes=1),
    )
    approved.status = ApprovalStatus.APPROVED
    nonmatching = _pending_approval(
        resource_id=950_003,
        resource_name="Unrelated Request",
        requester=test_user_approval_requester,
        created_at=created_at + timedelta(minutes=2),
    )
    nonmatching.status = ApprovalStatus.REJECTED
    db_session.add_all([pending, approved, nonmatching])
    await db_session.commit()

    tab_expectations = (
        ({}, [approved.id, pending.id]),
        ({"my_requests": "true"}, [approved.id, pending.id]),
        ({"status": "pending"}, [pending.id]),
        ({"status": "pending", "my_requests": "true"}, [pending.id]),
        ({"status": "approved"}, [approved.id]),
    )
    async with client_factory(current_user=test_user_approval_requester) as client:
        for tab_params, expected_ids in tab_expectations:
            first_page = await client.get(
                "/api/v1/approvals",
                params={**tab_params, "q": "Tab Search Needle", "skip": 0, "limit": 1},
            )
            second_page = await client.get(
                "/api/v1/approvals",
                params={**tab_params, "q": "Tab Search Needle", "skip": 1, "limit": 1},
            )

            assert first_page.status_code == 200, first_page.text
            assert second_page.status_code == 200, second_page.text
            assert first_page.json()["total"] == len(expected_ids)
            assert second_page.json()["total"] == len(expected_ids)
            paged_ids = [item["id"] for item in first_page.json()["items"]]
            paged_ids.extend(item["id"] for item in second_page.json()["items"])
            assert paged_ids == expected_ids


@pytest.mark.asyncio
async def test_approval_queue_search_uses_stable_tie_breaker_across_large_pages(
    client_factory,
    db_session: AsyncSession,
    test_user_approval_requester: User,
    test_user_cro: User,
) -> None:
    created_at = datetime(2026, 8, 30, 15, 0, tzinfo=UTC)
    approvals = [
        _pending_approval(
            resource_id=960_000 + index,
            resource_name=f"Bulk Search Needle {index:03d}",
            requester=test_user_approval_requester,
            created_at=created_at,
        )
        for index in range(205)
    ]
    db_session.add_all(approvals)
    await db_session.commit()

    async with client_factory(current_user=test_user_cro) as client:
        pages = [
            await client.get(
                "/api/v1/approvals",
                params={"q": "Bulk Search Needle", "skip": skip, "limit": 100},
            )
            for skip in (0, 100, 200)
        ]

    for page in pages:
        assert page.status_code == 200, page.text
        assert page.json()["total"] == 205

    page_ids = [[item["id"] for item in page.json()["items"]] for page in pages]
    assert [len(ids) for ids in page_ids] == [100, 100, 5]
    assert set(page_ids[0]).isdisjoint(page_ids[1])
    assert set(page_ids[0]).isdisjoint(page_ids[2])
    assert set(page_ids[1]).isdisjoint(page_ids[2])
    assert [item for ids in page_ids for item in ids] == sorted(
        (approval.id for approval in approvals),
        reverse=True,
    )
