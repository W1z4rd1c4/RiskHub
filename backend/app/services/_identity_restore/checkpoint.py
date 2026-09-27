"""Current authorization and credential commitments, retained outside rollback snapshots."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.datetime_utils import coerce_utc, utc_now
from app.models import ActivityLog, LocalAuthFactor, Permission, Role, RolePermission, User
from app.services._local_auth.keys import LocalKeyring
from app.services.identity_installation import validate_installation_binding

from .files import canonical_json, fingerprint, sign_artifact
from .ownership import ownership_digest


class UserSecurityState(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    external_id: str | None
    email: str
    role_id: int
    role_digest: str
    access_scope: str
    department_id: int | None
    manager_id: int | None
    is_active: bool
    local_suspended: bool
    local_suspended_at: str | None
    local_recovery_pending: bool
    local_enrollment_state: str | None
    local_email_verified_at: str | None
    restore_quarantined: bool
    directory_sync_status: str | None
    deprovision_reason: str | None
    deprovisioned_at: str | None
    token_version: int
    credential_commitment: str
    factor_last_step: int | None


class SecurityCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    version: int = Field(default=1, ge=1, le=1)
    kind: Literal["security-checkpoint"] = "security-checkpoint"
    installation_id: str
    auth_mode: Literal["password", "microsoft_sso"]
    tenant_id: str | None
    captured_at: str
    source: str = Field(min_length=1, max_length=255)
    ownership_digest: str
    users: list[UserSecurityState]
    audit_references: list[dict]


def instant(value: datetime | None) -> str | None:
    normalized = coerce_utc(value)
    return normalized.isoformat() if normalized else None


async def role_digests(db: AsyncSession) -> dict[int, str]:
    permissions: dict[int, list[tuple[str, str]]] = {}
    for role_id, resource, action in await db.execute(
        select(RolePermission.role_id, Permission.resource, Permission.action).join(
            Permission, Permission.id == RolePermission.permission_id
        )
    ):
        permissions.setdefault(role_id, []).append((resource, action))
    return {
        role.id: fingerprint(
            canonical_json(
                {
                    "id": role.id,
                    "name": role.name,
                    "is_active": role.is_active,
                    "permissions": sorted(permissions.get(role.id, [])),
                }
            )
        )
        for role in await db.scalars(select(Role))
    }


def credential_commitment(
    user: User, factor: LocalAuthFactor | None, *, installation_id: str, keys: LocalKeyring | None, evidence_key: bytes
) -> str:
    seed = None
    if factor is not None:
        if keys is None:
            from .files import RestoreError

            raise RestoreError("Native factors require their separately protected decryption keys")
        seed = keys.decrypt(
            "totp", factor.key_id, factor.encrypted_seed, [installation_id, str(user.id), factor.generation]
        )
    # Commitments prove the same secret state across encryption-key rewraps without
    # putting password hashes or factor seeds into the operator checkpoint.
    return sign_artifact(
        {
            "installation_id": installation_id,
            "user_id": user.id,
            "email": user.email,
            "verified_at": instant(user.local_email_verified_at),
            "password_hash": user.hashed_password,
            "factor_generation": factor.generation if factor else None,
            "factor_confirmed_at": instant(factor.confirmed_at) if factor else None,
            "factor_seed": seed,
        },
        evidence_key,
    )["signature"]


async def capture_checkpoint(
    db: AsyncSession, settings: Settings, *, source: str, evidence_key: bytes
) -> SecurityCheckpoint:
    binding = await validate_installation_binding(db, settings=settings)
    keys = LocalKeyring.load(settings.local_auth_keyring_file) if binding.auth_mode == "password" else None
    roles = await role_digests(db)
    factors = {factor.user_id: factor for factor in await db.scalars(select(LocalAuthFactor))}
    states = []
    for user in await db.scalars(select(User).order_by(User.id)):
        factor = factors.get(user.id)
        states.append(
            UserSecurityState(
                id=user.id,
                external_id=user.external_id,
                email=user.email,
                role_id=user.role_id,
                role_digest=roles[user.role_id],
                access_scope=user.access_scope.value,
                department_id=user.department_id,
                manager_id=user.manager_id,
                is_active=user.is_active,
                local_suspended=user.local_suspended,
                local_suspended_at=instant(user.local_suspended_at),
                local_recovery_pending=user.local_recovery_pending,
                local_enrollment_state=user.local_enrollment_state,
                local_email_verified_at=instant(user.local_email_verified_at),
                restore_quarantined=user.restore_quarantined,
                directory_sync_status=user.directory_sync_status,
                deprovision_reason=user.deprovision_reason,
                deprovisioned_at=instant(user.deprovisioned_at),
                token_version=user.token_version,
                credential_commitment=credential_commitment(
                    user, factor, installation_id=binding.installation_id, keys=keys, evidence_key=evidence_key
                ),
                factor_last_step=factor.last_time_step if factor else None,
            )
        )
    return SecurityCheckpoint(
        installation_id=binding.installation_id,
        auth_mode="password" if binding.auth_mode == "password" else "microsoft_sso",
        tenant_id=binding.tenant_id,
        captured_at=utc_now().isoformat(),
        source=source,
        ownership_digest=await ownership_digest(db),
        users=states,
        audit_references=[
            {
                "id": row.id,
                "created_at": instant(row.created_at),
                "entity_type": str(row.entity_type),
                "entity_id": row.entity_id,
                "action": str(row.action),
                "actor_id": row.actor_id,
            }
            for row in await db.scalars(select(ActivityLog).order_by(ActivityLog.id))
        ],
    )
