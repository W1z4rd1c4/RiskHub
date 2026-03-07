from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.role import RoleType
from app.models.vendor_assessment import (
    VendorAssessment,
    VendorAssessmentScope,
    VendorAssessmentStatus,
)
from app.services.outbox_service import OutboxService
from app.services.vendor_reassessment_service import VendorReassessmentService

logger = logging.getLogger(__name__)


class VendorAssessmentService:
    TEMPLATE_KEY_STANDARD = "standard"
    TEMPLATE_KEY_DORA = "dora"
    TEMPLATE_VERSION_V1 = "v1"

    @staticmethod
    def scope_for_vendor(vendor: Vendor) -> VendorAssessmentScope:
        return VendorAssessmentScope.dora if vendor.dora_relevant else VendorAssessmentScope.standard

    @staticmethod
    def template_key_for_scope(scope: VendorAssessmentScope) -> str:
        return (
            VendorAssessmentService.TEMPLATE_KEY_DORA
            if scope == VendorAssessmentScope.dora
            else VendorAssessmentService.TEMPLATE_KEY_STANDARD
        )

    @staticmethod
    async def _load_vendor(db: AsyncSession, vendor_id: int) -> Vendor:
        result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
        vendor = result.scalar_one_or_none()
        if not vendor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        return vendor

    @staticmethod
    async def _load_assessment(db: AsyncSession, assessment_id: int) -> VendorAssessment:
        result = await db.execute(
            select(VendorAssessment)
            .options(selectinload(VendorAssessment.vendor))
            .where(VendorAssessment.id == assessment_id)
        )
        assessment = result.scalar_one_or_none()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor assessment not found")
        return assessment

    @staticmethod
    async def create_draft(db: AsyncSession, *, vendor_id: int, actor: User) -> VendorAssessment:
        vendor = await VendorAssessmentService._load_vendor(db, vendor_id)
        scope = VendorAssessmentService.scope_for_vendor(vendor)
        template_key = VendorAssessmentService.template_key_for_scope(scope)

        assessment = VendorAssessment(
            vendor_id=vendor.id,
            status=VendorAssessmentStatus.draft,
            template_key=template_key,
            template_version=VendorAssessmentService.TEMPLATE_VERSION_V1,
            scope=scope,
            answers_json={},
            evidence_reference=None,
        )
        db.add(assessment)
        await db.flush()

        await log_activity(
            db,
            entity_type=ActivityEntityType.VENDOR_ASSESSMENT,
            entity_id=assessment.id,
            entity_name=f"{vendor.name} assessment",
            action=ActivityAction.CREATE,
            actor=actor,
            department_id=vendor.department_id,
            description=f"Created vendor assessment draft for {vendor.name}",
        )

        return assessment

    @staticmethod
    async def update_draft(
        db: AsyncSession,
        *,
        assessment_id: int,
        answers_json: dict | None,
        evidence_reference: str | None,
        actor: User,
    ) -> VendorAssessment:
        assessment = await VendorAssessmentService._load_assessment(db, assessment_id)
        if assessment.status != VendorAssessmentStatus.draft:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assessment is not editable")

        if answers_json is not None:
            assessment.answers_json = answers_json
        if evidence_reference is not None:
            assessment.evidence_reference = evidence_reference

        await log_activity(
            db,
            entity_type=ActivityEntityType.VENDOR_ASSESSMENT,
            entity_id=assessment.id,
            entity_name=f"{assessment.vendor.name} assessment",
            action=ActivityAction.UPDATE,
            actor=actor,
            department_id=assessment.vendor.department_id,
            description=f"Updated vendor assessment draft for {assessment.vendor.name}",
        )

        return assessment

    @staticmethod
    async def submit(db: AsyncSession, *, assessment_id: int, actor: User) -> VendorAssessment:
        assessment = await VendorAssessmentService._load_assessment(db, assessment_id)
        if assessment.status != VendorAssessmentStatus.draft:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft assessments can be submitted"
            )

        old_status = assessment.status
        assessment.status = VendorAssessmentStatus.submitted
        assessment.submitted_at = datetime.now(UTC)
        assessment.submitted_by_user_id = actor.id

        await log_activity(
            db,
            entity_type=ActivityEntityType.VENDOR_ASSESSMENT,
            entity_id=assessment.id,
            entity_name=f"{assessment.vendor.name} assessment",
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=assessment.vendor.department_id,
            changes={"status": {"old": old_status.value, "new": assessment.status.value}},
            description=f"Submitted vendor assessment for {assessment.vendor.name}",
        )

        await OutboxService.enqueue(
            db,
            event_type="vendor_assessment.submitted",
            aggregate_type="vendor_assessment",
            aggregate_id=assessment.id,
            idempotency_key=f"vendor_assessment:{assessment.id}:submitted",
            payload={
                "assessment_id": assessment.id,
                "actor_user_id": actor.id,
            },
        )
        return assessment

    @staticmethod
    async def review(db: AsyncSession, *, assessment_id: int, actor: User) -> VendorAssessment:
        assessment = await VendorAssessmentService._load_assessment(db, assessment_id)
        if assessment.status != VendorAssessmentStatus.submitted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assessment is not ready for review")

        old_status = assessment.status
        assessment.status = VendorAssessmentStatus.in_review
        assessment.reviewed_at = datetime.now(UTC)
        assessment.reviewed_by_user_id = actor.id

        await log_activity(
            db,
            entity_type=ActivityEntityType.VENDOR_ASSESSMENT,
            entity_id=assessment.id,
            entity_name=f"{assessment.vendor.name} assessment",
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=assessment.vendor.department_id,
            changes={"status": {"old": old_status.value, "new": assessment.status.value}},
            description=f"Reviewed vendor assessment for {assessment.vendor.name}",
        )
        return assessment

    @staticmethod
    async def committee_recommend(
        db: AsyncSession,
        *,
        assessment_id: int,
        recommendation: str,
        conditions_text: str | None,
        actor: User,
    ) -> VendorAssessment:
        assessment = await VendorAssessmentService._load_assessment(db, assessment_id)
        if assessment.status != VendorAssessmentStatus.in_review:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assessment must be in_review before committee recommendation",
            )

        old_status = assessment.status
        assessment.status = VendorAssessmentStatus.committee_recommended
        assessment.committee_recommendation = recommendation  # validated via model enum
        assessment.conditions_text = conditions_text

        await log_activity(
            db,
            entity_type=ActivityEntityType.VENDOR_ASSESSMENT,
            entity_id=assessment.id,
            entity_name=f"{assessment.vendor.name} assessment",
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=assessment.vendor.department_id,
            changes={"status": {"old": old_status.value, "new": assessment.status.value}},
            description=f"Recorded committee recommendation for vendor assessment ({assessment.vendor.name})",
        )

        await OutboxService.enqueue(
            db,
            event_type="vendor_assessment.committee_recommended",
            aggregate_type="vendor_assessment",
            aggregate_id=assessment.id,
            idempotency_key=f"vendor_assessment:{assessment.id}:committee_recommended",
            payload={
                "assessment_id": assessment.id,
                "actor_user_id": actor.id,
            },
        )
        return assessment

    @staticmethod
    async def decide(
        db: AsyncSession, *, assessment_id: int, decision: VendorAssessmentStatus, actor: User
    ) -> VendorAssessment:
        assessment = await VendorAssessmentService._load_assessment(db, assessment_id)
        if assessment.status != VendorAssessmentStatus.committee_recommended:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assessment is not ready for decision")
        if decision not in (VendorAssessmentStatus.approved, VendorAssessmentStatus.rejected):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be approved or rejected")

        old_status = assessment.status
        assessment.status = decision
        assessment.decision_at = datetime.now(UTC)
        assessment.decided_by_user_id = actor.id

        vendor = assessment.vendor
        # Phase 18-04: schedule next reassessment after final decision
        vendor.last_decided_at = assessment.decision_at
        if assessment.submitted_at:
            vendor.last_assessed_at = assessment.submitted_at
        cadence = VendorReassessmentService.default_cadence_months(vendor)
        vendor.reassessment_cadence_months = cadence
        vendor.next_reassessment_due_at = VendorReassessmentService.compute_next_due(
            base=assessment.decision_at,
            cadence_months=cadence,
        )
        vendor.reassessment_triggered_reason = None
        vendor.reassessment_triggered_at = None

        await log_activity(
            db,
            entity_type=ActivityEntityType.VENDOR_ASSESSMENT,
            entity_id=assessment.id,
            entity_name=f"{vendor.name} assessment",
            action=ActivityAction.STATUS_CHANGE,
            actor=actor,
            department_id=vendor.department_id,
            changes={"status": {"old": old_status.value, "new": assessment.status.value}},
            description=f"Decision recorded for vendor assessment ({vendor.name})",
        )

        await OutboxService.enqueue(
            db,
            event_type="vendor_assessment.decided",
            aggregate_type="vendor_assessment",
            aggregate_id=assessment.id,
            idempotency_key=f"vendor_assessment:{assessment.id}:decided:{decision.value}",
            payload={
                "assessment_id": assessment.id,
                "actor_user_id": actor.id,
            },
        )
        return assessment
