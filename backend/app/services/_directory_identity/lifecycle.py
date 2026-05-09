from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import utc_now
from app.core.email import email_equals, normalize_email
from app.models import Department, User
from app.schemas.directory import DirectoryUserRead


class DirectoryIdentityConflictError(ValueError):
    pass


@dataclass(frozen=True)
class DirectoryImportOutcome:
    status: Literal["created", "updated", "conflict", "skipped"]
    user: User | None
    reason: str | None = None


@dataclass(frozen=True)
class DirectorySyncOutcome:
    status: Literal["active", "directory_disabled", "missing", "orphan_flagged", "error", "skipped"]
    user: User
    reason: str | None = None
    orphaned_items_flagged: int = 0
    revoked_sessions: int = 0


@dataclass(frozen=True)
class DirectoryProfileUpdateOutcome:
    status: Literal["applied", "local_sso_field_blocked", "conflict"]
    user: User
    reason: str | None = None


@dataclass(frozen=True)
class DirectoryReenableOutcome:
    status: Literal["allowed", "blocked_by_directory", "break_glass_required"]
    user: User
    reason: str | None = None


def resolve_directory_email(directory_user: DirectoryUserRead) -> str | None:
    return normalize_email(directory_user.email or directory_user.user_principal_name)


def normalize_business_role(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def has_auto_deprovision_reason(user: User) -> bool:
    from app.services.ad_deprovision_service import ADDeprovisionService

    return user.deprovision_reason in ADDeprovisionService.AUTO_DEPROVISION_REASONS


def requires_break_glass_for_reenable(user: User, *, now=None) -> bool:
    if not user.external_id or not has_auto_deprovision_reason(user):
        return False
    current_time = now or utc_now()
    return not user.has_active_break_glass(now=current_time)


def directory_reenable_outcome(user: User, *, now=None) -> DirectoryReenableOutcome:
    if requires_break_glass_for_reenable(user, now=now):
        return DirectoryReenableOutcome(
            status="break_glass_required",
            user=user,
            reason="Directory-deprovisioned users require break-glass enable before reactivation.",
        )
    if (
        user.external_id
        and user.directory_sync_status == "directory_disabled"
        and not user.has_active_break_glass(now=now)
    ):
        return DirectoryReenableOutcome(
            status="blocked_by_directory",
            user=user,
            reason="Directory-linked user is disabled in the directory.",
        )
    return DirectoryReenableOutcome(status="allowed", user=user)


async def resolve_or_create_department(db: AsyncSession, directory_department: str) -> Department:
    name = directory_department.strip()
    if not name:
        raise ValueError("Invalid directory department")

    result = await db.execute(select(Department).where(func.lower(Department.name) == name.lower()))
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    normalized = "".join(ch if ch.isalnum() else "_" for ch in name).strip("_").upper() or "DEPARTMENT"
    candidate_code = normalized[:50]
    suffix = 1
    while True:
        code_result = await db.execute(select(Department).where(func.lower(Department.code) == candidate_code.lower()))
        if code_result.scalar_one_or_none() is None:
            break
        suffix += 1
        suffix_str = str(suffix)
        head = normalized[: max(1, 50 - len(suffix_str) - 1)]
        candidate_code = f"{head}_{suffix_str}"

    department = Department(name=name, code=candidate_code, description="Imported from directory")
    db.add(department)
    await db.flush()
    return department


async def apply_directory_profile(
    db: AsyncSession,
    *,
    user: User,
    directory_user: DirectoryUserRead,
    sync_business_role: bool = False,
    seed_department: bool = False,
) -> User:
    now = utc_now()
    normalized_email = resolve_directory_email(directory_user)
    if normalized_email is not None and normalized_email != user.email:
        existing_user_id = (
            await db.execute(
                select(User.id).where(email_equals(User.email, normalized_email)).where(User.id != user.id).limit(1)
            )
        ).scalar_one_or_none()
        if existing_user_id is not None:
            raise DirectoryIdentityConflictError(
                f"Directory identity conflict: email already in use by user_id={existing_user_id}"
            )
        user.email = normalized_email

    user.name = directory_user.display_name or user.name or normalized_email or user.email
    user.external_id = directory_user.external_id
    user.job_title = directory_user.job_title
    if sync_business_role:
        user.entra_business_role = normalize_business_role(directory_user.business_role)
        user.entra_business_role_last_synced_at = now
    user.directory_last_checked_at = now
    user.directory_last_seen_at = now
    user.directory_sync_status = "active" if directory_user.account_enabled else "directory_disabled"

    if seed_department and directory_user.department:
        department = await resolve_or_create_department(db, directory_user.department)
        user.department_id = department.id

    db.add(user)
    await db.flush()
    return user


async def apply_directory_profile_outcome(
    db: AsyncSession,
    *,
    user: User,
    directory_user: DirectoryUserRead,
    sync_business_role: bool = False,
    seed_department: bool = False,
) -> DirectoryProfileUpdateOutcome:
    try:
        updated_user = await apply_directory_profile(
            db,
            user=user,
            directory_user=directory_user,
            sync_business_role=sync_business_role,
            seed_department=seed_department,
        )
    except DirectoryIdentityConflictError as exc:
        return DirectoryProfileUpdateOutcome(status="conflict", user=user, reason=str(exc))
    return DirectoryProfileUpdateOutcome(status="applied", user=updated_user)
