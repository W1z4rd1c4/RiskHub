from app.models import User

from .evaluation import has_permission
from .ownership import (
    get_control_ids_where_owner,
    get_risk_ids_where_control_owner,
    get_risk_ids_where_kri_reporting_owner,
)
from .scoping import get_user_department_ids


async def get_issue_scope_clause(db, user: User):
    """
    Build a SQLAlchemy visibility clause for issue queries.

    Returns:
        None: user has global scope (no additional filtering required)
        SQL expression: apply as `.where(clause)` to scope issues
    """
    from sqlalchemy import or_, select

    from app.models import Control, ControlExecution, Issue, IssueLink

    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return None

    scope_conditions = [Issue.owner_user_id == user.id]
    if dept_ids:
        scope_conditions.append(Issue.department_id.in_(dept_ids))

    risk_owner_ids = set(await get_risk_ids_where_kri_reporting_owner(db, user.id))
    risk_owner_ids.update(await get_risk_ids_where_control_owner(db, user.id))
    control_owner_ids = set(await get_control_ids_where_owner(db, user.id))

    if risk_owner_ids:
        scope_conditions.append(Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.risk_id.in_(risk_owner_ids))))
    if control_owner_ids:
        scope_conditions.append(
            Issue.id.in_(select(IssueLink.issue_id).where(IssueLink.control_id.in_(control_owner_ids)))
        )
        scope_conditions.append(
            Issue.id.in_(
                select(IssueLink.issue_id)
                .join(ControlExecution, IssueLink.execution_id == ControlExecution.id)
                .join(Control, ControlExecution.control_id == Control.id)
                .where(Control.control_owner_id == user.id)
            )
        )

    return or_(*scope_conditions)


async def can_read_issue_id(db, user: User, issue_id: int) -> bool:
    """
    Issue visibility rule:
    - Must have issues:read
    - In-scope by department OR issue owner OR linked ownership exception paths
      (risk/control/KRI/control-execution visibility).
    """
    if not has_permission(user, "issues", "read"):
        return False

    from sqlalchemy import select

    from app.models import Issue

    scope_clause = await get_issue_scope_clause(db, user)
    query = select(Issue.id).where(Issue.id == issue_id)
    if scope_clause is not None:
        query = query.where(scope_clause)
    return (await db.execute(query)).scalar_one_or_none() is not None


async def can_write_issue_id(db, user: User, issue_id: int) -> bool:
    """
    Issue mutation rule:
    - Must have issues:write
    - Must pass issue visibility checks.
    """
    if not has_permission(user, "issues", "write"):
        return False
    return await can_read_issue_id(db, user, issue_id)


async def is_issue_owner_assignable_to_department(
    db,
    *,
    owner_user_id: int | None,
    issue_department_id: int,
) -> bool:
    """
    Owner assignment guard for issues.

    Rules:
    - `None` owner is always allowed (unassigned issue).
    - Owner must exist and be active.
    - Global-scope owners are always assignable.
    - Non-global owners must belong to the issue department.
    """
    if owner_user_id is None:
        return True

    from sqlalchemy import select

    from app.models import Role, User
    from app.models.role import RoleType
    from app.models.user import AccessScope

    row = (
        await db.execute(
            select(
                User.id,
                User.is_active,
                User.access_scope,
                User.department_id,
                Role.name,
            )
            .join(Role, User.role_id == Role.id)
            .where(User.id == owner_user_id)
        )
    ).one_or_none()
    if row is None:
        return False

    _, is_active, access_scope, department_id, role_name = row
    if not bool(is_active):
        return False

    if role_name == RoleType.ADMIN:
        return False

    if access_scope == AccessScope.GLOBAL:
        return True
    return department_id == issue_department_id

