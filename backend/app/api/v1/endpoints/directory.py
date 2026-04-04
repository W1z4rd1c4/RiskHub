from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api import deps
from app.core.activity_logger import log_activity
from app.core.config import Settings, get_settings
from app.core.datetime_utils import utc_now
from app.core.email import email_equals, normalize_email
from app.db.session import get_db
from app.models import Department, Role, User
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.models.role import RoleType
from app.schemas.directory import (
    DirectoryImportRequest,
    DirectoryImportResponse,
    DirectoryUserRead,
)
from app.services.ad_deprovision_service import ADDeprovisionService
from app.services.directory_provider_service import (
    DirectoryProviderError,
    DirectoryProviderService,
    DirectoryProviderUnavailableError,
    DirectoryUserNotFoundError,
)

from .auth._shared import _resolve_safe_default_role

router = APIRouter(prefix="/directory")


def _require_directory_admin(current_user: User = Depends(deps.get_current_user)) -> User:
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    if role_name != RoleType.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Directory access requires Admin")
    return current_user


def _normalize_department_code(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", value.strip()).strip("_").upper()
    if not normalized:
        normalized = "DEPARTMENT"
    return normalized[:50]


async def _resolve_or_create_department(db: AsyncSession, directory_department: str) -> Department:
    name = directory_department.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Invalid directory department")

    result = await db.execute(select(Department).where(func.lower(Department.name) == name.lower()))
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    base_code = _normalize_department_code(name)
    candidate_code = base_code
    suffix = 1
    while True:
        code_result = await db.execute(select(Department).where(func.lower(Department.code) == candidate_code.lower()))
        if code_result.scalar_one_or_none() is None:
            break
        suffix += 1
        suffix_str = str(suffix)
        head = base_code[: max(1, 50 - len(suffix_str) - 1)]
        candidate_code = f"{head}_{suffix_str}"

    department = Department(name=name, code=candidate_code, description="Imported from directory")
    db.add(department)
    await db.flush()
    return department


async def _resolve_role_for_import(
    db: AsyncSession,
    *,
    override_role_id: int | None,
) -> Role:
    if override_role_id is not None:
        result = await db.execute(select(Role).where(Role.id == override_role_id).where(Role.is_active.is_(True)))
        role = result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=400, detail="Invalid role_id override")
        return role
    return await _resolve_safe_default_role(db)


def _provider_or_503(settings: Settings) -> DirectoryProviderService:
    try:
        return DirectoryProviderService(settings)
    except DirectoryProviderUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/users/search", response_model=list[DirectoryUserRead])
async def search_directory_users(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(25, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: User = Depends(_require_directory_admin),
    settings: Settings = Depends(get_settings),
) -> list[DirectoryUserRead]:
    del current_user  # explicit auth gate only
    provider = _provider_or_503(settings)
    try:
        return await provider.search_users(query=q, limit=limit, skip=skip)
    except DirectoryProviderUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except DirectoryProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/users/{oid}", response_model=DirectoryUserRead)
async def get_directory_user(
    oid: str,
    current_user: User = Depends(_require_directory_admin),
    settings: Settings = Depends(get_settings),
) -> DirectoryUserRead:
    del current_user
    provider = _provider_or_503(settings)
    try:
        return await provider.get_user(oid)
    except DirectoryUserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DirectoryProviderUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except DirectoryProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/users/{oid}/import", response_model=DirectoryImportResponse)
async def import_directory_user(
    oid: str,
    payload: DirectoryImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_directory_admin),
    settings: Settings = Depends(get_settings),
) -> DirectoryImportResponse:
    provider = _provider_or_503(settings)
    try:
        directory_user = await provider.get_user(oid)
    except DirectoryUserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DirectoryProviderUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except DirectoryProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    directory_email = directory_user.email or directory_user.user_principal_name
    if not directory_email:
        raise HTTPException(status_code=400, detail="Directory user is missing an importable email address")
    normalized_email = normalize_email(directory_email)
    if normalized_email is None:
        raise HTTPException(status_code=400, detail="Directory user is missing an importable email address")

    now = utc_now()
    user = (
        await db.execute(select(User).where(User.external_id == directory_user.external_id))
    ).scalar_one_or_none()
    import_status = "updated"
    if user is None:
        existing_email_user = (
            await db.execute(select(User).where(email_equals(User.email, normalized_email)))
        ).scalar_one_or_none()
        if (
            existing_email_user is not None
            and existing_email_user.external_id not in (None, directory_user.external_id)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Directory identity conflict: email already linked to a different external_id",
            )
        if existing_email_user is not None:
            user = existing_email_user
        else:
            role = await _resolve_role_for_import(db, override_role_id=payload.role_id)
            user = User(
                email=normalized_email,
                name=directory_user.display_name or normalized_email,
                external_id=directory_user.external_id,
                hashed_password=None,
                role_id=role.id,
                is_active=True,
            )
            db.add(user)
            import_status = "created"

    user.email = normalized_email
    user.name = directory_user.display_name or normalized_email
    user.external_id = directory_user.external_id
    user.job_title = directory_user.job_title
    user.directory_last_checked_at = now
    user.directory_last_seen_at = now
    user.directory_sync_status = "active" if directory_user.account_enabled else "directory_disabled"

    if directory_user.account_enabled and user.deprovision_reason in ADDeprovisionService.AUTO_DEPROVISION_REASONS:
        user.is_active = True
        user.deprovisioned_at = None
        user.deprovision_reason = None

    if directory_user.department:
        department = await _resolve_or_create_department(db, directory_user.department)
        user.department_id = department.id

    if payload.role_id is not None and import_status == "updated":
        role = await _resolve_role_for_import(db, override_role_id=payload.role_id)
        user.role_id = role.id

    db.add(user)
    await db.flush()

    await log_activity(
        db=db,
        actor=current_user,
        action=ActivityAction.CREATE if import_status == "created" else ActivityAction.UPDATE,
        entity_type=ActivityEntityType.USER,
        entity_id=user.id,
        entity_name=user.name,
        description=f"Directory import ({provider.provider_name}) for {user.email}",
    )

    await db.commit()

    refreshed = (
        await db.execute(
            select(User)
            .options(selectinload(User.role), selectinload(User.department))
            .where(User.id == user.id)
        )
    ).scalar_one()

    return DirectoryImportResponse(
        status=import_status,
        user_id=refreshed.id,
        email=refreshed.email,
        name=refreshed.name,
        external_id=refreshed.external_id or directory_user.external_id,
        department_id=refreshed.department_id,
        department_name=refreshed.department.name if refreshed.department else None,
        role_id=refreshed.role_id,
        role_name=refreshed.role.name if refreshed.role else None,
        directory_sync_status=refreshed.directory_sync_status,
    )
