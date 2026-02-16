from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import RolePermission, User
from app.schemas.auth import TokenResponse

from ._shared import _build_token_response

router = APIRouter()


@router.post("/demo-login/{user_id}", response_model=TokenResponse)
async def demo_login(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Demo login endpoint - allows direct login by user ID.
    ONLY works in development mode with mock auth enabled.

    Args:
        user_id: The ID of the demo user to log in as
        db: Database session

    Returns:
        JWT access token and user information
    """
    # Security check - only allow in demo/debug mode
    if not settings.debug or not settings.mock_auth_enabled or settings.auth_mode != "hybrid_dev":
        raise HTTPException(status_code=403, detail="Demo login is only available in development mode")

    # Eager load role and permissions
    permission_load = selectinload(User.role).selectinload(User.role.property.mapper.class_.permissions).selectinload(
        RolePermission.permission
    )

    result = await db.execute(
        select(User).options(permission_load, selectinload(User.department)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="Demo user not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")

    token_response = _build_token_response(user)

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    # Log successful demo login
    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        description=f"User logged in (demo): {user.email}",
    )

    await db.commit()

    return token_response

