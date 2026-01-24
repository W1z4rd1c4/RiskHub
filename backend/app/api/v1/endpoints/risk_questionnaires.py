"""Risk questionnaire API endpoints."""
from datetime import datetime, timedelta, UTC

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.db.session import get_db
from app.models import Risk, User, RiskQuestionnaire
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.schemas.risk_questionnaire import (
    RiskQuestionnaireListItemRead,
    RiskQuestionnaireRead,
    RiskQuestionnaireDraftUpdate,
    RiskQuestionnaireSubmit,
)
from app.core.permissions import check_department_access, get_user_department_ids
from app.core.activity_logger import log_activity
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.notification import NotificationType
from app.services.notification_service import NotificationService
from app.i18n import t
from app.services.risk_questionnaire_service import (
    QUESTIONNAIRE_TEMPLATE_KEY,
    QUESTIONNAIRE_TEMPLATE_VERSION,
    can_send_questionnaire,
    can_submit_questionnaire,
    create_questionnaire_instance,
    find_open_questionnaire_for_risk,
    validate_submit_answers_v1,
)

router = APIRouter(prefix="/questionnaires")
risk_router = APIRouter(prefix="/risks")


async def _get_risk_for_read(db: AsyncSession, current_user: User, risk_id: int) -> Risk:
    from app.core.permissions import is_risk_kri_reporting_owner, is_risk_control_owner

    result = await db.execute(select(Risk).where(Risk.id == risk_id))
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")

    if await is_risk_kri_reporting_owner(db, current_user.id, risk_id):
        return risk
    if await is_risk_control_owner(db, current_user.id, risk_id):
        return risk

    try:
        check_department_access(risk.department_id, current_user)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Risk not found")

    return risk


async def _get_questionnaire_for_read(
    db: AsyncSession,
    current_user: User,
    questionnaire_id: int,
) -> RiskQuestionnaire:
    result = await db.execute(
        select(RiskQuestionnaire)
        .options(
            selectinload(RiskQuestionnaire.risk),
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.id == questionnaire_id)
    )
    questionnaire = result.scalar_one_or_none()
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")

    await _get_risk_for_read(db, current_user, questionnaire.risk_id)
    return questionnaire


def _serialize_list_item(q: RiskQuestionnaire) -> RiskQuestionnaireListItemRead:
    return RiskQuestionnaireListItemRead(
        id=q.id,
        risk_id=q.risk_id,
        risk_name=getattr(getattr(q, "risk", None), "name", None),
        assigned_to_user_id=q.assigned_to_user_id,
        sent_by_user_id=q.sent_by_user_id,
        status=q.status.value if hasattr(q.status, "value") else q.status,
        template_key=q.template_key,
        template_version=q.template_version,
        sent_at=q.sent_at,
        due_at=q.due_at,
        submitted_at=q.submitted_at,
        submitted_by_user_id=q.submitted_by_user_id,
        assigned_to_user_name=getattr(getattr(q, "assigned_to_user", None), "name", None),
        sent_by_user_name=getattr(getattr(q, "sent_by_user", None), "name", None),
        submitted_by_user_name=getattr(getattr(q, "submitted_by_user", None), "name", None),
    )


def _serialize_read(q: RiskQuestionnaire) -> RiskQuestionnaireRead:
    base = _serialize_list_item(q).model_dump()
    return RiskQuestionnaireRead(**base, answers=q.answers)


@risk_router.get("/{risk_id}/questionnaires", response_model=list[RiskQuestionnaireListItemRead])
async def list_questionnaires_for_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[RiskQuestionnaireListItemRead]:
    await _get_risk_for_read(db, current_user, risk_id)

    result = await db.execute(
        select(RiskQuestionnaire)
        .options(
            selectinload(RiskQuestionnaire.risk),
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.risk_id == risk_id)
        .order_by(desc(RiskQuestionnaire.submitted_at), desc(RiskQuestionnaire.sent_at))
    )
    items = result.scalars().all()
    return [_serialize_list_item(q) for q in items]


