from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.activity_logger import log_activity
from app.i18n import t
from app.models import User, Vendor
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.notification import NotificationType
from app.models.role import Role, RolePermission, RoleType
from app.models.vendor_assessment import (
    VendorAssessment,
    VendorAssessmentScope,
    VendorAssessmentStatus,
)
from app.services.notification_service import NotificationService
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
        return VendorAssessmentService.TEMPLATE_KEY_DORA if scope == VendorAssessmentScope.dora else VendorAssessmentService.TEMPLATE_KEY_STANDARD

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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft assessments can be submitted")

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

        await VendorAssessmentService._notify_submitted(db, assessment=assessment, actor=actor)
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

        await VendorAssessmentService._notify_committee_recommended(db, assessment=assessment, actor=actor)
        return assessment

    @staticmethod
    async def decide(db: AsyncSession, *, assessment_id: int, decision: VendorAssessmentStatus, actor: User) -> VendorAssessment:
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

        await VendorAssessmentService._notify_decided(db, assessment=assessment, actor=actor)
        return assessment

    @staticmethod
    async def _users_by_roles(db: AsyncSession, roles: set[RoleType]) -> list[User]:
        role_names = [r.value for r in roles]
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        stmt = (
            select(User)
            .join(Role, User.role_id == Role.id)
            .options(permission_load)
            .where(User.is_active.is_(True))
            .where(Role.name.in_(role_names))
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def _notify_submitted(db: AsyncSession, *, assessment: VendorAssessment, actor: User) -> None:
        recipients = await VendorAssessmentService._users_by_roles(
            db, roles={RoleType.RISK_MANAGER, RoleType.COMPLIANCE, RoleType.CRO}
        )
        vendor = assessment.vendor
        for user in recipients:
            if user.id == actor.id:
                continue
            locale = getattr(user, "preferred_language", None) or "en"
            await NotificationService.create_vendor_notification_if_visible(
                db=db,
                user=user,
                vendor_id=vendor.id,
                notification_type=NotificationType.VENDOR_ASSESSMENT_SUBMITTED,
                title=t("notifications.vendor_assessment_submitted_title", locale=locale),
                message=t(
                    "notifications.vendor_assessment_submitted_message",
                    locale=locale,
                    vendor_name=vendor.name,
                    actor_name=actor.name,
                ),
            )

    @staticmethod
    async def _notify_committee_recommended(db: AsyncSession, *, assessment: VendorAssessment, actor: User) -> None:
        recipients = await VendorAssessmentService._users_by_roles(db, roles={RoleType.CRO})
        vendor = assessment.vendor
        for user in recipients:
            if user.id == actor.id:
                continue
            locale = getattr(user, "preferred_language", None) or "en"
            await NotificationService.create_vendor_notification_if_visible(
                db=db,
                user=user,
                vendor_id=vendor.id,
                notification_type=NotificationType.VENDOR_ASSESSMENT_COMMITTEE_RECOMMENDED,
                title=t("notifications.vendor_assessment_committee_recommended_title", locale=locale),
                message=t(
                    "notifications.vendor_assessment_committee_recommended_message",
                    locale=locale,
                    vendor_name=vendor.name,
                ),
            )

    @staticmethod
    async def _notify_decided(db: AsyncSession, *, assessment: VendorAssessment, actor: User) -> None:
        vendor = assessment.vendor
        owner_id = vendor.outsourcing_owner_user_id
        if not owner_id or owner_id == actor.id:
            return
        permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        owner_result = await db.execute(select(User).options(permission_load).where(User.id == owner_id))
        owner = owner_result.scalar_one_or_none()
        if not owner:
            return
        locale = getattr(owner, "preferred_language", None) or "en"
        await NotificationService.create_vendor_notification_if_visible(
            db=db,
            user=owner,
            vendor_id=vendor.id,
            notification_type=NotificationType.VENDOR_ASSESSMENT_DECIDED,
            title=t("notifications.vendor_assessment_decided_title", locale=locale),
            message=t(
                "notifications.vendor_assessment_decided_message",
                locale=locale,
                vendor_name=vendor.name,
                decision=assessment.status.value,
            ),
        )
