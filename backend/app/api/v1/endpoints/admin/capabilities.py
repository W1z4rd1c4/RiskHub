from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.v1.endpoints.admin._deps import require_platform_admin
from app.models import User
from app.schemas.admin import AdminConsoleCapabilities

router = APIRouter()


@router.get("/capabilities", response_model=AdminConsoleCapabilities)
async def get_admin_console_capabilities(
    current_user: User = Depends(require_platform_admin),
) -> AdminConsoleCapabilities:
    _ = current_user
    return AdminConsoleCapabilities(
        can_revoke_sessions=True,
        can_run_directory_check_all=True,
        can_update_log_config=True,
        can_export_loaded_audit_logs=True,
    )
