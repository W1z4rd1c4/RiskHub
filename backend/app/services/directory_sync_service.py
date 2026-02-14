"""Directory emulator sync service."""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.policy import SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES
from app.integrations.ad_emulator_client import ADEmulatorClient
from app.models import Department, Role, User
from app.models.directory_sync_log import DirectorySyncLog, DirectorySyncStatus
from app.schemas.directory_sync import DirectorySyncPreview, DirectoryUserDiff

logger = logging.getLogger(__name__)


def _normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    email = value.strip().lower()
    if "@" not in email:
        return None
    return email


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _display_name(user_data: dict[str, Any], fallback_email: str | None) -> str:
    if user_data.get("display_name"):
        return user_data["display_name"].strip()
    given = (user_data.get("given_name") or "").strip()
    surname = (user_data.get("surname") or "").strip()
    combined = (f"{given} {surname}").strip()
    if combined:
        return combined
    if fallback_email:
        return fallback_email
    return user_data.get("external_id", "")


def _email_sha256(value: str | None) -> str:
    if not value:
        return "none"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


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


async def _resolve_default_role(db: AsyncSession) -> Role:
    """Resolve a safe default role for new directory users.

    Only returns non-privileged roles (employee, control_owner, viewer).
    Raises ValueError if no suitable role exists - never falls back to privileged roles.
    """
    for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES:
        result = await db.execute(select(Role).where(Role.name == name))
        role = result.scalar_one_or_none()
        if role:
            return role

    candidates = ", ".join(str(name) for name in SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES)
    raise ValueError(
        f"No safe default role found ({candidates}). "
        "Seed roles before syncing directory users."
    )


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

    result = await db.execute(
        select(Department).where(func.lower(Department.name) == key)
    )
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


def _diff_field(changes: dict, field: str, old, new) -> None:
    if old != new:
        changes[field] = {"old": old, "new": new}