@risk_router.post("/{risk_id}/questionnaires/send", response_model=RiskQuestionnaireRead, status_code=201)
async def send_questionnaire_for_risk(
    risk_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RiskQuestionnaireRead:
    if not can_send_questionnaire(current_user):
        raise HTTPException(status_code=403, detail="Only Risk Manager or CRO can send questionnaires")

    risk = await _get_risk_for_read(db, current_user, risk_id)
    if risk.owner_id is None:
        raise HTTPException(status_code=400, detail="Risk owner must be set before sending a questionnaire")

    existing_open = await find_open_questionnaire_for_risk(db, risk_id)
    if existing_open is not None:
        raise HTTPException(status_code=409, detail="An open questionnaire already exists for this risk")

    questionnaire = await create_questionnaire_instance(
        db=db,
        risk=risk,
        assigned_to_user_id=risk.owner_id,
        sent_by_user_id=current_user.id,
        template_key=QUESTIONNAIRE_TEMPLATE_KEY,
        template_version=QUESTIONNAIRE_TEMPLATE_VERSION,
        sent_at=datetime.now(UTC),
        due_at=datetime.now(UTC) + timedelta(days=15),
    )

    # Notify assignee (localized)
    assignee_result = await db.execute(select(User).where(User.id == risk.owner_id))
    assignee = assignee_result.scalar_one_or_none()
    if assignee:
        locale = assignee.preferred_language or "en"
        await NotificationService.create_notification(
            db=db,
            user_id=assignee.id,
            notification_type=NotificationType.QUESTIONNAIRE_SENT,
            title=t("notifications.questionnaire_sent_title", locale=locale),
            message=t(
                "notifications.questionnaire_sent_message",
                locale=locale,
                risk_name=risk.name,
                due_date=questionnaire.due_at.date().isoformat(),
            ),
            resource_type="risk",
            resource_id=risk.id,
        )

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK_QUESTIONNAIRE,
        entity_id=questionnaire.id,
        entity_name=f"{risk.name} questionnaire",
        action=ActivityAction.CREATE,
        actor=current_user,
        department_id=risk.department_id,
        description=f"Sent questionnaire for risk '{risk.name}'",
    )
    await db.commit()
    await db.refresh(questionnaire)

    result = await db.execute(
        select(RiskQuestionnaire)
        .options(
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.id == questionnaire.id)
    )
    questionnaire = result.scalar_one()
    return _serialize_read(questionnaire)


