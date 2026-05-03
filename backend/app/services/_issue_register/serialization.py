from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import coerce_utc, utc_now
from app.core.permissions import (
    can_read_vendor,
    visible_control_ids,
    visible_kri_ids,
    visible_risk_ids,
    visible_vendor_ids,
)
from app.core.security import check_permission
from app.models import ControlRiskLink, Issue, IssueException, IssueLink, IssueRemediationPlan, Risk, User
from app.models.issue import IssueExceptionStatus, IssueSourceType
from app.schemas.issue import (
    IssueCapabilities,
    IssueExceptionRead,
    IssueLinkRead,
    IssueRead,
    IssueRemediationPlanRead,
    IssueRiskContext,
    IssueSummary,
    IssueVendorContext,
)

from .constants import (
    UNKNOWN_CONTROL_LABEL,
    UNKNOWN_DEPARTMENT_LABEL,
    UNKNOWN_EXECUTION_LABEL,
    UNKNOWN_KRI_LABEL,
    UNKNOWN_RISK_LABEL,
    UNKNOWN_USER_LABEL,
    UNKNOWN_VENDOR_LABEL,
)


@dataclass(frozen=True)
class IssueLinkedVisibility:
    risk_ids: set[int]
    control_ids: set[int]
    kri_ids: set[int]
    vendor_ids: set[int]


