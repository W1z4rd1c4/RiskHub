"""Risk Hub questionnaire endpoints (CRO-only batch send)."""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.riskhub import get_cro_user
from app.core.activity_logger import log_activity
from app.db.session import get_db
from app.i18n import t
from app.models import Risk, RiskQuestionnaire, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.risk_questionnaire import RiskQuestionnaireStatus
from app.services.outbox_service import OutboxService
from app.services.risk_questionnaire_service import (
    QUESTIONNAIRE_TEMPLATE_KEY,
    QUESTIONNAIRE_TEMPLATE_VERSION,
    create_questionnaire_instance,
)

router = APIRouter(prefix="/riskhub/questionnaires", tags=["riskhub"])


class RiskFilters(BaseModel):
    department_id: int | None = None
    process: str | None = None
    category: str | None = None
    status: str | None = None


class BatchSendRequest(BaseModel):
    select_all: bool
    risk_ids: list[int] | None = None
    filters: RiskFilters | None = None


class BatchSendResponse(BaseModel):
    created_count: int
    skipped_no_owner: list[int]
    skipped_open_exists: list[int]
    errors: list[str]


@router.post("/batch-send", response_model=BatchSendResponse)
async def batch_send_questionnaires(
    payload: BatchSendRequest,
    db: AsyncSession = Depends(get_db),
    cro_user: User = Depends(get_cro_user),
) -> BatchSendResponse:
    if payload.select_all:
        if payload.filters is None:
            raise HTTPException(status_code=400, detail="filters is required when select_all=true")

        query = select(Risk).where(Risk.status != "archived")
        if payload.filters.department_id is not None:
            query = query.where(Risk.department_id == payload.filters.department_id)
        if payload.filters.process:
            query = query.where(Risk.process == payload.filters.process)
        if payload.filters.category:
            query = query.where(Risk.category == payload.filters.category)
        if payload.filters.status:
            query = query.where(Risk.status == payload.filters.status)

        result = await db.execute(query)
        risks = result.scalars().all()
        target_risk_ids = [r.id for r in risks]
    else:
        if not payload.risk_ids:
            raise HTTPException(status_code=400, detail="risk_ids is required when select_all=false")
        target_risk_ids = payload.risk_ids

        result = await db.execute(select(Risk).where(Risk.id.in_(target_risk_ids)))
        risks = result.scalars().all()

    skipped_no_owner: list[int] = []
    skipped_open_exists: list[int] = []
    errors: list[str] = []
    created_count = 0

    open_result = await db.execute(
        select(RiskQuestionnaire.risk_id)
        .where(
            RiskQuestionnaire.risk_id.in_(target_risk_ids),
            RiskQuestionnaire.status.in_([RiskQuestionnaireStatus.sent, RiskQuestionnaireStatus.in_progress]),
        )
        .distinct()
    )
    open_risk_ids = {row[0] for row in open_result.all()}

    now = datetime.now(UTC)
    for risk in risks:
        try:
            if risk.owner_id is None:
                skipped_no_owner.append(risk.id)
                continue
            if risk.id in open_risk_ids:
                skipped_open_exists.append(risk.id)
                continue

            questionnaire = await create_questionnaire_instance(
                db=db,
                risk=risk,
                assigned_to_user_id=risk.owner_id,
                sent_by_user_id=cro_user.id,
                template_key=QUESTIONNAIRE_TEMPLATE_KEY,
                template_version=QUESTIONNAIRE_TEMPLATE_VERSION,
                sent_at=now,
                due_at=now + timedelta(days=15),
            )

            await log_activity(
                db,
                entity_type=ActivityEntityType.RISK_QUESTIONNAIRE,
                entity_id=questionnaire.id,
                entity_name=f"{risk.name} questionnaire",
                action=ActivityAction.CREATE,
                actor=cro_user,
                department_id=risk.department_id,
                description=f"Sent questionnaire for risk '{risk.name}'",
            )
            await OutboxService.enqueue(
                db,
                event_type="questionnaire.sent",
                aggregate_type="risk_questionnaire",
                aggregate_id=questionnaire.id,
                idempotency_key=f"questionnaire:{questionnaire.id}:sent",
                payload={
                    "questionnaire_id": questionnaire.id,
                    "actor_user_id": cro_user.id,
                },
            )

            created_count += 1
        except Exception as e:
            errors.append(f"risk_id={risk.id}: {e}")

    await db.commit()
    return BatchSendResponse(
        created_count=created_count,
        skipped_no_owner=sorted(skipped_no_owner),
        skipped_open_exists=sorted(skipped_open_exists),
        errors=errors,
    )
