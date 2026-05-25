from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.kri import KRICreate, KRIResponse
from app.services._entity_mutation_lifecycle import create_kri_detail

from .list import router


@router.post("", response_model=KRIResponse, status_code=201)
async def create_kri(
    data: KRICreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("risks", "write")),
):
    """Create a new KRI. Requires risks:write permission."""
    return await create_kri_detail(db=db, data=data, current_user=current_user)