class DirectorySyncService:
    """Service for previewing and applying directory sync from external AD Emulator."""

    @staticmethod
    async def preview_sync(db: AsyncSession) -> DirectorySyncPreview:
        return await DirectorySyncService._run_sync(db, apply_changes=False)

    @staticmethod
    async def apply_sync(db: AsyncSession) -> DirectorySyncPreview:
        return await DirectorySyncService._run_sync(db, apply_changes=True)

    @staticmethod
    async def _run_sync(db: AsyncSession, apply_changes: bool) -> DirectorySyncPreview:
        # 1. Initialize Sync Log (if applying)
        sync_log: DirectorySyncLog | None = None
        if apply_changes:
            sync_log = DirectorySyncLog(
                started_at=datetime.now(UTC),
                status=DirectorySyncStatus.success,
            )
            db.add(sync_log)
            await db.flush()

        client = ADEmulatorClient()
        try:
            # 2. Fetch data from Emulator
            try:
                directory_users_data = await client.get_users()
            except Exception as e:
                error_msg = f"Failed to fetch users from AD Emulator: {str(e)}"
                logger.exception(error_msg)
                if sync_log:
                    sync_log.status = DirectorySyncStatus.failed
                    sync_log.finished_at = datetime.now(UTC)
                    sync_log.errors = [{"error": error_msg}]
                    await db.commit()
                raise

            # 3. Load local state for diffing
            users = (await db.execute(select(User))).scalars().all()
            departments = (await db.execute(select(Department))).scalars().all()

            dept_cache = {d.name.lower(): d for d in departments}
            dept_by_id = {d.id: d for d in departments}
            existing_codes = {d.code.upper() for d in departments if d.code}

            # Local users lookup maps
            user_by_id = {u.id: u for u in users}
            user_by_external_id = {u.external_id: u for u in users if u.external_id}
            user_by_email = {u.email.lower(): u for u in users if u.email}

            default_role = await _resolve_default_role(db)

            diffs: list[DirectoryUserDiff] = []
            diffs_by_external_id: dict[str, DirectoryUserDiff] = {}
            errors: list[dict] = []

            created_count = 0
            updated_count = 0
            deactivated_count = 0
            error_count = 0

            planned_user_ids: dict[str, int] = {}
            seen_external_ids: set[str] = set()

            # 4. First Pass: Create/Update/Deactivate
            for dir_user in directory_users_data:
                external_id = dir_user.get("external_id")
                email = dir_user.get("email")
                upn = dir_user.get("user_principal_name")
                account_enabled = dir_user.get("account_enabled", True)
                department = dir_user.get("department")
                manager_external_id = dir_user.get("manager_external_id")

                if not external_id:
                    error_count += 1
                    error = "Missing external_id in directory user"
                    diffs.append(DirectoryUserDiff(
                        external_id="unknown",
                        email=email,
                        user_principal_name=upn,
                        action="error",
                        error=error,
                    ))
                    errors.append({"error": error, "data": dir_user})
                    continue

                if external_id in seen_external_ids:
                    error_count += 1
                    error = f"Duplicate external_id in directory set: {external_id}"
                    diffs.append(DirectoryUserDiff(
                        external_id=external_id,
                        email=email,
                        user_principal_name=upn,
                        action="error",
                        error=error,
                    ))
                    errors.append({"external_id": external_id, "error": error})
                    continue
                seen_external_ids.add(external_id)

                # Prioritize matching by external_id
                user = user_by_external_id.get(external_id)

                normalized_email = _normalize_email(email)
                normalized_upn = _normalize_email(upn)
                target_email = normalized_email or normalized_upn

                # Fallback to email matching if no external_id match found
                if not user and target_email:
                    user = user_by_email.get(target_email)
                    if user and not user.external_id:
                        logger.info(
                            "Link user_id=%s to external_id=%s email_sha256=%s",
                            user.id,
                            external_id,
                            _email_sha256(user.email),
                        )
                    elif user and user.external_id:
                        # Email exists but is linked to another external_id!
                        error_count += 1
                        error = f"Email {target_email} already linked to another external_id: {user.external_id}"
                        diffs.append(DirectoryUserDiff(
                            external_id=external_id,
                            email=target_email,
                            user_principal_name=upn,
                            action="error",
                            error=error,
                        ))
                        errors.append({"external_id": external_id, "error": error})
                        continue

                target_name = _display_name(dir_user, target_email)
                target_active = bool(account_enabled)
                target_department_name = _normalize_text(department)

                if user is None:
                    # CREATE
                    changes = {
                        "email": {"old": None, "new": target_email},
                        "name": {"old": None, "new": target_name},
                        "is_active": {"old": None, "new": target_active},
                        "department": {"old": None, "new": target_department_name},
                        "external_id": {"old": None, "new": external_id},
                    }
                    diff = DirectoryUserDiff(
                        external_id=external_id,
                        email=target_email,
                        user_principal_name=upn,
                        action="create",
                        changes=changes,
                    )
                    diffs.append(diff)
                    diffs_by_external_id[external_id] = diff
                    created_count += 1

                    if apply_changes:
                        dept = await _get_or_create_department(db, target_department_name, dept_cache, existing_codes)
                        user = User(
                            email=target_email,
                            name=target_name,
                            is_active=target_active,
                            external_id=external_id,
                            role_id=default_role.id,
                            department_id=dept.id if dept else None,
                            hashed_password=None,
                        )
                        db.add(user)
                        await db.flush()
                        user_by_id[user.id] = user
                        user_by_external_id[external_id] = user
                        if target_email:
                            user_by_email[target_email.lower()] = user
                        planned_user_ids[external_id] = user.id
                    else:
                        planned_user_ids[external_id] = 0
                    continue

                # UPDATE / DEACTIVATE
                planned_user_ids[external_id] = user.id

                current_department_name = None
                if user.department_id:
                    current_department = dept_by_id.get(user.department_id)
                    current_department_name = current_department.name if current_department else None

                changes: dict[str, dict] = {}
                _diff_field(changes, "name", user.name, target_name)
                _diff_field(changes, "email", user.email, target_email)
                _diff_field(changes, "department", current_department_name, target_department_name)
                _diff_field(changes, "is_active", user.is_active, target_active)
                _diff_field(changes, "external_id", user.external_id, external_id)

                if changes:
                    action = "deactivate" if user.is_active and not target_active else "update"
                    diff = DirectoryUserDiff(
                        external_id=external_id,
                        email=target_email,
                        user_principal_name=upn,
                        user_id=user.id,
                        action=action,
                        changes=changes,
                    )
                    diffs.append(diff)
                    diffs_by_external_id[external_id] = diff

                    if action == "deactivate":
                        deactivated_count += 1
                    else:
                        updated_count += 1

                    if apply_changes:
                        old_email = user.email.lower() if user.email else None
                        dept = await _get_or_create_department(db, target_department_name, dept_cache, existing_codes)
                        user.name = target_name
                        user.email = target_email
                        user.is_active = target_active
                        user.external_id = external_id
                        user.department_id = dept.id if dept else None

                        if user.email and user.email.lower() != old_email:
                            if old_email:
                                user_by_email.pop(old_email, None)
                            user_by_email[user.email.lower()] = user

            # 5. Second Pass: Resolve Managers
            for dir_user in directory_users_data:
                external_id = dir_user.get("external_id")
                manager_external_id = dir_user.get("manager_external_id")
                if not manager_external_id:
                    continue

                user_id = planned_user_ids.get(external_id)
                if not user_id:
                    continue

                user = user_by_id.get(user_id)
                manager_user_id = planned_user_ids.get(manager_external_id)

                if not manager_user_id or user.manager_id == manager_user_id:
                    continue

                diff = diffs_by_external_id.get(external_id)
                if not diff:
                    diff = DirectoryUserDiff(
                        external_id=external_id,
                        email=user.email,
                        user_id=user.id,
                        action="update",
                        changes={},
                    )
                    diffs.append(diff)
                    diffs_by_external_id[external_id] = diff
                    updated_count += 1

                if diff.changes is None:
                    diff.changes = {}
                _diff_field(diff.changes, "manager_id", user.manager_id, manager_user_id)

                if apply_changes:
                    user.manager_id = manager_user_id

            # 6. Finalize Transaction & Log
            if apply_changes:
                sync_log.status = DirectorySyncStatus.success
                if error_count > 0:
                    sync_log.status = DirectorySyncStatus.partial if (created_count or updated_count or deactivated_count) else DirectorySyncStatus.failed

                sync_log.finished_at = datetime.now(UTC)
                sync_log.created_count = created_count
                sync_log.updated_count = updated_count
                sync_log.deactivated_count = deactivated_count
                sync_log.error_count = error_count
                sync_log.errors = errors or None

                await db.commit()

                # 7. Post-sync Cleanup
                try:
                    cleaned = await DirectorySyncService.cleanup_empty_departments(db)
                    if cleaned > 0:
                        logger.info(f"Cleaned up {cleaned} empty departments after full sync")
                except Exception as e:
                    logger.error(f"Failed to cleanup empty departments: {e}")

            return DirectorySyncPreview(
                created_count=created_count,
                updated_count=updated_count,
                deactivated_count=deactivated_count,
                error_count=error_count,
                diffs=diffs,
            )

        except Exception as e:
            logger.exception("Directory sync execution failed")
            if apply_changes and sync_log:
                await db.rollback()
                sync_log.status = DirectorySyncStatus.failed
                sync_log.finished_at = datetime.now(UTC)
                sync_log.errors = [{"error": str(e)}]
                await db.commit()
            raise

    @staticmethod
    async def detect_orphans(db: AsyncSession, user_id: int) -> dict:
        """
        Detect items that will become orphaned when a user is deactivated.

        Returns dict with lists of affected item IDs.
        """
        from app.models.control import Control
        from app.models.risk import Risk

        # Find risks owned by this user
        risks_result = await db.execute(
            select(Risk.id).where(Risk.owner_id == user_id)
        )
        risk_ids = [r[0] for r in risks_result.all()]

        # Find controls owned by this user
        controls_result = await db.execute(
            select(Control.id).where(Control.control_owner_id == user_id)
        )
        control_ids = [c[0] for c in controls_result.all()]

        return {
            "risks": risk_ids,
            "controls": control_ids,
            "total": len(risk_ids) + len(control_ids),
        }

    @staticmethod
    async def sync_single_user(
        db: AsyncSession,
        user_data: dict,
        event_type: str,
    ) -> dict:
        """
        Sync a single user based on webhook event.

        Args:
            db: Database session
            user_data: User data from webhook payload
            event_type: One of "user.created", "user.updated", "user.deactivated", "user.activated"

        Returns:
            Dict with action taken, user_id, and orphaned_items (for deactivation)
        """
        external_id = user_data.get("external_id")
        if not external_id:
            raise ValueError("Missing external_id in user data")

        # Find existing user
        result = await db.execute(
            select(User).where(User.external_id == external_id)
        )
        user = result.scalar_one_or_none()

        # Also try to find by email if not found by external_id
        if not user and user_data.get("email"):
            email = _normalize_email(user_data.get("email"))
            if email:
                result = await db.execute(
                    select(User).where(func.lower(User.email) == email)
                )
                user = result.scalar_one_or_none()

        orphaned_items = {"risks": [], "controls": [], "total": 0}

        if event_type == "user.deactivated":
            if not user:
                logger.warning(f"Cannot deactivate unknown user: {external_id}")
                return {
                    "action": "not_found",
                    "user_id": None,
                    "orphaned_items": orphaned_items,
                }

            # Flag orphaned items before deactivating
            from app.services.orphaned_item_service import OrphanedItemService
            flagged_items = await OrphanedItemService.flag_orphaned_items(db, user.id)

            # Detect orphans for the response
            orphaned_items = await DirectorySyncService.detect_orphans(db, user.id)
            if orphaned_items["total"] > 0:
                logger.warning(
                    f"Deactivating user {user.email} - flagged "
                    f"{len(orphaned_items['risks'])} risks and "
                    f"{len(orphaned_items['controls'])} controls as orphaned"
                )

            user.is_active = False
            await db.commit()

            return {
                "action": "deactivated",
                "user_id": user.id,
                "orphaned_items": orphaned_items,
                "flagged_count": len(flagged_items),
            }

        elif event_type == "user.activated":
            if not user:
                logger.warning(f"Cannot activate unknown user: {external_id}")
                return {
                    "action": "not_found",
                    "user_id": None,
                    "orphaned_items": orphaned_items,
                }

            user.is_active = True
            await db.commit()

            return {
                "action": "activated",
                "user_id": user.id,
                "orphaned_items": orphaned_items,
            }

        elif event_type in ("user.created", "user.updated"):
            # Load caches for department handling
            departments = (await db.execute(select(Department))).scalars().all()
            dept_cache = {d.name.lower(): d for d in departments}
            existing_codes = {d.code.upper() for d in departments if d.code}

            target_email = _normalize_email(user_data.get("email"))
            target_name = _display_name(user_data, target_email)
            target_department = _normalize_text(user_data.get("department"))
            target_active = user_data.get("account_enabled", True)
            target_employee_type = user_data.get("employee_type", "employee")

            if user:
                # UPDATE existing user
                dept = await _get_or_create_department(db, target_department, dept_cache, existing_codes)

                user.email = target_email or user.email
                user.name = target_name
                user.is_active = target_active
                user.external_id = external_id
                user.employee_type = target_employee_type
                if dept:
                    user.department_id = dept.id

                await db.commit()

                return {
                    "action": "updated",
                    "user_id": user.id,
                    "orphaned_items": orphaned_items,
                }
            else:
                # CREATE new user
                default_role = await _resolve_default_role(db)
                dept = await _get_or_create_department(db, target_department, dept_cache, existing_codes)

                user = User(
                    email=target_email,
                    name=target_name,
                    is_active=target_active,
                    external_id=external_id,
                    role_id=default_role.id,

                    department_id=dept.id if dept else None,
                    employee_type=target_employee_type,
                    hashed_password=None,
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)

                # Cleanup (fire and forget check)
                try:
                     await DirectorySyncService.cleanup_empty_departments(db)
                except Exception as e:
                    logger.error(f"Failed to cleanup empty departments in single sync: {e}")

                return {
                    "action": "created",
                    "user_id": user.id,
                    "orphaned_items": orphaned_items,
                }

        else:
            raise ValueError(f"Unknown event type: {event_type}")

    @staticmethod
    async def cleanup_empty_departments(db: AsyncSession) -> int:
        """
        Move items from empty departments to Uncategorised.
        Empty means no ACTIVE users.
        Returns number of departments cleaned up.
        """
        from app.models.control import Control
        from app.models.risk import Risk

        # Find Uncategorised department
        uncat_result = await db.execute(select(Department).where(Department.code == "UNCAT"))
        uncat_dept = uncat_result.scalar_one_or_none()
        if not uncat_dept:
            logger.error("Uncategorised department not found, skipping cleanup")
            return 0

        # Find empty non-system departments
        # Department is empty if it has NO users with is_active=True
        # We use a left join on users filtering for active ones

        # Subquery for departments with ACTIVE users
        active_dept_ids = select(User.department_id).where(
            and_(User.department_id.isnot(None), User.is_active.is_(True))
        ).distinct()

        # Select departments NOT in that list
        stmt = (
            select(Department)
            .where(Department.is_system.is_(False))
            .where(Department.id.not_in(active_dept_ids))
        )

        result = await db.execute(stmt)
        empty_depts = result.scalars().all()

        cleanup_count = 0
        for dept in empty_depts:
            # Move Risks
            await db.execute(
                update(Risk)
                .where(Risk.department_id == dept.id)
                .values(department_id=uncat_dept.id)
            )
            # Move Controls
            await db.execute(
                update(Control)
                .where(Control.department_id == dept.id)
                .values(department_id=uncat_dept.id)
            )
            cleanup_count += 1
            logger.info(f"Cleaned up empty department {dept.name} ({dept.code}) - items moved to Uncategorised")

        if cleanup_count > 0:
            await db.commit()

        return cleanup_count
