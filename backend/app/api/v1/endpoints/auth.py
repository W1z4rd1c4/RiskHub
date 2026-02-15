"""Authentication endpoints for login, logout, and current user."""

import hashlib

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.api import deps
from app.core.config import Settings, get_settings
from app.core.permissions import get_effective_permissions, get_scope_label
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models import Role, RolePermission, User
from app.schemas.auth import AuthConfigResponse, LoginRequest, SsoExchangeRequest, TokenResponse
from app.schemas.user import UserBrief
from app.services.sso_token_service import SsoProviderUnavailableError, SsoTokenVerificationError, verify_entra_id_token

router = APIRouter()


def _sha256_trunc(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _build_token_response(user: User) -> TokenResponse:
    effective_permissions = get_effective_permissions(user)
    scope_label = get_scope_label(user)
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name,
        "role_display_name": user.role.display_name,
        "department_id": user.department_id,
        "department_name": user.department.name if user.department else None,
        "permissions": effective_permissions,
        "effective_permissions": effective_permissions,
        "access_scope": user.access_scope,
        "scope_label": scope_label,
    }
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    return TokenResponse(access_token=access_token, user=user_data)


async def _resolve_safe_default_role(db: AsyncSession) -> Role:
    from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES

    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise HTTPException(status_code=500, detail=f"No safe default role found ({candidates}). Seed roles first.")


@router.get("/config", response_model=AuthConfigResponse)
async def get_auth_config(settings: Settings = Depends(get_settings)) -> AuthConfigResponse:
    tenant_id = settings.entra_tenant_id or None
    client_id = settings.entra_client_id or None
    demo_login_enabled = bool(settings.debug and settings.mock_auth_enabled and settings.auth_mode == "hybrid_dev")
    password_login_enabled = settings.auth_mode in ("password", "hybrid_dev")

    sso_intended = settings.auth_mode in ("microsoft_sso", "hybrid_dev")
    sso_configured = bool(tenant_id and client_id)
    sso_enabled = bool(sso_intended and sso_configured)
    authority = f"https://login.microsoftonline.com/{tenant_id}" if sso_enabled else None
    sso_error = None
    if sso_intended and not sso_configured:
        sso_error = "SSO enabled by AUTH_MODE but missing ENTRA_TENANT_ID/ENTRA_CLIENT_ID"
    return AuthConfigResponse(
        auth_mode=settings.auth_mode,
        demo_login_enabled=demo_login_enabled,
        password_login_enabled=password_login_enabled,
        debug=settings.debug,
        mock_auth_enabled=settings.mock_auth_enabled,
        sso={
            "enabled": sso_enabled,
            "tenant_id": tenant_id,
            "client_id": client_id,
            "authority": authority,
            "scopes": ["openid", "profile", "email"],
        },
        sso_error=sso_error,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    request: Request,
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
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)

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


@router.get("/me", response_model=UserBrief)
async def get_current_user_info(current_user: User = Depends(deps.get_current_user)):
    """
    Get current authenticated user information.

    Args:
        current_user: Authenticated user from JWT token

    Returns:
        Current user details
    """
    # Ensure relationships are loaded if they weren't (though deps usually loads them)
    # The permissions are needed for the response

    effective_permissions = get_effective_permissions(current_user)
    return UserBrief(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role.name,
        role_display_name=current_user.role.display_name,
        permissions=effective_permissions,
        effective_permissions=effective_permissions,
        access_scope=current_user.access_scope,
        scope_label=get_scope_label(current_user),
        department_id=current_user.department_id,
        department_name=current_user.department.name if current_user.department else None,
    )


@router.post("/logout")
async def logout():
    """
    Logout endpoint (client-side token removal).

    Returns:
        Success message
    """
    return {"message": "Logged out successfully"}


