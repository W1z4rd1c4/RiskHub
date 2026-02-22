from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api import deps
from app.core.datetime_utils import utc_now
from app.core.limits import (
    DASHBOARD_RECENT_ACTIVITY,
    DASHBOARD_TOP_BREACHED_SLAS,
    DASHBOARD_TOP_CRITICAL_RISKS,
    DASHBOARD_TOP_CRITICAL_VENDORS,
    DASHBOARD_TOP_DEPARTMENT_EXPOSURE,
    DASHBOARD_TOP_MAJOR_INCIDENTS,
    DASHBOARD_TOP_OVERDUE_VENDORS,
)
from app.core.permissions import get_user_department_ids, has_permission
from app.db.session import get_db
from app.models import Department, Risk, User
from app.models.activity_log import ActivityLog
from app.models.risk import RiskStatus
from app.models.vendor import Vendor
from app.models.vendor_incident import VendorIncident
from app.models.vendor_sla import VendorSLA

router = APIRouter()


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
        "next_reassessment_due_at": (
            vendor.next_reassessment_due_at.isoformat() if vendor.next_reassessment_due_at else None
        ),
        "outsourcing_owner_name": vendor.outsourcing_owner.name if vendor.outsourcing_owner else "Unassigned",
        "department_name": vendor.department.name if vendor.department else "Unassigned",
    }


