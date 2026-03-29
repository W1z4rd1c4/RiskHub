from __future__ import annotations

from sqlalchemy import Select, false, or_, select

from app.models import User
from app.models.user import AccessScope


def build_visible_users_query(
    current_user: User,
    *,
    department_id: int | None = None,
) -> Select[tuple[User]]:
    """Build a user query scoped to the caller's visible users."""
    query = select(User)

    if current_user.access_scope == AccessScope.GLOBAL:
        if department_id is not None:
            query = query.where(User.department_id == department_id)
        return query

    if current_user.access_scope == AccessScope.DEPARTMENT:
        if department_id is not None and department_id != current_user.department_id:
            return query.where(false())
        if current_user.department_id:
            return query.where(User.department_id == current_user.department_id)
        return query.where(User.id == current_user.id)

    query = query.where(or_(User.id == current_user.id, User.manager_id == current_user.id))
    if department_id is not None:
        if department_id != current_user.department_id:
            return query.where(false())
        query = query.where(User.department_id == current_user.department_id)
    return query