def _active_exception(issue: Issue) -> IssueException | None:
    now = utc_now()
    approved = []
    for ex in issue.exceptions:
        expires_at = coerce_utc(ex.expires_at)
        if ex.status == IssueExceptionStatus.approved.value and expires_at is not None and expires_at > now:
            approved.append(ex)
    if not approved:
        return None
    approved.sort(
        key=lambda ex: coerce_utc(ex.approved_at) or coerce_utc(ex.created_at) or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return approved[0]


def _label_or_fallback(value: str | None, fallback: str) -> str:
    if value and value.strip():
        return value.strip()
    return fallback


def _link_display(
    link: IssueLink,
    current_user: User | None = None,
    *,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> tuple[str | None, str | None]:
    if link.risk_id is not None:
        if linked_visibility is not None and link.risk_id not in linked_visibility.risk_ids:
            return "risk", None
        return "risk", _label_or_fallback(getattr(link.risk, "name", None), UNKNOWN_RISK_LABEL)
    if link.control_id is not None:
        if linked_visibility is not None and link.control_id not in linked_visibility.control_ids:
            return "control", None
        return "control", _label_or_fallback(getattr(link.control, "name", None), UNKNOWN_CONTROL_LABEL)
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
        return "kri", _label_or_fallback(getattr(link.kri, "metric_name", None), UNKNOWN_KRI_LABEL)
    if link.vendor_id is not None:
        if linked_visibility is not None and link.vendor_id not in linked_visibility.vendor_ids:
            return "vendor", None
        if current_user is not None and (
            not check_permission(current_user, "vendors", "read")
            or link.vendor is None
            or not can_read_vendor(link.vendor, current_user)
        ):
            return "vendor", None
        return "vendor", _label_or_fallback(getattr(link.vendor, "name", None), UNKNOWN_VENDOR_LABEL)
    return None, None


def _serialize_issue_link(
    link: IssueLink,
    current_user: User | None = None,
    *,
    is_source_link: bool | None = None,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> IssueLinkRead:
    linked_entity_type, linked_entity_name = _link_display(
        link,
        current_user,
        linked_visibility=linked_visibility,
    )
    resolved_is_source_link = link.is_source_link if is_source_link is None else is_source_link
    return IssueLinkRead.model_validate(
        {
            "id": link.id,
            "issue_id": link.issue_id,
            "risk_id": link.risk_id,
            "control_id": link.control_id,
            "execution_id": link.execution_id,
            "kri_id": link.kri_id,
            "vendor_id": link.vendor_id,
            "linked_entity_type": linked_entity_type,
            "linked_entity_name": linked_entity_name,
            "is_source_link": resolved_is_source_link,
            "created_at": link.created_at,
        }
    )


def _source_type_value(source_type: IssueSourceType | str) -> str:
    return source_type.value if isinstance(source_type, IssueSourceType) else str(source_type)


def _link_matches_issue_source(issue: Issue, link: IssueLink) -> bool:
    if issue.source_id is None:
        return False
    source_type = _source_type_value(issue.source_type)
    if source_type == IssueSourceType.control_execution.value:
        return link.execution_id == issue.source_id
    if source_type == IssueSourceType.kri_breach.value:
        return link.kri_id == issue.source_id
    return False


def _issue_source_link(issue: Issue) -> IssueLink | None:
    links = sorted(issue.links or [], key=lambda item: item.id or 0)
    for link in links:
        if link.is_source_link:
            return link

    for link in links:
        if _link_matches_issue_source(issue, link):
            return link
    return None


def _serialize_issue_source_link(
    issue: Issue,
    current_user: User | None = None,
    *,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> IssueLinkRead | None:
    source_link = _issue_source_link(issue)
    if source_link is None:
        return None
    return _serialize_issue_link(
        source_link,
        current_user=current_user,
        is_source_link=True,
        linked_visibility=linked_visibility,
    )


def _issue_source_display(
    issue: Issue,
    current_user: User | None = None,
    *,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> str | None:
    source_link = _issue_source_link(issue)
    if source_link is None:
        return None
    _linked_entity_type, linked_entity_name = _link_display(
        source_link,
        current_user,
        linked_visibility=linked_visibility,
    )
    return linked_entity_name


def _serialize_remediation(remediation: IssueRemediationPlan | None) -> IssueRemediationPlanRead | None:
    if remediation is None:
        return None
    owner_user_name: str | None = None
    if remediation.owner_user_id is not None:
        owner_user_name = _label_or_fallback(getattr(remediation.owner, "name", None), UNKNOWN_USER_LABEL)
    return IssueRemediationPlanRead.model_validate(
        {
            "id": remediation.id,
            "issue_id": remediation.issue_id,
            "status": remediation.status,
            "progress_percent": remediation.progress_percent,
            "owner_user_id": remediation.owner_user_id,
            "owner_user_name": owner_user_name,
            "target_date": remediation.target_date,
            "blocker_reason": remediation.blocker_reason,
            "completion_notes": remediation.completion_notes,
            "completed_at": remediation.completed_at,
            "created_at": remediation.created_at,
            "updated_at": remediation.updated_at,
        }
    )


def _serialize_exception(exception: IssueException) -> IssueExceptionRead:
    requested_by_name: str | None = None
    if exception.requested_by_id is not None:
        requested_by_name = _label_or_fallback(getattr(exception.requested_by, "name", None), UNKNOWN_USER_LABEL)
    approved_by_name: str | None = None
    if exception.approved_by_id is not None:
        approved_by_name = _label_or_fallback(getattr(exception.approved_by, "name", None), UNKNOWN_USER_LABEL)
    return IssueExceptionRead.model_validate(
        {
            "id": exception.id,
            "issue_id": exception.issue_id,
            "status": exception.status,
            "reason": exception.reason,
            "requested_by_id": exception.requested_by_id,
            "requested_by_name": requested_by_name,
            "approved_by_id": exception.approved_by_id,
            "approved_by_name": approved_by_name,
            "requested_at": exception.requested_at,
            "approved_at": exception.approved_at,
            "expires_at": exception.expires_at,
            "created_at": exception.created_at,
            "updated_at": exception.updated_at,
        }
    )


def _serialize_risk_context(risk: Risk) -> IssueRiskContext:
    return IssueRiskContext.model_validate(
        {
            "risk_id": risk.id,
            "risk_name": _label_or_fallback(getattr(risk, "name", None), UNKNOWN_RISK_LABEL),
            "risk_category": getattr(risk, "category", None),
            "risk_process": getattr(risk, "process", None),
            "risk_type": getattr(risk, "risk_type", None),
        }
    )


def _link_risks(link: IssueLink) -> list[Risk]:
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


def _serialize_issue_risk_contexts(
    issue: Issue,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> list[IssueRiskContext]:
    seen_risk_ids: set[int] = set()
    contexts: list[IssueRiskContext] = []

    for link in issue.links:
        for risk in _link_risks(link):
            if risk.id in seen_risk_ids:
                continue
            if linked_visibility is not None and risk.id not in linked_visibility.risk_ids:
                continue
            seen_risk_ids.add(risk.id)
            contexts.append(_serialize_risk_context(risk))

    return contexts


def _serialize_issue_vendor_contexts(
    issue: Issue,
    current_user: User | None,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> list[IssueVendorContext]:
    if current_user is None or not check_permission(current_user, "vendors", "read"):
        return []

    seen_vendor_ids: set[int] = set()
    contexts: list[IssueVendorContext] = []

    for link in issue.links:
        vendor = getattr(link, "vendor", None)
        if vendor is None or vendor.id in seen_vendor_ids:
            continue
        if linked_visibility is not None and vendor.id not in linked_visibility.vendor_ids:
            continue
        if linked_visibility is None and not can_read_vendor(vendor, current_user):
            continue
        seen_vendor_ids.add(vendor.id)
        contexts.append(
            IssueVendorContext.model_validate(
                {
                    "vendor_id": vendor.id,
                    "vendor_name": _label_or_fallback(getattr(vendor, "name", None), UNKNOWN_VENDOR_LABEL),
                }
            )
        )

    return contexts


def _issue_link_candidate_ids(issues: Sequence[Issue]) -> tuple[set[int], set[int], set[int], set[int]]:
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

            for risk in _link_risks(link):
                if risk.id is not None:
                    risk_ids.add(risk.id)

    return risk_ids, control_ids, kri_ids, vendor_ids


async def build_issue_linked_visibility(
    db: AsyncSession,
    current_user: User,
    issues: Sequence[Issue],
) -> IssueLinkedVisibility:
    risk_ids, control_ids, kri_ids, vendor_ids = _issue_link_candidate_ids(issues)
    return IssueLinkedVisibility(
        risk_ids=await visible_risk_ids(db, current_user, risk_ids),
        control_ids=await visible_control_ids(db, current_user, control_ids),
        kri_ids=await visible_kri_ids(db, current_user, kri_ids),
        vendor_ids=await visible_vendor_ids(db, current_user, vendor_ids),
    )


async def _resolve_user_name(db: AsyncSession, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    return (await db.execute(select(User.name).where(User.id == user_id))).scalar_one_or_none()


async def _serialize_exception_with_user_names(db: AsyncSession, exception: IssueException) -> IssueExceptionRead:
    requested_by_name: str | None = None
    if exception.requested_by_id is not None:
        requested_by_name = _label_or_fallback(
            await _resolve_user_name(db, exception.requested_by_id), UNKNOWN_USER_LABEL
        )
    approved_by_name: str | None = None
    if exception.approved_by_id is not None:
        approved_by_name = _label_or_fallback(
            await _resolve_user_name(db, exception.approved_by_id), UNKNOWN_USER_LABEL
        )
    return IssueExceptionRead.model_validate(
        {
            "id": exception.id,
            "issue_id": exception.issue_id,
            "status": exception.status,
            "reason": exception.reason,
            "requested_by_id": exception.requested_by_id,
            "requested_by_name": requested_by_name,
            "approved_by_id": exception.approved_by_id,
            "approved_by_name": approved_by_name,
            "requested_at": exception.requested_at,
            "approved_at": exception.approved_at,
            "expires_at": exception.expires_at,
            "created_at": exception.created_at,
            "updated_at": exception.updated_at,
        }
    )


def _serialize_issue_summary(
    issue: Issue,
    current_user: User | None = None,
    *,
    capabilities: IssueCapabilities | None = None,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> IssueSummary:
    owner_user_name: str | None = None
    if issue.owner_user_id is not None:
        owner_user_name = _label_or_fallback(getattr(issue.owner, "name", None), UNKNOWN_USER_LABEL)
    source_link = _serialize_issue_source_link(
        issue,
        current_user=current_user,
        linked_visibility=linked_visibility,
    )
    return IssueSummary.model_validate(
        {
            "id": issue.id,
            "title": issue.title,
            "severity": issue.severity,
            "status": issue.status,
            "source_type": issue.source_type,
            "source_id": issue.source_id,
            "source_display": _issue_source_display(
                issue,
                current_user=current_user,
                linked_visibility=linked_visibility,
            ),
            "source_link": source_link.model_dump() if source_link is not None else None,
            "department_id": issue.department_id,
            "department_name": _label_or_fallback(getattr(issue.department, "name", None), UNKNOWN_DEPARTMENT_LABEL),
            "owner_user_id": issue.owner_user_id,
            "owner_user_name": owner_user_name,
            "opened_at": issue.opened_at,
            "due_at": issue.due_at,
            "closed_at": issue.closed_at,
            "created_at": issue.created_at,
            "updated_at": issue.updated_at,
            "risk_contexts": [
                context.model_dump()
                for context in _serialize_issue_risk_contexts(issue, linked_visibility=linked_visibility)
            ],
            "vendor_contexts": [
                context.model_dump()
                for context in _serialize_issue_vendor_contexts(
                    issue,
                    current_user,
                    linked_visibility=linked_visibility,
                )
            ],
            "capabilities": capabilities,
        }
    )


def _serialize_issue_read(
    issue: Issue,
    current_user: User | None = None,
    *,
    capabilities: IssueCapabilities | None = None,
    linked_visibility: IssueLinkedVisibility | None = None,
) -> IssueRead:
    summary = _serialize_issue_summary(
        issue,
        current_user=current_user,
        capabilities=capabilities,
        linked_visibility=linked_visibility,
    )
    created_by_name: str | None = None
    if issue.created_by_id is not None:
        created_by_name = _label_or_fallback(getattr(issue.created_by, "name", None), UNKNOWN_USER_LABEL)
    source_link = _issue_source_link(issue)
    return IssueRead.model_validate(
        {
            **summary.model_dump(),
            "description": issue.description,
            "created_by_id": issue.created_by_id,
            "created_by_name": created_by_name,
            "validation_note": issue.validation_note,
            "links": [
                _serialize_issue_link(
                    link,
                    current_user=current_user,
                    is_source_link=source_link is not None and link.id == source_link.id,
                    linked_visibility=linked_visibility,
                ).model_dump()
                for link in issue.links
            ],
            "remediation_plan": (
                serialized_remediation.model_dump()
                if (serialized_remediation := _serialize_remediation(issue.remediation_plan)) is not None
                else None
            ),
            "exceptions": [_serialize_exception(exception).model_dump() for exception in issue.exceptions],
        }
    )
