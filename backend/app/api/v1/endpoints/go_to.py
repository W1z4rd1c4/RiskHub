from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.session import get_db
from app.models import User
from app.schemas.go_to import GoToRecordRead
from app.services.go_to_records import search_go_to_records

router = APIRouter()


@router.get("/records", response_model=list[GoToRecordRead])
async def list_go_to_records(
    q: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> list[GoToRecordRead]:
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Search query must contain at least 2 characters",
        )
    return await search_go_to_records(db, current_user=current_user, query=query)
