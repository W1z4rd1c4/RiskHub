from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.datetime_utils import utc_now
from app.core.limits import (
    DASHBOARD_RECENT_ACTIVITY,
    DASHBOARD_TOP_CRITICAL_RISKS,
    DASHBOARD_TOP_CRITICAL_VENDORS,
    DASHBOARD_TOP_DEPARTMENT_EXPOSURE,
)
from app.models import Department, Risk
from app.models.activity_log import ActivityLog
from app.models.risk import RiskStatus
from app.models.vendor import Vendor


def _empty_committee_core() -> dict:
    return {"critical_risks": [], "recent_activity": [], "department_exposure": []}


def _risk_payload(risk: Risk) -> dict:
    return {
        "id": risk.id,
        "risk_id_code": risk.risk_id_code,
        "name": risk.name,
        "process": risk.process,
        "description": risk.description[:300] if risk.description else "",
        "net_score": risk.net_score,
        "is_priority": risk.is_priority,
        "owner_name": risk.owner.name if risk.owner else "Unassigned",
        "department_name": risk.department.name if risk.department else "Unassigned",
    }


def _activity_payload(item: ActivityLog) -> dict:
    return {
        "id": item.id,
        "action": item.action,
        "entity_type": item.entity_type,
        "entity_name": item.entity_name,
        "description": item.description,
        "created_at": item.created_at.isoformat(),
    }


def _department_exposure_payload(row) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "total_exposure": row.total_exposure,
        "risk_count": row.risk_count,
    }


def _vendor_payload(vendor: Vendor) -> dict:
    return {
        "id": vendor.id,
        "name": vendor.name,
        "process": vendor.process,
        "subprocess": vendor.subprocess,
        "risk_score_1_5": vendor.risk_score_1_5,
        "supports_important_core_insurance_function": bool(vendor.supports_important_core_insurance_function),
        "dora_relevant": bool(vendor.dora_relevant),
        "is_significant_vendor": bool(vendor.is_significant_vendor),
        "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else "Unassigned",
        "department_name": vendor.department.name if vendor.department else "Unassigned",
    }


def _apply_risk_department_scope(query, dept_ids: list[int] | None):
    if dept_ids is None:
        return query
    return query.where(Risk.department_id.in_(dept_ids))


def _apply_activity_department_scope(query, dept_ids: list[int] | None):
    if dept_ids is None:
        return query
    return query.where(ActivityLog.department_id.in_(dept_ids))


def _apply_department_scope(query, dept_ids: list[int] | None):
    if dept_ids is None:
        return query
    return query.where(Department.id.in_(dept_ids))


def _apply_vendor_scope(query, vendor_scope_filter):
    if vendor_scope_filter is None:
        return query
    return query.where(vendor_scope_filter)


async def _fetch_critical_vendors(db: AsyncSession, *, vendor_scope_filter):
    query = (
        select(Vendor)
        .options(joinedload(Vendor.outsourcing_owner), joinedload(Vendor.department))
        .where(Vendor.status == "active")
    )
    query = _apply_vendor_scope(query, vendor_scope_filter)
    return (
        (
            await db.execute(
                query.order_by(Vendor.risk_score_1_5.desc(), Vendor.name.asc()).limit(DASHBOARD_TOP_CRITICAL_VENDORS)
            )
        )
        .scalars()
        .all()
    )


async def _fetch_committee_core(
    db: AsyncSession,
    *,
    dept_ids: list[int] | None,
):
    thirty_days_ago = utc_now() - timedelta(days=30)

    critical_risks_query = (
        select(Risk)
        .options(joinedload(Risk.owner), joinedload(Risk.department))
        .where(Risk.status == RiskStatus.active.value)
    )
    critical_risks_query = _apply_risk_department_scope(critical_risks_query, dept_ids)
    critical_risks = (
        (
            await db.execute(
                critical_risks_query.order_by(Risk.is_priority.desc(), Risk.net_score.desc()).limit(
                    DASHBOARD_TOP_CRITICAL_RISKS
                )
            )
        )
        .scalars()
        .all()
    )

    recent_activity_query = (
        select(ActivityLog)
        .where(ActivityLog.created_at >= thirty_days_ago)
        .where(ActivityLog.action.in_(["create", "delete", "archive", "approve", "reject"]))
        .order_by(ActivityLog.created_at.desc())
        .limit(DASHBOARD_RECENT_ACTIVITY)
    )
    recent_activity_query = _apply_activity_department_scope(recent_activity_query, dept_ids)
    recent_activity = (await db.execute(recent_activity_query)).scalars().all()

    dept_exposure_query = (
        select(
            Department.id,
            Department.name,
            func.sum(Risk.net_score).label("total_exposure"),
            func.count(Risk.id).label("risk_count"),
        )
        .join(Risk, Risk.department_id == Department.id)
        .where(Risk.status == RiskStatus.active.value)
        .group_by(Department.id)
        .order_by(func.sum(Risk.net_score).desc())
        .limit(DASHBOARD_TOP_DEPARTMENT_EXPOSURE)
    )
    dept_exposure_query = _apply_department_scope(dept_exposure_query, dept_ids)
    dept_exposure = (await db.execute(dept_exposure_query)).all()

    return critical_risks, recent_activity, dept_exposure


async def _fetch_vendor_sections(
    db: AsyncSession,
    *,
    can_read_vendors: bool,
    dept_ids: list[int] | None,
):
    vendor_scope_filter = Vendor.department_id.in_(dept_ids) if dept_ids is not None else None

    sections = {
        "critical_vendors": [],
    }
    if not can_read_vendors:
        return sections

    sections["critical_vendors"] = await _fetch_critical_vendors(
        db,
        vendor_scope_filter=vendor_scope_filter,
    )
    return sections
