"""Native recovery eligibility and exact operation binding."""

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import normalize_email
from app.core.permissions import has_permission, is_platform_admin
from app.models import User
from app.models.role import RoleType
from app.models.user import AccessScope

from .common import audit_local, commit_local, invalid_proof


def recovery_intent(operation: str, version: int, email: str | None) -> str:
    return json.dumps([operation, version, normalize_email(email) if email else None], separators=(",", ":"))


def privileged_recovery_target(user: User) -> bool:
    return bool(
        user.role.name in {RoleType.ADMIN, RoleType.CRO}
        or (
            user.access_scope == AccessScope.GLOBAL
            and any(
                has_permission(user, resource, action)
                for resource in ("users", "access_management", "recovery")
                for action in ("write", "manage")
            )
        )
    )


def require_recoverable(user: User, *, version: int, web: bool = False) -> None:
    if (
        user.token_version != version
        or user.external_id is not None
        or user.local_suspended
        or user.local_enrollment_state != "enrolled"
        or user.local_email_verified_at is None
        or not user.role.is_active
        or not (user.is_active or user.local_recovery_pending)
        or (web and privileged_recovery_target(user))
    ):
        raise invalid_proof()


async def require_web_recoverable(db: AsyncSession, user: User, *, actor: User, version: int) -> None:
    """Audit the privileged web boundary before consuming any proof or factor."""
    if privileged_recovery_target(user):
        from app.models.activity_log import ActivityAction

        await audit_local(
            db,
            user,
            "local_privileged_recovery_denied",
            actor=actor,
            action=ActivityAction.FAILED_LOGIN,
            evidence={"event_type": "local_privileged_recovery_denied", "failure_code": "offline_recovery_required"},
        )
        await commit_local(db, "privileged_recovery_denied")
        raise invalid_proof()
    require_recoverable(user, version=version, web=True)


def require_recovery_actor(user: User) -> None:
    from .common import local_user_ready

    if not is_platform_admin(user) or not local_user_ready(user) or not user.role.is_active:
        raise invalid_proof()
