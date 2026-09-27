"""Explicit operator review of quarantined access, independent from credential recovery."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.identity_policy import projected_account_active
from app.core.user_query_options import user_selectinload_options
from app.models import Department, IdentityRestoreCutover, LocalAuthFactor, Role, User
from app.models.role import RoleType
from app.models.user import AccessScope
from app.services._auth_session_workflow.authority import invalidate_user_sessions
from app.services._auth_session_workflow.transactions import commit_auth_transaction
from app.services._graph_directory import GraphDirectoryService
from app.services._identity_access_lifecycle.policy import effective_platform_admin_ids
from app.services._local_auth.common import audit_local

from .admission import validate_restore_admission
from .checkpoint import role_digests
from .files import RestoreError
from .ownership import ownership_digest


class AccessReview(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    epoch: str
    user_id: int
    expected_token_version: int
    role_id: int
    role_digest: str
    ownership_digest: str
    access_scope: str
    department_id: int | None
    manager_id: int | None
    suspended: bool
    reason: str = Field(min_length=10, max_length=2000)
    reviewer: str = Field(min_length=3, max_length=255)
    incident_reference: str = Field(min_length=3, max_length=255)


async def review_status(db: AsyncSession, settings: Settings, user_id: int) -> dict:
    await validate_restore_admission(db, settings=settings)
    user = await db.get(User, user_id)
    cutover = await db.get(IdentityRestoreCutover, 1)
    if user is None or cutover is None:
        raise RestoreError("Review requires an existing user and completed cutover")
    return {
        "epoch": cutover.epoch,
        "user_id": user.id,
        "expected_token_version": user.token_version,
        "role_id": user.role_id,
        "role_digest": (await role_digests(db))[user.role_id],
        "ownership_digest": await ownership_digest(db),
        "access_scope": user.access_scope.value,
        "department_id": user.department_id,
        "manager_id": user.manager_id,
        "suspended": user.local_suspended,
        "restore_quarantined": user.restore_quarantined,
        "credential_recovery_pending": user.local_recovery_pending,
    }


async def reconcile_user(db: AsyncSession, settings: Settings, review: AccessReview) -> dict:
    await validate_restore_admission(db, settings=settings)
    probe = await db.get(User, review.user_id)
    if probe is None:
        raise RestoreError("Review requires an existing user")
    expected_subject = probe.external_id
    upstream = None
    if expected_subject is not None:
        # Never hold a User row lock across a remote directory request.
        upstream = await GraphDirectoryService(settings).get_user(expected_subject)
    cutover = await db.get(IdentityRestoreCutover, 1)
    user = await db.scalar(
        select(User)
        .where(User.id == review.user_id)
        .options(*user_selectinload_options(include_permissions=True))
        .with_for_update(of=User)
        .execution_options(populate_existing=True)
    )
    role = await db.get(Role, review.role_id)
    if (
        cutover is None
        or cutover.epoch != review.epoch
        or user is None
        or user.external_id != expected_subject
        or not user.restore_quarantined
        or user.token_version != review.expected_token_version
        or role is None
        or not role.is_active
        or (await role_digests(db)).get(review.role_id) != review.role_digest
        or await ownership_digest(db) != review.ownership_digest
    ):
        raise RestoreError("Access review is stale or does not describe a quarantined existing user")
    if role.name in {RoleType.ADMIN, RoleType.CRO} and role.id != user.role_id:
        raise RestoreError("Restore review cannot create a privileged account or elevate an existing account")
    if role.name != RoleType.ADMIN and not await effective_platform_admin_ids(db, settings=settings):
        raise RestoreError("Recover and review the existing platform administrator before ordinary access")
    scope = AccessScope(review.access_scope)
    if review.department_id is not None:
        department = await db.get(Department, review.department_id)
        if department is None or not department.is_active:
            raise RestoreError("Review must select an existing active department")
    if review.manager_id is not None and (
        review.manager_id == user.id or await db.get(User, review.manager_id) is None
    ):
        raise RestoreError("Review must select an existing separate manager")
    if user.external_id is not None:
        if upstream is None or upstream.external_id != user.external_id or upstream.account_enabled is not True:
            raise RestoreError("Current upstream account eligibility could not be established")
        user.directory_sync_status, user.deprovision_reason, user.deprovisioned_at = "active", None, None
    else:
        factor = await db.scalar(select(LocalAuthFactor).where(LocalAuthFactor.user_id == user.id))
        # Access may be reviewed before recovery. Pending recovery still blocks all
        # login; completion of the existing dual-controlled ceremony then enables it.
        if user.local_enrollment_state == "enrolled" and (
            not user.hashed_password
            or user.local_email_verified_at is None
            or (settings.local_mfa_policy == "required" and (factor is None or factor.confirmed_at is None))
        ):
            user.local_recovery_pending = True
        elif user.local_enrollment_state != "enrolled":
            # An uncompleted invitation has no valid old credential to retain.
            user.hashed_password = None
            user.local_recovery_pending = False
    user.role_id, user.access_scope = role.id, scope
    user.department_id, user.manager_id = review.department_id, review.manager_id
    user.local_suspended = review.suspended
    user.local_suspended_at = utc_now() if review.suspended else None
    user.restore_quarantined = False
    await invalidate_user_sessions(db=db, user=user, reason="identity_restore_access_review")
    user.is_active = projected_account_active(user, settings=settings)
    await audit_local(
        db,
        user,
        "identity_restore_access_reviewed",
        reason=review.reason,
        evidence={
            "restore_epoch": review.epoch,
            "reviewer": review.reviewer,
            "incident_reference": review.incident_reference,
            "role_id": review.role_id,
            "role_digest": review.role_digest,
            "ownership_digest": review.ownership_digest,
            "access_scope": review.access_scope,
            "department_id": review.department_id,
            "manager_id": review.manager_id,
            "local_suspended": review.suspended,
            "credential_recovery_pending": user.local_recovery_pending,
        },
    )
    await commit_auth_transaction(db, boundary="identity_restore_access_review")
    return {
        "status": "access-reviewed",
        "user_id": user.id,
        "active": user.is_active,
        "credential_recovery_pending": user.local_recovery_pending,
    }
