"""Create or resume the exact initial native Admin/CRO principals without printing credentials."""

from __future__ import annotations

import argparse
import asyncio
import json

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, AuthorizationError, ConflictError, ValidationError
from app.db.session import session_context
from app.services._local_auth.bootstrap import (
    BootstrapRequest,
    abort_pending_bootstrap,
    bootstrap_native,
    bootstrap_status,
    reissue_bootstrap,
)
from app.services._local_auth.common import build_context
from app.services._local_auth.operator_io import route_console_logs_to_stderr
from app.services._local_auth.recovery_approvals import load_recovery_approvers
from app.services.identity_installation import IdentityBindingError


async def run(args: argparse.Namespace) -> dict:
    settings = get_settings()
    if settings.debug or settings.mock_auth_enabled or not settings.redis_url:
        raise ValueError("Installed non-debug native configuration and Redis are required")
    if args.command != "status" and not args.dry_run and not args.maintenance_confirmed:
        raise ValueError("Stop/drain application writers and confirm maintenance")
    load_recovery_approvers(settings.local_recovery_approvers_file)
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis.ping()
        async with session_context(settings) as db:
            if db.get_bind().dialect.name != "postgresql":
                raise ValueError("Installed native bootstrap requires PostgreSQL")
            ctx = await build_context(db, settings=settings, redis=redis, source="native-bootstrap")
            if args.command == "status":
                return await bootstrap_status(db, ctx)
            if args.command == "abort":
                return await abort_pending_bootstrap(db, ctx, reason=args.reason)
            if args.command == "reissue":
                return await reissue_bootstrap(db, ctx, slot=args.slot, output=args.output, reason=args.reason)
            request = BootstrapRequest(args.admin_email, args.cro_email, args.admin_file, args.cro_file)
            return await bootstrap_native(db, ctx, request, dry_run=args.dry_run)
    finally:
        await redis.aclose()


def main() -> None:
    route_console_logs_to_stderr()
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog=(
            "Use separate files in a directory owned by the command UID with mode 0700. "
            "Files are created with mode 0600; Docker volumes must be writable by the image riskhub UID, "
            "and Linux handoffs by the service/operator UID. Register at least two independent recovery "
            "approver public keys before bootstrap. Never pass passwords or grants as arguments. "
            "Exit 0: completed command (inspect enrollment status); 2: validation refused; "
            "3: unavailable/interrupted; 4: persisted grants awaiting handoff."
        ),
    )
    parser.add_argument("--maintenance-confirmed", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    start = sub.add_parser("start", help="Create fresh targets or resume the same pending handoffs")
    for name in ("admin-email", "cro-email", "admin-file", "cro-file"):
        start.add_argument(f"--{name}", required=True)
    start.add_argument("--dry-run", action="store_true", help="Validate without database or file mutations")
    sub.add_parser("status", help="Read infrastructure, handoff and enrollment status without changing accounts")
    reissue = sub.add_parser("reissue", help="Explicitly supersede a never-enrolled pending grant")
    reissue.add_argument("--slot", choices=("admin", "cro"), required=True)
    reissue.add_argument("--output", required=True, help="New protected path; old files are never overwritten")
    reissue.add_argument("--reason", required=True, help="Accountable non-secret incident/change reference")
    abort = sub.add_parser("abort", help="Revoke unused bootstrap grants, then remove verified current handoff files")
    abort.add_argument("--reason", required=True, help="Accountable non-secret incident/change reference")
    parser.set_defaults(dry_run=False)
    args = parser.parse_args()
    try:
        result = asyncio.run(run(args))
    except (ValueError, AuthenticationError, AuthorizationError, ConflictError, ValidationError, IdentityBindingError):
        parser.exit(2, "Native bootstrap validation refused; check profile, inputs, keys and protected paths.\n")
    except Exception:
        parser.exit(3, "Native bootstrap unavailable or interrupted; inspect status before retrying.\n")
    print(json.dumps(result, sort_keys=True))
    if result["status"] == "handoff-failed" or result.get("cleanup_failed"):
        raise SystemExit(4)


if __name__ == "__main__":
    main()
