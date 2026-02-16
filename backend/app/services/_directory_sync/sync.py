from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.ad_emulator_client import ADEmulatorClient
from app.models import Department, User
from app.models.directory_sync_log import DirectorySyncLog, DirectorySyncStatus
from app.schemas.directory_sync import DirectorySyncPreview, DirectoryUserDiff

from .departments import _get_or_create_department
from .diffing import _diff_field
from .logging import logger
from .normalize import _display_name, _email_sha256, _normalize_email, _normalize_text
from .orphans import cleanup_empty_departments
from .roles import _resolve_default_role


async def run_sync(db: AsyncSession, apply_changes: bool) -> DirectorySyncPreview:
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
                diffs.append(
                    DirectoryUserDiff(
                        external_id="unknown",
                        email=email,
                        user_principal_name=upn,
                        action="error",
                        error=error,
                    )
                )
                errors.append({"error": error, "data": dir_user})
                continue

            if external_id in seen_external_ids:
                error_count += 1
                error = f"Duplicate external_id in directory set: {external_id}"
                diffs.append(
                    DirectoryUserDiff(
                        external_id=external_id,
                        email=email,
                        user_principal_name=upn,
                        action="error",
                        error=error,
                    )
                )
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
                    diffs.append(
                        DirectoryUserDiff(
                            external_id=external_id,
                            email=target_email,
                            user_principal_name=upn,
                            action="error",
                            error=error,
                        )
                    )
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
                sync_log.status = (
                    DirectorySyncStatus.partial
                    if (created_count or updated_count or deactivated_count)
                    else DirectorySyncStatus.failed
                )

            sync_log.finished_at = datetime.now(UTC)
            sync_log.created_count = created_count
            sync_log.updated_count = updated_count
            sync_log.deactivated_count = deactivated_count
            sync_log.error_count = error_count
            sync_log.errors = errors or None

            await db.commit()

            # 7. Post-sync Cleanup
            try:
                cleaned = await cleanup_empty_departments(db)
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
