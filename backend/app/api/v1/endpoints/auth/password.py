from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings, get_settings
from app.core.security import verify_password
from app.db.session import get_db
from app.models import RolePermission, User
from app.schemas.auth import LoginRequest, TokenResponse

from ._shared import _build_token_response, _issue_refresh_session

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Authenticate user and return JWT token.

    Args:
        credentials: Email and password
        db: Database session

    Returns:
        JWT access token and user information

    Raises:
        HTTPException: If credentials are invalid or user is inactive
    """
    if settings.auth_mode == "microsoft_sso":
        raise HTTPException(status_code=403, detail="Password login is disabled. Use single sign-on (SSO).")

    # Check if account is locked due to too many failed attempts
    account_lockout = request.app.state.account_lockout
    is_locked, lockout_remaining = await account_lockout.is_locked(credentials.email)
    if is_locked:
        raise HTTPException(
            status_code=429,
            detail=(
                "Account temporarily locked due to too many failed attempts. "
                f"Try again in {lockout_remaining} seconds."
            ),
            headers={"Retry-After": str(lockout_remaining)},
        )

    # Eager load role and permissions
    permission_load = selectinload(User.role).selectinload(User.role.property.mapper.class_.permissions).selectinload(
        RolePermission.permission
    )

    result = await db.execute(
        select(User).options(permission_load, selectinload(User.department)).where(User.email == credentials.email)
    )
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        # Track failed attempt
        is_now_locked, info = await account_lockout.record_failed_attempt(credentials.email)

        from app.core.activity_logger import log_activity
        from app.models.activity_log import ActivityAction, ActivityEntityType

        await log_activity(
            db=db,
            actor=None,
            action=ActivityAction.FAILED_LOGIN,
            entity_type=ActivityEntityType.USER,
            entity_id=0,
            entity_name=credentials.email,
            description=f"Failed login attempt: invalid credentials{' (account now locked)' if is_now_locked else ''}",
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(credentials.password, user.hashed_password):
        # Track failed attempt
        is_now_locked, info = await account_lockout.record_failed_attempt(credentials.email)

        from app.core.activity_logger import log_activity
        from app.models.activity_log import ActivityAction, ActivityEntityType

        await log_activity(
            db=db,
            actor=None,  # Don't attribute to user to avoid confirming existence
            action=ActivityAction.FAILED_LOGIN,
            entity_type=ActivityEntityType.USER,
            entity_id=0,  # Don't expose real user ID
            entity_name=credentials.email,
            description=f"Failed login attempt: invalid credentials{' (account now locked)' if is_now_locked else ''}",
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")

    token_response = _build_token_response(user)
    await _issue_refresh_session(db=db, request=request, response=response, user=user, settings=settings)

    # Clear lockout tracking on successful login
    await account_lockout.record_successful_login(credentials.email)

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    # Log successful login
    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        description=f"User logged in: {user.email}",
    )

    await db.commit()

    return token_response
