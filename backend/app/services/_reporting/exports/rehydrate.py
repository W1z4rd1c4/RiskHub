from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User

from .shared import _safe_int, _unique_ids


async def _rehydrate_user_names(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    *,
    user_id_field: str,
    user_name_field: str,
) -> list[dict[str, Any]]:
    user_ids = _unique_ids(rows, user_id_field)
    user_name_by_id: dict[int, str] = {}
    if user_ids:
        result = await db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))
        user_name_by_id = {int(user_id): name for user_id, name in result.all()}

    for row in rows:
        user_id = row.get(user_id_field)
        if user_id is None:
            row[user_name_field] = None
            continue
        row[user_name_field] = user_name_by_id.get(_safe_int(user_id))

    return rows


async def _rehydrate_department_names(
    db: AsyncSession,
    rows: list[dict[str, Any]],
    *,
    department_id_field: str,
    department_name_field: str,
) -> list[dict[str, Any]]:
    department_ids = _unique_ids(rows, department_id_field)
    department_name_by_id: dict[int, str] = {}
    if department_ids:
        result = await db.execute(select(Department.id, Department.name).where(Department.id.in_(department_ids)))
        department_name_by_id = {int(department_id): name for department_id, name in result.all()}

    for row in rows:
        department_id = row.get(department_id_field)
        if department_id is None:
            row[department_name_field] = None
            continue
        row[department_name_field] = department_name_by_id.get(_safe_int(department_id))

    return rows