def _vendor_alert_payload(
    *,
    overdue_total: int,
    overdue_vendors: list[Vendor],
    sla_breach_total: int,
    breached_slas: list[VendorSLA],
    incident_total: int,
    major_incidents: list[VendorIncident],
) -> dict:
    return {
        "overdue_reassessments": {
            "count": overdue_total,
            "items": [
                {
                    "id": vendor.id,
                    "name": vendor.name,
                    "next_reassessment_due_at": vendor.next_reassessment_due_at.isoformat()
                    if vendor.next_reassessment_due_at
                    else None,
                    "department_name": vendor.department.name if vendor.department else "Unassigned",
                }
                for vendor in overdue_vendors
            ],
        },
        "sla_breaches": {
            "count": sla_breach_total,
            "items": [
                {
                    "vendor_id": sla.vendor_id,
                    "vendor_name": sla.vendor.name if sla.vendor else "",
                    "sla_id": sla.id,
                    "metric_name": sla.metric_name,
                    "breach_status": sla.breach_status,
                    "last_reported_at": sla.last_reported_at.isoformat() if sla.last_reported_at else None,
                    "department_name": (
                        sla.vendor.department.name if sla.vendor and sla.vendor.department else "Unassigned"
                    ),
                }
                for sla in breached_slas
            ],
        },
        "major_incidents_30d": {
            "count": incident_total,
            "items": [
                {
                    "vendor_id": incident.vendor_id,
                    "vendor_name": incident.vendor.name if incident.vendor else "",
                    "incident_id": incident.id,
                    "incident_type": incident.incident_type.value
                    if hasattr(incident.incident_type, "value")
                    else str(incident.incident_type),
                    "summary": incident.summary,
                    "occurred_at": (incident.occurred_at or incident.created_at).isoformat()
                    if (incident.occurred_at or incident.created_at)
                    else None,
                    "department_name": incident.vendor.department.name
                    if incident.vendor and incident.vendor.department
                    else "Unassigned",
                }
                for incident in major_incidents
            ],
        },
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


async def _fetch_overdue_vendors(db: AsyncSession, *, now, vendor_scope_filter):
    query = (
        select(Vendor)
        .options(joinedload(Vendor.outsourcing_owner), joinedload(Vendor.department))
        .where(
            Vendor.status == "active",
            Vendor.next_reassessment_due_at.isnot(None),
            Vendor.next_reassessment_due_at < now,
        )
    )
    query = _apply_vendor_scope(query, vendor_scope_filter)
    return (
        (await db.execute(query.order_by(Vendor.next_reassessment_due_at.asc()).limit(DASHBOARD_TOP_OVERDUE_VENDORS)))
        .scalars()
        .all()
    )


async def _count_overdue_vendors(db: AsyncSession, *, now, vendor_scope_filter) -> int:
    query = select(func.count(Vendor.id)).where(
        Vendor.status == "active",
        Vendor.next_reassessment_due_at.isnot(None),
        Vendor.next_reassessment_due_at < now,
    )
    query = _apply_vendor_scope(query, vendor_scope_filter)
    return (await db.execute(query)).scalar() or 0


async def _fetch_breached_slas(db: AsyncSession, *, vendor_scope_filter):
    query = (
        select(VendorSLA)
        .options(
            joinedload(VendorSLA.vendor).joinedload(Vendor.department),
            joinedload(VendorSLA.vendor).joinedload(Vendor.outsourcing_owner),
        )
        .where(VendorSLA.is_archived.is_(False))
        .where(or_(VendorSLA.current_value < VendorSLA.lower_limit, VendorSLA.current_value > VendorSLA.upper_limit))
        .join(Vendor, VendorSLA.vendor_id == Vendor.id)
        .where(Vendor.status == "active")
    )
    query = _apply_vendor_scope(query, vendor_scope_filter)
    result = await db.execute(query.order_by(VendorSLA.last_reported_at.desc()).limit(DASHBOARD_TOP_BREACHED_SLAS))
    return result.scalars().all()


async def _count_breached_slas(db: AsyncSession, *, vendor_scope_filter) -> int:
    query = (
        select(func.count(VendorSLA.id))
        .join(Vendor, VendorSLA.vendor_id == Vendor.id)
        .where(VendorSLA.is_archived.is_(False))
        .where(or_(VendorSLA.current_value < VendorSLA.lower_limit, VendorSLA.current_value > VendorSLA.upper_limit))
        .where(Vendor.status == "active")
    )
    query = _apply_vendor_scope(query, vendor_scope_filter)
    return (await db.execute(query)).scalar() or 0


async def _fetch_major_incidents(db: AsyncSession, *, thirty_days_ago, vendor_scope_filter):
    query = (
        select(VendorIncident)
        .options(
            joinedload(VendorIncident.vendor).joinedload(Vendor.department),
            joinedload(VendorIncident.vendor).joinedload(Vendor.outsourcing_owner),
        )
        .where(VendorIncident.is_major.is_(True))
        .where(
            or_(
                VendorIncident.occurred_at >= thirty_days_ago,
                and_(VendorIncident.occurred_at.is_(None), VendorIncident.created_at >= thirty_days_ago),
            )
        )
        .join(Vendor, VendorIncident.vendor_id == Vendor.id)
        .where(Vendor.status == "active")
        .order_by(desc(VendorIncident.occurred_at), desc(VendorIncident.created_at))
        .limit(DASHBOARD_TOP_MAJOR_INCIDENTS)
    )
    query = _apply_vendor_scope(query, vendor_scope_filter)
    return (await db.execute(query)).scalars().all()


async def _count_major_incidents(db: AsyncSession, *, thirty_days_ago, vendor_scope_filter) -> int:
    query = (
        select(func.count(VendorIncident.id))
        .join(Vendor, VendorIncident.vendor_id == Vendor.id)
        .where(VendorIncident.is_major.is_(True))
        .where(
            or_(
                VendorIncident.occurred_at >= thirty_days_ago,
                and_(VendorIncident.occurred_at.is_(None), VendorIncident.created_at >= thirty_days_ago),
            )
        )
        .where(Vendor.status == "active")
    )
    query = _apply_vendor_scope(query, vendor_scope_filter)
    return (await db.execute(query)).scalar() or 0


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
    now = utc_now()
    thirty_days_ago = now - timedelta(days=30)
    vendor_scope_filter = Vendor.department_id.in_(dept_ids) if dept_ids is not None else None

    sections = {
        "critical_vendors": [],
        "overdue_vendors": [],
        "overdue_total": 0,
        "breached_slas": [],
        "sla_breach_total": 0,
        "major_incidents": [],
        "incident_total": 0,
    }
    if not can_read_vendors:
        return sections

    sections["critical_vendors"] = await _fetch_critical_vendors(
        db,
        vendor_scope_filter=vendor_scope_filter,
    )
    sections["overdue_vendors"] = await _fetch_overdue_vendors(
        db,
        now=now,
        vendor_scope_filter=vendor_scope_filter,
    )
    sections["overdue_total"] = await _count_overdue_vendors(
        db,
        now=now,
        vendor_scope_filter=vendor_scope_filter,
    )
    sections["breached_slas"] = await _fetch_breached_slas(
        db,
        vendor_scope_filter=vendor_scope_filter,
    )
    sections["sla_breach_total"] = await _count_breached_slas(
        db,
        vendor_scope_filter=vendor_scope_filter,
    )
    sections["major_incidents"] = await _fetch_major_incidents(
        db,
        thirty_days_ago=thirty_days_ago,
        vendor_scope_filter=vendor_scope_filter,
    )
    sections["incident_total"] = await _count_major_incidents(
        db,
        thirty_days_ago=thirty_days_ago,
        vendor_scope_filter=vendor_scope_filter,
    )
    return sections


@router.get("/committee-summary")
async def get_committee_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
):
    """
    Get executive summary for Risk Committee meetings.

    Returns high-level overview with key decision points.
    """
    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None and not dept_ids:
        return _empty_committee_core()

    critical_risks, recent_activity, dept_exposure = await _fetch_committee_core(db, dept_ids=dept_ids)
    vendor_sections = await _fetch_vendor_sections(
        db,
        can_read_vendors=has_permission(current_user, "vendors", "read"),
        dept_ids=dept_ids,
    )

    return {
        "critical_risks": [_risk_payload(risk) for risk in critical_risks],
        "recent_activity": [_activity_payload(item) for item in recent_activity],
        "department_exposure": [_department_exposure_payload(row) for row in dept_exposure],
        "critical_vendors": [_vendor_payload(vendor) for vendor in vendor_sections["critical_vendors"]],
        "vendor_alerts": _vendor_alert_payload(
            overdue_total=vendor_sections["overdue_total"],
            overdue_vendors=vendor_sections["overdue_vendors"],
            sla_breach_total=vendor_sections["sla_breach_total"],
            breached_slas=vendor_sections["breached_slas"],
            incident_total=vendor_sections["incident_total"],
            major_incidents=vendor_sections["major_incidents"],
        ),
    }
