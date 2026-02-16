from __future__ import annotations

import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department


def _build_department_code(name: str, existing_codes: set[str]) -> str:
    words = [w for w in re.split(r"\s+", name.strip()) if w]
    initials = "".join(w[0] for w in words)
    initials = re.sub(r"[^A-Za-z0-9]", "", initials).upper()

    if len(initials) < 2:
        initials = re.sub(r"[^A-Za-z0-9]", "", name).upper()[:4]

    if not initials:
        initials = "DEPT"

    base = initials[:10]
    code = base
    suffix = 2
    while code in existing_codes:
        code = f"{base}{suffix}"
        suffix += 1
    existing_codes.add(code)
    return code


async def _get_or_create_department(
    db: AsyncSession,
    department_name: str | None,
    dept_cache: dict[str, Department],
    existing_codes: set[str],
) -> Department | None:
    if not department_name:
        return None

    normalized = department_name.strip()
    key = normalized.lower()
    if key in dept_cache:
        return dept_cache[key]

    result = await db.execute(select(Department).where(func.lower(Department.name) == key))
    dept = result.scalar_one_or_none()
    if dept:
        dept_cache[key] = dept
        return dept

    code = _build_department_code(normalized, existing_codes)
    dept = Department(
        name=normalized,
        code=code,
        description="Imported from directory sync",
    )
    db.add(dept)
    await db.flush()
    dept_cache[key] = dept
    return dept