@router.get("/inbox", response_model=list[RiskQuestionnaireListItemRead])
async def get_questionnaire_inbox(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[RiskQuestionnaireListItemRead]:
    open_statuses = {RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress}

    owner_clause = RiskQuestionnaire.assigned_to_user_id == current_user.id

    dept_clause = None
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    if role_name == "department_head" and current_user.department_id is not None:
        dept_clause = Risk.department_id == current_user.department_id

    query = (
        select(RiskQuestionnaire)
        .join(Risk, Risk.id == RiskQuestionnaire.risk_id)
        .options(
            selectinload(RiskQuestionnaire.risk),
            selectinload(RiskQuestionnaire.assigned_to_user),
            selectinload(RiskQuestionnaire.sent_by_user),
            selectinload(RiskQuestionnaire.submitted_by_user),
        )
        .where(RiskQuestionnaire.status.in_(open_statuses))
    )

    if dept_clause is not None:
        query = query.where(or_(owner_clause, dept_clause))
    else:
        query = query.where(owner_clause)

    # Ensure dept scoping for non-privileged users (owners are already scoped by assignment).
    dept_ids = get_user_department_ids(current_user)
    if dept_ids is not None:
        if not dept_ids:
            return []
        query = query.where(or_(owner_clause, Risk.department_id.in_(dept_ids)))

    result = await db.execute(query.order_by(desc(RiskQuestionnaire.due_at)))
    items = result.scalars().all()
    return [_serialize_list_item(q) for q in items]


@router.get("/{questionnaire_id}", response_model=RiskQuestionnaireRead)
async def get_questionnaire(
    questionnaire_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RiskQuestionnaireRead:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)

    risk = questionnaire.risk
    if questionnaire.status == RiskQuestionnaireStatus.sent and can_submit_questionnaire(current_user, risk):
        questionnaire.status = RiskQuestionnaireStatus.in_progress
        await db.commit()
        await db.refresh(questionnaire)

    return _serialize_read(questionnaire)


@router.patch("/{questionnaire_id}/draft", response_model=RiskQuestionnaireRead)
async def update_questionnaire_draft(
    questionnaire_id: int,
    payload: RiskQuestionnaireDraftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RiskQuestionnaireRead:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    if not can_submit_questionnaire(current_user, questionnaire.risk):
        raise HTTPException(status_code=403, detail="Not allowed to update this questionnaire")
    if questionnaire.status not in (RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress):
        raise HTTPException(status_code=409, detail="Questionnaire can no longer be edited")

    questionnaire.answers = payload.answers
    questionnaire.status = RiskQuestionnaireStatus.in_progress
    await db.commit()
    await db.refresh(questionnaire)
    return _serialize_read(questionnaire)


@router.post("/{questionnaire_id}/submit", response_model=RiskQuestionnaireRead)
async def submit_questionnaire(
    questionnaire_id: int,
    payload: RiskQuestionnaireSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RiskQuestionnaireRead:
    questionnaire = await _get_questionnaire_for_read(db, current_user, questionnaire_id)
    if not can_submit_questionnaire(current_user, questionnaire.risk):
        raise HTTPException(status_code=403, detail="Not allowed to submit this questionnaire")
    if questionnaire.status not in (RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress):
        raise HTTPException(status_code=409, detail="Questionnaire has already been submitted")

    missing = validate_submit_answers_v1(payload.answers)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Missing required questionnaire answers", "missing": sorted(missing)},
        )

    questionnaire.answers = payload.answers
    old_status = questionnaire.status
    questionnaire.status = RiskQuestionnaireStatus.submitted
    questionnaire.submitted_at = datetime.now(UTC)
    questionnaire.submitted_by_user_id = current_user.id

    # Notify RM/CRO recipients (localized per recipient)
    all_users_result = await db.execute(select(User).options(selectinload(User.role)).where(User.is_active == True))
    users = all_users_result.scalars().all()
    recipients = [
        u for u in users
        if u.role and u.role.name in ("risk_manager", "cro") and u.id != current_user.id
    ]
    for recipient in recipients:
        locale = recipient.preferred_language or "en"
        await NotificationService.create_notification(
            db=db,
            user_id=recipient.id,
            notification_type=NotificationType.QUESTIONNAIRE_SUBMITTED,
            title=t("notifications.questionnaire_submitted_title", locale=locale),
            message=t(
                "notifications.questionnaire_submitted_message",
                locale=locale,
                actor_name=current_user.name,
                risk_name=questionnaire.risk.name if questionnaire.risk else "Risk",
            ),
            resource_type="risk",
            resource_id=questionnaire.risk_id,
        )

    await log_activity(
        db,
        entity_type=ActivityEntityType.RISK_QUESTIONNAIRE,
        entity_id=questionnaire.id,
        entity_name=f"{questionnaire.risk.name if questionnaire.risk else 'Risk'} questionnaire",
        action=ActivityAction.STATUS_CHANGE,
        actor=current_user,
        department_id=questionnaire.risk.department_id if questionnaire.risk else None,
        changes={"status": {"old": old_status.value if hasattr(old_status, "value") else old_status, "new": "submitted"}},
        description=f"Submitted questionnaire for risk '{questionnaire.risk.name if questionnaire.risk else 'Risk'}'",
    )
    await db.commit()
    await db.refresh(questionnaire)
    return _serialize_read(questionnaire)
