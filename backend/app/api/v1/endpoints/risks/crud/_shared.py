from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RiskTypeConfig


async def validate_risk_type(db: AsyncSession, risk_type_code: str) -> None:
    """Validate that the risk_type code exists in the active risk_types config."""
    result = await db.execute(
        select(RiskTypeConfig).where(
            RiskTypeConfig.code == risk_type_code,
            RiskTypeConfig.is_active.is_(True),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown risk type '{risk_type_code}'. Available types can be viewed in Risk Hub configuration.",
        )

