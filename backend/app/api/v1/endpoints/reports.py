"""
Report generation endpoints for PDF and Excel exports.
Secured with department scoping for RBAC compliance.

Patterns used:
- Streaming helpers: _stream_pdf(), _stream_excel() for consistent response formatting
- Query builders: Per-entity functions for explicit, auditable queries
- Empty scoping: Unified handling of users with no accessible departments
"""
from datetime import datetime
from typing import Optional, Callable, Any

from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select
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


# =============================================================================
# Streaming Response Helpers
# =============================================================================

_PDF_MEDIA_TYPE = "application/pdf"
_EXCEL_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _get_filename(base: str, ext: str) -> str:
    """Generate a filename with current date."""
    date_str = datetime.now().strftime('%Y-%m-%d')
    return f"{base}-{date_str}.{ext}"


def _stream_pdf(filename_base: str, content_bytes: bytes) -> StreamingResponse:
    """Create a PDF streaming response with correct headers."""
    return StreamingResponse(
        BytesIO(content_bytes),
        media_type=_PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{_get_filename(filename_base, "pdf")}"'}
    )


def _stream_excel(filename_base: str, content_bytes: bytes) -> StreamingResponse:
    """Create an Excel streaming response with correct headers."""
    return StreamingResponse(
        BytesIO(content_bytes),
        media_type=_EXCEL_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{_get_filename(filename_base, "xlsx")}"'}
    )


# =============================================================================
# Department Scoping
# =============================================================================

def _validate_department_access(department_id: Optional[int], dept_ids: Optional[list[int]]) -> None:
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


def _user_has_no_departments(dept_ids: Optional[list[int]]) -> bool:
    """Check if user is non-privileged and has no accessible departments."""
    return dept_ids is not None and len(dept_ids) == 0


# =============================================================================
# Query Builders (per-entity, explicit, no generics)
# =============================================================================

def _controls_report_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    status_filter: Optional[str]
) -> Select:
    """Build controls query with RBAC scoping and filters applied."""
    query = select(Control).options(selectinload(Control.department))
    
    # Department scoping for non-privileged
    if dept_ids is not None:
        query = query.where(Control.department_id.in_(dept_ids))
    
    # User-specified filters
    if department_id:
        query = query.where(Control.department_id == department_id)
    if status_filter:
        query = query.where(Control.status == status_filter)
    
    return query.order_by(Control.name)


def _risks_report_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    status_filter: Optional[str]
) -> Select:
    """Build risks query with RBAC scoping and filters applied."""
    query = select(Risk).options(selectinload(Risk.department))
    
    # Department scoping for non-privileged
    if dept_ids is not None:
        query = query.where(Risk.department_id.in_(dept_ids))
    
    # User-specified filters
    if department_id:
        query = query.where(Risk.department_id == department_id)
    if status_filter:
        query = query.where(Risk.status == status_filter)
    
    return query.order_by(Risk.process)


def _audit_trail_query(
    dept_ids: Optional[list[int]],
    department_id: Optional[int],
    result_filter: Optional[str],
    control_id: Optional[int],
    from_date: Optional[datetime],
    to_date: Optional[datetime]
) -> Select:
    """Build audit trail (ControlExecution) query with RBAC scoping and filters."""
    query = (
        select(ControlExecution)
        .join(Control, ControlExecution.control_id == Control.id)
        .options(
            selectinload(ControlExecution.control).selectinload(Control.department),
            selectinload(ControlExecution.control).selectinload(Control.risk_links).selectinload(ControlRiskLink.risk),
            selectinload(ControlExecution.executed_by)
        )
    )
    
    # Department scoping for non-privileged
    if dept_ids is not None:
        query = query.where(Control.department_id.in_(dept_ids))
    
    # User-specified filters
    if department_id:
        query = query.where(Control.department_id == department_id)
    if result_filter:
        query = query.where(ControlExecution.result == result_filter)
    if control_id:
        query = query.where(ControlExecution.control_id == control_id)
    if from_date:
        query = query.where(ControlExecution.executed_at >= from_date)
    if to_date:
        query = query.where(ControlExecution.executed_at <= to_date)
    
    return query.order_by(ControlExecution.executed_at.desc())


# =============================================================================
# Report Endpoints
# =============================================================================

