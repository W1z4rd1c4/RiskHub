from datetime import date
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.mappers.risk import risk_summary_load_options
from app.core.datetime_utils import utc_now
from app.core.permissions import (
    control_visibility_clause,
    get_issue_scope_clause,
    kri_visibility_clause,
    risk_visibility_clause,
    vendor_visibility_clause,
)
from app.models import (
    Control,
    ControlExecution,
    Issue,
    IssueException,
    IssueLink,
    IssueRemediationPlan,
    KeyRiskIndicator,
    Risk,
    User,
    Vendor,
)
from app.models.issue import IssueSeverity, IssueStatus
from app.models.kri_history import KRIValueHistory
from app.models.risk import ControlRiskLink
from app.services.issue_visibility_service import issue_severity_clause, unsuppressed_issue_clause
from app.services.report_export_limits import (
    MAX_SYNC_EXPORT_RELATED_ROWS,
    enforce_sync_export_row_limit,
    execute_bounded_export_query,
    preflight_export_query,
)

from .shared import _safe_int


async def _fetch_risks_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Risk]:
    id_query = select(Risk.id)
    query = select(Risk).options(*risk_summary_load_options()).order_by(Risk.id.asc())

    visibility_clause = await risk_visibility_clause(db, current_user, department_id=department_id)
    if visibility_clause is not None:
        id_query = id_query.where(visibility_clause)
        query = query.where(visibility_clause)

    risk_ids = await preflight_export_query(db, id_query.order_by(Risk.id.asc()))
    if risk_ids:
        await preflight_export_query(
            db,
            select(KeyRiskIndicator.id).where(
                KeyRiskIndicator.risk_id.in_(risk_ids),
                KeyRiskIndicator.is_archived.is_(False),
            ),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )
        await preflight_export_query(
            db,
            select(ControlRiskLink.id).where(ControlRiskLink.risk_id.in_(risk_ids)),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )
    return await execute_bounded_export_query(db, query)


async def _fetch_controls_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Control]:
    id_query = select(Control.id)
    query = select(Control).order_by(Control.id.asc())

    visibility_clause = control_visibility_clause(current_user, department_id=department_id)
    if visibility_clause is not None:
        id_query = id_query.where(visibility_clause)
        query = query.where(visibility_clause)

    query = query.options(
        selectinload(Control.department),
        selectinload(Control.control_owner),
        selectinload(Control.executions),
        selectinload(Control.risk_links).selectinload(ControlRiskLink.risk).selectinload(Risk.department),
        selectinload(Control.risk_links).selectinload(ControlRiskLink.risk).selectinload(Risk.owner),
    )

    control_ids = await preflight_export_query(db, id_query.order_by(Control.id.asc()))
    if control_ids:
        await preflight_export_query(
            db,
            select(ControlExecution.id).where(ControlExecution.control_id.in_(control_ids)),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )
        await preflight_export_query(
            db,
            select(ControlRiskLink.id).where(ControlRiskLink.control_id.in_(control_ids)),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )
    return await execute_bounded_export_query(db, query)


async def _fetch_kris_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[KeyRiskIndicator]:
    id_query = select(KeyRiskIndicator.id).join(Risk)
    query = select(KeyRiskIndicator).join(Risk).order_by(KeyRiskIndicator.id.asc())

    visibility_clause = await kri_visibility_clause(db, current_user, department_id=department_id)
    if visibility_clause is not None:
        id_query = id_query.where(visibility_clause)
        query = query.where(visibility_clause)

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.department),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.owner),
    )

    await preflight_export_query(db, id_query.order_by(KeyRiskIndicator.id.asc()))
    return await execute_bounded_export_query(db, query)


async def _fetch_vendors_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Vendor]:
    id_query = select(Vendor.id)
    query = select(Vendor).order_by(Vendor.id.asc())

    visibility_clause = vendor_visibility_clause(current_user, department_id=department_id)
    if visibility_clause is not None:
        id_query = id_query.where(visibility_clause)
        query = query.where(visibility_clause)

    query = query.options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
    await preflight_export_query(db, id_query.order_by(Vendor.id.asc()))
    return await execute_bounded_export_query(db, query)


