from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import and_, false, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.core.permissions import (
    can_manage_users,
    get_user_department_ids,
    has_permission,
    is_platform_admin,
)
from app.models import Department, OrphanedItem, Process, User
from app.models.role import RoleType
from app.services._ict_register_lifecycle.lifecycle_adapters import RegisterLifecyclePolicy
from app.services._process_owner_lock import (
    acquire_process_owner_identity_lock,
    lock_process_for_owner_mutation,
)

_POLICY = RegisterLifecyclePolicy[Process](model=Process, resource="processes", entity_label="Process")


async def load_process(db: AsyncSession, process_id: int) -> Process | None:
    result = await db.execute(
        select(Process)
        .options(
            selectinload(Process.process_owner).selectinload(User.role),
            selectinload(Process.process_owner).selectinload(User.department),
            selectinload(Process.owning_department),
        )
        .where(Process.id == process_id)
    )
    return result.scalar_one_or_none()


def _is_owning_department_head(current_user: User, process: Process) -> bool:
    role_name = current_user.role.name if current_user.role is not None else None
    return bool(
        role_name == RoleType.DEPARTMENT_HEAD
        and process.owning_department_id is not None
        and process.owning_department_id == current_user.department_id
    )


def can_read_process_record(current_user: User, process: Process) -> bool:
    if is_platform_admin(current_user):
        return False
    if process.process_owner_user_id == current_user.id:
        return True
    if not has_permission(current_user, "processes", "read"):
        return False
    department_ids = get_user_department_ids(current_user)
    return department_ids is None or process.owning_department_id in department_ids


def can_update_process_record(current_user: User, process: Process) -> bool:
    if process.is_archived or not can_read_process_record(current_user, process):
        return False
    return bool(
        has_permission(current_user, "processes", "write")
        or process.process_owner_user_id == current_user.id
        or _is_owning_department_head(current_user, process)
    )


def process_visibility_clause(current_user: User):
    if is_platform_admin(current_user):
        return false()
    owner_clause = Process.process_owner_user_id == current_user.id
    if not has_permission(current_user, "processes", "read"):
        return owner_clause
    department_ids = get_user_department_ids(current_user)
    if department_ids is None:
        return None
    if not department_ids:
        return owner_clause if current_user.id is not None else false()
    return or_(owner_clause, Process.owning_department_id.in_(department_ids))


def editable_process_visibility_clause(current_user: User):
    """Rows the caller may mutate under the canonical Process record policy."""
    if is_platform_admin(current_user):
        return false()

    owner_clause = Process.process_owner_user_id == current_user.id
    editable_clauses = [owner_clause]
    can_read = has_permission(current_user, "processes", "read")
    has_global_write = False

    if can_read and has_permission(current_user, "processes", "write"):
        readable_clause = process_visibility_clause(current_user)
        if readable_clause is None:
            has_global_write = True
        else:
            editable_clauses.append(readable_clause)

    role_name = current_user.role.name if current_user.role is not None else None
    if (
        can_read
        and role_name == RoleType.DEPARTMENT_HEAD
        and current_user.department_id is not None
    ):
        editable_clauses.append(
            Process.owning_department_id == current_user.department_id
        )

    pending_orphan_exists = (
        select(OrphanedItem.id)
        .where(
            OrphanedItem.item_type == "process",
            OrphanedItem.item_id == Process.id,
            OrphanedItem.status == "pending",
        )
        .exists()
    )
    return and_(
        Process.is_archived.is_(False),
        true() if has_global_write else or_(*editable_clauses),
        ~pending_orphan_exists,
    )


async def has_editable_process_record(
    db: AsyncSession,
    *,
    current_user: User,
) -> bool:
    """Return only an existence fact; never project an unreadable Process row."""
    process_id = await db.scalar(
        select(Process.id)
        .where(editable_process_visibility_clause(current_user))
        .limit(1)
    )
    return process_id is not None


async def can_use_process_assignment_lookup(
    db: AsyncSession,
    *,
    current_user: User,
) -> bool:
    if is_platform_admin(current_user):
        return False
    if can_manage_users(current_user):
        return True

    department_ids = get_user_department_ids(current_user)
    if department_ids is None and has_permission(current_user, "processes", "write"):
        return True

    role_name = current_user.role.name if current_user.role is not None else None
    eligibility_clauses = [Process.process_owner_user_id == current_user.id]
    if (
        role_name == RoleType.DEPARTMENT_HEAD
        and current_user.department_id is not None
        and has_permission(current_user, "processes", "read")
    ):
        eligibility_clauses.append(
            Process.owning_department_id == current_user.department_id
        )
    editable_process_id = (
        await db.execute(
            select(Process.id)
            .where(Process.is_archived.is_(False), or_(*eligibility_clauses))
            .limit(1)
        )
    ).scalar_one_or_none()
    return editable_process_id is not None


