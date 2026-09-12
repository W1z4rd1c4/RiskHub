"""Read-only operator diagnostics, also available in the minimal runtime image."""

from __future__ import annotations

import argparse
import asyncio
import json

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.production_contract import enforce_identity_release_admission, resolve_identity_profile
from app.db.session import session_context
from app.services._local_auth.bootstrap import bootstrap_status
from app.services._local_auth.common import build_context
from app.services._local_auth.delivery import smtp_connection, validate_mail_configuration
from app.services._local_auth.key_rotation import verify_key_material
from app.services._local_auth.operator_io import route_console_logs_to_stderr
from app.services._local_auth.recovery_approvals import load_recovery_approvers
from app.services.identity_installation import validate_installation_binding


def probe_mail(settings: Settings) -> None:
    """Verify TLS/authentication without sending mail or exposing response text."""
    with smtp_connection(settings) as connection:
        if connection.noop()[0] != 250:
            raise OSError("Mail delivery dependency unavailable")


async def inspect_runtime(db: AsyncSession, settings: Settings, redis, *, check_mail: bool = False) -> dict:
    profile = resolve_identity_profile(settings)
    native = profile.auth_mode == "password"
    result: dict = {
        "auth_mode": profile.auth_mode,
        "directory_provider": profile.directory_provider,
        "external_directory": "not_applicable" if native else "unchecked",
        "local_mfa_policy": settings.local_mfa_policy if native else "not_applicable",
        "security": "unavailable",
        "delivery": "unchecked" if native else "not_applicable",
        "onboarding": "unchecked" if native else "provider_managed",
        "release_admission": "available",
        "mutated": False,
    }
    try:
        enforce_identity_release_admission(profile)
    except RuntimeError:
        result["release_admission"] = "awaiting_208"
    try:
        binding = await validate_installation_binding(db, settings=settings)
        result["contract_version"] = binding.contract_version
        if redis is None or not await redis.ping():
            return result
        if native:
            ctx = await build_context(db, settings=settings, redis=redis, source="operator-diagnostics")
            load_recovery_approvers(settings.local_recovery_approvers_file)
            validate_mail_configuration(settings)
            counts = await verify_key_material(db, installation_id=ctx.installation_id, keys=ctx.keys)
            if any(key not in ctx.keys.purposes[purpose].keys for purpose, refs in counts.items() for key in refs):
                return result
            status = await bootstrap_status(db, ctx)
            result["onboarding"] = status["status"]
            # Do not disclose grant/delivery IDs, handoff paths, user IDs or credentials.
            result["initial_accounts"] = [
                {"account": entry["slot"], "enrollment": entry["enrollment"], "handoff": entry["handoff"]}
                for entry in status["targets"]
            ]
        result["security"] = "available"
    except Exception:
        return result
    if native and check_mail:
        try:
            await asyncio.to_thread(probe_mail, settings)
            result["delivery"] = "available"
        except Exception:
            result["delivery"] = "degraded"
    return result


async def run(*, check_mail: bool) -> dict:
    settings = get_settings()
    redis = (
        Redis.from_url(settings.redis_url, socket_connect_timeout=3, socket_timeout=3) if settings.redis_url else None
    )
    try:
        async with session_context(settings) as db:
            return await inspect_runtime(db, settings, redis, check_mail=check_mail)
    finally:
        if redis is not None:
            await redis.aclose()


def main() -> None:
    route_console_logs_to_stderr()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe-mail", action="store_true")
    args = parser.parse_args()
    try:
        result = asyncio.run(run(check_mail=args.probe_mail))
    except Exception:
        result = {"security": "unavailable", "onboarding": "unchecked", "mutated": False}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
