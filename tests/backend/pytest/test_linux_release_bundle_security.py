"""Security contracts for authenticated Linux release bundle extraction."""

from __future__ import annotations

import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
BUNDLE_TOOL = REPO_ROOT / "scripts" / "deploy" / "lib" / "release_bundle.py"


def _add_directory(archive: tarfile.TarFile, name: str) -> None:
    member = tarfile.TarInfo(name)
    member.type = tarfile.DIRTYPE
    member.mode = 0o755
    archive.addfile(member)


def _add_file(archive: tarfile.TarFile, name: str, contents: bytes) -> None:
    member = tarfile.TarInfo(name)
    member.size = len(contents)
    member.mode = 0o644
    archive.addfile(member, io.BytesIO(contents))


def _write_bundle(path: Path, version: str = "v-test") -> bytes:
    root = f"riskhub-linux-{version}"
    payload = b"trusted release payload\n"
    manifest = {
        "schema_version": 1,
        "version": version,
        "git_commit": "0" * 40,
        "git_ref": f"refs/tags/{version}",
        "bundle_root": root,
        "files": {
            "backend/app.txt": {
                "sha256": hashlib.sha256(payload).hexdigest(),
                "size": len(payload),
            }
        },
    }
    manifest_bytes = (json.dumps(manifest, sort_keys=True) + "\n").encode()
    with tarfile.open(path, "w:gz") as archive:
        _add_directory(archive, root)
        _add_directory(archive, f"{root}/backend")
        _add_file(archive, f"{root}/manifest.json", manifest_bytes)
        _add_file(archive, f"{root}/backend/app.txt", payload)
    return payload


