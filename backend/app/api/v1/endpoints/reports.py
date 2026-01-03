"""
Report generation endpoints for PDF and Excel exports.
Secured with department scoping for RBAC compliance.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from io import BytesIO

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.control import Control
from app.models.control_execution import ControlExecution
from app.models.risk import Risk, ControlRiskLink
from app.models import User
from app.core.permissions import get_user_department_ids
from app.core.security import require_permission
from app.services.report_service import (
    generate_controls_pdf,
    generate_controls_excel,
    generate_risks_pdf,
    generate_risks_excel,
    generate_dashboard_summary_pdf,
    generate_audit_trail_pdf,
    generate_audit_trail_excel
)

router = APIRouter()


def get_filename(base: str, ext: str) -> str:
    """Generate a filename with current date."""
    date_str = datetime.now().strftime('%Y-%m-%d')
    return f"{base}-{date_str}.{ext}"


def validate_department_access(department_id: Optional[int], dept_ids: Optional[list[int]]) -> None:
    """
    Validate that requested department is within user's accessible departments.
    
    Args:
        department_id: Requested department filter
        dept_ids: User's accessible department IDs (None = privileged/all access)
        
    Raises:
        HTTPException 403 if user cannot access the requested department
    """
    if dept_ids is None:  # Privileged user - can access all
        return
    if department_id and department_id not in dept_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this department's reports"
        )


@router.get("/controls/pdf")
async def download_controls_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download controls report as PDF. Scoped to user's accessible departments."""
    # Get user's department scope
    dept_ids = get_user_department_ids(current_user)
    
    # Validate requested department filter
    validate_department_access(department_id, dept_ids)
    
    query = select(Control).options(selectinload(Control.department))
    
    # Apply department scoping
    if dept_ids is not None:
        if not dept_ids:
            # User has no departments - return empty report
            return StreamingResponse(
                BytesIO(generate_controls_pdf([])),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{get_filename("controls", "pdf")}"'}
            )
        query = query.where(Control.department_id.in_(dept_ids))
    
    # Additional user-specified filters
    if department_id:
        query = query.where(Control.department_id == department_id)
    if status_filter:
        query = query.where(Control.status == status_filter)
    
    query = query.order_by(Control.name)
    
    result = await db.execute(query)
    controls = result.scalars().all()
    
    pdf_bytes = generate_controls_pdf(list(controls))
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{get_filename("controls", "pdf")}"'
        }
    )


@router.get("/controls/excel")
async def download_controls_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download controls report as Excel. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    validate_department_access(department_id, dept_ids)
    
    query = select(Control).options(selectinload(Control.department))
    
    if dept_ids is not None:
        if not dept_ids:
            return StreamingResponse(
                BytesIO(generate_controls_excel([])),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{get_filename("controls", "xlsx")}"'}
            )
        query = query.where(Control.department_id.in_(dept_ids))
    
    if department_id:
        query = query.where(Control.department_id == department_id)
    if status_filter:
        query = query.where(Control.status == status_filter)
    
    query = query.order_by(Control.name)
    
    result = await db.execute(query)
    controls = result.scalars().all()
    
    excel_bytes = generate_controls_excel(list(controls))
    
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{get_filename("controls", "xlsx")}"'
        }
    )


@router.get("/risks/pdf")
async def download_risks_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download risks report as PDF. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    validate_department_access(department_id, dept_ids)
    
    query = select(Risk).options(selectinload(Risk.department))
    
    if dept_ids is not None:
        if not dept_ids:
            return StreamingResponse(
                BytesIO(generate_risks_pdf([])),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{get_filename("risks", "pdf")}"'}
            )
        query = query.where(Risk.department_id.in_(dept_ids))
    
    if department_id:
        query = query.where(Risk.department_id == department_id)
    if status_filter:
        query = query.where(Risk.status == status_filter)
    
    query = query.order_by(Risk.process)
    
    result = await db.execute(query)
    risks = result.scalars().all()
    
    pdf_bytes = generate_risks_pdf(list(risks))
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{get_filename("risks", "pdf")}"'
        }
    )


@router.get("/risks/excel")
async def download_risks_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download risks report as Excel. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    validate_department_access(department_id, dept_ids)
    
    query = select(Risk).options(selectinload(Risk.department))
    
    if dept_ids is not None:
        if not dept_ids:
            return StreamingResponse(
                BytesIO(generate_risks_excel([])),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{get_filename("risks", "xlsx")}"'}
            )
        query = query.where(Risk.department_id.in_(dept_ids))
    
    if department_id:
        query = query.where(Risk.department_id == department_id)
    if status_filter:
        query = query.where(Risk.status == status_filter)
    
    query = query.order_by(Risk.process)
    
    result = await db.execute(query)
    risks = result.scalars().all()
    
    excel_bytes = generate_risks_excel(list(risks))
    
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{get_filename("risks", "xlsx")}"'
        }
    )


