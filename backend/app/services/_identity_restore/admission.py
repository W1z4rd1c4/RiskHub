"""Fail closed across interrupted restores and stale database/signing-key combinations."""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import IdentityRestoreCutover, InstallationIdentity
from app.services.identity_installation import IdentityBindingError

from .files import fingerprint
from .runtime_files import read_runtime

RESTORE_CONTRACT_VERSION = 1


def state_path(settings: Settings) -> Path:
    if not settings.secret_key_file:
        raise IdentityBindingError("Identity restore requires the installed file-backed signing authority")
    return Path(settings.secret_key_file + ".restore-state.json")


async def validate_restore_admission(db: AsyncSession, *, settings: Settings) -> None:
    cutover = await db.get(IdentityRestoreCutover, 1)
    if not settings.secret_key_file:
        if cutover is not None:
            raise IdentityBindingError("Restored identity requires protected cutover evidence")
        return
    path = state_path(settings)
    if not path.exists() and not path.is_symlink():
        if cutover is not None:
            raise IdentityBindingError("Restore evidence is missing; keep API and scheduler stopped")
        return
    try:
        evidence = json.loads(read_runtime(path, maximum=32768))
        binding = await db.get(InstallationIdentity, 1)
        if (
            evidence.get("version") != RESTORE_CONTRACT_VERSION
            or type(evidence.get("version")) is not int
            or evidence.get("status") != "ready"
            or binding is None
            or cutover is None
            or evidence.get("installation_id") != binding.installation_id
            or cutover.installation_id != binding.installation_id
            or evidence.get("epoch") != cutover.epoch
            or evidence.get("signing_fingerprint") != cutover.signing_fingerprint
            or fingerprint(settings.secret_key.encode()) != cutover.signing_fingerprint
            or evidence.get("manifest_digest") != cutover.manifest_digest
            or evidence.get("checkpoint_digest") != cutover.checkpoint_digest
        ):
            raise ValueError("Incomplete or inconsistent cutover")
    except (ValueError, TypeError, AttributeError):
        raise IdentityBindingError("Restore security cutover is incomplete; keep API and scheduler stopped") from None
