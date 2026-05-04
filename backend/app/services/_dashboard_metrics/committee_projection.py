from __future__ import annotations

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
from app.core.permissions import vendor_visibility_clause
from app.models import Department, Risk, User
from app.models.activity_log import ActivityLog
from app.models.risk import RiskStatus
from app.models.vendor import Vendor


def empty_committee_core() -> dict:
    return {"critical_risks": [], "recent_activity": [], "department_exposure": [], "critical_vendors": []}


def risk_payload(risk: Risk) -> dict:
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


def activity_payload(item: ActivityLog) -> dict:
    return {
        "id": item.id,
        "action": item.action,
        "entity_type": item.entity_type,
        "entity_name": item.entity_name,
        "description": item.description,
        "created_at": item.created_at.isoformat(),
    }


def department_exposure_payload(row) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "total_exposure": row.total_exposure,
        "risk_count": row.risk_count,
    }


def vendor_payload(vendor: Vendor) -> dict:
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


def _apply_scope(query, model_field, dept_ids: list[int] | None):
    if dept_ids is None:
        return query
    return query.where(model_field.in_(dept_ids))


async def fetch_committee_core(
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
    critical_risks_query = _apply_scope(critical_risks_query, Risk.department_id, dept_ids)
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
    recent_activity_query = _apply_scope(recent_activity_query, ActivityLog.department_id, dept_ids)
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
    dept_exposure_query = _apply_scope(dept_exposure_query, Department.id, dept_ids)
    dept_exposure = (await db.execute(dept_exposure_query)).all()

    return critical_risks, recent_activity, dept_exposure


async def fetch_vendor_sections(
    db: AsyncSession,
    *,
    current_user: User,
    can_read_vendors: bool,
):
    vendor_scope_filter = vendor_visibility_clause(current_user)
    if not can_read_vendors:
        return {"critical_vendors": []}

    query = (
        select(Vendor)
        .options(joinedload(Vendor.outsourcing_owner), joinedload(Vendor.department))
        .where(Vendor.status == "active")
    )
    if vendor_scope_filter is not None:
        query = query.where(vendor_scope_filter)
    critical_vendors = (
        (
            await db.execute(
                query.order_by(Vendor.risk_score_1_5.desc(), Vendor.name.asc()).limit(DASHBOARD_TOP_CRITICAL_VENDORS)
            )
        )
        .scalars()
        .all()
    )
    return {"critical_vendors": critical_vendors}
