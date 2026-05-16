from __future__ import annotations

import tomllib
from datetime import date
from pathlib import Path


def assert_not_expired(toml_path: Path) -> None:
    data = tomllib.loads(toml_path.read_text(encoding="utf-8"))
    saw_expiry = False

    top = data.get("expires_at")
    if top:
        saw_expiry = True
        if date.fromisoformat(str(top)) < date.today():
            raise AssertionError(f"{toml_path}: top-level expires_at={top} elapsed")

    for entry in data.get("allowlist", []):
        exp = entry.get("expires_at")
        if exp:
            saw_expiry = True
            if date.fromisoformat(str(exp)) < date.today():
                raise AssertionError(f"{toml_path} entry {entry!r}: expires_at={exp} elapsed")

    if not saw_expiry:
        raise AssertionError(f"{toml_path}: missing expires_at")
