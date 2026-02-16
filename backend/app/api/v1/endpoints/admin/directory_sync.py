from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import User
from app.services.ad_deprovision_service import ADDeprovisionService
from app.services.directory_provider_service import DirectoryProviderUnavailableError

from ._deps import require_platform_admin

router = APIRouter()


@router.post("/directory/check-user/{user_id}")
async def check_directory_user_status(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        return await ADDeprovisionService.check_user_by_id(
            db,
            user_id=user_id,
            settings=settings,
            actor=admin_user,
            trigger="admin_check_user",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DirectoryProviderUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.post("/directory/check-all")
async def check_all_directory_users(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        return await ADDeprovisionService.check_all_users(
            db,
            settings=settings,
            actor=admin_user,
            trigger="admin_check_all",
        )
    except DirectoryProviderUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
