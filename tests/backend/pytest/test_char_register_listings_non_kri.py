"""Characterization test: control / vendor / issue register-listing counts + highlights.

PURPOSE (regression safety net for a later refactor):
The register-listing services (app/services/_register_listings/{controls,vendors,issues}.py)
each produce a paginated `total` plus, when grouped, per-group `count` / `active_count` /
`highlighted_count`. The KRI/risk breach grains are already pinned in test_char_kri_breach.py;
this file extends the net to the NON-KRI entities. Each entity uses its OWN active/highlighted
predicate (they are deliberately NOT shared):

  - CONTROL   active     = status == 'active' AND live();  highlighted = risk_level >= 4
  - VENDOR    active     = not archived;                   highlighted = risk_score_1_5 >= 4
  - ISSUE     active     = status != 'closed';             highlighted = severity in {high, critical}

Evidence:
  - controls.py:233 `count_distinct_control_if(highlighted_expr)` with `highlighted_expr = Control.risk_level >= 4`
  - vendors.py:207  `case((Vendor.risk_score_1_5 >= 4, Vendor.id), else_=None)` -> highlighted_count
  - issues.py:249   `is_highlighted=lambda issue: issue.severity in {high, critical}` (IssueSeverity values)

These predicates differ per entity, so a later 'unify the highlight logic' refactor must keep
three distinct rules. The tests below pin each rule's current output.

Seed (single department, privileged CRO who can read everything):
  CONTROLS: 3 live -> risk_level 5 (highlighted+active), risk_level 4 (highlighted+active),
            risk_level 2 (active, not highlighted); + 1 archived (excluded default).
  VENDORS : 3 live -> risk_score 5 (highlighted), 4 (highlighted), 2 (not); + 1 archived.
  ISSUES  : critical (highlighted, open), high (highlighted, open), low (open),
            critical-but-CLOSED (highlighted, not active).
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import Issue, IssueSeverity, IssueSourceType, IssueStatus
from tests.backend.pytest.factories import create_test_control, create_test_vendor


# ---------------------------------------------------------------------------
# CONTROLS
# ---------------------------------------------------------------------------
async def _seed_controls(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    await create_test_control(
        db, department_id=department_id, owner_id=owner_id, name="Ctrl RL5", overrides={"risk_level": 5}
    )
    await create_test_control(
        db, department_id=department_id, owner_id=owner_id, name="Ctrl RL4", overrides={"risk_level": 4}
    )
    await create_test_control(
        db, department_id=department_id, owner_id=owner_id, name="Ctrl RL2", overrides={"risk_level": 2}
    )
    await create_test_control(
        db,
        department_id=department_id,
        owner_id=owner_id,
        name="Ctrl Archived",
        overrides={"risk_level": 5, "is_archived": True},
    )
    await db.commit()


@pytest.mark.asyncio
async def test_control_listing_total_and_highlight(
    db_session: AsyncSession, client_factory, test_department, test_user_cro
):
    """GET /api/v1/controls: total=3 live; department group highlighted_count=2 (risk_level>=4)."""
    await _seed_controls(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    async with client_factory(current_user=test_user_cro) as ac:
        resp = await ac.get("/api/v1/controls")
        assert resp.status_code == 200
        assert resp.json()["total"] == 3  # archived excluded by default

        grouped = await ac.get("/api/v1/controls", params={"group_by": "department"})
    assert grouped.status_code == 200
    groups = grouped.json()["groups"]
    dept_group = next(g for g in groups if g["label"] == test_department.name)
    assert dept_group["count"] == 3
    assert dept_group["active_count"] == 3  # all three live controls have status 'active'
    assert dept_group["highlighted_count"] == 2  # risk_level 5 and 4


# ---------------------------------------------------------------------------
# VENDORS
# ---------------------------------------------------------------------------
async def _seed_vendors(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    await create_test_vendor(
        db, department_id=department_id, owner_id=owner_id, name="Vendor RS5", overrides={"risk_score_1_5": 5}
    )
    await create_test_vendor(
        db, department_id=department_id, owner_id=owner_id, name="Vendor RS4", overrides={"risk_score_1_5": 4}
    )
    await create_test_vendor(
        db, department_id=department_id, owner_id=owner_id, name="Vendor RS2", overrides={"risk_score_1_5": 2}
    )
    await create_test_vendor(
        db,
        department_id=department_id,
        owner_id=owner_id,
        name="Vendor Archived",
        overrides={"risk_score_1_5": 5, "is_archived": True},
    )
    await db.commit()


@pytest.mark.asyncio
async def test_vendor_listing_total_and_highlight(
    db_session: AsyncSession, client_factory, test_department, test_user_cro
):
    """GET /api/v1/vendors: total=3 live; department group highlighted_count=2 (risk_score>=4)."""
    await _seed_vendors(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    async with client_factory(current_user=test_user_cro) as ac:
        resp = await ac.get("/api/v1/vendors")
        assert resp.status_code == 200
        assert resp.json()["total"] == 3  # archived excluded by default

        grouped = await ac.get("/api/v1/vendors", params={"group_by": "department"})
    assert grouped.status_code == 200
    groups = grouped.json()["groups"]
    dept_group = next(g for g in groups if g["label"] == test_department.name)
    assert dept_group["count"] == 3
    assert dept_group["active_count"] == 3
    assert dept_group["highlighted_count"] == 2  # risk_score_1_5 5 and 4


# ---------------------------------------------------------------------------
# ISSUES
# ---------------------------------------------------------------------------
async def _seed_issues(db: AsyncSession, *, department_id: int, owner_id: int) -> None:
    def _issue(title: str, severity: IssueSeverity, status: IssueStatus) -> Issue:
        return Issue(
            title=title,
            severity=severity.value,
            status=status.value,
            source_type=IssueSourceType.manual.value,
            department_id=department_id,
            owner_user_id=owner_id,
        )

    db.add_all(
        [
            _issue("Critical open", IssueSeverity.critical, IssueStatus.open),
            _issue("High open", IssueSeverity.high, IssueStatus.open),
            _issue("Low open", IssueSeverity.low, IssueStatus.open),
            _issue("Critical closed", IssueSeverity.critical, IssueStatus.closed),
        ]
    )
    await db.commit()


@pytest.mark.asyncio
async def test_issue_listing_total_and_severity_group(
    db_session: AsyncSession, client_factory, test_department, test_user_cro
):
    """GET /api/v1/issues: total counts all; severity_group=high_critical filters to 3."""
    await _seed_issues(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    async with client_factory(current_user=test_user_cro) as ac:
        all_resp = await ac.get("/api/v1/issues")
        assert all_resp.status_code == 200
        assert all_resp.json()["total"] == 4  # include_closed defaults True

        hc_resp = await ac.get("/api/v1/issues", params={"severity_group": "high_critical"})
        assert hc_resp.status_code == 200
        # 2 open (critical+high) + 1 closed critical = 3 high/critical issues.
        assert hc_resp.json()["total"] == 3

        open_resp = await ac.get("/api/v1/issues", params={"include_closed": "false"})
    assert open_resp.status_code == 200
    assert open_resp.json()["total"] == 3  # the closed critical drops out


@pytest.mark.asyncio
async def test_issue_department_group_highlight_is_high_critical(
    db_session: AsyncSession, client_factory, test_department, test_user_cro
):
    """Issue department group: highlighted_count == high+critical (3), active_count == not-closed (3)."""
    await _seed_issues(db_session, department_id=test_department.id, owner_id=test_user_cro.id)

    async with client_factory(current_user=test_user_cro) as ac:
        grouped = await ac.get("/api/v1/issues", params={"group_by": "department"})
    assert grouped.status_code == 200
    groups = grouped.json()["groups"]
    dept_group = next(g for g in groups if g["label"] == test_department.name)
    assert dept_group["count"] == 4
    assert dept_group["active_count"] == 3  # all except the closed one
    assert dept_group["highlighted_count"] == 3  # 2 critical + 1 high
