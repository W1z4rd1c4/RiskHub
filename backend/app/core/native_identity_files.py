"""Dependency-free native security file validation shared with deployment tooling."""

from __future__ import annotations

import base64
import json
import os
import re
import stat


class NativeSecurityFileError(ValueError):
    """Required file cannot be read with its security constraints intact."""


def read_native_secret(path: str | None, *, max_bytes: int = 65536) -> bytes:
    if not path:
        raise NativeSecurityFileError("Missing native security file")
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > max_bytes:
                raise NativeSecurityFileError("Unsafe native security file")
            value = stream.read(max_bytes + 1)
            if not value or len(value) > max_bytes:
                raise NativeSecurityFileError("Invalid native security file")
            return value
    except OSError:
        raise NativeSecurityFileError("Native security file is unavailable") from None


def load_keyring_material(path: str | None) -> dict[str, tuple[str, dict[str, bytes]]]:
    try:
        data = json.loads(read_native_secret(path))
        if (
            type(data["version"]) is not int
            or data["version"] != 1
            or set(data["purposes"]) != {"delivery", "totp", "action"}
        ):
            raise ValueError("Invalid keyring format")
        purposes = {}
        unique: set[bytes] = set()
        for purpose, entry in data["purposes"].items():
            keys = {}
            for key_id, value in entry["keys"].items():
                if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", key_id):
                    raise ValueError("Invalid key identifier")
                raw = base64.b64decode(value, validate=True)
                if len(raw) != 32 or raw in unique:
                    raise ValueError("Keyring keys must be independently generated")
                unique.add(raw)
                keys[key_id] = raw
            if entry["active"] not in keys:
                raise ValueError("Missing active key")
            purposes[purpose] = (entry["active"], keys)
        return purposes
    except (KeyError, TypeError, ValueError, AttributeError):
        raise ValueError("Invalid or unavailable native keyring") from None


def load_approver_material(path: str | None) -> dict[str, bytes]:
    try:
        trust = json.loads(read_native_secret(path))
        if trust["version"] != 1 or type(trust["version"]) is not int:
            raise ValueError("Invalid trust format")
        keys: dict[str, bytes] = {}
        public_keys = set()
        accountable_names = set()
        for item in trust["approvers"]:
            raw = base64.b64decode(item["public_key"], validate=True)
            if (
                len(raw) != 32
                or not isinstance(item["id"], str)
                or not item["id"]
                or not isinstance(item["name"], str)
                or not item["name"].strip()
                or item["id"] in keys
                or raw in public_keys
                or item["name"].strip().casefold() in accountable_names
            ):
                raise ValueError("Duplicate or unaccountable approver")
            keys[item["id"]] = raw
            public_keys.add(raw)
            accountable_names.add(item["name"].strip().casefold())
        if len(keys) < 2:
            raise ValueError("At least two independent approvers required")
        return keys
    except NativeSecurityFileError:
        raise
    except (KeyError, ValueError, TypeError):
        raise ValueError("Invalid or unavailable recovery approver file") from None