@router.post("/sso/exchange", response_model=TokenResponse)
async def sso_exchange(
    payload: SsoExchangeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if settings.auth_mode not in ("microsoft_sso", "hybrid_dev"):
        return JSONResponse(status_code=403, content={"detail": "SSO is not enabled.", "code": "SSO_DISABLED"})

    from app.core.activity_logger import log_activity
    from app.models.activity_log import ActivityAction, ActivityEntityType

    try:
        identity = await verify_entra_id_token(id_token=payload.id_token, settings=settings)
    except SsoProviderUnavailableError:
        await log_activity(
            db=db,
            actor=None,
            action=ActivityAction.FAILED_LOGIN,
            entity_type=ActivityEntityType.USER,
            entity_id=0,
            entity_name="sso",
            description="Failed SSO login: verification unavailable",
        )
        await db.commit()
        return JSONResponse(
            status_code=503,
            content={
                "detail": "SSO verification unavailable. Please try again later.",
                "code": "SSO_DISCOVERY_FAILED",
            },
        )
    except SsoTokenVerificationError as e:
        await log_activity(
            db=db,
            actor=None,
            action=ActivityAction.FAILED_LOGIN,
            entity_type=ActivityEntityType.USER,
            entity_id=0,
            entity_name="sso",
            description=f"Failed SSO login: {e.code}",
        )
        await db.commit()
        # Stable error codes for frontend mapping (avoid leaking low-level token details).
        status_code = 401
        code = "SSO_TOKEN_INVALID"
        if e.code == "tenant_mismatch":
            code = "SSO_TENANT_MISMATCH"
        elif e.code == "email_domain_not_allowed":
            status_code = 403
            code = "SSO_EMAIL_DOMAIN_FORBIDDEN"
        elif e.code == "email_required":
            status_code = 400
            code = "SSO_EMAIL_MISSING"
        elif e.code == "missing_token":
            status_code = 400
            code = "SSO_TOKEN_INVALID"
        return JSONResponse(status_code=status_code, content={"detail": "Invalid SSO token", "code": code})

    # Eager load role and permissions
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)

    result = await db.execute(
        select(User)
        .options(permission_load, selectinload(User.department))
        .where(User.external_id == identity.external_id)
    )
    user = result.scalar_one_or_none()

    if user is None and identity.email:
        result = await db.execute(
            select(User)
            .options(permission_load, selectinload(User.department))
            .where(func.lower(User.email) == identity.email.lower())
        )
        user = result.scalar_one_or_none()
        if user is not None:
            if user.external_id is None:
                user.external_id = identity.external_id
                if identity.name and user.name != identity.name:
                    user.name = identity.name
                db.add(user)
                await db.flush()
            elif user.external_id != identity.external_id:
                await log_activity(
                    db=db,
                    actor=None,
                    action=ActivityAction.FAILED_LOGIN,
                    entity_type=ActivityEntityType.USER,
                    entity_id=0,
                    entity_name=identity.email,
                    description="Failed SSO login: identity conflict",
                )
                await db.commit()
                return JSONResponse(
                    status_code=409,
                    content={"detail": "SSO identity conflict", "code": "SSO_IDENTITY_COLLISION"},
                )

    if user is None:
        if not settings.entra_jit_provisioning_enabled:
            await log_activity(
                db=db,
                actor=None,
                action=ActivityAction.FAILED_LOGIN,
                entity_type=ActivityEntityType.USER,
                entity_id=0,
                entity_name=identity.email or "unknown",
                description="Failed SSO login: user not provisioned",
            )
            await db.commit()
            return JSONResponse(
                status_code=403,
                content={"detail": "User not provisioned", "code": "SSO_USER_NOT_PROVISIONED"},
            )

        if not identity.email or "@" not in identity.email:
            await log_activity(
                db=db,
                actor=None,
                action=ActivityAction.FAILED_LOGIN,
                entity_type=ActivityEntityType.USER,
                entity_id=0,
                entity_name="unknown",
                description="Failed SSO login: missing email claim",
            )
            await db.commit()
            return JSONResponse(status_code=400, content={"detail": "Email claim missing", "code": "SSO_EMAIL_MISSING"})

        default_role = await _resolve_safe_default_role(db)
        new_user = User(
            email=identity.email.lower(),
            name=identity.name or identity.email.lower(),
            external_id=identity.external_id,
            hashed_password=None,
            role_id=default_role.id,
            is_active=True,
        )
        db.add(new_user)
        await db.flush()

        result = await db.execute(
            select(User)
            .options(permission_load, selectinload(User.department))
            .where(User.id == new_user.id)
        )
        user = result.scalar_one()

    if not user.is_active:
        return JSONResponse(status_code=403, content={"detail": "User account is inactive", "code": "USER_INACTIVE"})

    token_response = _build_token_response(user)

    await log_activity(
        db=db,
        actor=user,
        action=ActivityAction.LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        description=(
            f"User logged in (sso): {user.email} "
            f"tenant_sha256={_sha256_trunc(identity.tenant_id)} oid_sha256={_sha256_trunc(identity.external_id)}"
        ),
    )
    await db.commit()
    return token_response


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
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)

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
