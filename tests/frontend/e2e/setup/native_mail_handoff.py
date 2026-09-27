"""Read an invitation from a fresh, owned loopback browser fixture into a 0600 handoff.

This test-only mailbox substitute reads encrypted queued delivery without sending mail,
printing credentials, or changing account/grant state. Never points at an application DB.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg
from native_fixture import ROOT, private_json


async def export_invitation(root: Path, email: str, output_name: str) -> None:
    config = root / "environment.json"
    for path in (root, root / "handoff", config):
        if path.is_symlink() or path.stat().st_uid != os.geteuid() or path.stat().st_mode & 0o077:
            raise ValueError("Use an owner-only browser fixture")
    environment = json.loads(config.read_text())
    database = urlsplit(environment["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1))
    if environment.get("DEBUG") != "true" or database.hostname not in {"localhost", "127.0.0.1"} or not re.fullmatch(
        r"/riskhub_native_e2e_[a-z0-9_]+", database.path
    ):
        raise ValueError("Only a loopback native browser fixture is permitted")
    if not re.fullmatch(r"[a-z0-9_-]+\.json", output_name):
        raise ValueError("Use a simple unique handoff filename")
    os.environ.update(environment)
    sys.path.insert(0, str(ROOT / "backend"))
    from app.services._local_auth.keys import LocalKeyring

    connection = await asyncpg.connect(database.geturl())
    try:
        async with connection.transaction(readonly=True):
            row = await connection.fetchrow("""
                SELECT d.* FROM local_auth_deliveries d
                JOIN local_auth_grants g ON g.id=d.grant_id JOIN users u ON u.id=d.user_id
                WHERE lower(u.email)=lower($1) AND g.purpose='invite'
                  AND g.consumed_at IS NULL AND g.revoked_at IS NULL AND g.expires_at>now()
                  AND d.ciphertext IS NOT NULL
                ORDER BY d.created_at DESC LIMIT 1
            """, email)
        if row is None:
            raise ValueError("No active invitation delivery in this fixture")
        payload = json.loads(LocalKeyring.load(environment["LOCAL_AUTH_KEYRING_FILE"]).decrypt(
            "delivery", row["key_id"], row["ciphertext"],
            [row["installation_id"], str(row["user_id"]), row["id"], row["grant_id"]],
        ))
        if payload.get("kind") != "invitation" or payload.get("recipient", "").lower() != email.lower():
            raise ValueError("Invitation recipient mismatch")
        private_json(root / "handoff" / output_name, {"credential": payload["credential"]})
    finally:
        await connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--output-name", required=True)
    args = parser.parse_args()
    asyncio.run(export_invitation(Path(args.root).resolve(), args.email, args.output_name))
