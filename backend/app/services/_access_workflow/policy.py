"""Access-management policy helpers shared by API and service code."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.permissions import has_permission, is_privileged_user
from app.models import Role, User
from app.models.role import RoleType
from app.schemas.access import AccessUserCapabilities
from app.services._directory_identity import has_auto_deprovision_reason

ADMIN_PRIVILEGED_ROLES: set[RoleType] = {RoleType.ADMIN, RoleType.CRO}
PLATFORM_ADMIN_FIELDS = {"name", "email"}
BUSINESS_ACCESS_FIELDS = {"department_id", "manager_id", "access_scope"}
LIFECYCLE_FIELDS = {"is_active"}


def is_platform_admin(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.ADMIN)


def is_cro(user: User) -> bool:
    return bool(user.role and user.role.name == RoleType.CRO)


def can_view_department_access_roster(user: User) -> bool:
    """Match the Department Users tab's caller eligibility."""
    is_department_head = bool(user.role and user.role.name == RoleType.DEPARTMENT_HEAD)
    return is_department_head or (
        is_privileged_user(user) and has_permission(user, "users", "read")
    )


def resolve_department_access_roster_target(
    current_user: User,
    requested_department_id: int | None,
) -> int:
    """Resolve the Department Users tab target with its existing fail-closed policy."""
    if not can_view_department_access_roster(current_user):
        raise AuthorizationError(
            "Only department heads or privileged users can view department access"
        )
    is_department_head = bool(
        current_user.role and current_user.role.name == RoleType.DEPARTMENT_HEAD
    )
    if requested_department_id is not None and not is_department_head:
        return requested_department_id
    if not current_user.department_id:
        raise ValidationError("You are not assigned to a department")

    target_department_id = requested_department_id or current_user.department_id
    if is_department_head and target_department_id != current_user.department_id:
        raise AuthorizationError("Access denied to this department")
    return target_department_id


def build_department_access_roster_query(
    current_user: User,
    *,
    department_id: int,
):
    """Build the exact active roster visible on the Department Users tab."""
    query = (
        select(User)
        .join(Role)
        .where(
            User.department_id == department_id,
            User.is_active.is_(True),
        )
    )
    if not is_platform_admin(current_user):
        query = query.where(Role.name != RoleType.ADMIN)
    return query


def access_user_capabilities(
    current_user: User,
    target_user: User,
) -> AccessUserCapabilities:
    target_is_admin = is_platform_admin(target_user)
    current_is_admin = is_platform_admin(current_user)
    current_is_cro = is_cro(current_user)
    hidden_from_current = target_is_admin and not current_is_admin
    can_change_active_status = bool(
        current_is_admin
        and current_user.id != target_user.id
        and not hidden_from_current
    )
    can_break_glass_enable = bool(
        current_is_admin
        and target_user.external_id
        and has_auto_deprovision_reason(target_user)
        and not target_user.has_active_break_glass(now=utc_now())
        and not hidden_from_current
    )
    return AccessUserCapabilities(
        can_edit_identity=bool(current_is_admin and not hidden_from_current),
        can_edit_business_access=bool(current_is_cro and not hidden_from_current),
        can_edit_role=bool(
            (current_is_admin or current_is_cro) and not hidden_from_current
        ),
        can_deactivate=can_change_active_status,
        can_change_active_status=can_change_active_status,
        can_break_glass_enable=can_break_glass_enable,
        can_revoke_sessions=bool(
            current_is_admin
            and current_user.id != target_user.id
            and not hidden_from_current
        ),
    )


async def _get_role_or_400(db: AsyncSession, role_id: int) -> Role:
    role_result = await db.execute(
        select(Role).where(
            Role.id == role_id,
            Role.is_active.is_(True),
        )
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise ValidationError("Invalid role_id")
    return role


async def authorize_access_update_fields(
    *,
    db: AsyncSession,
    current_user: User,
    target_user: User,
    update_data: dict,
) -> Role | None:
    if is_platform_admin(target_user) and not is_platform_admin(current_user):
        raise NotFoundError("User not found")

    platform_update = {
        field: value
        for field, value in update_data.items()
        if field in PLATFORM_ADMIN_FIELDS
    }
    business_update = {
        field: value
        for field, value in update_data.items()
        if field in BUSINESS_ACCESS_FIELDS
    }
    lifecycle_update = {
        field: value
        for field, value in update_data.items()
        if field in LIFECYCLE_FIELDS
    }
    new_role: Role | None = None

    if platform_update and not is_platform_admin(current_user):
        raise AuthorizationError("Only Admin can update user identity fields")

    if business_update and not is_cro(current_user):
        raise AuthorizationError("Only CRO can update user business access fields")

    if lifecycle_update and not is_platform_admin(current_user):
        raise AuthorizationError("Only Admin can change user active status")

    if "role_id" not in update_data or update_data["role_id"] == target_user.role_id:
        return None

    new_role = await _get_role_or_400(db, update_data["role_id"])
    assigning_admin = new_role.name == RoleType.ADMIN

    if assigning_admin and not is_platform_admin(current_user):
        raise AuthorizationError("Only Admin can assign the Admin role")
    if not assigning_admin and not is_cro(current_user):
        raise AuthorizationError("Only CRO can assign business roles")

    return new_role
