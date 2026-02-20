from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import RolePermission, User
from app.schemas.auth import DemoLoginRequest, TokenResponse

from ._shared import _build_token_response, _issue_refresh_session

router = APIRouter()


def _assert_demo_login_enabled(settings: Settings) -> None:
    if not settings.debug or not settings.mock_auth_enabled or settings.auth_mode != "hybrid_dev":
        raise HTTPException(status_code=403, detail="Demo login is only available in development mode")


def _user_with_demo_load():
    return (
        selectinload(User.role)
        .selectinload(User.role.property.mapper.class_.permissions)
        .selectinload(RolePermission.permission),
        selectinload(User.department),
    )


async def _resolve_demo_user_by_id(*, db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(select(User).options(*_user_with_demo_load()).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _resolve_demo_user_by_email(*, db: AsyncSession, email: str) -> User | None:
    normalized_email = email.strip().lower()
    result = await db.execute(
        select(User).options(*_user_with_demo_load()).where(func.lower(User.email) == normalized_email)
    )
    return result.scalar_one_or_none()


async def _build_demo_response(
    *,
    db: AsyncSession,
    request: Request,
    response: Response,
    user: User,
    settings: Settings,
    login_detail: str,
) -> TokenResponse:
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")

    token_response = _build_token_response(user)
    await _issue_refresh_session(db=db, request=request, response=response, user=user, settings=settings)

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        description=login_detail,
    )
    await db.commit()
    return token_response


@router.post("/demo-login", response_model=TokenResponse)
async def demo_login_by_email(
    payload: DemoLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    _assert_demo_login_enabled(settings)

    user = await _resolve_demo_user_by_email(db=db, email=payload.email)
    if not user:
        raise HTTPException(status_code=404, detail="Demo user not found")

    return await _build_demo_response(
        db=db,
        request=request,
        response=response,
        user=user,
        settings=settings,
        login_detail=f"User logged in (demo): {user.email}",
    )


@router.post("/demo-login/{user_id}", response_model=TokenResponse)
async def demo_login(
    user_id: int,
    request: Request,
    response: Response,
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
    _assert_demo_login_enabled(settings)

    user = await _resolve_demo_user_by_id(db=db, user_id=user_id)

    if not user:
        raise HTTPException(status_code=404, detail="Demo user not found")

    return await _build_demo_response(
        db=db,
        request=request,
        response=response,
        user=user,
        settings=settings,
        login_detail=f"User logged in (demo): {user.email}",
    )
