from fastapi import APIRouter, Depends

from app.api import deps
from app.core.permissions import get_effective_permissions, get_scope_label
from app.models import User
from app.schemas.user import UserBrief

router = APIRouter()


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