def _run_tool(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(BUNDLE_TOOL), *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_exact_digest_and_inventory_preserve_offline_extraction(tmp_path: Path) -> None:
    bundle = tmp_path / "riskhub-linux-v-test.tar.gz"
    expected_payload = _write_bundle(bundle)
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    destination = tmp_path / "extract"

    inspected = _run_tool("inspect", "--bundle", str(bundle), "--sha256", digest)
    extracted = _run_tool(
        "extract",
        "--bundle",
        str(bundle),
        "--sha256",
        f"sha256:{digest}",
        "--destination",
        str(destination),
        "--expected-version",
        "v-test",
    )

    assert inspected.returncode == 0 and inspected.stdout.strip() == "v-test"
    assert extracted.returncode == 0, extracted.stderr
    assert (
        destination / "riskhub-linux-v-test" / "backend" / "app.txt"
    ).read_bytes() == expected_payload


def test_modified_archive_is_rejected_before_tar_parsing(tmp_path: Path) -> None:
    bundle = tmp_path / "riskhub-linux-v-test.tar.gz"
    _write_bundle(bundle)
    trusted_digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    bundle.write_bytes(b"not a tar archive")

    result = _run_tool(
        "inspect", "--bundle", str(bundle), "--sha256", trusted_digest
    )

    assert result.returncode != 0
    assert "SHA-256 mismatch" in result.stderr
    assert "Unable to inspect" not in result.stderr


def test_authenticated_legacy_manifest_remains_installable(tmp_path: Path) -> None:
    bundle = tmp_path / "riskhub-linux-v-legacy.tar.gz"
    root = "riskhub-linux-v-legacy"
    manifest = {
        "version": "v-legacy",
        "git_commit": "0" * 40,
        "git_ref": "refs/tags/v-legacy",
        "bundle_root": root,
    }
    with tarfile.open(bundle, "w:gz") as archive:
        _add_directory(archive, root)
        _add_file(
            archive,
            f"{root}/manifest.json",
            (json.dumps(manifest) + "\n").encode(),
        )
        _add_file(archive, f"{root}/legacy.txt", b"legacy release\n")

    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    result = _run_tool("inspect", "--bundle", str(bundle), "--sha256", digest)

    assert result.returncode == 0
    assert result.stdout.strip() == "v-legacy"

    destination = tmp_path / "extract"
    extracted = _run_tool(
        "extract", "--bundle", str(bundle), "--sha256", digest,
        "--destination", str(destination), "--expected-version", "v-legacy",
    )
    assert extracted.returncode == 0, extracted.stderr
    assert (destination / root / "legacy.txt").read_bytes() == b"legacy release\n"


@pytest.mark.parametrize(
    "unsafe_kind",
    [
        "traversal",
        "absolute",
        "link",
        "hardlink",
        "device",
        "fifo",
        "sparse",
        "setuid",
        "setgid",
        "sticky",
        "noncanonical",
        "duplicate",
        "second-root",
        "second-manifest",
    ],
)
def test_authenticated_archive_still_rejects_unsafe_members(
    tmp_path: Path, unsafe_kind: str
) -> None:
    bundle = tmp_path / f"{unsafe_kind}.tar.gz"
    root = "riskhub-linux-v-test"
    manifest = {
        "schema_version": 1,
        "version": "v-test",
        "git_commit": "0" * 40,
        "git_ref": "refs/tags/v-test",
        "bundle_root": root,
        "files": {},
    }
    with tarfile.open(bundle, "w:gz") as archive:
        _add_directory(archive, root)
        _add_file(
            archive,
            f"{root}/manifest.json",
            (json.dumps(manifest) + "\n").encode(),
        )
        if unsafe_kind == "traversal":
            _add_file(archive, f"{root}/../escape", b"escape")
        elif unsafe_kind == "absolute":
            _add_file(archive, "/escape", b"escape")
        elif unsafe_kind == "link":
            member = tarfile.TarInfo(f"{root}/link")
            member.type = tarfile.SYMTYPE
            member.linkname = "/etc/passwd"
            archive.addfile(member)
        elif unsafe_kind == "device":
            member = tarfile.TarInfo(f"{root}/device")
            member.type = tarfile.CHRTYPE
            archive.addfile(member)
        elif unsafe_kind == "hardlink":
            member = tarfile.TarInfo(f"{root}/link")
            member.type = tarfile.LNKTYPE
            member.linkname = f"{root}/manifest.json"
            archive.addfile(member)
        elif unsafe_kind == "fifo":
            member = tarfile.TarInfo(f"{root}/fifo")
            member.type = tarfile.FIFOTYPE
            archive.addfile(member)
        elif unsafe_kind == "sparse":
            member = tarfile.TarInfo(f"{root}/sparse")
            member.pax_headers = {"GNU.sparse.map": "0,0", "GNU.sparse.size": "0"}
            archive.addfile(member, io.BytesIO(b""))
        elif unsafe_kind in {"setuid", "setgid", "sticky"}:
            member = tarfile.TarInfo(f"{root}/privileged")
            member.mode = {"setuid": 0o4755, "setgid": 0o2755, "sticky": 0o1755}[unsafe_kind]
            archive.addfile(member, io.BytesIO(b""))
        elif unsafe_kind == "noncanonical":
            _add_file(archive, f"{root}//file", b"ambiguous")
        elif unsafe_kind == "duplicate":
            _add_file(archive, f"{root}/duplicate", b"first")
            _add_file(archive, f"{root}/duplicate", b"second")
        elif unsafe_kind == "second-manifest":
            _add_file(archive, f"{root}/nested/manifest.json", b"{}\n")
        else:
            _add_file(archive, "other-root/file", b"outside")

    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    destination = tmp_path / "extract"
    result = _run_tool(
        "extract", "--bundle", str(bundle), "--sha256", digest,
        "--destination", str(destination), "--expected-version", "v-test",
    )

    assert result.returncode != 0
    assert not destination.exists()
    assert any(
        phrase in result.stderr
        for phrase in (
            "unsafe member path",
            "regular file or directory",
            "duplicate member path",
            "outside its declared root",
            "exactly one regular manifest.json",
            "privileged mode bits",
            "non-canonical member path",
        )
    )


@pytest.mark.parametrize(
    ("corruption", "message"),
    [
        ("missing", "files do not match the manifest inventory"),
        ("extra", "files do not match the manifest inventory"),
        ("size", "file size does not match manifest"),
        ("same-size-content", "file digest does not match manifest"),
    ],
)
def test_authenticated_inventory_mismatch_never_extracts(
    tmp_path: Path, corruption: str, message: str
) -> None:
    original = tmp_path / "original.tar.gz"
    payload = _write_bundle(original)
    root = "riskhub-linux-v-test"
    with tarfile.open(original, "r:gz") as archive:
        manifest = json.load(archive.extractfile(f"{root}/manifest.json"))
    if corruption == "size":
        manifest["files"]["backend/app.txt"]["size"] += 1
    elif corruption == "same-size-content":
        payload = b"X" + payload[1:]

    bundle = tmp_path / "inconsistent.tar.gz"
    with tarfile.open(bundle, "w:gz") as archive:
        _add_directory(archive, root)
        _add_file(archive, f"{root}/manifest.json", json.dumps(manifest).encode())
        if corruption != "missing":
            _add_file(archive, f"{root}/backend/app.txt", payload)
        if corruption == "extra":
            _add_file(archive, f"{root}/unexpected.txt", b"unlisted payload")

    # Authenticate these exact bytes so the test reaches inventory validation.
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    destination = tmp_path / "extract"
    result = _run_tool(
        "extract", "--bundle", str(bundle), "--sha256", digest,
        "--destination", str(destination), "--expected-version", "v-test",
    )
    assert result.returncode != 0
    assert message in result.stderr
    assert not destination.exists()


@pytest.mark.parametrize(
    "manifest_bytes",
    [
        b'{"version":"v-test","version":"v-other"}',
        b'{"files":{"app.txt":{"sha256":"first","sha256":"second"}}}',
    ],
)
def test_duplicate_manifest_keys_never_extract(tmp_path: Path, manifest_bytes: bytes) -> None:
    bundle = tmp_path / "duplicate-json.tar.gz"
    with tarfile.open(bundle, "w:gz") as archive:
        _add_directory(archive, "riskhub-linux-v-test")
        _add_file(archive, "riskhub-linux-v-test/manifest.json", manifest_bytes)
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    destination = tmp_path / "extract"
    result = _run_tool(
        "extract", "--bundle", str(bundle), "--sha256", digest,
        "--destination", str(destination), "--expected-version", "v-test",
    )
    assert result.returncode != 0
    assert "duplicate JSON key" in result.stderr
    assert not destination.exists()