@router.get("/controls/pdf")
async def download_controls_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download controls report as PDF. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    
    if _user_has_no_departments(dept_ids):
        return _stream_pdf("controls", generate_controls_pdf([]))
    
    query = _controls_report_query(dept_ids, department_id, status_filter)
    result = await db.execute(query)
    controls = result.scalars().all()
    
    return _stream_pdf("controls", generate_controls_pdf(list(controls)))


@router.get("/controls/excel")
async def download_controls_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download controls report as Excel. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    
    if _user_has_no_departments(dept_ids):
        return _stream_excel("controls", generate_controls_excel([]))
    
    query = _controls_report_query(dept_ids, department_id, status_filter)
    result = await db.execute(query)
    controls = result.scalars().all()
    
    return _stream_excel("controls", generate_controls_excel(list(controls)))


@router.get("/risks/pdf")
async def download_risks_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download risks report as PDF. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    
    if _user_has_no_departments(dept_ids):
        return _stream_pdf("risks", generate_risks_pdf([]))
    
    query = _risks_report_query(dept_ids, department_id, status_filter)
    result = await db.execute(query)
    risks = result.scalars().all()
    
    return _stream_pdf("risks", generate_risks_pdf(list(risks)))


@router.get("/risks/excel")
async def download_risks_excel(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status_filter: Optional[str] = Query(None, description="Filter by status", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download risks report as Excel. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    
    if _user_has_no_departments(dept_ids):
        return _stream_excel("risks", generate_risks_excel([]))
    
    query = _risks_report_query(dept_ids, department_id, status_filter)
    result = await db.execute(query)
    risks = result.scalars().all()
    
    return _stream_excel("risks", generate_risks_excel(list(risks)))


@router.get("/summary/pdf")
async def download_summary_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports", "read"))
):
    """Download dashboard summary as PDF. Scoped to user's accessible departments."""
    dept_ids = get_user_department_ids(current_user)
    _validate_department_access(department_id, dept_ids)
    
    if _user_has_no_departments(dept_ids):
        empty_summary = {
            'total_controls': 0,
            'total_risks': 0,
            'critical_risks_count': 0,
            'average_net_risk_score': 0,
            'controls_by_status': {}
        }
        return _stream_pdf("dashboard-summary", generate_dashboard_summary_pdf(empty_summary))
    
    # Build queries for controls and risks
    controls_query = select(Control)
    risks_query = select(Risk)
    
    if dept_ids is not None:
        controls_query = controls_query.where(Control.department_id.in_(dept_ids))
        risks_query = risks_query.where(Risk.department_id.in_(dept_ids))
    
    if department_id:
        controls_query = controls_query.where(Control.department_id == department_id)
        risks_query = risks_query.where(Risk.department_id == department_id)
    
    controls_result = await db.execute(controls_query)
    controls = controls_result.scalars().all()
    
    risks_result = await db.execute(risks_query)
    risks = risks_result.scalars().all()
    
    # Calculate metrics
    total_controls = len(controls)
    total_risks = len(risks)
    critical_risks = sum(1 for r in risks if r.net_probability * r.net_impact >= 16)
    avg_net_score = sum(r.net_probability * r.net_impact for r in risks) / len(risks) if risks else 0
    
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
    
    return _stream_pdf("dashboard-summary", generate_dashboard_summary_pdf(summary))


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
    _validate_department_access(department_id, dept_ids)
    
    if _user_has_no_departments(dept_ids):
        return _stream_pdf("audit-trail", generate_audit_trail_pdf([]))
    
    query = _audit_trail_query(dept_ids, department_id, result, control_id, from_date, to_date)
    result_set = await db.execute(query)
    executions = result_set.scalars().all()
    
    return _stream_pdf("audit-trail", generate_audit_trail_pdf(list(executions)))


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
    _validate_department_access(department_id, dept_ids)
    
    if _user_has_no_departments(dept_ids):
        return _stream_excel("audit-trail", generate_audit_trail_excel([]))
    
    query = _audit_trail_query(dept_ids, department_id, result, control_id, from_date, to_date)
    result_set = await db.execute(query)
    executions = result_set.scalars().all()
    
    return _stream_excel("audit-trail", generate_audit_trail_excel(list(executions)))

