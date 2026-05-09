from fastapi import APIRouter, Depends

from app.api import deps
from app.core.logging import get_logger
from app.core.permissions import get_effective_permissions, get_scope_label
from app.models import User
from app.schemas.user import AccessScopeEnum, MeCapabilities, UserBrief
from app.services.authorization_capabilities import build_me_capabilities

router = APIRouter()
logger = get_logger("auth.me")


def _build_logged_me_capabilities(current_user: User) -> MeCapabilities:
    try:
        capabilities = build_me_capabilities(current_user)
    except Exception:
        logger.exception("me_capabilities.parse_error", user_id=current_user.id)
        raise
    logger.info("me_capabilities.parsed", user_id=current_user.id)
    return capabilities


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
        access_scope=AccessScopeEnum(current_user.access_scope.value),
        scope_label=get_scope_label(current_user),
        entra_business_role=current_user.entra_business_role,
        department_id=current_user.department_id,
        department_name=current_user.department.name if current_user.department else None,
        me_capabilities=_build_logged_me_capabilities(current_user),
    )


@router.get("/me/capabilities", response_model=MeCapabilities)
async def get_current_user_capabilities(current_user: User = Depends(deps.get_current_user)):
    """Get backend-authoritative shell and route-gate capabilities for the current user."""
    return _build_logged_me_capabilities(current_user)
