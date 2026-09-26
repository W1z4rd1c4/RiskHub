"""Identity manifest for the operator-managed PostgreSQL dump, not a second backup store."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Literal

from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.security import _bounded_password_hash
from app.models import LocalBootstrapTarget, User
from app.services._local_auth.key_rotation import verify_key_material
from app.services._local_auth.keys import LocalKeyring
from app.services.identity_installation import validate_installation_binding

from .admission import RESTORE_CONTRACT_VERSION
from .files import RestoreError


class BackupManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    version: int = Field(default=1, ge=1, le=1)
    kind: Literal["identity-backup"] = "identity-backup"
    installation_id: str
    auth_mode: Literal["password", "microsoft_sso"]
    tenant_id: str | None
    identity_contract: int
    restore_contract: int
    schema_revision: str
    application_identity: dict[str, str]
    password_formats: list[str]
    factor_format: Literal["aesgcm-local-v1"] = "aesgcm-local-v1"
    key_ids: dict[str, list[str]]
    captured_at: str
    dump_sha256: str


def dump_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        if stream.read(5) != b"PGDMP":
            raise RestoreError("Use a PostgreSQL custom-format dump from the supported backup command")
        stream.seek(0)
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_application_identity(value: dict[str, str]) -> None:
    if set(value) == {"source_commit"} and re.fullmatch(r"[0-9a-f]{40}", value["source_commit"]):
        return
    if set(value) == {"linux_bundle_sha256"} and re.fullmatch(r"[0-9a-f]{64}", value["linux_bundle_sha256"]):
        return
    if set(value) == {"backend", "backend_db", "frontend", "redis"} and all(
        re.fullmatch(r"[a-zA-Z0-9._/:-]+@sha256:[0-9a-f]{64}", image) for image in value.values()
    ):
        return
    raise RestoreError("Record the immutable source commit, Linux bundle digest or all four Docker image identities")


async def make_manifest(
    db: AsyncSession,
    settings: Settings,
    *,
    dump: Path,
    application_identity: dict[str, str],
    captured_at: str | None = None,
) -> BackupManifest:
    captured = datetime.fromisoformat(captured_at) if captured_at is not None else utc_now()
    if captured.tzinfo is None:
        raise RestoreError("Backup capture time must carry its UTC offset")
    binding = await validate_installation_binding(db, settings=settings)
    validate_application_identity(application_identity)
    revisions = list(await db.scalars(text("SELECT version_num FROM alembic_version")))
    if len(revisions) != 1:
        raise RestoreError("Backup requires an unambiguous schema revision")
    key_ids: dict[str, list[str]] = {purpose: [] for purpose in ("totp", "delivery", "action")}
    if binding.auth_mode == "password":
        incomplete = await db.scalar(
            select(LocalBootstrapTarget.user_id).where(LocalBootstrapTarget.completed_at.is_(None)).limit(1)
        )
        if incomplete is not None:
            raise RestoreError("Complete initial account enrollment before creating a restorable native backup")
        keys = LocalKeyring.load(settings.local_auth_keyring_file)
        references = await verify_key_material(db, installation_id=binding.installation_id, keys=keys, as_of=captured)
        key_ids = {purpose: sorted(references[purpose]) for purpose in references}
    formats: set[str] = set()
    for password_hash in await db.scalars(select(User.hashed_password).where(User.hashed_password.is_not(None))):
        if password_hash is None or not _bounded_password_hash(password_hash):
            raise RestoreError("Backup includes a password hash unsupported by this release")
        formats.add("argon2id-v19" if password_hash.startswith("$argon2id$") else "bcrypt-legacy")
    return BackupManifest(
        installation_id=binding.installation_id,
        auth_mode="password" if binding.auth_mode == "password" else "microsoft_sso",
        tenant_id=binding.tenant_id,
        identity_contract=binding.contract_version,
        restore_contract=RESTORE_CONTRACT_VERSION,
        schema_revision=revisions[0],
        application_identity=application_identity,
        password_formats=sorted(formats),
        key_ids=key_ids,
        captured_at=captured.isoformat(),
        dump_sha256=dump_digest(dump),
    )


def verify_manifest(
    manifest: BackupManifest, *, dump: Path, settings: Settings, expected_installation_id: str, migration_config: Path
) -> None:
    from app.core.production_contract import resolve_identity_profile

    profile = resolve_identity_profile(settings)
    validate_application_identity(manifest.application_identity)
    revisions = ScriptDirectory.from_config(Config(str(migration_config)))
    if (
        manifest.installation_id != expected_installation_id
        or manifest.auth_mode != profile.auth_mode
        or manifest.tenant_id != profile.tenant_id
        or manifest.identity_contract != 1
        or manifest.restore_contract != RESTORE_CONTRACT_VERSION
        or manifest.schema_revision != revisions.get_current_head()
        or set(manifest.password_formats) - {"argon2id-v19", "bcrypt-legacy"}
        or set(manifest.key_ids) != {"totp", "delivery", "action"}
        or manifest.dump_sha256 != dump_digest(dump)
    ):
        raise RestoreError("Backup identity, format, schema or integrity is incompatible with this destination")
    if manifest.auth_mode == "password":
        keys = LocalKeyring.load(settings.local_auth_keyring_file)
        if any(set(required) - set(keys.purposes[purpose].keys) for purpose, required in manifest.key_ids.items()):
            raise RestoreError("Required factor or delivery decryption keys are missing")
