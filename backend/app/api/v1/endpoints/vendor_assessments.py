from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.permissions import can_read_vendor, is_vendor_owner
from app.core.security import check_permission, require_permission
from app.db.session import get_db
from app.models import User, Vendor
from app.models.role import RoleType
from app.models.vendor_assessment import VendorAssessment, VendorAssessmentStatus
from app.schemas.vendor_assessment import (
    VendorAssessmentCommitteeRecommend,
    VendorAssessmentCreate,
    VendorAssessmentDecide,
    VendorAssessmentDraftUpdate,
    VendorAssessmentRead,
)
from app.services.vendor_assessment_service import VendorAssessmentService

router = APIRouter()


async def _get_vendor_or_404(db: AsyncSession, vendor_id: int, current_user: User) -> Vendor:
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor or not can_read_vendor(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


async def _get_assessment_or_404(db: AsyncSession, assessment_id: int, current_user: User) -> VendorAssessment:
    result = await db.execute(
        select(VendorAssessment)
        .options(selectinload(VendorAssessment.vendor))
        .where(VendorAssessment.id == assessment_id)
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor assessment not found")
    if not can_read_vendor(assessment.vendor, current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor assessment not found")
    return assessment


@router.get("/vendors/{vendor_id}/assessments", response_model=list[VendorAssessmentRead])
async def list_vendor_assessments(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    await _get_vendor_or_404(db, vendor_id, current_user)
    result = await db.execute(
        select(VendorAssessment)
        .where(VendorAssessment.vendor_id == vendor_id)
        .order_by(desc(VendorAssessment.created_at))
    )
    return result.scalars().all()


@router.post("/vendors/{vendor_id}/assessments", response_model=VendorAssessmentRead, status_code=status.HTTP_201_CREATED)
async def create_vendor_assessment(
    vendor_id: int,
    payload: VendorAssessmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    vendor = await _get_vendor_or_404(db, vendor_id, current_user)
    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_vendor_owner(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only outsourcing owner can start assessments")

    assessment = await VendorAssessmentService.create_draft(db, vendor_id=vendor_id, actor=current_user)
    await db.commit()
    await db.refresh(assessment)
    return assessment


@router.get("/vendor-assessments/{assessment_id}", response_model=VendorAssessmentRead)
async def get_vendor_assessment(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
):
    return await _get_assessment_or_404(db, assessment_id, current_user)


@router.patch("/vendor-assessments/{assessment_id}/draft", response_model=VendorAssessmentRead)
async def update_vendor_assessment_draft(
    assessment_id: int,
    payload: VendorAssessmentDraftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")

    assessment = await _get_assessment_or_404(db, assessment_id, current_user)
    vendor = assessment.vendor

    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_vendor_owner(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only outsourcing owner can edit drafts")

    assessment = await VendorAssessmentService.update_draft(
        db,
        assessment_id=assessment.id,
        answers_json=payload.answers_json,
        evidence_reference=payload.evidence_reference,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(assessment)
    return assessment


@router.post("/vendor-assessments/{assessment_id}/submit", response_model=VendorAssessmentRead)
async def submit_vendor_assessment(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    assessment = await _get_assessment_or_404(db, assessment_id, current_user)
    vendor = assessment.vendor

    can_write = check_permission(current_user, "vendors", "write")
    if not can_write and not is_vendor_owner(vendor, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only outsourcing owner can submit assessments")

    assessment = await VendorAssessmentService.submit(db, assessment_id=assessment.id, actor=current_user)
    await db.commit()
    await db.refresh(assessment)
    return assessment


def _require_role(current_user: User, allowed: set[RoleType]) -> None:
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    if not role_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role required")
    if role_name not in {r.value for r in allowed}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role for this action")


@router.post("/vendor-assessments/{assessment_id}/review", response_model=VendorAssessmentRead)
async def review_vendor_assessment(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    _require_role(current_user, {RoleType.RISK_MANAGER, RoleType.COMPLIANCE})
    assessment = await _get_assessment_or_404(db, assessment_id, current_user)

    assessment = await VendorAssessmentService.review(db, assessment_id=assessment.id, actor=current_user)
    await db.commit()
    await db.refresh(assessment)
    return assessment


@router.post("/vendor-assessments/{assessment_id}/committee-recommend", response_model=VendorAssessmentRead)
async def committee_recommend_vendor_assessment(
    assessment_id: int,
    payload: VendorAssessmentCommitteeRecommend,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    _require_role(current_user, {RoleType.RISK_MANAGER, RoleType.COMPLIANCE})
    assessment = await _get_assessment_or_404(db, assessment_id, current_user)

    assessment = await VendorAssessmentService.committee_recommend(
        db,
        assessment_id=assessment.id,
        recommendation=payload.committee_recommendation.value,
        conditions_text=payload.conditions_text,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(assessment)
    return assessment


@router.post("/vendor-assessments/{assessment_id}/decide", response_model=VendorAssessmentRead)
async def decide_vendor_assessment(
    assessment_id: int,
    payload: VendorAssessmentDecide,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not check_permission(current_user, "vendors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied: vendors:read")
    _require_role(current_user, {RoleType.CRO})
    assessment = await _get_assessment_or_404(db, assessment_id, current_user)

    decision_enum = VendorAssessmentStatus(payload.decision.value)
    assessment = await VendorAssessmentService.decide(
        db,
        assessment_id=assessment.id,
        decision=decision_enum,
        actor=current_user,
    )
    await db.commit()
    await db.refresh(assessment)
    return assessment

