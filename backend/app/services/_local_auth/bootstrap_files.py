"""Owner-only, no-follow, durable bootstrap handoff without overwriting unrelated files."""

from __future__ import annotations

import ctypes
import json
import os
import stat
import sys
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4


class BootstrapFileError(ValueError):
    """Protected handoff destination is unsafe or cannot be reconciled."""


def _publish_without_overwrite(directory: int, temporary: str, name: str) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    symbol, flag = ("renameatx_np", 4) if sys.platform == "darwin" else ("renameat2", 1)
    rename = getattr(libc, symbol, None)
    if rename is None:
        raise BootstrapFileError("Atomic no-overwrite publication is unavailable on this operating system")
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(directory, os.fsencode(temporary), directory, os.fsencode(name), flag) != 0:
        raise OSError(ctypes.get_errno(), "Atomic handoff publication failed")


@contextmanager
def destination(path: str):
    candidate = Path(path)
    if (
        not candidate.is_absolute()
        or str(candidate) != path
        or ".." in path.split("/")
        or candidate.name in {"", ".", ".."}
    ):
        raise BootstrapFileError("Use an absolute handoff file path without traversal")
    directory = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for component in candidate.parent.parts[1:]:
            next_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = next_fd
            info = os.fstat(directory)
            shared_temporary = info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX)
            if info.st_mode & 0o022 and not shared_temporary:
                raise BootstrapFileError("Handoff ancestry permits modification by another owner")
        info = os.fstat(directory)
        if info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise BootstrapFileError("Handoff directory must be owned by this operator with mode 0700")
        yield directory, candidate.name
    except OSError:
        raise BootstrapFileError("Handoff path cannot be opened safely") from None
    finally:
        os.close(directory)


def read_at(directory: int, name: str) -> dict | None:
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.geteuid()
            or info.st_mode & 0o077
            or info.st_nlink != 1
            or info.st_size > 16384
        ):
            raise BootstrapFileError("Existing handoff file is not owner-only regular data")
        try:
            value = json.loads(stream.read(16385))
        except (ValueError, UnicodeError):
            raise BootstrapFileError("Existing handoff file is unrelated") from None
        if not isinstance(value, dict):
            raise BootstrapFileError("Existing handoff file is unrelated")
        return value


def validate_destination(path: str, *, expected: dict | None = None) -> None:
    with destination(path) as (directory, name):
        existing = read_at(directory, name)
        if existing is not None and (expected is None or existing != expected):
            raise BootstrapFileError("Refusing to overwrite an unrelated handoff file")


def remove_verified_handoff(path: str, matches) -> None:
    with destination(path) as (directory, name):
        existing = read_at(directory, name)
        if existing is None:
            return
        if not matches(existing):
            raise BootstrapFileError("Refusing to remove an unrelated handoff file")
        os.unlink(name, dir_fd=directory)
        os.fsync(directory)


def publish_handoff(path: str, payload: dict) -> None:
    with destination(path) as (directory, name):
        existing = read_at(directory, name)
        if existing is not None:
            if existing != payload:
                raise BootstrapFileError("Refusing to overwrite an unrelated handoff file")
            os.fsync(directory)
            return
        temporary = f".bootstrap-{uuid4().hex}"
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(payload, stream, sort_keys=True)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            # Atomic no-clobber publication; both names are relative to the same held directory.
            _publish_without_overwrite(directory, temporary, name)
            os.fsync(directory)
        finally:
            try:
                os.unlink(temporary, dir_fd=directory)
            except FileNotFoundError:
                pass
