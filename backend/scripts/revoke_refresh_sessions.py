#!/usr/bin/env python3
"""Revoke active refresh sessions without bumping user token_version."""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import RefreshToken


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Revoke all active refresh sessions without mass-invalidating already-issued access tokens.",
    )
    parser.add_argument(
        "--reason",
        default="policy_cutover",
        help="Revocation reason stored on affected refresh session rows.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print how many active sessions would be revoked without mutating the database.",
    )
    return parser.parse_args(argv)


async def _run(args: argparse.Namespace) -> int:
    settings = get_settings()
    async with session_context(settings) as db:
        active_count = (
            await db.execute(
                select(RefreshToken.id).where(RefreshToken.revoked_at.is_(None))
            )
        ).scalars().all()

        if args.dry_run:
            print(f"REFRESH_REVOKE_DRY_RUN active_sessions={len(active_count)} reason={args.reason}")
            return 0

        now = utc_now()
        result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, revoked_reason=args.reason)
        )
        await db.commit()
        print(f"REFRESH_REVOKE_OK revoked_sessions={int(result.rowcount or 0)} reason={args.reason}")
        return 0


def main() -> int:
    return asyncio.run(_run(_parse_args(sys.argv[1:])))


if __name__ == "__main__":
    raise SystemExit(main())
