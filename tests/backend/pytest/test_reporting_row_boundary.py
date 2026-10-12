"""Rebuilt row-owner proofs: bounded projection, order, modes and filter precedence."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.dialects import postgresql

from app.models import Issue, IssueException
from app.models.issue import IssueSeverity
from app.services import _reporting
from app.services._issue_register.linked_context import IssueLinkedVisibility
from app.services._reporting.exports import issue_rows
from app.services.issue_visibility_service import issue_severity_clause


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [0, 1, 100, 101, 205])
@pytest.mark.parametrize("mode", ["current_register", "evaluation_report"])
async def test_issue_batch_owner_preserves_bound_order_actor_time(
    monkeypatch, count, mode
):
    now = datetime(2026, 10, 1, tzinfo=UTC)
    actor, db = object(), object()
    models = [object() for _ in range(count)]
    calls, projected = [], []
    visibility = IssueLinkedVisibility(set(), set(), set(), set())

    async def visible(actual_db, actual_actor, batch):
        assert actual_db is db and actual_actor is actor
        calls.append(batch)
        return visibility

    def row(model, **kwargs):
        assert kwargs == {
            "as_of_dt": now,
            "current_user": actor,
            "linked_visibility": visibility,
            "overdue_mode": mode,
        }
        projected.append(model)
        return {"ordinal": models.index(model)}

    monkeypatch.setattr(issue_rows, "build_issue_linked_visibility", visible)
    monkeypatch.setattr(issue_rows, "_issue_to_row", row)
    result = await _reporting.build_issue_export_rows(
        db=db, current_user=actor, models=models, as_of_dt=now, overdue_mode=mode
    )
    assert projected == models
    assert result == [{"ordinal": i} for i in range(count)]
    assert [len(batch) for batch in calls] == [
        min(100, count - i) for i in range(0, count, 100)
    ]


@pytest.mark.asyncio
async def test_issue_modes_preserve_exception_difference(monkeypatch):
    now = datetime(2026, 10, 1, tzinfo=UTC)
    issue = Issue(
        id=1,
        title="Overdue",
        status="open",
        severity="high",
        source_type="manual",
        opened_at=now - timedelta(days=10),
        due_at=now - timedelta(days=2),
        links=[],
        exceptions=[
            IssueException(status="approved", expires_at=now + timedelta(days=2))
        ],
    )

    async def visible(*args):
        return IssueLinkedVisibility(set(), set(), set(), set())

    monkeypatch.setattr(issue_rows, "build_issue_linked_visibility", visible)
    current = await _reporting.build_issue_export_rows(
        db=object(),
        current_user=object(),
        models=[issue],
        as_of_dt=now,
        overdue_mode="current_register",
    )
    report = await _reporting.build_issue_export_rows(
        db=object(),
        current_user=object(),
        models=[issue],
        as_of_dt=now,
        overdue_mode="evaluation_report",
    )
    assert current[0]["is_overdue"] is True
    assert report[0]["is_overdue"] is False
    assert {k: v for k, v in current[0].items() if k != "is_overdue"} == {
        k: v for k, v in report[0].items() if k != "is_overdue"
    }


def test_issue_severity_group_precedes_individual_without_becoming_authority():
    clause = issue_severity_clause(IssueSeverity.low, "high_critical")
    sql = str(
        clause.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert "'high'" in sql and "'critical'" in sql and "'low'" not in sql
    assert issue_severity_clause(None, None) is None
    assert issue_severity_clause(None, "unknown") is None
    assert "'low'" in str(
        issue_severity_clause(IssueSeverity.low, "unknown").compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
