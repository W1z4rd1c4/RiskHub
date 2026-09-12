"""Prepare, verify and execute dual-approved native recovery under maintenance."""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
from datetime import UTC, datetime
from uuid import uuid4

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.datetime_utils import utc_now
from app.db.session import session_context
from app.models import LocalAuthGrant
from app.services._identity_authority_lock import lock_identity_transition
from app.services._local_auth.common import build_context, commit_local, invalid_proof
from app.services._local_auth.keys import read_secret_file
from app.services._local_auth.recovery import initiate_recovery
from app.services._local_auth.recovery_approvals import (
    RecoveryEnvelope,
    canonical_envelope,
    validate_envelope,
    verify_approvals,
)
from app.services._local_auth.recovery_policy import require_recoverable


def write_private_file(path: str, value: dict) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def read_envelope(path: str) -> RecoveryEnvelope:
    return RecoveryEnvelope.model_validate_json(read_secret_file(path))


async def run(args: argparse.Namespace) -> dict:
    if args.command == "sign":
        envelope = read_envelope(args.envelope)
        validate_envelope(envelope)
        key = serialization.load_pem_private_key(read_secret_file(args.private_key_file), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise invalid_proof()
        write_private_file(
            args.output,
            {
                "signer_id": args.signer_id,
                "signature": base64.b64encode(key.sign(canonical_envelope(envelope))).decode(),
            },
        )
        return {"status": "approval-written"}
    settings = get_settings()
    if settings.debug or settings.mock_auth_enabled or not args.maintenance_confirmed or not settings.redis_url:
        raise invalid_proof()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis.ping()
        async with session_context(settings) as db:
            ctx = await build_context(db, settings=settings, redis=redis, source="offline-recovery")
            if args.command in {"prepare", "status"}:
                user = await lock_identity_transition(db, user_id=args.target_user_id)
                if args.command == "status":
                    return {
                        "status": "read-only",
                        "target_user_id": user.id,
                        "installation_id": ctx.installation_id,
                        "token_version": user.token_version,
                        "recovery_pending": user.local_recovery_pending,
                        "local_suspended": user.local_suspended,
                    }
                require_recoverable(user, version=user.token_version)
                now = int(utc_now().timestamp())
                envelope = RecoveryEnvelope(
                    installation_id=ctx.installation_id,
                    target_user_id=user.id,
                    expected_token_version=user.token_version,
                    operation=args.operation,
                    nonce=uuid4().hex,
                    issued_at=now,
                    expires_at=now + 900,
                    incident_reference=args.incident,
                    verification_method=args.verification,
                    reason=args.reason,
                    new_email=args.new_email,
                )
                validate_envelope(envelope)
                write_private_file(args.output, envelope.model_dump(mode="json"))
                return {"status": "request-written", "target_user_id": user.id, "token_version": user.token_version}
            envelope = read_envelope(args.envelope)
            approvals = [json.loads(read_secret_file(path)) for path in args.approval]
            approvers = verify_approvals(envelope, approvals, settings.local_recovery_approvers_file)
            if envelope.installation_id != ctx.installation_id:
                raise invalid_proof()
            user = await lock_identity_transition(db, user_id=envelope.target_user_id)
            # Recheck time and target after any lock wait.
            validate_envelope(envelope)
            require_recoverable(user, version=envelope.expected_token_version)
            if await db.get(LocalAuthGrant, envelope.nonce) is not None:
                raise invalid_proof()
            if args.command == "verify":
                return {"status": "verified-not-written", "target_user_id": user.id, "approvers": approvers}
            grant, raw = await initiate_recovery(
                db,
                ctx,
                user,
                operation=envelope.operation,
                version=envelope.expected_token_version,
                incident=envelope.incident_reference,
                verification=envelope.verification_method,
                reason=envelope.reason,
                approvers=approvers,
                nonce=envelope.nonce,
                new_email=envelope.new_email,
                expires_at=datetime.fromtimestamp(envelope.expires_at, UTC),
            )
            written = False
            try:
                write_private_file(
                    args.output,
                    {
                        "grant": raw,
                        "expires_at": grant.expires_at.isoformat(),
                        "url": f"{ctx.public_url}/auth/local/recover",
                    },
                )
                written = True
                await commit_local(db, "offline_recovery")
            except BaseException:
                if written:
                    os.unlink(args.output)
                raise
            return {
                "status": "recovery-pending",
                "target_user_id": user.id,
                "approvers": approvers,
                "incident_reference": envelope.incident_reference,
            }
    finally:
        await redis.aclose()


def main() -> None:
    from app.services._local_auth.operator_io import route_console_logs_to_stderr

    route_console_logs_to_stderr()
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("prepare", "status", "verify", "recover", "sign"):
        part = sub.add_parser(command)
        if command != "sign":
            part.add_argument("--maintenance-confirmed", action="store_true")
        if command in {"prepare", "status"}:
            part.add_argument("--target-user-id", type=int, required=True)
        if command in {"prepare", "recover", "sign"}:
            part.add_argument("--output", required=True)
        if command == "prepare":
            part.add_argument(
                "--operation",
                required=True,
                choices=["factor_recovery", "credential_and_factor_recovery", "verified_address_recovery"],
            )
            part.add_argument("--incident", required=True)
            part.add_argument("--verification", required=True)
            part.add_argument("--reason", required=True)
            part.add_argument("--new-email")
        if command in {"verify", "recover", "sign"}:
            part.add_argument("--envelope", required=True)
        if command in {"verify", "recover"}:
            part.add_argument("--approval", action="append", required=True)
        if command == "sign":
            part.add_argument("--private-key-file", required=True)
            part.add_argument("--signer-id", required=True)
    args = parser.parse_args()
    try:
        result = asyncio.run(run(args))
    except Exception:
        parser.exit(
            2, "Recovery refused: verify protected configuration, approvals, maintenance and current account state.\n"
        )
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
