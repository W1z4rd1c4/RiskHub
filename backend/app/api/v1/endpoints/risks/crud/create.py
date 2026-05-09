from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints._monitoring_response import load_monitoring_response_context, serialize_risk_read
from app.core.audit.risk import risk_created
from app.core.datetime_utils import utc_now
from app.core.owner_reference_validation import validate_active_owner_reference
from app.core.permissions import check_department_access
from app.core.security import require_permission
from app.db.session import get_db
from app.models import KeyRiskIndicator, Risk, User
from app.schemas.risk import RiskCreate, RiskRead
from app.services.authorization_capabilities import risk_capabilities
from app.services.transaction_boundary import commit_service_transaction

from ..id_generation import generate_risk_id_code
from ._shared import validate_risk_type
from .list import router


@router.post("", response_model=RiskRead, status_code=status.HTTP_201_CREATED)
async def create_risk(
    risk_data: RiskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new risk. Requires risks:write permission."""
    # Verify department access
    check_department_access(risk_data.department_id, current_user)

    # Validate risk type against dynamic configuration
    await validate_risk_type(db, risk_data.risk_type)
    await validate_active_owner_reference(
        db,
        user_id=risk_data.owner_id,
        label="Risk owner",
    )

    # Prepare for atomic retry pattern
    risk_id_code = risk_data.risk_id_code
    auto_generated = not risk_id_code

    MAX_RETRIES = 5
    for attempt in range(MAX_RETRIES):
        try:
            if auto_generated:
                risk_id_code = await generate_risk_id_code(db, risk_data.process)

            # Calculate scores
            gross_score = risk_data.gross_probability * risk_data.gross_impact
            net_score = risk_data.net_probability * risk_data.net_impact

            risk = Risk(
                risk_id_code=risk_id_code,
                name=risk_data.name,
                process=risk_data.process,
                subprocess=risk_data.subprocess,
                risk_type=risk_data.risk_type,
                category=risk_data.category,
                description=risk_data.description,
                department_id=risk_data.department_id,
                owner_id=risk_data.owner_id,
                gross_probability=risk_data.gross_probability,
                gross_impact=risk_data.gross_impact,
                gross_score=gross_score,
                net_probability=risk_data.net_probability,
                net_impact=risk_data.net_impact,
                net_score=net_score,
                status=risk_data.status.value,
                is_priority=risk_data.is_priority,
            )

            db.add(risk)
            await db.flush()

            await risk_created(
                db,
                actor=current_user,
                risk=risk,
            )
            await commit_service_transaction(db)
            await db.refresh(risk)

            # Reload with relationships
            result = await db.execute(
                select(Risk)
                .options(
                    selectinload(Risk.department),
                    selectinload(Risk.owner),
                    selectinload(Risk.kris.and_(KeyRiskIndicator.is_archived.is_(False))),
                )
                .where(Risk.id == risk.id)
            )
            now = utc_now()
            monitoring_context = await load_monitoring_response_context(db, now=now, today=now.date())
            reloaded_risk = result.scalar_one()
            capabilities = await risk_capabilities(db, current_user=current_user, risk=reloaded_risk)
            return serialize_risk_read(reloaded_risk, monitoring_context, capabilities=capabilities)

        except IntegrityError:
            await db.rollback()

            # Only retry for auto-generated IDs (user-provided ID collision should fail)
            if not auto_generated:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail=f"Risk ID '{risk_id_code}' already exists"
                )

            # Retry with fresh ID for auto-generated
            if attempt < MAX_RETRIES - 1:
                continue

    # All retries exhausted
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not generate unique Risk ID after retries. Please try again.",
    )
