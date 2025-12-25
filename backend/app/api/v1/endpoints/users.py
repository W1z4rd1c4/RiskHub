from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import User, Role
from app.schemas import RoleRead, UserRead, UserBrief
from app.core.security import get_current_user

router = APIRouter()


@router.get("/me", response_model=UserBrief)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """Get current user information."""
    permissions = []
    if current_user.role and current_user.role.permissions:
        for rp in current_user.role.permissions:
            permissions.append(f"{rp.permission.resource}:{rp.permission.action}")
    
    return UserBrief(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role.name if current_user.role else "unknown",
        role_display_name=current_user.role.display_name if current_user.role else "Unknown",
        permissions=permissions,
    )


@router.get("", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
):
    """List all users (admin only in production)."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.role))
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/roles", response_model=list[RoleRead])
async def list_roles(
    db: AsyncSession = Depends(get_db),
):
    """List all available roles."""
    result = await db.execute(select(Role))
    return result.scalars().all()


@router.post("/mock-login/{user_id}")
async def mock_login(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Mock login endpoint for development.
    Returns user info that can be used with X-Mock-User-Id header.
    """
    result = await db.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user_id)
    )
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
        }
    }
