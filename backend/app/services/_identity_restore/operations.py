"""Manifest validation and restartable restore under operator-controlled maintenance."""

from __future__ import annotations

import json
import secrets
from pathlib import Path
from uuid import uuid4

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.core.config import Settings
from app.db.session import session_context
from app.models import IdentityRestoreCutover
from app.services._identity_access_lifecycle.policy import effective_platform_admin_ids
from app.services.identity_installation import validate_installation_binding
from app.services.transaction_boundary import commit_service_boundary

from .admission import state_path, validate_restore_admission
from .checkpoint import SecurityCheckpoint, capture_checkpoint
from .cutover import purge_installation_auth, reconcile_restored_security
from .files import (
    RestoreError,
    canonical_json,
    fingerprint,
    read_private,
    sign_artifact,
    verify_artifact,
    write_private,
)
from .manifest import BackupManifest, make_manifest, verify_manifest
from .postgres import (
    dump_database,
    maintenance_database,
    reload_restored_schema,
    require_quiet_database,
    restore_database,
)
from .runtime_files import read_runtime, write_runtime


def load_signed(path: Path, key: bytes) -> dict:
    return verify_artifact(json.loads(read_private(path)), key)


def save_signed(path: Path, value: dict, key: bytes, *, replace: bool = False) -> None:
    previous = read_private(path) if replace else None
    write_private(path, canonical_json(sign_artifact(value, key)), expected=previous)


async def backup(
    settings: Settings, *, dump: Path, manifest_path: Path, evidence_key: bytes, application_identity: dict[str, str]
) -> dict:
    async with maintenance_database(settings) as db:
        await validate_restore_admission(db, settings=settings)
        await dump_database(settings.database_url, dump)
        manifest = await make_manifest(db, settings, dump=dump, application_identity=application_identity)
        save_signed(manifest_path, manifest.model_dump(), evidence_key)
        return {
            "status": "backup-created",
            "dump_sha256": manifest.dump_sha256,
            "installation_id": manifest.installation_id,
            "schema_revision": manifest.schema_revision,
        }


async def verify_backup(
    settings: Settings,
    *,
    dump: Path,
    manifest_path: Path,
    evidence_key: bytes,
    installation_id: str,
    validation_url: str,
    migration_config: Path,
) -> BackupManifest:
    manifest = BackupManifest.model_validate(load_signed(manifest_path, evidence_key))
    verify_manifest(
        manifest,
        dump=dump,
        settings=settings,
        expected_installation_id=installation_id,
        migration_config=migration_config,
    )
    target, validation = make_url(settings.database_url), make_url(validation_url)
    # A different name is required even when host aliases would compare differently.
    if target.database == validation.database:
        raise RestoreError("Validation requires a separate empty PostgreSQL database")
    validation_settings = settings.model_copy(update={"database_url": validation_url})
    async with maintenance_database(validation_settings) as db:
        tables = await db.scalar(
            text(
                "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                "WHERE n.nspname NOT IN ('pg_catalog','information_schema') "
                "AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')"
            )
        )
        if tables:
            raise RestoreError("Validation database must be empty; preserve it after a failed drill for inspection")
        await commit_service_boundary(db, boundary="identity_restore_validation_quiescence")
        await restore_database(validation_url, dump, replace=False)
        # This reads and decrypts the actual restored records, not just matching key IDs.
        actual = await make_manifest(
            db,
            validation_settings,
            dump=dump,
            application_identity=manifest.application_identity,
            captured_at=manifest.captured_at,
        )
        expected = manifest.model_dump(exclude={"captured_at"})
        if actual.model_dump(exclude={"captured_at"}) != expected:
            raise RestoreError("Restored content differs from its signed backup manifest")
    return manifest


def _marker(journal: dict, *, ready: bool = False) -> dict:
    return {
        "version": 1,
        "status": "ready" if ready else "pending",
        **{
            field: journal[field]
            for field in ("installation_id", "epoch", "signing_fingerprint", "manifest_digest", "checkpoint_digest")
        },
    }