async def _apply_kri_history_as_of(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    as_of_date: date,
) -> list[dict[str, Any]]:
    enforce_sync_export_row_limit(len(rows))
    kri_ids = sorted({int(r["id"]) for r in rows if r.get("id") is not None})
    if not kri_ids:
        return rows

    ranked_history = (
        select(
            KRIValueHistory.id.label("history_id"),
            func.row_number()
            .over(
                partition_by=KRIValueHistory.kri_id,
                order_by=(
                    KRIValueHistory.period_end.desc(),
                    KRIValueHistory.recorded_at.desc(),
                    KRIValueHistory.id.desc(),
                ),
            )
            .label("history_rank"),
        )
        .where(KRIValueHistory.kri_id.in_(kri_ids), KRIValueHistory.period_end <= as_of_date)
        .subquery()
    )
    result = await db.execute(
        select(KRIValueHistory)
        .join(ranked_history, KRIValueHistory.id == ranked_history.c.history_id)
        .where(ranked_history.c.history_rank == 1)
    )
    history_rows = result.scalars().all()
    latest = {item.kri_id: item for item in history_rows}

    for row in rows:
        kri_id = _safe_int(row.get("id"))
        entry = latest.get(kri_id)
        if entry is None:
            continue
        row["current_value"] = entry.value
        row["lower_limit"] = entry.lower_limit
        row["upper_limit"] = entry.upper_limit
        row["unit"] = entry.unit
        row["breach_status"] = entry.breach_status
        row["last_period_end"] = entry.period_end
        row["last_reported_at"] = entry.recorded_at

    return rows


async def _fetch_issues_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
    status_filter: IssueStatus | None,
    severity_filter: IssueSeverity | None,
    severity_group: Literal["high_critical"] | None,
    owner_user_id: int | None,
    exclude_active_exceptions: bool,
) -> list[Issue]:
    conditions = []

    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        conditions.append(scope_clause)
    if department_id is not None:
        conditions.append(Issue.department_id == department_id)
    if status_filter is not None:
        conditions.append(Issue.status == status_filter.value)
    severity_clause = issue_severity_clause(severity_filter, severity_group)
    if severity_clause is not None:
        conditions.append(severity_clause)
    if owner_user_id is not None:
        conditions.append(Issue.owner_user_id == owner_user_id)
    if exclude_active_exceptions:
        conditions.append(unsuppressed_issue_clause(utc_now()))

    id_query = select(Issue.id).where(*conditions).order_by(Issue.id.asc())
    issue_ids = await preflight_export_query(db, id_query)
    if issue_ids:
        await preflight_export_query(
            db,
            select(IssueLink.id).where(IssueLink.issue_id.in_(issue_ids)),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )
        await preflight_export_query(
            db,
            select(IssueException.id).where(IssueException.issue_id.in_(issue_ids)),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )
        await preflight_export_query(
            db,
            select(ControlRiskLink.id)
            .join(IssueLink, IssueLink.control_id == ControlRiskLink.control_id)
            .where(IssueLink.issue_id.in_(issue_ids))
            .distinct(),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )
        await preflight_export_query(
            db,
            select(ControlRiskLink.id)
            .join(ControlExecution, ControlExecution.control_id == ControlRiskLink.control_id)
            .join(IssueLink, IssueLink.execution_id == ControlExecution.id)
            .where(IssueLink.issue_id.in_(issue_ids))
            .distinct(),
            maximum=MAX_SYNC_EXPORT_RELATED_ROWS,
        )

    query = select(Issue).where(*conditions).options(
        selectinload(Issue.department),
        selectinload(Issue.owner),
        selectinload(Issue.links).selectinload(IssueLink.risk),
        selectinload(Issue.links)
        .selectinload(IssueLink.control)
        .selectinload(Control.risk_links)
        .selectinload(ControlRiskLink.risk),
        selectinload(Issue.links)
        .selectinload(IssueLink.execution)
        .selectinload(ControlExecution.control)
        .selectinload(Control.risk_links)
        .selectinload(ControlRiskLink.risk),
        selectinload(Issue.links).selectinload(IssueLink.kri).selectinload(KeyRiskIndicator.risk),
        selectinload(Issue.links).selectinload(IssueLink.vendor),
        selectinload(Issue.remediation_plan).selectinload(IssueRemediationPlan.owner),
        selectinload(Issue.exceptions),
    )
    return await execute_bounded_export_query(db, query.order_by(Issue.id.asc()))
