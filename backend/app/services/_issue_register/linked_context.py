from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    can_read_vendor,
    visible_control_ids,
    visible_kri_ids,
    visible_risk_ids,
    visible_vendor_ids,
)
from app.core.security import check_permission
from app.models import ControlRiskLink, Issue, IssueLink, Risk, User
from app.models.issue import IssueSourceType

from .constants import (
    UNKNOWN_CONTROL_LABEL,
    UNKNOWN_EXECUTION_LABEL,
    UNKNOWN_KRI_LABEL,
    UNKNOWN_RISK_LABEL,
    UNKNOWN_VENDOR_LABEL,
)


@dataclass(frozen=True)
class IssueLinkedVisibility:
    risk_ids: set[int]
    control_ids: set[int]
    kri_ids: set[int]
    vendor_ids: set[int]


def label_or_fallback(value: str | None, fallback: str) -> str:
    if value and value.strip():
        return value.strip()
    return fallback


def link_display(
    link: IssueLink,
    current_user: User | None = None,
    *,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> tuple[str | None, str | None]:
    if link.risk_id is not None:
        if linked_visibility is not None and link.risk_id not in linked_visibility.risk_ids:
            return "risk", None
        return "risk", label_or_fallback(getattr(link.risk, "name", None), UNKNOWN_RISK_LABEL)
    if link.control_id is not None:
        if linked_visibility is not None and link.control_id not in linked_visibility.control_ids:
            return "control", None
        return "control", label_or_fallback(getattr(link.control, "name", None), UNKNOWN_CONTROL_LABEL)
    if link.execution_id is not None:
        control_id = getattr(getattr(link.execution, "control", None), "id", None) or getattr(
            link.execution, "control_id", None
        )
        if linked_visibility is not None and control_id not in linked_visibility.control_ids:
            return "execution", None
        control_name = getattr(getattr(link.execution, "control", None), "name", None)
        if control_name and control_name.strip():
            return "execution", f"Execution for {control_name.strip()}"
        return "execution", UNKNOWN_EXECUTION_LABEL
    if link.kri_id is not None:
        if linked_visibility is not None and link.kri_id not in linked_visibility.kri_ids:
            return "kri", None
        return "kri", label_or_fallback(getattr(link.kri, "metric_name", None), UNKNOWN_KRI_LABEL)
    if link.vendor_id is not None:
        if linked_visibility is not None and link.vendor_id not in linked_visibility.vendor_ids:
            return "vendor", None
        if current_user is not None and (
            not check_permission(current_user, "vendors", "read")
            or link.vendor is None
            or not can_read_vendor(link.vendor, current_user)
        ):
            return "vendor", None
        return "vendor", label_or_fallback(getattr(link.vendor, "name", None), UNKNOWN_VENDOR_LABEL)
    return None, None


def source_type_value(source_type: IssueSourceType | str) -> str:
    return source_type.value if isinstance(source_type, IssueSourceType) else str(source_type)


def link_matches_issue_source(issue: Issue, link: IssueLink) -> bool:
    if issue.source_id is None:
        return False
    source_type = source_type_value(issue.source_type)
    if source_type == IssueSourceType.control_execution.value:
        return link.execution_id == issue.source_id
    if source_type == IssueSourceType.kri_breach.value:
        return link.kri_id == issue.source_id
    return False


def issue_source_link(issue: Issue) -> IssueLink | None:
    links = sorted(issue.links or [], key=lambda item: item.id or 0)
    for link in links:
        if link.is_source_link:
            return link

    for link in links:
        if link_matches_issue_source(issue, link):
            return link
    return None


def link_risks(link: IssueLink) -> list[Risk]:
    if link.risk is not None:
        return [link.risk]

    kri = link.kri
    if kri is not None and kri.risk is not None:
        return [kri.risk]

    execution = link.execution
    if execution is not None and execution.control is not None:
        return [
            risk_link.risk
            for risk_link in getattr(execution.control, "risk_links", [])
            if isinstance(risk_link, ControlRiskLink) and risk_link.risk is not None
        ]

    if link.control is not None:
        return [
            risk_link.risk
            for risk_link in getattr(link.control, "risk_links", [])
            if isinstance(risk_link, ControlRiskLink) and risk_link.risk is not None
        ]

    return []


def issue_link_candidate_ids(issues: Sequence[Issue]) -> tuple[set[int], set[int], set[int], set[int]]:
    risk_ids: set[int] = set()
    control_ids: set[int] = set()
    kri_ids: set[int] = set()
    vendor_ids: set[int] = set()

    for issue in issues:
        for link in issue.links:
            if link.risk_id is not None:
                risk_ids.add(link.risk_id)
            if link.control_id is not None:
                control_ids.add(link.control_id)
            if link.execution_id is not None:
                execution_control_id = getattr(link.execution, "control_id", None)
                if execution_control_id is not None:
                    control_ids.add(execution_control_id)
            if link.kri_id is not None:
                kri_ids.add(link.kri_id)
                kri_risk_id = getattr(link.kri, "risk_id", None)
                if kri_risk_id is not None:
                    risk_ids.add(kri_risk_id)
            if link.vendor_id is not None:
                vendor_ids.add(link.vendor_id)

            for risk in link_risks(link):
                if risk.id is not None:
                    risk_ids.add(risk.id)

    return risk_ids, control_ids, kri_ids, vendor_ids


async def build_issue_linked_visibility(
    db: AsyncSession,
    current_user: User,
    issues: Sequence[Issue],
) -> IssueLinkedVisibility:
    risk_ids, control_ids, kri_ids, vendor_ids = issue_link_candidate_ids(issues)
    return IssueLinkedVisibility(
        risk_ids=await visible_risk_ids(db, current_user, risk_ids),
        control_ids=await visible_control_ids(db, current_user, control_ids),
        kri_ids=await visible_kri_ids(db, current_user, kri_ids),
        vendor_ids=await visible_vendor_ids(db, current_user, vendor_ids),
    )

