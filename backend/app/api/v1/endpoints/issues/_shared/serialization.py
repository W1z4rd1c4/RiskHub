from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.core.datetime_utils import coerce_utc
from app.models import ControlRiskLink, Issue, IssueException, IssueLink, IssueRemediationPlan, Risk, User
from app.models.issue import IssueExceptionStatus
from app.schemas.issue import (
    IssueExceptionRead,
    IssueLinkRead,
    IssueRiskContext,
    IssueRead,
    IssueRemediationPlanRead,
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


def _active_exception(issue: Issue) -> IssueException | None:
    now = datetime.now(UTC)
    approved = [
        ex
        for ex in issue.exceptions
        if ex.status == IssueExceptionStatus.approved.value
        and ex.expires_at is not None
        and coerce_utc(ex.expires_at) is not None
        and coerce_utc(ex.expires_at) > now
    ]
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


def _link_display(link: IssueLink) -> tuple[str | None, str | None]:
    if link.risk_id is not None:
        return "risk", _label_or_fallback(getattr(link.risk, "name", None), UNKNOWN_RISK_LABEL)
    if link.control_id is not None:
        return "control", _label_or_fallback(getattr(link.control, "name", None), UNKNOWN_CONTROL_LABEL)
    if link.execution_id is not None:
        control_name = getattr(getattr(link.execution, "control", None), "name", None)
        if control_name and control_name.strip():
            return "execution", f"Execution for {control_name.strip()}"
        return "execution", UNKNOWN_EXECUTION_LABEL
    if link.kri_id is not None:
        return "kri", _label_or_fallback(getattr(link.kri, "metric_name", None), UNKNOWN_KRI_LABEL)
    if link.vendor_id is not None:
        return "vendor", _label_or_fallback(getattr(link.vendor, "name", None), UNKNOWN_VENDOR_LABEL)
    return None, None


def _serialize_issue_link(link: IssueLink) -> IssueLinkRead:
    linked_entity_type, linked_entity_name = _link_display(link)
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
            "created_at": link.created_at,
        }
    )


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

    if getattr(link.kri, "risk", None) is not None:
        return [link.kri.risk]

    if getattr(link.execution, "control", None) is not None:
        return [
            risk_link.risk
            for risk_link in getattr(link.execution.control, "risk_links", [])
            if isinstance(risk_link, ControlRiskLink) and risk_link.risk is not None
        ]

    if link.control is not None:
        return [
            risk_link.risk
            for risk_link in getattr(link.control, "risk_links", [])
            if isinstance(risk_link, ControlRiskLink) and risk_link.risk is not None
        ]

    return []


def _serialize_issue_risk_contexts(issue: Issue) -> list[IssueRiskContext]:
    seen_risk_ids: set[int] = set()
    contexts: list[IssueRiskContext] = []

    for link in issue.links:
        for risk in _link_risks(link):
            if risk.id in seen_risk_ids:
                continue
            seen_risk_ids.add(risk.id)
            contexts.append(_serialize_risk_context(risk))

    return contexts


def _serialize_issue_vendor_contexts(issue: Issue, current_user: User | None) -> list[IssueVendorContext]:
    if current_user is None or not check_permission(current_user, "vendors", "read"):
        return []

    seen_vendor_ids: set[int] = set()
    contexts: list[IssueVendorContext] = []

    for link in issue.links:
        vendor = getattr(link, "vendor", None)
        if vendor is None or vendor.id in seen_vendor_ids or not can_read_vendor(vendor, current_user):
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


def _serialize_issue_summary(issue: Issue, current_user: User | None = None) -> IssueSummary:
    owner_user_name: str | None = None
    if issue.owner_user_id is not None:
        owner_user_name = _label_or_fallback(getattr(issue.owner, "name", None), UNKNOWN_USER_LABEL)
    return IssueSummary.model_validate(
        {
            "id": issue.id,
            "title": issue.title,
            "severity": issue.severity,
            "status": issue.status,
            "source_type": issue.source_type,
            "source_id": issue.source_id,
            "department_id": issue.department_id,
            "department_name": _label_or_fallback(getattr(issue.department, "name", None), UNKNOWN_DEPARTMENT_LABEL),
            "owner_user_id": issue.owner_user_id,
            "owner_user_name": owner_user_name,
            "opened_at": issue.opened_at,
            "due_at": issue.due_at,
            "closed_at": issue.closed_at,
            "created_at": issue.created_at,
            "updated_at": issue.updated_at,
            "risk_contexts": [context.model_dump() for context in _serialize_issue_risk_contexts(issue)],
            "vendor_contexts": [context.model_dump() for context in _serialize_issue_vendor_contexts(issue, current_user)],
        }
    )


def _serialize_issue_read(issue: Issue) -> IssueRead:
    summary = _serialize_issue_summary(issue)
    created_by_name: str | None = None
    if issue.created_by_id is not None:
        created_by_name = _label_or_fallback(getattr(issue.created_by, "name", None), UNKNOWN_USER_LABEL)
    return IssueRead.model_validate(
        {
            **summary.model_dump(),
            "description": issue.description,
            "created_by_id": issue.created_by_id,
            "created_by_name": created_by_name,
            "validation_note": issue.validation_note,
            "links": [_serialize_issue_link(link).model_dump() for link in issue.links],
            "remediation_plan": (
                _serialize_remediation(issue.remediation_plan).model_dump() if issue.remediation_plan else None
            ),
            "exceptions": [_serialize_exception(exception).model_dump() for exception in issue.exceptions],
        }
    )
