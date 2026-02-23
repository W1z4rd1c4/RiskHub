from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.permissions import get_user_department_ids, has_permission
from app.db.session import get_db
from app.models import User

from .committee_helpers import (
    _activity_payload,
    _department_exposure_payload,
    _empty_committee_core,
    _fetch_committee_core,
    _fetch_vendor_sections,
    _risk_payload,
    _vendor_alert_payload,
    _vendor_payload,
)

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
