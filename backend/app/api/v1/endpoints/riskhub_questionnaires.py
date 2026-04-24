"""Risk Hub questionnaire endpoints (CRO-only batch send)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.riskhub import get_cro_user
from app.db.session import get_db
from app.models import Risk, User
from app.services.risk_questionnaire_service import send_questionnaire_for_risk

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
        target_risk_ids = [r.id for r in result.scalars().all()]
    else:
        if not payload.risk_ids:
            raise HTTPException(status_code=400, detail="risk_ids is required when select_all=false")
        target_risk_ids = payload.risk_ids

    skipped_no_owner: list[int] = []
    skipped_open_exists: list[int] = []
    errors: list[str] = []
    created_count = 0

    for risk_id in target_risk_ids:
        try:
            async with db.begin_nested():
                await send_questionnaire_for_risk(db=db, risk_id=risk_id, current_user=cro_user)
            created_count += 1
        except HTTPException as e:
            if e.status_code == 400 and e.detail == "Risk owner must be set before sending a questionnaire":
                skipped_no_owner.append(risk_id)
            elif e.status_code == 409 and e.detail == "An open questionnaire already exists for this risk":
                skipped_open_exists.append(risk_id)
            else:
                errors.append(f"risk_id={risk_id}: {e.detail}")
        except Exception as e:
            errors.append(f"risk_id={risk_id}: {e}")

    await db.commit()
    return BatchSendResponse(
        created_count=created_count,
        skipped_no_owner=sorted(skipped_no_owner),
        skipped_open_exists=sorted(skipped_open_exists),
        errors=errors,
    )
