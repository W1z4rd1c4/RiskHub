from __future__ import annotations

from http import HTTPStatus

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.email import email_equals, normalize_email
from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES
from app.core.user_query_options import user_selectinload_options
from app.models import Role, User
from app.services._directory_identity import normalize_business_role

from .contracts import SsoFailure
from .sso_identity import log_failed_sso


def _user_permission_load():
    return user_selectinload_options(include_permissions=True)


async def _find_user_by_external_id(db: AsyncSession, external_id: str) -> User | None:
    result = await db.execute(
        select(User).options(*_user_permission_load()).where(User.external_id == external_id)
    )
    return result.scalar_one_or_none()


async def _find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).options(*_user_permission_load()).where(email_equals(User.email, email))
    )
    return result.scalar_one_or_none()


async def _resolve_safe_default_role(db: AsyncSession) -> Role:
    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise RuntimeError(f"No safe default role found ({candidates}). Seed roles first.")


async def sync_sso_user_profile(
    db: AsyncSession,
    *,
    user: User,
    identity,
) -> SsoFailure | None:
    from app.core.datetime_utils import utc_now

    now = utc_now()
    if identity.name and user.name != identity.name:
        user.name = identity.name

    normalized_email = normalize_email(identity.email)
    if normalized_email is not None and normalized_email != user.email:
        conflicting_user = await _find_user_by_email(db, normalized_email)
        if conflicting_user is not None and conflicting_user.id != user.id:
            await log_failed_sso(
                db,
                entity_name=identity.email or "unknown",
                description="Failed SSO login: identity conflict",
            )
            return SsoFailure(
                status_code=HTTPStatus.CONFLICT,
                detail="SSO identity conflict",
                code="SSO_IDENTITY_COLLISION",
            )
        user.email = normalized_email

    business_role = normalize_business_role(identity.business_role)
    if business_role is not None and user.entra_business_role != business_role:
        user.entra_business_role = business_role
    if business_role is not None:
        user.entra_business_role_last_synced_at = now

    db.add(user)
    await db.flush()
    return None


async def _resolve_existing_sso_user(
    db: AsyncSession,
    *,
    identity,
    settings: Settings,
) -> tuple[User | None, SsoFailure | None]:
    user = await _find_user_by_external_id(db, identity.external_id)
    if user is not None:
        return user, None

    if not identity.email:
        return None, None

    email_user = await _find_user_by_email(db, identity.email)
    if email_user is None:
        return None, None

    if email_user.external_id not in (None, identity.external_id):
        await log_failed_sso(
            db,
            entity_name=identity.email or "unknown",
            description="Failed SSO login: identity conflict",
        )
        return None, SsoFailure(
            status_code=HTTPStatus.CONFLICT,
            detail="SSO identity conflict",
            code="SSO_IDENTITY_COLLISION",
        )

    if email_user.external_id is None:
        if not settings.auth_sso_allow_email_link:
            await log_failed_sso(
                db,
                entity_name=identity.email or "unknown",
                description="Failed SSO login: explicit directory linking required",
            )
            return None, SsoFailure(
                status_code=HTTPStatus.FORBIDDEN,
                detail="SSO account link required",
                code="SSO_LINK_REQUIRED",
            )
        email_user.external_id = identity.external_id
        db.add(email_user)
        await db.flush()

    return email_user, None


async def _jit_provision_sso_user(db: AsyncSession, *, identity) -> User:
    default_role = await _resolve_safe_default_role(db)
    normalized_email = normalize_email(identity.email)
    if normalized_email is None:
        raise ValueError("identity.email must be present for JIT provisioning")
    new_user = User(
        email=normalized_email,
        name=identity.name or normalized_email,
        external_id=identity.external_id,
        hashed_password=None,
        role_id=default_role.id,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()

    result = await db.execute(
        select(User).options(*_user_permission_load()).where(User.id == new_user.id)
    )
    return result.scalar_one()


async def resolve_jit_user(
    *,
    db: AsyncSession,
    identity,
    settings: Settings,
) -> tuple[User | None, SsoFailure | None]:
    user, resolution_error = await _resolve_existing_sso_user(db, identity=identity, settings=settings)
    if user is not None or resolution_error is not None:
        return user, resolution_error

    if not settings.entra_jit_provisioning_enabled:
        await log_failed_sso(
            db,
            entity_name=identity.email or "unknown",
            description="Failed SSO login: user not provisioned",
        )
        return None, SsoFailure(
            status_code=HTTPStatus.FORBIDDEN,
            detail="User not provisioned",
            code="SSO_USER_NOT_PROVISIONED",
        )

    if not identity.email or "@" not in identity.email:
        await log_failed_sso(
            db,
            entity_name="unknown",
            description="Failed SSO login: missing email claim",
        )
        return None, SsoFailure(
            status_code=HTTPStatus.BAD_REQUEST,
            detail="Email claim missing",
            code="SSO_EMAIL_MISSING",
        )

    return await _jit_provision_sso_user(db, identity=identity), None


_resolve_sso_user = resolve_jit_user
