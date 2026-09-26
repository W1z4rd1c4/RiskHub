"""Prepare/serve a fresh loopback-only native browser fixture; never reuse an app DB.

Run with the backend Python environment. Configuration and handoffs are owner-only.
The source production guard is not altered: only the browser component server is debug.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parents[4]


def private_json(path: Path, payload: dict) -> None:
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(payload, stream)


async def fresh_database(raw: str) -> None:
    parsed = urlsplit(raw.replace("postgresql+asyncpg://", "postgresql://", 1))
    database = parsed.path.removeprefix("/")
    if parsed.hostname not in {"localhost", "127.0.0.1"} or not re.fullmatch(
        r"riskhub_native_e2e_[a-z0-9_]+", database
    ):
        raise ValueError("Use a loopback database named riskhub_native_e2e_<unique_run>")
    connection = await asyncpg.connect(urlunsplit(parsed._replace(path="/postgres")))
    try:
        if await connection.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", database):
            raise ValueError("Fixture database already exists; choose a fresh run name")
        await connection.execute(f'CREATE DATABASE "{database}"')
    finally:
        await connection.close()


def prepare(args: argparse.Namespace) -> None:
    public = urlsplit(args.public_url)
    if public.scheme != "http" or public.hostname not in {"localhost", "127.0.0.1"} or public.path not in {"", "/"}:
        raise ValueError("The component browser origin must be a loopback HTTP origin")
    if public.query or public.fragment or public.username or public.password:
        raise ValueError("Use an origin without credentials, path, query or fragment")
    redis = urlsplit(args.redis_url)
    if redis.scheme != "redis" or redis.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("Use an isolated loopback Redis database")
    root = Path(args.root).resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    (root / "handoff").mkdir(mode=0o700)
    asyncio.run(fresh_database(args.database_url))
    keys = {
        "version": 1,
        "purposes": {
            purpose: {"active": "v1", "keys": {"v1": base64.b64encode(secrets.token_bytes(32)).decode()}}
            for purpose in ("delivery", "totp", "action")
        },
    }
    approvers = {
        "version": 1,
        "approvers": [
            {
                "id": str(index),
                "name": f"Browser fixture operator {index}",
                "public_key": base64.b64encode(Ed25519PrivateKey.generate().public_key().public_bytes_raw()).decode(),
            }
            for index in (1, 2)
        ],
    }
    private_json(root / "keyring.json", keys)
    private_json(root / "approvers.json", approvers)
    environment = {
        "DATABASE_URL": args.database_url,
        "REDIS_URL": args.redis_url,
        "SECRET_KEY": secrets.token_urlsafe(48),
        "DEBUG": "true",
        "MOCK_AUTH_ENABLED": "false",
        "AUTH_MODE": "password",
        "DIRECTORY_PROVIDER": "none",
        "SCHEDULER_ROLE": "api",
        "PUBLIC_URL": args.public_url.rstrip("/"),
        "CORS_ORIGINS": json.dumps([args.public_url.rstrip("/")]),
        "TRUSTED_HOSTS": '["localhost","127.0.0.1"]',
        "LOCAL_MFA_POLICY": args.mfa_policy,
        "LOCAL_AUTH_KEYRING_FILE": str(root / "keyring.json"),
        "LOCAL_RECOVERY_APPROVERS_FILE": str(root / "approvers.json"),
        "LOCAL_SMTP_HOST": "localhost",
        "LOCAL_SMTP_PORT": "11025",
        "LOCAL_SMTP_SENDER": "security@example.com",
        "REFRESH_TOKEN_MIGRATION_GRACE": "false",
    }
    private_json(root / "environment.json", environment)
    maintenance_origin = urlunsplit(public._replace(scheme="https")).rstrip("/")
    maintenance = (
        os.environ
        | environment
        | {
            "DEBUG": "false",
            "PUBLIC_URL": maintenance_origin,
            "CORS_ORIGINS": json.dumps([maintenance_origin]),
        }
    )
    commands = [
        ["-m", "alembic", "upgrade", "head"],
        [
            "-m",
            "scripts.identity_installation",
            "initialize",
            "--maintenance-confirmed",
            "--source",
            "native-browser-fixture",
        ],
        [
            "-m",
            "scripts.bootstrap_local_users",
            "--maintenance-confirmed",
            "start",
            "--admin-email",
            "native-admin@example.com",
            "--cro-email",
            "native-cro@example.com",
            "--admin-file",
            str(root / "handoff/admin.json"),
            "--cro-file",
            str(root / "handoff/cro.json"),
        ],
    ]
    with (root / "prepare.log").open("x") as log:
        os.chmod(root / "prepare.log", 0o600)
        for command in commands:
            subprocess.run(
                [sys.executable, *command], cwd=ROOT / "backend", env=maintenance, stdout=log, stderr=log, check=True
            )
    print(f"Fresh {args.mfa_policy} fixture prepared at {root}; no production admission enabled.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("prepare")
    create.add_argument("--root", required=True)
    create.add_argument("--database-url", required=True)
    create.add_argument("--redis-url", required=True)
    create.add_argument("--public-url", default="http://localhost:15175")
    create.add_argument("--mfa-policy", choices=["required", "optional"], default="required")
    serve = commands.add_parser("serve")
    serve.add_argument("--root", required=True)
    serve.add_argument("--port", type=int, default=18002)
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args)
        return
    path = Path(args.root).resolve() / "environment.json"
    if path.stat().st_uid != os.geteuid() or path.stat().st_mode & 0o077:
        raise ValueError("Fixture configuration must be owned by the current user with mode 0600")
    os.environ.update(json.loads(path.read_text()))
    os.chdir(ROOT / "backend")
    os.execv(
        sys.executable,
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(args.port)],
    )


if __name__ == "__main__":
    main()
