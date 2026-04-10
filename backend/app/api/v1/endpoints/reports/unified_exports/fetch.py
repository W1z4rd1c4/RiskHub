from datetime import UTC, date, datetime
from typing import Any, Literal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import (
    get_control_ids_where_owner,
    get_issue_scope_clause,
    get_kri_ids_where_reporting_owner,
    get_risk_ids_where_control_owner,
    get_risk_ids_where_kri_reporting_owner,
    get_user_department_ids,
)
from app.models import (
    Control,
    Issue,
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
from app.services.issue_visibility_service import unsuppressed_issue_clause

from ._shared import _safe_int


async def _fetch_risks_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Risk]:
    query = select(Risk).options(
        selectinload(Risk.department),
        selectinload(Risk.owner),
        selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
        selectinload(Risk.control_links),
    )

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        reporting_owner_risk_ids = await get_risk_ids_where_kri_reporting_owner(db, current_user.id)
        control_owner_risk_ids = await get_risk_ids_where_control_owner(db, current_user.id)
        cross_dept_risk_ids = set(reporting_owner_risk_ids) | set(control_owner_risk_ids)
        if cross_dept_risk_ids:
            query = query.where(
                or_(
                    Risk.department_id.in_(dept_ids),
                    Risk.owner_id == current_user.id,
                    Risk.id.in_(cross_dept_risk_ids),
                )
            )
        else:
            query = query.where(or_(Risk.department_id.in_(dept_ids), Risk.owner_id == current_user.id))
    elif department_id:
        query = query.where(Risk.department_id == department_id)

    result = await db.execute(query)
    return list(result.scalars().all())


async def _fetch_controls_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Control]:
    query = select(Control)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        owned_control_ids = await get_control_ids_where_owner(db, current_user.id)
        if owned_control_ids:
            query = query.where(or_(Control.department_id.in_(dept_ids), Control.id.in_(owned_control_ids)))
        else:
            query = query.where(Control.department_id.in_(dept_ids))
    elif department_id:
        query = query.where(Control.department_id == department_id)

    query = query.options(
        selectinload(Control.department),
        selectinload(Control.control_owner),
        selectinload(Control.executions),
        selectinload(Control.risk_links).selectinload(ControlRiskLink.risk).selectinload(Risk.department),
        selectinload(Control.risk_links).selectinload(ControlRiskLink.risk).selectinload(Risk.owner),
    )

    result = await db.execute(query)
    return list(result.scalars().all())


async def _fetch_kris_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[KeyRiskIndicator]:
    query = select(KeyRiskIndicator).join(Risk)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        reporting_owner_kri_ids = await get_kri_ids_where_reporting_owner(db, current_user.id)
        if reporting_owner_kri_ids:
            query = query.where(
                or_(
                    Risk.department_id.in_(dept_ids),
                    KeyRiskIndicator.id.in_(reporting_owner_kri_ids),
                )
            )
        else:
            query = query.where(Risk.department_id.in_(dept_ids))

    if department_id and dept_ids is None:
        query = query.where(Risk.department_id == department_id)

    query = query.options(
        selectinload(KeyRiskIndicator.reporting_owner),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.department),
        selectinload(KeyRiskIndicator.risk).selectinload(Risk.owner),
    )

    result = await db.execute(query)
    return list(result.scalars().all())


async def _fetch_vendors_for_export(
    db: AsyncSession,
    *,
    current_user: User,
    department_id: int | None,
) -> list[Vendor]:
    query = select(Vendor)

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if dept_ids:
            query = query.where(
                or_(
                    Vendor.department_id.in_(dept_ids),
                    Vendor.outsourcing_owner_user_id == current_user.id,
                )
            )
        else:
            query = query.where(Vendor.outsourcing_owner_user_id == current_user.id)
        query = query.where(Vendor.department_id.is_not(None))
    elif department_id is not None:
        query = query.where(Vendor.department_id == department_id)

    query = query.options(selectinload(Vendor.department), selectinload(Vendor.outsourcing_owner))
    result = await db.execute(query)
    return list(result.scalars().all())


async def _apply_kri_history_as_of(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    as_of_date: date,
) -> list[dict[str, Any]]:
    kri_ids = [int(r["id"]) for r in rows if r.get("id") is not None]
    if not kri_ids:
        return rows

    result = await db.execute(
        select(KRIValueHistory)
        .where(KRIValueHistory.kri_id.in_(kri_ids), KRIValueHistory.period_end <= as_of_date)
        .order_by(
            KRIValueHistory.kri_id.asc(),
            KRIValueHistory.period_end.desc(),
            KRIValueHistory.recorded_at.desc(),
        )
    )
    history_rows = result.scalars().all()
    latest: dict[int, KRIValueHistory] = {}
    for item in history_rows:
        if item.kri_id not in latest:
            latest[item.kri_id] = item

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
    query = select(Issue).options(
        selectinload(Issue.department),
        selectinload(Issue.owner),
        selectinload(Issue.links).selectinload(IssueLink.risk),
        selectinload(Issue.links).selectinload(IssueLink.control),
        selectinload(Issue.links).selectinload(IssueLink.execution),
        selectinload(Issue.links).selectinload(IssueLink.kri),
        selectinload(Issue.remediation_plan).selectinload(IssueRemediationPlan.owner),
        selectinload(Issue.exceptions),
    )

    scope_clause = await get_issue_scope_clause(db, current_user)
    if scope_clause is not None:
        query = query.where(scope_clause)
    if department_id is not None:
        query = query.where(Issue.department_id == department_id)
    if status_filter is not None:
        query = query.where(Issue.status == status_filter.value)
    if severity_group == "high_critical":
        query = query.where(Issue.severity.in_((IssueSeverity.high.value, IssueSeverity.critical.value)))
    elif severity_filter is not None:
        query = query.where(Issue.severity == severity_filter.value)
    if owner_user_id is not None:
        query = query.where(Issue.owner_user_id == owner_user_id)
    if exclude_active_exceptions:
        query = query.where(unsuppressed_issue_clause(datetime.now(UTC)))

    result = await db.execute(query.order_by(Issue.id.asc()))
    return list(result.scalars().all())