async def assert_process_assignment_lookup_allowed(
    db: AsyncSession,
    *,
    current_user: User,
) -> None:
    if not await can_use_process_assignment_lookup(db, current_user=current_user):
        raise AuthorizationError("Permission denied: Process assignment lookup")


async def assert_active_process_owner(
    db: AsyncSession,
    *,
    user_id: int,
    acquire_identity_lock: bool = True,
) -> User:
    if acquire_identity_lock:
        await acquire_process_owner_identity_lock(db, user_id=user_id)
    owner = (
        await db.execute(
            select(User)
            .options(selectinload(User.role), selectinload(User.department))
            .where(User.id == user_id)
        )
    ).scalar_one_or_none()
    if owner is None:
        raise ValidationError("Process owner must be an active user")
    assert_process_owner_eligible(owner)
    return owner


def assert_process_owner_eligible(owner: User) -> None:
    """Apply the canonical active business-owner policy to a loaded User."""
    error = process_owner_eligibility_error(owner)
    if error is not None:
        raise ValidationError(error)


def process_owner_eligibility_error(owner: User) -> str | None:
    """Return the canonical owner-policy failure without acquiring new locks."""
    if not owner.is_active:
        return "Process owner must be an active user"
    if is_platform_admin(owner):
        return "Platform admins cannot own business Processes"
    return None


async def assert_active_owning_department(
    db: AsyncSession,
    *,
    department_id: int,
) -> Department:
    department = (
        await db.execute(
            select(Department)
            .where(
                Department.id == department_id,
                Department.is_active.is_(True),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if department is None:
        raise ValidationError("Owning department must be active")
    return department


async def assert_process_readable(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    process = await load_process(db, process_id)
    if process is None or not can_read_process_record(current_user, process):
        raise NotFoundError("Process not found")
    return process


async def assert_process_create_allowed(*, current_user: User) -> None:
    _POLICY.assert_create_allowed(current_user=current_user)


async def assert_process_update_allowed(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    process = await assert_process_readable(db, process_id=process_id, current_user=current_user)
    if process.is_archived:
        raise ConflictError("Cannot update archived process")
    if not can_update_process_record(current_user, process):
        raise AuthorizationError("Permission denied: processes:write")
    return process


async def assert_process_ordinary_mutation_allowed(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
    additional_owner_user_ids: Iterable[int | None] = (),
) -> Process:
    """Authorize and lock an ordinary Process mutation, then reject orphan state.

    The identity -> Process row order serializes ordinary edits and link
    mutations against owner deactivation and Governance reassignment.
    """
    process = await assert_process_update_allowed(
        db,
        process_id=process_id,
        current_user=current_user,
    )
    expected_owner_id = process.process_owner_user_id
    locked_process = await lock_process_for_owner_mutation(
        db,
        process_id=process.id,
        user_ids=(expected_owner_id, *additional_owner_user_ids),
        expected_owner_user_id=expected_owner_id,
    )
    if locked_process is None:
        raise NotFoundError("Process not found")
    process = locked_process
    if process.is_archived:
        raise ConflictError("Cannot update archived process")
    if not can_update_process_record(current_user, process):
        raise AuthorizationError("Permission denied: processes:write")

    pending_orphan_id = await db.scalar(
        select(OrphanedItem.id)
        .where(
            OrphanedItem.item_type == "process",
            OrphanedItem.item_id == process.id,
            OrphanedItem.status == "pending",
        )
        .limit(1)
    )
    if pending_orphan_id is not None:
        raise ConflictError(
            "Orphaned Process ownership must be reassigned through the governance workflow"
        )
    return process


async def assert_process_archive_allowed(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    return await _POLICY.assert_archive_allowed(db, entity_id=process_id, current_user=current_user)


async def assert_process_restore_allowed(db: AsyncSession, *, process_id: int, current_user: User) -> Process:
    return await _POLICY.assert_restore_allowed(db, entity_id=process_id, current_user=current_user)


async def assert_process_lifecycle_mutation_allowed(
    db: AsyncSession,
    *,
    process_id: int,
    current_user: User,
    restore: bool,
) -> Process:
    """Authorize, then serialize archive/restore in the canonical owner order."""
    snapshot = (
        await assert_process_restore_allowed(
            db,
            process_id=process_id,
            current_user=current_user,
        )
        if restore
        else await assert_process_archive_allowed(
            db,
            process_id=process_id,
            current_user=current_user,
        )
    )
    expected_owner_id = snapshot.process_owner_user_id
    process = await lock_process_for_owner_mutation(
        db,
        process_id=process_id,
        user_ids=(expected_owner_id,),
        expected_owner_user_id=expected_owner_id,
    )
    if process is None:
        raise NotFoundError("Process not found")
    if restore and not process.is_archived:
        raise ValidationError("Process is not archived")
    if not restore and process.is_archived:
        raise ValidationError("Process is already archived")
    return process
