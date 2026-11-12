#!/usr/bin/env python3
"""Authenticate, validate, and safely extract Linux release bundles."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


DIGEST_RE = re.compile(r"^(?:sha256:)?([0-9a-fA-F]{64})$")
VERSION_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._+-]*$")
GIT_COMMIT_RE = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
MAX_MANIFEST_BYTES = 16 * 1024 * 1024


class BundleError(ValueError):
    pass


@dataclass(frozen=True)
class ValidatedBundle:
    version: str
    root: str


def normalize_sha256(value: str) -> str:
    match = DIGEST_RE.fullmatch(value.strip())
    if match is None:
        raise BundleError(
            "Bundle SHA-256 must be 64 hexadecimal characters, optionally prefixed by sha256:"
        )
    return match.group(1).lower()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise BundleError(f"Unable to hash bundle {path}: {exc}") from exc
    return digest.hexdigest()


def verify_archive_digest(bundle_path: Path, expected_sha256: str) -> str:
    expected = normalize_sha256(expected_sha256)
    actual = file_sha256(bundle_path)
    if actual != expected:
        raise BundleError(
            f"Bundle SHA-256 mismatch: expected {expected}, received {actual}"
        )
    return actual


def _canonical_member_name(member: tarfile.TarInfo) -> str:
    raw_name = member.name
    if member.isdir() and raw_name.endswith("/"):
        raw_name = raw_name[:-1]
    if not raw_name or "\\" in raw_name:
        raise BundleError("Bundle contains an empty or non-POSIX member path")
    path = PurePosixPath(raw_name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise BundleError(f"Bundle contains an unsafe member path: {member.name}")
    canonical = "/".join(path.parts)
    if canonical != raw_name:
        raise BundleError(f"Bundle contains a non-canonical member path: {member.name}")
    return canonical


def _canonical_inventory_name(raw_name: object) -> str:
    if not isinstance(raw_name, str) or not raw_name or "\\" in raw_name:
        raise BundleError("Bundle manifest contains an invalid file path")
    path = PurePosixPath(raw_name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise BundleError(f"Bundle manifest contains an unsafe file path: {raw_name}")
    canonical = "/".join(path.parts)
    if canonical != raw_name or canonical == "manifest.json":
        raise BundleError(f"Bundle manifest contains an invalid file path: {raw_name}")
    return canonical


def _reject_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    parsed: dict[str, object] = {}
    for key, value in pairs:
        if key in parsed:
            raise BundleError(f"Bundle manifest contains duplicate JSON key: {key}")
        parsed[key] = value
    return parsed


def _read_manifest(
    archive: tarfile.TarFile, manifest_member: tarfile.TarInfo
) -> dict[str, object]:
    if manifest_member.size > MAX_MANIFEST_BYTES:
        raise BundleError("Bundle manifest exceeds the supported size limit")
    stream = archive.extractfile(manifest_member)
    if stream is None:
        raise BundleError("Unable to read bundle manifest")
    try:
        payload = json.loads(
            stream.read().decode("utf-8"),
            object_pairs_hook=_reject_duplicate_json_keys,
        )
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise BundleError("Bundle manifest is not valid UTF-8 JSON") from exc
    if not isinstance(payload, dict):
        raise BundleError("Bundle manifest must be a JSON object")
    return payload


def _manifest_identity(payload: dict[str, object]) -> tuple[str, str, int]:
    schema_version = payload.get("schema_version", 0)
    if schema_version not in {0, 1}:
        raise BundleError("Bundle manifest schema_version must be 1 when present")
    version = payload.get("version")
    if not isinstance(version, str) or VERSION_RE.fullmatch(version) is None:
        raise BundleError("Bundle manifest contains an invalid release version")
    root = payload.get("bundle_root")
    if root != f"riskhub-linux-{version}":
        raise BundleError("Bundle manifest root does not match its release version")
    commit = payload.get("git_commit")
    if not isinstance(commit, str) or GIT_COMMIT_RE.fullmatch(commit) is None:
        raise BundleError("Bundle manifest contains an invalid source commit")
    if not isinstance(payload.get("git_ref"), str) or not payload["git_ref"]:
        raise BundleError("Bundle manifest is missing its source ref")
    return version, root, schema_version


def _manifest_inventory(
    payload: dict[str, object], schema_version: int
) -> dict[str, dict[str, object]] | None:
    raw_inventory = payload.get("files")
    if schema_version == 0 and raw_inventory is None:
        # The independently supplied archive digest authenticates legacy bundles.
        return None
    if not isinstance(raw_inventory, dict):
        raise BundleError("Bundle manifest is missing its file inventory")
    inventory: dict[str, dict[str, object]] = {}
    for raw_name, raw_entry in raw_inventory.items():
        name = _canonical_inventory_name(raw_name)
        if name in inventory or not isinstance(raw_entry, dict):
            raise BundleError(f"Bundle manifest contains an invalid file entry: {name}")
        if set(raw_entry) != {"sha256", "size"}:
            raise BundleError(f"Bundle manifest file entry has invalid fields: {name}")
        digest = raw_entry.get("sha256")
        size = raw_entry.get("size")
        if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
            raise BundleError(f"Bundle manifest contains an invalid file digest: {name}")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise BundleError(f"Bundle manifest contains an invalid file size: {name}")
        inventory[name] = {"sha256": digest, "size": size}
    return inventory


def validate_archive(bundle_path: Path, expected_sha256: str) -> ValidatedBundle:
    # Authentication must complete before tarfile sees any attacker-controlled bytes.
    verify_archive_digest(bundle_path, expected_sha256)
    try:
        with tarfile.open(bundle_path, "r:gz") as archive:
            members = tuple(archive.getmembers())
            names: dict[str, tarfile.TarInfo] = {}
            manifest_members: list[tarfile.TarInfo] = []
            for member in members:
                name = _canonical_member_name(member)
                if name in names:
                    raise BundleError(f"Bundle contains duplicate member path: {name}")
                names[name] = member
                if not (member.isdir() or member.isfile()) or member.issparse():
                    raise BundleError(
                        f"Bundle member must be a regular file or directory: {name}"
                    )
                if member.mode & 0o7000:
                    raise BundleError(f"Bundle member uses privileged mode bits: {name}")
                if PurePosixPath(name).name == "manifest.json":
                    manifest_members.append(member)

            if len(manifest_members) != 1 or not manifest_members[0].isfile():
                raise BundleError("Bundle must contain exactly one regular manifest.json")
            payload = _read_manifest(archive, manifest_members[0])
            version, root, schema_version = _manifest_identity(payload)
            if root not in names or not names[root].isdir():
                raise BundleError("Bundle is missing its declared root directory")
            if any(PurePosixPath(name).parts[0] != root for name in names):
                raise BundleError("Bundle contains members outside its declared root")
            if manifest_members[0].name.rstrip("/") != f"{root}/manifest.json":
                raise BundleError("Bundle manifest is not at the declared root")

            inventory = _manifest_inventory(payload, schema_version)
            actual_files = {
                name.removeprefix(f"{root}/"): member
                for name, member in names.items()
                if member.isfile() and name != f"{root}/manifest.json"
            }
            if inventory is not None:
                if set(actual_files) != set(inventory):
                    raise BundleError("Bundle files do not match the manifest inventory")
                for name, member in actual_files.items():
                    entry = inventory[name]
                    if member.size != entry["size"]:
                        raise BundleError(
                            f"Bundle file size does not match manifest: {name}"
                        )
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise BundleError(f"Unable to read bundle file: {name}")
                    digest = hashlib.sha256()
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                    if digest.hexdigest() != entry["sha256"]:
                        raise BundleError(
                            f"Bundle file digest does not match manifest: {name}"
                        )
    except (tarfile.TarError, OSError) as exc:
        raise BundleError(f"Unable to inspect bundle {bundle_path}: {exc}") from exc
    return ValidatedBundle(version=version, root=root)


def extract_archive(
    bundle_path: Path,
    expected_sha256: str,
    destination: Path,
    expected_version: str,
) -> str:
    validated = validate_archive(bundle_path, expected_sha256)
    if validated.version != expected_version:
        raise BundleError("Bundle version changed after release directory selection")
    if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
        raise BundleError("Bundle extraction destination must be a real directory")
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise BundleError("Bundle extraction destination must be empty")

    try:
        with tarfile.open(bundle_path, "r:gz") as archive:
            directories: list[tuple[Path, int]] = []
            for member in archive.getmembers():
                relative = Path(*PurePosixPath(member.name.rstrip("/")).parts)
                target = destination / relative
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    directories.append((target, member.mode & 0o777))
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    raise BundleError(f"Unable to extract bundle file: {member.name}")
                with target.open("xb") as output:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
                os.chmod(target, member.mode & 0o777)
            for directory, mode in reversed(directories):
                os.chmod(directory, mode)
    except (tarfile.TarError, OSError) as exc:
        raise BundleError(f"Unable to extract bundle {bundle_path}: {exc}") from exc
    return validated.version


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect = subparsers.add_parser("inspect")
    inspect.add_argument("--bundle", required=True)
    inspect.add_argument("--sha256", required=True)
    extract = subparsers.add_parser("extract")
    extract.add_argument("--bundle", required=True)
    extract.add_argument("--sha256", required=True)
    extract.add_argument("--destination", required=True)
    extract.add_argument("--expected-version", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "inspect":
            print(validate_archive(Path(args.bundle), args.sha256).version)
        else:
            extract_archive(
                Path(args.bundle),
                args.sha256,
                Path(args.destination),
                args.expected_version,
            )
    except BundleError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
