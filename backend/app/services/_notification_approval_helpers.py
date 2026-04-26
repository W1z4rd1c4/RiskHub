from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import can_read_control_id, can_read_kri_id, can_read_risk_id
from app.models.approval_request import ApprovalRequest, ApprovalResourceType
from app.models.role import Permission, Role, RolePermission
from app.models.user import AccessScope, User


def approval_action_label(approval: ApprovalRequest) -> str:
    return "delete" if approval.action_type.value == "delete" else "edit"


async def load_approval_notification_candidates(db: AsyncSession) -> list[User]:
    permission_load = selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
    candidates_stmt = (
        select(User)
        .join(Role, User.role_id == Role.id)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .where(
            User.is_active.is_(True),
            User.access_scope == AccessScope.GLOBAL,
            or_(
                (Permission.resource.in_(("approvals", "*")) & Permission.action.in_(("write", "*"))),
            ),
        )
        .options(permission_load)
    )
    candidates_result = await db.execute(candidates_stmt)
    return list(candidates_result.unique().scalars().all())


async def can_user_view_approval_resource(db: AsyncSession, user: User, approval: ApprovalRequest) -> bool:
    if approval.resource_type == ApprovalResourceType.RISK:
        return await can_read_risk_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.CONTROL:
        return await can_read_control_id(db, user, approval.resource_id)
    if approval.resource_type == ApprovalResourceType.KRI:
        return await can_read_kri_id(db, user, approval.resource_id)
    return False
