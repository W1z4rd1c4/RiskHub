from __future__ import annotations

from pathlib import Path
from typing import Any

from release_parity_audit.artifacts import sha256_file, write_json, write_text


def write_audit_json(path: Path, payload: Any) -> None:
    write_json(path, payload)


def write_audit_text(path: Path, text: str) -> None:
    write_text(path, text)


def sha256_audit_file(path: Path) -> str:
    return sha256_file(path)
