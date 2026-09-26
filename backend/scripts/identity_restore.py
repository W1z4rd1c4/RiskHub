"""Protect operator PostgreSQL backups and restore identity under explicit maintenance."""

from __future__ import annotations

import argparse
import asyncio
import json
import secrets
from pathlib import Path

from app.core.config import get_settings
from app.db.session import session_context
from app.services._identity_restore.files import RestoreError, read_private, write_private
from app.services._identity_restore.postgres import maintenance_database
from app.services._identity_restore.review import AccessReview, reconcile_user, review_status
from app.services._local_auth.operator_io import route_console_logs_to_stderr


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--maintenance-confirmed", action="store_true", help="API, scheduler and all writers are stopped")
    commands = root.add_subparsers(dest="command", required=True)
    initialize = commands.add_parser("init-evidence-key", help="Create an owner-only evidence key outside backups")
    initialize.add_argument("--output", type=Path, required=True)
    for command in ("backup", "verify-backup", "restore"):
        cmd = commands.add_parser(command)
        cmd.add_argument("--dump", type=Path, required=True)
        cmd.add_argument("--manifest", type=Path, required=True)
        cmd.add_argument("--evidence-key-file", type=Path, required=True)
        if command == "backup":
            cmd.add_argument(
                "--application-identity", type=Path, required=True, help="JSON immutable release identities"
            )
        else:
            cmd.add_argument("--installation-id", required=True)
            cmd.add_argument("--validation-database-url-file", type=Path, required=command == "verify-backup")
            cmd.add_argument("--alembic-config", type=Path, default=Path("alembic.ini"))
        if command == "restore":
            cmd.add_argument(
                "--operation-dir", type=Path, required=True, help="New 0700 directory outside rollback snapshots"
            )
            cmd.add_argument("--source", required=True)
            cmd.add_argument(
                "--unplanned", action="store_true", help="No authoritative current checkpoint; quarantine all users"
            )
            cmd.add_argument("--resume", action="store_true", help="Resume the exact interrupted operation")
    commands.add_parser("verify-cutover")
    status = commands.add_parser("review-status")
    status.add_argument("--user-id", type=int, required=True)
    review = commands.add_parser("reconcile-user")
    review.add_argument("--review-file", type=Path, required=True, help="0700/0600 operator access review JSON")
    return root


async def run(args: argparse.Namespace) -> dict:
    from app.services._identity_restore.operations import backup, restore, verify_backup, verify_cutover

    if args.command == "init-evidence-key":
        write_private(args.output, secrets.token_bytes(32))
        return {"status": "evidence-key-created"}
    settings = get_settings()
    if args.command == "verify-cutover":
        return await verify_cutover(settings)
    if args.command == "review-status":
        async with session_context(settings) as db:
            return await review_status(db, settings, args.user_id)
    if not args.maintenance_confirmed:
        raise RestoreError("Stop API, scheduler and all database writers; then pass --maintenance-confirmed")
    if args.command == "reconcile-user":
        review = AccessReview.model_validate_json(read_private(args.review_file))
        async with maintenance_database(settings) as db:
            return await reconcile_user(db, settings, review)
    key = read_private(args.evidence_key_file, maximum=4096)
    if args.command == "backup":
        return await backup(
            settings,
            dump=args.dump,
            manifest_path=args.manifest,
            evidence_key=key,
            application_identity=json.loads(read_private(args.application_identity)),
        )
    validation_url = (
        read_private(args.validation_database_url_file, maximum=4096).decode().strip()
        if args.validation_database_url_file
        else None
    )
    common = dict(
        dump=args.dump,
        manifest_path=args.manifest,
        evidence_key=key,
        installation_id=args.installation_id,
        migration_config=args.alembic_config,
    )
    if args.command == "verify-backup":
        if validation_url is None:
            raise RestoreError("Validation database required")
        manifest = await verify_backup(settings, validation_url=validation_url, **common)
        return {
            "status": "backup-verified",
            "installation_id": manifest.installation_id,
            "dump_sha256": manifest.dump_sha256,
            "validation_database": "restored; retain or remove explicitly",
        }
    return await restore(
        settings,
        validation_url=validation_url,
        operation_dir=args.operation_dir,
        source=args.source,
        unplanned=args.unplanned,
        resume=args.resume,
        **common,
    )


def main() -> None:
    route_console_logs_to_stderr()
    cli = parser()
    try:
        result = asyncio.run(run(cli.parse_args()))
    except RestoreError as exc:
        cli.exit(2, f"Identity restore refused: {exc}\n")
    except Exception:
        cli.exit(
            3, "Identity restore unavailable; keep writers stopped and inspect protected configuration and evidence.\n"
        )
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
