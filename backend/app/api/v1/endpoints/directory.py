from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import User
from app.models.role import RoleType
from app.schemas.directory import (
    DirectoryImportRequest,
    DirectoryImportResponse,
    DirectoryUserRead,
)
from app.services._identity_access_lifecycle import import_directory_identity
from app.services.directory_provider_service import (
    DirectoryProviderError,
    DirectoryProviderService,
    DirectoryProviderUnavailableError,
    DirectoryUserNotFoundError,
)

router = APIRouter(prefix="/directory")


def _require_directory_admin(current_user: User = Depends(deps.get_current_user)) -> User:
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    if role_name != RoleType.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Directory access requires Admin")
    return current_user


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

    outcome = await import_directory_identity(
        db=db,
        settings=settings,
        current_user=current_user,
        directory_user=directory_user,
        payload=payload,
        provider_name=provider.provider_name,
    )
    assert outcome.response is not None
    return outcome.response
