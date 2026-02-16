"""
Shared ID mappings for E2E seed scripts.
Populated by load_mappings() function, used by other scripts.
"""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import select

# User email -> ID mappings (populated at runtime)
USERS = {
    "cro@riskhub.local": None,
    "risk.manager@riskhub.local": None,
    "ops.head@riskhub.local": None,
    "fin.head@riskhub.local": None,
    "it.head@riskhub.local": None,
    "ops.analyst@riskhub.local": None,
    "fin.analyst@riskhub.local": None,
    "it.analyst@riskhub.local": None,
}

# Department name -> ID mappings (populated at runtime)
DEPARTMENTS = {
    "Operations": None,
    "Finance": None,
    "IT": None,
    "Compliance": None,
    "Risk Management": None,
}

REQUIRED_USER_EMAILS = tuple(USERS.keys())
REQUIRED_DEPARTMENT_NAMES = tuple(DEPARTMENTS.keys())


async def load_mappings(db):
    """Load actual IDs from database."""
    from app.models import Department, User

    users = {}
    for email in USERS:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            users[email] = user.id

    departments = {}
    for name in DEPARTMENTS:
        result = await db.execute(select(Department).where(Department.name == name))
        dept = result.scalar_one_or_none()
        if dept:
            departments[name] = dept.id

    return users, departments


def get_missing_required_keys(
    users: Mapping[str, int],
    departments: Mapping[str, int],
) -> tuple[list[str], list[str]]:
    """Return missing required user emails and department names."""
    missing_users = [email for email in REQUIRED_USER_EMAILS if email not in users]
    missing_departments = [name for name in REQUIRED_DEPARTMENT_NAMES if name not in departments]
    return missing_users, missing_departments


def assert_required_mappings(
    users: Mapping[str, int],
    departments: Mapping[str, int],
    *,
    context: str = "E2E seed scripts",
) -> None:
    """Raise RuntimeError if required users/departments are not present."""
    missing_users, missing_departments = get_missing_required_keys(users, departments)
    if not missing_users and not missing_departments:
        return

    lines = [f"{context} prerequisites failed."]
    if missing_users:
        lines.append(f"Missing users: {', '.join(missing_users)}")
    if missing_departments:
        lines.append(f"Missing departments: {', '.join(missing_departments)}")
    lines.append("Run base seed first (python -m app.db.seed).")
    lines.append("E2E seed scripts never create users or departments.")
    raise RuntimeError(" ".join(lines))


async def load_mappings_strict(db, *, context: str = "E2E seed scripts"):
    """Load mappings and enforce required prerequisites."""
    users, departments = await load_mappings(db)
    assert_required_mappings(users, departments, context=context)
    return users, departments


def require_user_id(users: Mapping[str, int], email: str) -> int:
    """Resolve required user ID or raise a clear error."""
    user_id = users.get(email)
    if user_id is None:
        raise RuntimeError(
            f"Required user mapping missing for '{email}'. " "Run base seed first (python -m app.db.seed)."
        )
    return user_id


def require_department_id(departments: Mapping[str, int], name: str) -> int:
    """Resolve required department ID or raise a clear error."""
    department_id = departments.get(name)
    if department_id is None:
        raise RuntimeError(
            f"Required department mapping missing for '{name}'. " "Run base seed first (python -m app.db.seed)."
        )
    return department_id
