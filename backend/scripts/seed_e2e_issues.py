"""
Deterministic issue seed matrix for dashboard and README screenshot fixtures.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import (
    Control,
    Issue,
    IssueException,
    IssueExceptionStatus,
    IssueLink,
    IssueSeverity,
    IssueSourceType,
    IssueStatus,
    KeyRiskIndicator,
    Risk,
    Vendor,
)
from scripts.e2e_mappings import load_mappings_strict, require_department_id, require_user_id

E2E_ISSUES: list[dict[str, Any]] = [
    {
        "title": "E2E-ISSUE-001 Motor pricing validation backlog",
        "description": "Open pricing review queue requires remediation before the next underwriting cycle.",
        "severity": "low",
        "status": "open",
        "dept": "Operations",
        "owner": "ops.head@riskhub.local",
        "opened_days_ago": 2,
        "age_bucket": "0-7",
        "due_days_from_now": 6,
        "link": {"type": "risk", "code": "E2E-UW-001"},
    },
    {
        "title": "E2E-ISSUE-002 Claims evidence sampling gap",
        "description": "Evidence samples for claims controls are pending final upload.",
        "severity": "medium",
        "status": "triaged",
        "dept": "Finance",
        "owner": "fin.head@riskhub.local",
        "opened_days_ago": 6,
        "age_bucket": "0-7",
        "due_days_from_now": 9,
        "link": {"type": "control", "name": "E2E-CTRL-004 Fraud Detection Analytics"},
    },
    {
        "title": "E2E-ISSUE-003 Vendor access review delay",
        "description": "Quarterly vendor access attestation is behind the target date.",
        "severity": "high",
        "status": "in_progress",
        "dept": "IT",
        "owner": "it.head@riskhub.local",
        "opened_days_ago": 12,
        "age_bucket": "8-30",
        "due_days_from_now": -1,
        "link": {"type": "vendor", "registration_id": "E2E-VREG-001"},
    },
    {
        "title": "E2E-ISSUE-004 AML screening alert tuning",
        "description": "AML alert thresholds need tuning after an increase in false positives.",
        "severity": "critical",
        "status": "open",
        "dept": "Compliance",
        "owner": "risk.manager@riskhub.local",
        "opened_days_ago": 21,
        "age_bucket": "8-30",
        "due_days_from_now": -4,
        "link": {"type": "risk", "code": "E2E-COMP-002"},
    },
    {
        "title": "E2E-ISSUE-005 Reserve model documentation update",
        "description": "Reserve adequacy model documentation needs control-owner signoff.",
        "severity": "low",
        "status": "ready_for_validation",
        "dept": "Finance",
        "owner": "fin.analyst@riskhub.local",
        "opened_days_ago": 25,
        "age_bucket": "8-30",
        "due_days_from_now": 3,
        "link": {"type": "kri", "name": "E2E-KRI-005 Reserve Adequacy Ratio"},
    },
    {
        "title": "E2E-ISSUE-006 Disaster recovery action owner missing",
        "description": "A disaster recovery exercise action is missing accountable ownership.",
        "severity": "medium",
        "status": "open",
        "dept": "IT",
        "owner": "it.analyst@riskhub.local",
        "opened_days_ago": 45,
        "age_bucket": "31-60",
        "due_days_from_now": -9,
        "link": {"type": "control", "name": "E2E-CTRL-009 Disaster Recovery Testing"},
    },
    {
        "title": "E2E-ISSUE-007 Reinsurance data reconciliation gap",
        "description": "Treaty reinsurance bordereaux reconciliation remains unresolved.",
        "severity": "high",
        "status": "in_progress",
        "dept": "Risk Management",
        "owner": "risk.manager@riskhub.local",
        "opened_days_ago": 75,
        "age_bucket": "61+",
        "due_days_from_now": -18,
        "link": {"type": "vendor", "registration_id": "E2E-VREG-005"},
    },
    {
        "title": "E2E-ISSUE-008 CNB reporting evidence package",
        "description": "The CNB reporting evidence package needs final compliance validation.",
        "severity": "critical",
        "status": "triaged",
        "dept": "Compliance",
        "owner": "cro@riskhub.local",
        "opened_days_ago": 90,
        "age_bucket": "61+",
        "due_days_from_now": 11,
        "link": {"type": "risk", "code": "E2E-COMP-001"},
    },
    {
        "title": "E2E-ISSUE-009 Closed travel assistance follow-up",
        "description": "Closed guard fixture for dashboard exclusion checks.",
        "severity": "high",
        "status": "closed",
        "dept": "Operations",
        "owner": "ops.head@riskhub.local",
        "opened_days_ago": 18,
        "age_bucket": "8-30",
        "due_days_from_now": -2,
        "closed_days_ago": 1,
        "link": {"type": "vendor", "registration_id": "E2E-VREG-004"},
    },
    {
        "title": "E2E-ISSUE-010 Suppressed claims cloud exception",
        "description": "Approved exception guard fixture for dashboard exclusion checks.",
        "severity": "critical",
        "status": "in_progress",
        "dept": "IT",
        "owner": "it.head@riskhub.local",
        "opened_days_ago": 30,
        "age_bucket": "8-30",
        "due_days_from_now": -6,
        "active_approved_exception": True,
        "link": {"type": "vendor", "registration_id": "E2E-VREG-001"},
    },
]


async def _resolve_link_target(db, link: dict[str, str]) -> IssueLink:
    target_type = link["type"]
    if target_type == "risk":
        target = (
            await db.execute(select(Risk).where(Risk.risk_id_code == link["code"]))
        ).scalar_one_or_none()
        if target is None:
            raise RuntimeError(f"Deterministic issue seed requires risk '{link['code']}', but it was not found.")
        return IssueLink(risk_id=target.id, is_source_link=True)

    if target_type == "control":
        target = (await db.execute(select(Control).where(Control.name == link["name"]))).scalar_one_or_none()
        if target is None:
            raise RuntimeError(f"Deterministic issue seed requires control '{link['name']}', but it was not found.")
        return IssueLink(control_id=target.id, is_source_link=True)

    if target_type == "kri":
        target = (
            await db.execute(select(KeyRiskIndicator).where(KeyRiskIndicator.metric_name == link["name"]))
        ).scalar_one_or_none()
        if target is None:
            raise RuntimeError(f"Deterministic issue seed requires KRI '{link['name']}', but it was not found.")
        return IssueLink(kri_id=target.id, is_source_link=True)

    if target_type == "vendor":
        target = (
            await db.execute(select(Vendor).where(Vendor.registration_id == link["registration_id"]))
        ).scalar_one_or_none()
        if target is None:
            raise RuntimeError(
                f"Deterministic issue seed requires vendor '{link['registration_id']}', but it was not found."
            )
        return IssueLink(vendor_id=target.id, is_source_link=True)

    raise RuntimeError(f"Unsupported issue link target type '{target_type}'.")


async def seed_issues():
    """Seed deterministic issues for dashboard age/severity visuals."""
    print("=" * 60)
    print("Phase 179-17: Deterministic Issue Dashboard Data")
    print("=" * 60)

    async with session_context(get_settings()) as db:
        users, departments = await load_mappings_strict(db, context="seed_e2e_issues")

        created = 0
        updated = 0
        now = utc_now()

        for entry in E2E_ISSUES:
            owner_id = require_user_id(users, entry["owner"])
            department_id = require_department_id(departments, entry["dept"])
            opened_at = now.replace(microsecond=0) - timedelta(days=entry["opened_days_ago"])
            due_at = now.replace(microsecond=0) + timedelta(days=entry["due_days_from_now"])
            closed_at = None
            if entry["status"] == IssueStatus.closed.value:
                closed_at = now.replace(microsecond=0) - timedelta(days=entry.get("closed_days_ago", 1))

            payload = {
                "title": entry["title"],
                "description": entry["description"],
                "severity": IssueSeverity(entry["severity"]).value,
                "status": IssueStatus(entry["status"]).value,
                "source_type": IssueSourceType.manual.value,
                "department_id": department_id,
                "owner_user_id": owner_id,
                "created_by_id": owner_id,
                "opened_at": opened_at,
                "due_at": due_at,
                "closed_at": closed_at,
            }

            result = await db.execute(select(Issue).where(Issue.title == entry["title"]))
            issue = result.scalar_one_or_none()
            if issue is None:
                issue = Issue(**payload)
                db.add(issue)
                created += 1
            else:
                for field, value in payload.items():
                    setattr(issue, field, value)
                updated += 1

            await db.flush()

            await db.execute(delete(IssueLink).where(IssueLink.issue_id == issue.id))
            await db.execute(delete(IssueException).where(IssueException.issue_id == issue.id))

            link = await _resolve_link_target(db, entry["link"])
            link.issue_id = issue.id
            db.add(link)

            if entry.get("active_approved_exception") is True:
                db.add(
                    IssueException(
                        issue_id=issue.id,
                        status=IssueExceptionStatus.approved.value,
                        reason="E2E dashboard suppression guard",
                        requested_by_id=owner_id,
                        approved_by_id=require_user_id(users, "cro@riskhub.local"),
                        requested_at=now - timedelta(days=3),
                        approved_at=now - timedelta(days=2),
                        expires_at=now + timedelta(days=14),
                    )
                )

        await db.commit()

        total = (await db.execute(select(func.count(Issue.id)).where(Issue.title.like("E2E-ISSUE-%")))).scalar_one()
        non_closed = (
            await db.execute(
                select(func.count(Issue.id)).where(
                    Issue.title.like("E2E-ISSUE-%"),
                    Issue.status != IssueStatus.closed.value,
                )
            )
        ).scalar_one()

        print(f"\nIssues seeded: total={total}, non_closed={non_closed}")
        print(f"Created={created}, updated={updated}")
        return {"total": total, "non_closed": non_closed, "created": created, "updated": updated}


if __name__ == "__main__":
    asyncio.run(seed_issues())
