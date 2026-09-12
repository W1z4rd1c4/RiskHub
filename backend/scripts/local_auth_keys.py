"""Maintain native purpose keys; retirement requires quiesced writers and a backup inventory."""

from __future__ import annotations

import argparse
import asyncio
import base64
import fcntl
import json
import os
import secrets
import tempfile
from pathlib import Path

from redis.asyncio import Redis

from app.core.config import get_settings
from app.db.session import session_context
from app.services._local_auth.common import build_context, invalid_proof
from app.services._local_auth.key_rotation import reencrypt_batch, reference_counts, verify_key_material
from app.services._local_auth.keys import LocalKeyring, read_secret_file


def atomic_keyring(path: str, data: dict) -> None:
    target = Path(path)
    fd, temporary = tempfile.mkstemp(prefix=".local-keyring-", dir=target.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(data, stream, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        LocalKeyring.load(temporary)
        os.replace(temporary, path)
        directory = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


async def run(args: argparse.Namespace) -> dict:
    settings = get_settings()
    if settings.debug or settings.mock_auth_enabled or not args.maintenance_confirmed:
        raise invalid_proof()
    path = settings.local_auth_keyring_file
    if not path or not settings.redis_url:
        raise invalid_proof()
    # The protected lock serializes cooperating operator commands; never lock secret contents then replace that inode.
    fd = os.open(path + ".lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        await redis.ping()
        async with session_context(settings) as db:
            ctx = await build_context(db, settings=settings, redis=redis, source="key-maintenance")
            data = json.loads(read_secret_file(path))
            if args.command == "verify":
                counts = await verify_key_material(db, installation_id=ctx.installation_id, keys=ctx.keys)
                for purpose, references in counts.items():
                    if set(references) - set(ctx.keys.purposes[purpose].keys):
                        raise invalid_proof()
                return {"status": "verified", "references": counts}
            if args.command == "reencrypt":
                return await reencrypt_batch(db, ctx, after_user_id=args.after_user_id, limit=args.batch_size)
            entry = data["purposes"][args.purpose]
            if args.command == "add":
                if args.key_id in entry["keys"]:
                    raise invalid_proof()
                entry["keys"][args.key_id] = base64.b64encode(secrets.token_bytes(32)).decode()
            elif args.command == "activate":
                if args.key_id not in entry["keys"]:
                    raise invalid_proof()
                entry["active"] = args.key_id
            elif args.command == "retire":
                inventory = json.loads(read_secret_file(args.retained_backups_file))
                if (
                    type(inventory["version"]) is not int
                    or inventory["version"] != 1
                    or not isinstance(inventory["retained_backups"], list)
                ):
                    raise invalid_proof()
                counts = await reference_counts(db)
                if entry["active"] == args.key_id or counts[args.purpose].get(args.key_id, 0):
                    raise invalid_proof()
                for backup in inventory["retained_backups"]:
                    if (
                        not backup["id"]
                        or set(backup["key_ids"]) != {"totp", "delivery", "action"}
                        or any(not isinstance(keys, list) for keys in backup["key_ids"].values())
                        or args.key_id in backup["key_ids"][args.purpose]
                    ):
                        raise invalid_proof()
                del entry["keys"][args.key_id]
            atomic_keyring(path, data)
            return {"status": args.command + "-completed", "purpose": args.purpose, "key_id": args.key_id}
    finally:
        await redis.aclose()
        os.close(fd)


def main() -> None:
    from app.services._local_auth.operator_io import route_console_logs_to_stderr

    route_console_logs_to_stderr()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--maintenance-confirmed", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("verify")
    batch = sub.add_parser("reencrypt")
    batch.add_argument("--after-user-id", type=int, default=0)
    batch.add_argument("--batch-size", type=int, choices=range(1, 501), default=100)
    for name in ("add", "activate", "retire"):
        command = sub.add_parser(name)
        command.add_argument("--purpose", choices=["totp", "delivery", "action"], required=True)
        command.add_argument("--key-id", required=True)
        if name == "retire":
            command.add_argument("--retained-backups-file", required=True)
    args = parser.parse_args()
    try:
        result = asyncio.run(run(args))
    except Exception:
        parser.exit(
            2, "Key maintenance refused; verify protected files, maintenance, key references and retained backups.\n"
        )
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
