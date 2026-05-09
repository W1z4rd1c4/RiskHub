from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.user_query_options import user_selectinload_options
from app.models.approval_request import ApprovalRequest
from app.models.role import Permission, Role, RolePermission
from app.models.user import AccessScope, User
from app.services.approval_scenario_policy import (
    RISK_OWNER_APPROVER_ROLE,
    can_view_approval_resource,
    scenario_roles_for_approval,
)


def approval_action_label(approval: ApprovalRequest) -> str:
    return "delete" if approval.action_type.value == "delete" else "edit"


async def load_approval_notification_candidates(db: AsyncSession) -> list[User]:
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
        .options(*user_selectinload_options(include_permissions=True))
    )
    candidates_result = await db.execute(candidates_stmt)
    return list(candidates_result.unique().scalars().all())


async def load_scenario_approval_notification_candidates(db: AsyncSession, approval: ApprovalRequest) -> list[User]:
    roles = scenario_roles_for_approval(approval)
    if roles is None:
        return await load_approval_notification_candidates(db)

    role_names = [role for role in roles if role != RISK_OWNER_APPROVER_ROLE]
    candidates: list[User] = []

    if role_names:
        result = await db.execute(
            select(User)
            .join(Role, User.role_id == Role.id)
            .where(User.is_active.is_(True), Role.name.in_(role_names))
            .options(*user_selectinload_options(include_permissions=True))
        )
        candidates.extend(result.unique().scalars().all())

    if RISK_OWNER_APPROVER_ROLE in roles and approval.primary_approver_id is not None:
        result = await db.execute(
            select(User)
            .where(User.id == approval.primary_approver_id, User.is_active.is_(True))
            .options(*user_selectinload_options(include_permissions=True))
        )
        primary = result.scalar_one_or_none()
        if primary is not None:
            candidates.append(primary)

    seen: set[int] = set()
    unique_candidates: list[User] = []
    for candidate in candidates:
        if candidate.id in seen:
            continue
        seen.add(candidate.id)
        unique_candidates.append(candidate)
    return unique_candidates


async def eligible_approval_notification_recipients(
    db: AsyncSession,
    approval: ApprovalRequest,
    *,
    exclude_user_id: int | None = None,
) -> tuple[list[User], dict[str, int]]:
    candidates = await load_scenario_approval_notification_candidates(db, approval)
    recipients: list[User] = []
    skipped = {
        "excluded_actor": 0,
        "hidden_resource": 0,
    }
    for candidate in candidates:
        if exclude_user_id is not None and candidate.id == exclude_user_id:
            skipped["excluded_actor"] += 1
            continue
        if not await can_view_approval_resource(db, candidate, approval):
            skipped["hidden_resource"] += 1
            continue
        recipients.append(candidate)
    return recipients, skipped
