from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.v1.endpoints.admin._deps import require_platform_admin
from app.core.config import Settings, get_settings
from app.models import User
from app.schemas.admin import AdminConsoleCapabilities
from app.services._authorization_capabilities.admin import build_admin_capabilities

router = APIRouter()


@router.get("/capabilities", response_model=AdminConsoleCapabilities)
async def get_admin_console_capabilities(
    current_user: User = Depends(require_platform_admin),
    settings: Settings = Depends(get_settings),
) -> AdminConsoleCapabilities:
    return build_admin_capabilities(current_user, settings=settings)
