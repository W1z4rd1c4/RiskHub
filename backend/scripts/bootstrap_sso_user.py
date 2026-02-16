#!/usr/bin/env python3
"""
Bootstrap (pre-provision) an SSO user by email.

Why: In production SSO mode, just-in-time provisioning assigns a safe default role.
To avoid admin/CRO lockout, operators can pre-create an initial admin/CRO user by email.
On first successful SSO login, RiskHub binds the user's external_id (OID) to this email record.

This script is idempotent:
- creates the user if missing
- updates role/access_scope/department if present
- does not wipe external_id if already set
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.session import session_context
from app.models import Department, Role, User
from app.models.user import AccessScope


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bootstrap an SSO user by email (idempotent upsert).")
    parser.add_argument("--email", required=True, help="User email (used for SSO matching).")
    parser.add_argument("--role", required=True, help="Role name (e.g. admin, cro).")
    parser.add_argument(
        "--access-scope",
        required=True,
        choices=[s.value for s in AccessScope],
        help="Access scope (global|department|manager).",
    )
    parser.add_argument(
        "--department",
        default=None,
        help="Optional department code or name to assign (e.g. RISK or 'Risk Management').",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="Optional display name. Defaults to email if not provided.",
    )
    return parser.parse_args(argv)


async def _resolve_department_id(department: str | None) -> int | None:
    if not department:
        return None

    dept_key = department.strip()
    if not dept_key:
        return None

    async with session_context(get_settings()) as db:
        # Prefer code match first (codes are typically short and stable).
        code_result = await db.execute(select(Department).where(func.lower(Department.code) == dept_key.lower()))
        dept = code_result.scalar_one_or_none()
        if dept is not None:
            return dept.id

        name_result = await db.execute(select(Department).where(func.lower(Department.name) == dept_key.lower()))
        dept = name_result.scalar_one_or_none()
        if dept is not None:
            return dept.id

    raise SystemExit(f"Department not found: {department!r} (seed departments first)")


async def _run(args: argparse.Namespace) -> int:
    settings = get_settings()
    email = args.email.strip().lower()
    if not email or "@" not in email:
        raise SystemExit("Invalid --email (must be a valid email address)")

    department_id = await _resolve_department_id(args.department)

    async with session_context(settings) as db:
        role_result = await db.execute(select(Role).where(Role.name == args.role))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise SystemExit(f"Role not found: {args.role!r} (seed roles first)")

        user_result = await db.execute(select(User).where(func.lower(User.email) == email))
        user = user_result.scalar_one_or_none()

        access_scope = AccessScope(args.access_scope)

        if user is None:
            user = User(
                email=email,
                name=args.name.strip() if args.name else email,
                role_id=role.id,
                department_id=department_id,
                access_scope=access_scope,
                hashed_password=None,
                external_id=None,
                is_active=True,
            )
            db.add(user)
            await db.flush()
            await db.commit()
            print(f"BOOTSTRAP_OK created email={email} role={role.name} scope={access_scope.value}")
            return 0

        changed = False

        if user.role_id != role.id:
            user.role_id = role.id
            changed = True
        if user.access_scope != access_scope:
            user.access_scope = access_scope
            changed = True
        if user.department_id != department_id:
            user.department_id = department_id
            changed = True
        if args.name and user.name != args.name.strip():
            user.name = args.name.strip()
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True

        if changed:
            db.add(user)
            await db.flush()
            await db.commit()
            print(
                "BOOTSTRAP_OK updated "
                f"email={email} role={role.name} scope={access_scope.value} external_id_set={bool(user.external_id)}"
            )
        else:
            print(
                "BOOTSTRAP_OK no-op "
                f"email={email} role={role.name} scope={access_scope.value} external_id_set={bool(user.external_id)}"
            )
        return 0


def main() -> int:
    args = _parse_args(sys.argv[1:])
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())

