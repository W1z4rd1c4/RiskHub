"""Installed signing authority and cutover markers, distinct from private evidence.

Managed deployments use root:service 0440 keys under a root-owned 0750 directory.
Maintenance preserves that reader set so the unprivileged runtime can start again.
Only the owning operator (or root) may replace these files. Backup/journal evidence
continues to use files.py's stricter owner-only interface.
"""

from __future__ import annotations

import fcntl
import os
import stat
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from .files import RestoreError


@contextmanager
def _directory(path: Path):
    if not path.is_absolute() or ".." in path.parts:
        raise RestoreError("Installed restore paths must be absolute without traversal")
    directory = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for component in path.parent.parts[1:]:
            next_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = next_fd
            info = os.fstat(directory)
            if info.st_uid not in {0, os.geteuid()}:
                raise RestoreError("Installed restore ancestry has an unexpected owner")
            shared_temporary = info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX)
            if info.st_mode & 0o022 and not shared_temporary:
                raise RestoreError("Installed restore ancestry is writable by another owner")
        if os.fstat(directory).st_uid not in {0, os.geteuid()}:
            raise RestoreError("Installed restore directory has an unexpected owner")
        yield directory
    except OSError:
        raise RestoreError("Installed restore path cannot be opened safely") from None
    finally:
        os.close(directory)


def _read(directory: int, name: str, maximum: int) -> tuple[bytes, os.stat_result]:
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid not in {0, os.geteuid()}
            or info.st_mode & 0o137  # no executable, group-writable or world-accessible secret
            or info.st_nlink != 1
            or info.st_size > maximum
            or (info.st_mode & 0o040 and os.geteuid() != 0 and info.st_gid not in {os.getegid(), *os.getgroups()})
        ):
            raise RestoreError("Installed restore state must have a protected owner and reader group")
        value = stream.read(maximum + 1)
        if not value or len(value) > maximum:
            raise RestoreError("Installed restore state is empty or exceeds its bound")
        return value, info


def read_runtime(path: Path, *, maximum: int = 32768) -> bytes:
    with _directory(path) as directory:
        return _read(directory, path.name, maximum)[0]


def write_runtime(path: Path, value: bytes, *, signing_file: Path, expected: bytes | None = None) -> None:
    """Atomically replace exactly the expected value, preserving installed access."""
    if path.parent != signing_file.parent or not value or len(value) > 32768:
        raise RestoreError("Cutover state must remain beside the installed signing authority")
    with _directory(path) as directory:
        _, access = _read(directory, signing_file.name, 4096)
        if os.geteuid() not in {0, access.st_uid}:
            raise RestoreError("Only the installed signing-file owner may perform restore maintenance")
        lock = os.open(".identity-restore.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        try:
            info = os.fstat(lock)
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.geteuid()
                or info.st_mode & 0o077
                or info.st_nlink != 1
            ):
                raise RestoreError("Unsafe installed restore lock")
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            _, access = _read(directory, signing_file.name, 4096)
            try:
                previous, _ = _read(directory, path.name, 32768)
            except FileNotFoundError:
                previous = None
            if previous != expected:
                raise RestoreError("Installed restore state changed during maintenance")
            temporary = f".identity-restore-{uuid4().hex}"
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(value)
                    stream.flush()
                    os.fchown(stream.fileno(), access.st_uid, access.st_gid)
                    os.fchmod(stream.fileno(), stat.S_IMODE(access.st_mode))
                    os.fsync(stream.fileno())
                os.replace(temporary, path.name, src_dir_fd=directory, dst_dir_fd=directory)
                os.fsync(directory)
            finally:
                try:
                    os.unlink(temporary, dir_fd=directory)
                except FileNotFoundError:
                    pass
        finally:
            os.close(lock)
