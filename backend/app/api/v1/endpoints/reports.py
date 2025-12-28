"""
Report generation endpoints for PDF and Excel exports.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from io import BytesIO

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.control import Control
from app.models.risk import Risk
from app.services.report_service import (
    generate_controls_pdf,
    generate_controls_excel,
    generate_risks_pdf,
    generate_risks_excel,
    generate_dashboard_summary_pdf
)

router = APIRouter()


def get_filename(base: str, ext: str) -> str:
    """Generate a filename with current date."""
    date_str = datetime.now().strftime('%Y-%m-%d')
    return f"{base}-{date_str}.{ext}"


@router.get("/controls/pdf")
async def download_controls_pdf(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    status: Optional[str] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    current_user: "User" = Depends(get_current_user)
):
    """Download controls report as PDF."""
    query = select(Control).options(selectinload(Control.department))
    
    if department_id:
        query = query.where(Control.department_id == department_id)
    if status:
        query = query.where(Control.status == status)
    
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
    status: Optional[str] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    current_user: "User" = Depends(get_current_user)
):
    """Download controls report as Excel."""
    query = select(Control).options(selectinload(Control.department))
    
    if department_id:
        query = query.where(Control.department_id == department_id)
    if status:
        query = query.where(Control.status == status)
    
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
    status: Optional[str] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    current_user: "User" = Depends(get_current_user)
):
    """Download risks report as PDF."""
    query = select(Risk).options(selectinload(Risk.department))
    
    if department_id:
        query = query.where(Risk.department_id == department_id)
    if status:
        query = query.where(Risk.status == status)
    
    query = query.order_by(Risk.name)
    
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
    status: Optional[str] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    current_user: "User" = Depends(get_current_user)
):
    """Download risks report as Excel."""
    query = select(Risk).options(selectinload(Risk.department))
    
    if department_id:
        query = query.where(Risk.department_id == department_id)
    if status:
        query = query.where(Risk.status == status)
    
    query = query.order_by(Risk.name)
    
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
    current_user: "User" = Depends(get_current_user)
):
    """Download dashboard summary as PDF."""
    # Build summary data
    controls_query = select(Control)
    risks_query = select(Risk)
    
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
        status = c.status or 'unknown'
        controls_by_status[status] = controls_by_status.get(status, 0) + 1
    
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
