from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.db.session import get_db
from app.models import User

router = APIRouter()


# Keep mock login for development
@router.post("/mock-login/{user_id}")
async def mock_login(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Mock login endpoint for development.
    Returns user info that can be used with X-Mock-User-Id header.
    """
    settings = get_settings()
    if not (settings.debug and settings.mock_auth_enabled):
        raise HTTPException(status_code=404, detail="Mock auth not enabled")

    result = await db.execute(select(User).options(selectinload(User.role)).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        return {"error": "User not found"}

    return {
        "message": f"Mock login successful. Use header: X-Mock-User-Id: {user_id}",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.name if user.role else None,
        },
    }
