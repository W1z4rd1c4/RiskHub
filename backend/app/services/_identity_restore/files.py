"""Protected restore artifacts and atomic JWT authority replacement."""

from __future__ import annotations

import fcntl
import hashlib
import hmac
import json
import os
import secrets
import stat
from pathlib import Path
from uuid import uuid4

from app.services._local_auth.bootstrap_files import destination

MAX_ARTIFACT_BYTES = 16 * 1024 * 1024


class RestoreError(ValueError):
    """Restore evidence is unsafe, incompatible or cannot establish current authority."""


def canonical_json(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def fingerprint(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _read_at(directory: int, name: str, *, maximum: int) -> bytes:
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.geteuid()
            or info.st_mode & 0o077
            or info.st_nlink != 1
            or info.st_size > maximum
        ):
            raise RestoreError("Restore evidence must be owner-only regular data")
        value = stream.read(maximum + 1)
        if not value or len(value) > maximum:
            raise RestoreError("Restore evidence is empty or exceeds its bound")
        return value


def read_private(path: Path, *, maximum: int = MAX_ARTIFACT_BYTES) -> bytes:
    with destination(str(path)) as (directory, name):
        return _read_at(directory, name, maximum=maximum)


def write_private(path: Path, value: bytes, *, expected: bytes | None = None) -> None:
    """Create exclusively, or replace only the exact expected protected value."""
    if not value or len(value) > MAX_ARTIFACT_BYTES:
        raise RestoreError("Restore evidence is empty or exceeds its bound")
    with destination(str(path)) as (directory, name):
        lock = os.open(".identity-restore.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        try:
            info = os.fstat(lock)
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.geteuid()
                or info.st_mode & 0o077
                or info.st_nlink != 1
            ):
                raise RestoreError("Unsafe restore lock")
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                previous = _read_at(directory, name, maximum=MAX_ARTIFACT_BYTES)
            except FileNotFoundError:
                previous = None
            if previous != expected:
                raise RestoreError("Restore evidence changed; refusing to overwrite it")
            temporary = f".identity-restore-{uuid4().hex}"
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(value)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
                os.fsync(directory)
            finally:
                try:
                    os.unlink(temporary, dir_fd=directory)
                except FileNotFoundError:
                    pass
        finally:
            os.close(lock)


def rotate_signing_authority(path: Path, *, expected_fingerprint: str) -> str:
    """Replace the sole signing key; never retain an old verification authority."""
    previous = read_private(path, maximum=4096)
    if not hmac.compare_digest(fingerprint(previous), expected_fingerprint):
        raise RestoreError("Signing authority changed since restore preparation")
    replacement = secrets.token_urlsafe(64).encode()
    write_private(path, replacement, expected=previous)
    return fingerprint(replacement)


def sign_artifact(payload: dict, key: bytes) -> dict:
    if len(key) < 32:
        raise RestoreError("Restore evidence key is too short")
    signature = hmac.new(key, b"riskhub-restore-v1\x00" + canonical_json(payload), hashlib.sha256).hexdigest()
    return {"payload": payload, "signature": signature}


def verify_artifact(value: dict, key: bytes) -> dict:
    try:
        if set(value) != {"payload", "signature"} or not isinstance(value["payload"], dict):
            raise RestoreError("Unrecognized restore evidence")
        expected = sign_artifact(value["payload"], key)["signature"]
        if not isinstance(value["signature"], str) or not hmac.compare_digest(expected, value["signature"]):
            raise RestoreError("Restore evidence integrity check failed")
        return value["payload"]
    except (TypeError, KeyError):
        raise RestoreError("Malformed restore evidence") from None