async def restore(
    settings: Settings,
    *,
    dump: Path,
    manifest_path: Path,
    evidence_key: bytes,
    installation_id: str,
    validation_url: str | None,
    migration_config: Path,
    operation_dir: Path,
    source: str,
    unplanned: bool,
    resume: bool,
) -> dict:
    marker_path = state_path(settings)
    journal_path = operation_dir / "restore-journal.json"
    key_path = operation_dir / "next-signing-key"
    checkpoint_path = operation_dir / "current-security.json"
    if not settings.redis_url:
        raise RestoreError("Restore requires the installed shared security-state service")
    # File validation happens before any database mutation.
    read_runtime(Path(settings.secret_key_file or ""), maximum=4096)
    if resume:
        journal = load_signed(journal_path, evidence_key)
        if (
            journal["installation_id"] != installation_id
            or journal["dump"] != str(dump)
            or journal["manifest_path"] != str(manifest_path)
            or journal["complete"]
        ):
            raise RestoreError("Resume must use the exact unfinished operation")
        manifest = BackupManifest.model_validate(load_signed(manifest_path, evidence_key))
        verify_manifest(
            manifest,
            dump=dump,
            settings=settings,
            expected_installation_id=installation_id,
            migration_config=migration_config,
        )
        if fingerprint(read_private(manifest_path)) != journal["manifest_digest"]:
            raise RestoreError("Manifest changed since restore preparation")
    else:
        if validation_url is None:
            raise RestoreError("An empty validation database is required before replacing any destination")
        manifest = await verify_backup(
            settings,
            dump=dump,
            manifest_path=manifest_path,
            evidence_key=evidence_key,
            installation_id=installation_id,
            validation_url=validation_url,
            migration_config=migration_config,
        )
        journal = {}
    redis = Redis.from_url(settings.redis_url, socket_connect_timeout=5, socket_timeout=5)
    try:
        await redis.execute_command("PING")
        async with maintenance_database(settings) as db:
            if not resume:
                has_binding = await db.scalar(text("SELECT to_regclass('public.installation_identity')"))
                if has_binding:
                    binding = await validate_installation_binding(db, settings=settings)
                    if binding.installation_id != installation_id:
                        raise RestoreError("Destination installation does not match the requested backup")
                    await validate_restore_admission(db, settings=settings)
                else:
                    tables = await db.scalar(text("SELECT count(*) FROM pg_tables WHERE schemaname='public'"))
                    if not unplanned or tables:
                        raise RestoreError("Only an empty destination can be recovered without its current binding")
                    if marker_path.exists():
                        previous = json.loads(read_runtime(marker_path))
                        if previous.get("status") != "ready" or previous.get("installation_id") != installation_id:
                            raise RestoreError("Unfinished or different installation evidence exists")
                checkpoint = (
                    None
                    if unplanned
                    else await capture_checkpoint(db, settings, source=source, evidence_key=evidence_key)
                )
                if checkpoint is not None:
                    save_signed(checkpoint_path, checkpoint.model_dump(), evidence_key)
                await dump_database(settings.database_url, operation_dir / "before-restore.dump")
                save_signed(
                    operation_dir / "configuration.json",
                    {
                        "installation_id": installation_id,
                        "auth_mode": settings.auth_mode,
                        "directory_provider": settings.directory_provider,
                        "local_mfa_policy": settings.local_mfa_policy,
                        "manifest_application_identity": manifest.application_identity,
                        "previous_cutover": json.loads(read_runtime(marker_path)) if marker_path.exists() else None,
                    },
                    evidence_key,
                )
                next_key = secrets.token_urlsafe(64).encode()
                write_private(key_path, next_key)
                journal = {
                    "version": 1,
                    "installation_id": installation_id,
                    "epoch": str(uuid4()),
                    "dump": str(dump),
                    "manifest_path": str(manifest_path),
                    "manifest_digest": fingerprint(read_private(manifest_path)),
                    "checkpoint_digest": fingerprint(read_private(checkpoint_path)) if checkpoint else None,
                    "previous_signing_fingerprint": fingerprint(read_runtime(Path(settings.secret_key_file or ""))),
                    "signing_fingerprint": fingerprint(next_key),
                    "source": source,
                    "complete": False,
                }
                save_signed(journal_path, journal, evidence_key)
                write_runtime(
                    marker_path,
                    canonical_json(_marker(journal)),
                    signing_file=Path(settings.secret_key_file or ""),
                    expected=read_runtime(marker_path) if marker_path.exists() else None,
                )
            else:
                marker = json.loads(read_runtime(marker_path))
                if marker == _marker(journal, ready=True):
                    await validate_restore_admission(db, settings=settings)
                    journal["complete"] = True
                    save_signed(journal_path, journal, evidence_key, replace=True)
                    return {"status": "cutover-complete", "epoch": journal["epoch"], "resumed_final_record": True}
                if marker != _marker(journal):
                    raise RestoreError("Pending cutover evidence differs from this operation")
                checkpoint = None
                if journal["checkpoint_digest"]:
                    if fingerprint(read_private(checkpoint_path)) != journal["checkpoint_digest"]:
                        raise RestoreError("The authoritative security checkpoint changed")
                    checkpoint = SecurityCheckpoint.model_validate(load_signed(checkpoint_path, evidence_key))
            new_key = read_private(key_path, maximum=4096)
            if fingerprint(new_key) != journal["signing_fingerprint"]:
                raise RestoreError("Pending signing authority changed")
            installed_key_path = Path(settings.secret_key_file or "")
            current_key = read_runtime(installed_key_path, maximum=4096)
            if fingerprint(current_key) == journal["previous_signing_fingerprint"]:
                write_runtime(installed_key_path, new_key, signing_file=installed_key_path, expected=current_key)
            elif fingerprint(current_key) != journal["signing_fingerprint"]:
                raise RestoreError("Unexpected signing authority; keep writers stopped")
            restored_settings = settings.model_copy(update={"secret_key": new_key.decode()})
            has_cutover = await db.scalar(text("SELECT to_regclass('public.identity_restore_cutover')"))
            cutover = await db.get(IdentityRestoreCutover, 1) if has_cutover else None
            already_reconciled = cutover is not None and cutover.epoch == journal["epoch"]
            await require_quiet_database(db)
            await commit_service_boundary(db, boundary="identity_restore_destination_quiescence")
            if not already_reconciled:
                await restore_database(settings.database_url, dump, replace=True)
                db.expunge_all()
                await reload_restored_schema(db)
                actual = await make_manifest(
                    db,
                    restored_settings,
                    dump=dump,
                    application_identity=manifest.application_identity,
                    captured_at=manifest.captured_at,
                )
                if actual.model_dump(exclude={"captured_at"}) != manifest.model_dump(exclude={"captured_at"}):
                    raise RestoreError("Destination content is incompatible; remain in maintenance")
                result = await reconcile_restored_security(
                    db,
                    restored_settings,
                    checkpoint=checkpoint,
                    evidence_key=evidence_key,
                    epoch=journal["epoch"],
                    manifest_digest=journal["manifest_digest"],
                    checkpoint_digest=journal["checkpoint_digest"],
                    signing_fingerprint=journal["signing_fingerprint"],
                    previous_signing_fingerprint=journal["previous_signing_fingerprint"],
                    source=journal["source"],
                )
            else:
                result = {"resumed_after_database_cutover": True}
            await purge_installation_auth(redis, installation_id)
            pending = read_runtime(marker_path)
            write_runtime(
                marker_path,
                canonical_json(_marker(journal, ready=True)),
                signing_file=installed_key_path,
                expected=pending,
            )
            await validate_restore_admission(db, settings=restored_settings)
            journal["complete"] = True
            save_signed(journal_path, journal, evidence_key, replace=True)
            return {
                "status": "cutover-complete",
                "epoch": journal["epoch"],
                **result,
                "services": "stopped; recreate all API and scheduler services before verification",
            }
    finally:
        await redis.aclose()


async def verify_cutover(settings: Settings) -> dict:
    async with session_context(settings) as db:
        binding = await validate_installation_binding(db, settings=settings)
        await validate_restore_admission(db, settings=settings)
        cutover = await db.get(IdentityRestoreCutover, 1)
        if cutover is None:
            raise RestoreError("No completed restore cutover exists")
        return {
            "status": "verified",
            "installation_id": binding.installation_id,
            "epoch": cutover.epoch,
            "administrator_recovery_required": not bool(await effective_platform_admin_ids(db, settings=settings)),
        }
