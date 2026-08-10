"""Shared reviewer and safe-label policy for governed Process intake."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.user_query_options import user_selectinload_options
from app.models import Department, Process, Role, User
from app.services.approval_scenario_policy import can_resolve_process_approval


async def has_independent_process_approver(
    db: AsyncSession,
    *,
    requester_id: int,
    roles: list[str],
    process: Process,
) -> bool:
    result = await db.execute(
        select(User)
        .join(Role, Role.id == User.role_id)
        .where(
            User.is_active.is_(True),
            User.id != requester_id,
            Role.name.in_(roles),
        )
        .options(*user_selectinload_options(include_permissions=True))
        .order_by(User.id)
    )
    return any(
        can_resolve_process_approval(
            candidate,
            process,
            requester_id=requester_id,
            configured_roles=roles,
        )
        for candidate in result.unique().scalars().all()
    )


def safe_process_user_label(user: User | None) -> str:
    name = (user.name if user is not None else "").strip()
    return name or "Unknown user"


def safe_process_department_label(department: Department | None) -> str:
    if department is None:
        return "Unknown department"
    name = (department.name or "").strip()
    code = (department.code or "").strip()
    return f"{code} — {name}" if code and name else name or code or "Unknown department"


__all__ = [
    "has_independent_process_approver",
    "safe_process_department_label",
    "safe_process_user_label",
]