@router.get("/summary/pdf")
async def download_summary_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download dashboard summary as PDF. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    validate_department_access(department_id, dept_ids)
    
    # Build queries with department scoping
    controls_query = select(Control)
    risks_query = select(Risk)
    
    # Apply department scoping for non-privileged users
    if dept_ids is not None:
        if not dept_ids:
            # Empty summary for users with no department
            summary = {
                'total_controls': 0,
                'total_risks': 0,
                'critical_risks_count': 0,
                'average_net_risk_score': 0,
                'controls_by_status': {}
            }
            return StreamingResponse(
                BytesIO(generate_dashboard_summary_pdf(summary)),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{get_filename("dashboard-summary", "pdf")}"'}
            )
        controls_query = controls_query.where(Control.department_id.in_(dept_ids))
        risks_query = risks_query.where(Risk.department_id.in_(dept_ids))
    
    # User-specified department filter (must be within scope)
    if department_id:
        controls_query = controls_query.where(Control.department_id == department_id)
        risks_query = risks_query.where(Risk.department_id == department_id)
    
    controls_result = await db.execute(controls_query)
    controls = controls_result.scalars().all()
    
    risks_result = await db.execute(risks_query)
    risks = risks_result.scalars().all()
    
    # Calculate summary metrics
    total_controls = len(controls)
    total_risks = len(risks)
    critical_risks = sum(1 for r in risks if r.net_probability * r.net_impact >= 16)
    avg_net_score = (
        sum(r.net_probability * r.net_impact for r in risks) / len(risks)
        if risks else 0
    )
    
    # Controls by status
    controls_by_status = {}
    for c in controls:
        ctrl_status = c.status or 'unknown'
        controls_by_status[ctrl_status] = controls_by_status.get(ctrl_status, 0) + 1
    
    summary = {
        'total_controls': total_controls,
        'total_risks': total_risks,
        'critical_risks_count': critical_risks,
        'average_net_risk_score': avg_net_score,
        'controls_by_status': controls_by_status
    }
    
    pdf_bytes = generate_dashboard_summary_pdf(summary)
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{get_filename("dashboard-summary", "pdf")}"'
        }
    )


@router.get("/audit-trail/pdf")
async def download_audit_trail_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    result: Optional[str] = Query(None, description="Filter by result (passed/failed/warning)"),
    control_id: Optional[int] = Query(None, description="Filter by control"),
    from_date: Optional[datetime] = Query(None, description="Filter from date"),
    to_date: Optional[datetime] = Query(None, description="Filter to date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download audit trail (control executions) as PDF. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    validate_department_access(department_id, dept_ids)
    
    # Build query with eager loading
    query = (
        select(ControlExecution)
        .join(Control, ControlExecution.control_id == Control.id)
        .options(
            selectinload(ControlExecution.control).selectinload(Control.department),
            selectinload(ControlExecution.control).selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            selectinload(ControlExecution.executed_by)
        )
    )
    
    # Department scoping
    if dept_ids is not None:
        if not dept_ids:
            return StreamingResponse(
                BytesIO(generate_audit_trail_pdf([])),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{get_filename("audit-trail", "pdf")}"'}
            )
        query = query.where(Control.department_id.in_(dept_ids))
    
    # Filters
    if department_id:
        query = query.where(Control.department_id == department_id)
    if result:
        query = query.where(ControlExecution.result == result)
    if control_id:
        query = query.where(ControlExecution.control_id == control_id)
    if from_date:
        query = query.where(ControlExecution.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecution.executed_at <= to_date)
    
    query = query.order_by(ControlExecution.executed_at.desc())
    
    result_set = await db.execute(query)
    executions = result_set.scalars().all()
    
    pdf_bytes = generate_audit_trail_pdf(list(executions))
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{get_filename("audit-trail", "pdf")}"'
        }
    )


@router.get("/audit-trail/excel")
async def download_audit_trail_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    result: Optional[str] = Query(None, description="Filter by result (passed/failed/warning)"),
    control_id: Optional[int] = Query(None, description="Filter by control"),
    from_date: Optional[datetime] = Query(None, description="Filter from date"),
    to_date: Optional[datetime] = Query(None, description="Filter to date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download audit trail (control executions) as Excel. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    validate_department_access(department_id, dept_ids)
    
    # Build query with eager loading
    query = (
        select(ControlExecution)
        .join(Control, ControlExecution.control_id == Control.id)
        .options(
            selectinload(ControlExecution.control).selectinload(Control.department),
            selectinload(ControlExecution.control).selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            selectinload(ControlExecution.executed_by)
        )
    )
    
    # Department scoping
    if dept_ids is not None:
        if not dept_ids:
            return StreamingResponse(
                BytesIO(generate_audit_trail_excel([])),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{get_filename("audit-trail", "xlsx")}"'}
            )
        query = query.where(Control.department_id.in_(dept_ids))
    
    # Filters
    if department_id:
        query = query.where(Control.department_id == department_id)
    if result:
        query = query.where(ControlExecution.result == result)
    if control_id:
        query = query.where(ControlExecution.control_id == control_id)
    if from_date:
        query = query.where(ControlExecution.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecution.executed_at <= to_date)
    
    query = query.order_by(ControlExecution.executed_at.desc())
    
    result_set = await db.execute(query)
    executions = result_set.scalars().all()
    
    excel_bytes = generate_audit_trail_excel(list(executions))
    
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{get_filename("audit-trail", "xlsx")}"'
        }
    )

