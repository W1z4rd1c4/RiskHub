from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.core.permissions import has_permission
from app.db.session import get_db
from app.models import Department, Risk, User
from app.models.risk import RiskStatus

router = APIRouter()


@router.get("/committee-summary")
async def get_committee_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_committee_user),
):
    """
    Get executive summary for Risk Committee meetings.

    Returns high-level overview with key decision points.
    """
    from datetime import timedelta

    from sqlalchemy.orm import joinedload

    from app.core.permissions import get_user_department_ids
    from app.models.activity_log import ActivityLog
    from app.models.vendor import Vendor
    from app.models.vendor_incident import VendorIncident
    from app.models.vendor_sla import VendorSLA

    if not has_permission(current_user, "risks", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: risks:read")

    dept_ids = get_user_department_ids(current_user)

    # Top 5 critical risks (by net_score, priority first)
    # Eager load owner and department
    critical_risks_query = (
        select(Risk)
        .options(joinedload(Risk.owner), joinedload(Risk.department))
        .where(Risk.status == RiskStatus.active.value)
    )
    if dept_ids is not None:
        if not dept_ids:
            return {"critical_risks": [], "recent_activity": [], "department_exposure": []}
        critical_risks_query = critical_risks_query.where(Risk.department_id.in_(dept_ids))
    critical_risks = await db.execute(
        critical_risks_query.order_by(Risk.is_priority.desc(), Risk.net_score.desc()).limit(
            DASHBOARD_TOP_CRITICAL_RISKS
        )
    )

    # Recent significant changes (last 30 days)
    thirty_days_ago = utc_now() - timedelta(days=30)
    recent_activity_query = (
        select(ActivityLog)
        .where(ActivityLog.created_at >= thirty_days_ago)
        .where(ActivityLog.action.in_(["create", "delete", "archive", "approve", "reject"]))
        .order_by(ActivityLog.created_at.desc())
        .limit(DASHBOARD_RECENT_ACTIVITY)
    )
    if dept_ids is not None:
        if not dept_ids:
            return {"critical_risks": [], "recent_activity": [], "department_exposure": []}
        recent_activity_query = recent_activity_query.where(ActivityLog.department_id.in_(dept_ids))
    recent_activity = await db.execute(recent_activity_query)

    # Departments with highest risk exposure
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
    if dept_ids is not None:
        if not dept_ids:
            return {"critical_risks": [], "recent_activity": [], "department_exposure": []}
        dept_exposure_query = dept_exposure_query.where(Department.id.in_(dept_ids))
    dept_exposure = await db.execute(dept_exposure_query)

    # Vendor sections (Phase 18-11)
    can_read_vendors = has_permission(current_user, "vendors", "read")
    vendor_scope_filter = None
    if dept_ids is not None:
        if not dept_ids:
            return {
                "critical_risks": [],
                "recent_activity": [],
                "department_exposure": [],
                "critical_vendors": [],
                "vendor_alerts": {},
            }
        vendor_scope_filter = Vendor.department_id.in_(dept_ids)

    now = utc_now()
    thirty_days_ago = now - timedelta(days=30)

    critical_vendors: list[Vendor] = []
    overdue_vendors: list[Vendor] = []
    overdue_total = 0
    breached_slas: list[VendorSLA] = []
    sla_breach_total = 0
    major_incidents: list[VendorIncident] = []
    incident_total = 0

    if can_read_vendors:
        critical_vendors_query = (
            select(Vendor)
            .options(joinedload(Vendor.outsourcing_owner), joinedload(Vendor.department))
            .where(Vendor.status == "active")
        )
        if vendor_scope_filter is not None:
            critical_vendors_query = critical_vendors_query.where(vendor_scope_filter)
        critical_vendors = (
            (
                await db.execute(
                    critical_vendors_query.order_by(Vendor.risk_score_1_5.desc(), Vendor.name.asc()).limit(
                        DASHBOARD_TOP_CRITICAL_VENDORS
                    )
                )
            )
            .scalars()
            .all()
        )

        overdue_query = (
            select(Vendor)
            .options(joinedload(Vendor.outsourcing_owner), joinedload(Vendor.department))
            .where(
                Vendor.status == "active",
                Vendor.next_reassessment_due_at.isnot(None),
                Vendor.next_reassessment_due_at < now,
            )
        )
        if vendor_scope_filter is not None:
            overdue_query = overdue_query.where(vendor_scope_filter)
        overdue_vendors = (
            (
                await db.execute(
                    overdue_query.order_by(Vendor.next_reassessment_due_at.asc()).limit(DASHBOARD_TOP_OVERDUE_VENDORS)
                )
            )
            .scalars()
            .all()
        )
        overdue_total_query = select(func.count(Vendor.id)).where(
            Vendor.status == "active",
            Vendor.next_reassessment_due_at.isnot(None),
            Vendor.next_reassessment_due_at < now,
        )
        if vendor_scope_filter is not None:
            overdue_total_query = overdue_total_query.where(vendor_scope_filter)
        overdue_total = (await db.execute(overdue_total_query)).scalar() or 0

        sla_breach_query = (
            select(VendorSLA)
            .options(
                joinedload(VendorSLA.vendor).joinedload(Vendor.department),
                joinedload(VendorSLA.vendor).joinedload(Vendor.outsourcing_owner),
            )
            .where(VendorSLA.is_archived.is_(False))
            .where(
                or_(VendorSLA.current_value < VendorSLA.lower_limit, VendorSLA.current_value > VendorSLA.upper_limit)
            )
            .join(Vendor, VendorSLA.vendor_id == Vendor.id)
            .where(Vendor.status == "active")
        )
        if vendor_scope_filter is not None:
            sla_breach_query = sla_breach_query.where(vendor_scope_filter)
        breached_slas = (
            (
                await db.execute(
                    sla_breach_query.order_by(VendorSLA.last_reported_at.desc()).limit(DASHBOARD_TOP_BREACHED_SLAS)
                )
            )
            .scalars()
            .all()
        )
        sla_breach_total_query = (
            select(func.count(VendorSLA.id))
            .join(Vendor, VendorSLA.vendor_id == Vendor.id)
            .where(VendorSLA.is_archived.is_(False))
            .where(
                or_(VendorSLA.current_value < VendorSLA.lower_limit, VendorSLA.current_value > VendorSLA.upper_limit)
            )
            .where(Vendor.status == "active")
        )
        if vendor_scope_filter is not None:
            sla_breach_total_query = sla_breach_total_query.where(vendor_scope_filter)
        sla_breach_total = (await db.execute(sla_breach_total_query)).scalar() or 0

        incident_query = (
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
        if vendor_scope_filter is not None:
            incident_query = incident_query.where(vendor_scope_filter)
        major_incidents = (await db.execute(incident_query)).scalars().all()
        incident_total_query = (
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
        if vendor_scope_filter is not None:
            incident_total_query = incident_total_query.where(vendor_scope_filter)
        incident_total = (await db.execute(incident_total_query)).scalar() or 0

    return {
        "critical_risks": [
            {
                "id": r.id,
                "risk_id_code": r.risk_id_code,
                "name": r.name,
                "process": r.process,
                "description": r.description[:300] if r.description else "",  # Increased limit for dashboard
                "net_score": r.net_score,
                "is_priority": r.is_priority,
                "owner_name": r.owner.name if r.owner else "Unassigned",
                "department_name": r.department.name if r.department else "Unassigned",
            }
            for r in critical_risks.scalars()
        ],
        "recent_activity": [
            {
                "id": a.id,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_name": a.entity_name,
                "description": a.description,
                "created_at": a.created_at.isoformat(),
            }
            for a in recent_activity.scalars()
        ],
        "department_exposure": [
            {
                "id": d.id,
                "name": d.name,
                "total_exposure": d.total_exposure,
                "risk_count": d.risk_count,
            }
            for d in dept_exposure
        ],
        "critical_vendors": [
            {
                "id": v.id,
                "name": v.name,
                "process": v.process,
                "subprocess": v.subprocess,
                "risk_score_1_5": v.risk_score_1_5,
                "supports_important_core_insurance_function": bool(v.supports_important_core_insurance_function),
                "dora_relevant": bool(v.dora_relevant),
                "is_significant_vendor": bool(v.is_significant_vendor),
                "next_reassessment_due_at": v.next_reassessment_due_at.isoformat()
                if v.next_reassessment_due_at
                else None,
                "outsourcing_owner_name": v.outsourcing_owner.name if v.outsourcing_owner else "Unassigned",
                "department_name": v.department.name if v.department else "Unassigned",
            }
            for v in critical_vendors
        ],
        "vendor_alerts": {
            "overdue_reassessments": {
                "count": overdue_total,
                "items": [
                    {
                        "id": v.id,
                        "name": v.name,
                        "next_reassessment_due_at": v.next_reassessment_due_at.isoformat()
                        if v.next_reassessment_due_at
                        else None,
                        "department_name": v.department.name if v.department else "Unassigned",
                    }
                    for v in overdue_vendors
                ],
            },
            "sla_breaches": {
                "count": sla_breach_total,
                "items": [
                    {
                        "vendor_id": s.vendor_id,
                        "vendor_name": s.vendor.name if s.vendor else "",
                        "sla_id": s.id,
                        "metric_name": s.metric_name,
                        "breach_status": s.breach_status,
                        "last_reported_at": s.last_reported_at.isoformat() if s.last_reported_at else None,
                        "department_name": s.vendor.department.name
                        if s.vendor and s.vendor.department
                        else "Unassigned",
                    }
                    for s in breached_slas
                ],
            },
            "major_incidents_30d": {
                "count": incident_total,
                "items": [
                    {
                        "vendor_id": i.vendor_id,
                        "vendor_name": i.vendor.name if i.vendor else "",
                        "incident_id": i.id,
                        "incident_type": i.incident_type.value
                        if hasattr(i.incident_type, "value")
                        else str(i.incident_type),
                        "summary": i.summary,
                        "occurred_at": (i.occurred_at or i.created_at).isoformat()
                        if (i.occurred_at or i.created_at)
                        else None,
                        "department_name": i.vendor.department.name
                        if i.vendor and i.vendor.department
                        else "Unassigned",
                    }
                    for i in major_incidents
                ],
            },
        },
    }
