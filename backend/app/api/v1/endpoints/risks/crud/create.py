from fastapi import Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.risk import RiskCreate, RiskRead
from app.services._entity_mutation_lifecycle import create_risk_detail

from .list import router


@router.post("", response_model=RiskRead, status_code=status.HTTP_201_CREATED)
async def create_risk(
    risk_data: RiskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new risk. Requires risks:write permission."""
    return await create_risk_detail(db=db, risk_data=risk_data, current_user=current_user)
