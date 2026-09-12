"""Read-only release compatibility inspection before stopping installed writers."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.password_policy import DATA_DIR, _packaged_passwords
from app.core.production_contract import resolve_identity_profile
from app.core.security import _bounded_password_hash
from app.db.session import session_context
from app.models import InstallationIdentity, User
from app.services._local_auth.delivery import validate_mail_configuration
from app.services._local_auth.key_rotation import verify_key_material
from app.services._local_auth.keys import LocalKeyring
from app.services._local_auth.operator_io import route_console_logs_to_stderr
from app.services._local_auth.recovery_approvals import load_recovery_approvers
from app.services.identity_installation import IdentityBindingError, validate_installation_binding


async def inspect_identity(db: AsyncSession, settings: Settings, *, migration_config: Path) -> dict:
    if settings.debug or settings.mock_auth_enabled or db.get_bind().dialect.name != "postgresql":
        raise IdentityBindingError("Installed non-debug PostgreSQL identity configuration is required")
    profile = resolve_identity_profile(settings)
    keys = None
    if profile.auth_mode == "password":
        keys = LocalKeyring.load(settings.local_auth_keyring_file)
        load_recovery_approvers(settings.local_recovery_approvers_file)
        validate_mail_configuration(settings)
        _packaged_passwords(str(DATA_DIR))
        if settings.local_password_blocklist_file:
            path = Path(settings.local_password_blocklist_file)
            with path.open("rb") as stream:
                contents = stream.read(4_000_001)
            if len(contents) > 4_000_000:
                raise IdentityBindingError("Additional password policy is too large")
            contents.decode("utf-8")

    connection = await db.connection()
    tables = set(await connection.run_sync(lambda sync: inspect(sync).get_table_names()))
    if "alembic_version" in tables:
        versions = list(await db.scalars(text("SELECT version_num FROM alembic_version")))
        revisions = ScriptDirectory.from_config(Config(str(migration_config)))
        if len(versions) != 1:
            raise IdentityBindingError("Ambiguous installed schema version; reconcile before upgrade")
        try:
            if revisions.get_revision(versions[0]) is None:
                raise ValueError("Unknown revision")
        except Exception:
            raise IdentityBindingError(
                "Installed schema is unknown to this release; use a compatible roll-forward"
            ) from None
    elif tables:
        raise IdentityBindingError("Unversioned database; reconcile before managed installation")

    populated = "users" in tables and bool(await db.scalar(text("SELECT EXISTS (SELECT 1 FROM users)")))
    binding = await db.get(InstallationIdentity, 1) if "installation_identity" in tables else None
    if binding is None:
        if populated:
            raise IdentityBindingError(
                "Populated unbound database: explicitly adopt verified Entra identities "
                "in maintenance before managed upgrade"
            )
        return {"status": "fresh-unbound", "auth_mode": profile.auth_mode, "mutated": False}
    validated = await validate_installation_binding(db, settings=settings)
    if keys is not None:
        if not {"local_auth_factors", "local_auth_grants", "local_auth_deliveries"} <= tables:
            if populated:
                raise IdentityBindingError("Native credential schema is incomplete; reconcile before upgrade")
        else:
            counts = await verify_key_material(db, installation_id=validated.installation_id, keys=keys)
            if any(key not in keys.purposes[purpose].keys for purpose, refs in counts.items() for key in refs):
                raise IdentityBindingError("Retained native security state references unavailable keys")
        for encoded in await db.scalars(select(User.hashed_password).where(User.hashed_password.is_not(None))):
            if encoded is not None and not _bounded_password_hash(encoded):
                raise IdentityBindingError("Native credential hash is not supported by this release; roll forward")
    return {
        "status": "compatible",
        "auth_mode": validated.auth_mode,
        "installation_id": validated.installation_id,
        "contract_version": validated.contract_version,
        "mutated": False,
    }


async def run(migration_config: Path) -> dict:
    settings = get_settings()
    async with session_context(settings) as db:
        return await inspect_identity(db, settings, migration_config=migration_config)


def main() -> None:
    route_console_logs_to_stderr()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--alembic-config", type=Path, default=Path("alembic.ini"))
    args = parser.parse_args()
    try:
        result = asyncio.run(run(args.alembic_config))
    except IdentityBindingError as exc:
        parser.exit(2, f"Identity preflight refused: {exc}\n")
    except Exception:
        parser.exit(
            3, "Identity preflight unavailable; verify protected security files, database and release compatibility.\n"
        )
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
