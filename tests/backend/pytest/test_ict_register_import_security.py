"""Public CLI security contracts for the one-time ICT Register importer."""

from __future__ import annotations

import ctypes
import hashlib
import json
import os
import select
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest

from scripts import import_ict_register_workbook as importer

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "backend"


def _run_importer(
    source_root: Path, *extra_args: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "scripts.import_ict_register_workbook",
            "--source",
            str(source_root),
            *extra_args,
        ],
        cwd=BACKEND_ROOT,
        env={
            **os.environ,
            "DATABASE_URL": "postgresql+asyncpg://riskhub:secret@localhost/riskhub_test",
        },
        capture_output=True,
        text=True,
        check=False,
    )


def _write_malicious_seed(seed_path: Path, sentinel: Path) -> None:
    seed_path.write_text(
        "from pathlib import Path\n"
        f"Path({str(sentinel)!r}).write_text('executed', encoding='utf-8')\n",
        encoding="utf-8",
    )


def _assert_integrity_rejection(
    result: subprocess.CompletedProcess[str], sentinel: Path
) -> None:
    assert result.returncode != 0
    assert "integrity" in f"{result.stdout}\n{result.stderr}".lower()
    assert not sentinel.exists()


def test_apply_cli_requires_explicit_cutover_authorization(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "verified-source"
    mapping_path = tmp_path / "ict-register-accountability-map.synthetic.json"

    @contextmanager
    def verified_snapshot(_source: Path):
        yield source_root

    async def unexpected_import(*_args, **_kwargs):
        pytest.fail("apply mode reached the database without authorization flags")

    monkeypatch.setattr(importer, "verified_source_snapshot", verified_snapshot)
    monkeypatch.setattr(importer, "run_import", unexpected_import)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://unused")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "import_ict_register_workbook",
            "--source",
            str(source_root),
            "--accountability-map",
            str(mapping_path),
        ],
    )

    with pytest.raises(SystemExit, match="--cutover-authorized-by"):
        importer.main()


def test_verify_cli_remains_read_only_without_cutover_authorization(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "verified-source"
    mapping_path = tmp_path / "ict-register-accountability-map.synthetic.json"
    calls: list[dict[str, object]] = []

    @contextmanager
    def verified_snapshot(_source: Path):
        yield source_root

    async def verify(*_args, **kwargs):
        calls.append(kwargs)
        return 0

    async def unexpected_import(*_args, **_kwargs):
        pytest.fail("--verify invoked the mutating apply path")

    monkeypatch.setattr(importer, "verified_source_snapshot", verified_snapshot)
    monkeypatch.setattr(importer, "run_verify", verify)
    monkeypatch.setattr(importer, "run_import", unexpected_import)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://unused")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "import_ict_register_workbook",
            "--source",
            str(source_root),
            "--verify",
            "--accountability-map",
            str(mapping_path),
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        importer.main()

    assert exit_info.value.code == 0
    assert calls == [
        {
            "source_label": source_root,
            "accountability_map_path": mapping_path,
        }
    ]


def test_apply_cli_requires_explicit_process_accountability_map(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "verified-source"

    @contextmanager
    def verified_snapshot(_source: Path):
        yield source_root

    async def unexpected_import(*_args, **_kwargs):
        pytest.fail("apply mode reached the database without an accountability map")

    monkeypatch.setattr(importer, "verified_source_snapshot", verified_snapshot)
    monkeypatch.setattr(importer, "run_import", unexpected_import)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://unused")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "import_ict_register_workbook",
            "--source",
            str(source_root),
            "--cutover-authorized-by",
            "cro@riskhub.local",
            "--authorization-reference",
            "#53",
        ],
    )

    with pytest.raises(SystemExit, match="--accountability-map"):
        importer.main()


def test_apply_cli_forwards_explicit_cutover_authorization(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "verified-source"
    mapping_path = tmp_path / "ict-register-accountability-map.synthetic.json"
    calls: list[dict[str, object]] = []

    @contextmanager
    def verified_snapshot(_source: Path):
        yield source_root

    async def apply(_source: Path, **kwargs):
        calls.append(kwargs)
        return 0

    monkeypatch.setattr(importer, "verified_source_snapshot", verified_snapshot)
    monkeypatch.setattr(importer, "run_import", apply)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://unused")
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "import_ict_register_workbook",
            "--source",
            str(source_root),
            "--cutover-authorized-by",
            "cro@riskhub.local",
            "--authorization-reference",
            "#53",
            "--accountability-map",
            str(mapping_path),
        ],
    )

    with pytest.raises(SystemExit) as exit_info:
        importer.main()

    assert exit_info.value.code == 0
    assert calls == [
        {
            "source_label": source_root,
            "cutover_authorized_by": "cro@riskhub.local",
            "authorization_reference": "#53",
            "accountability_map_path": mapping_path,
        }
    ]


def test_importer_rejects_tampered_seed_before_executing_it(tmp_path: Path) -> None:
    source_root = tmp_path / "workbook-export"
    builder = source_root / "builder"
    builder.mkdir(parents=True)
    sentinel = tmp_path / "seed-was-executed"
    _write_malicious_seed(builder / "seed.py", sentinel)
    (builder / "source_data.json").write_text("{}\n", encoding="utf-8")
    (builder / "build_expected.json").write_text("{}\n", encoding="utf-8")

    _assert_integrity_rejection(_run_importer(source_root), sentinel)


def test_importer_rejects_same_size_seed_with_wrong_hash(tmp_path: Path) -> None:
    source_root = tmp_path / "workbook-export"
    builder = source_root / "builder"
    builder.mkdir(parents=True)
    sentinel = tmp_path / "seed-was-executed"
    malicious = (
        "from pathlib import Path\n"
        f"Path({str(sentinel)!r}).write_text('executed', encoding='utf-8')\n"
    )
    (builder / "seed.py").write_text(
        malicious + ("#" * (38833 - len(malicious))),
        encoding="utf-8",
    )
    (builder / "source_data.json").write_text("{}\n", encoding="utf-8")
    (builder / "build_expected.json").write_text("{}\n", encoding="utf-8")

    result = _run_importer(source_root)

    _assert_integrity_rejection(result, sentinel)
    assert "sha-256 mismatch" in f"{result.stdout}\n{result.stderr}".lower()


def test_importer_rejects_symlinked_seed_before_executing_it(tmp_path: Path) -> None:
    source_root = tmp_path / "workbook-export"
    builder = source_root / "builder"
    builder.mkdir(parents=True)
    sentinel = tmp_path / "seed-was-executed"
    external_seed = tmp_path / "external-seed.py"
    _write_malicious_seed(external_seed, sentinel)
    (builder / "seed.py").symlink_to(external_seed)
    (builder / "source_data.json").write_text("{}\n", encoding="utf-8")
    (builder / "build_expected.json").write_text("{}\n", encoding="utf-8")

    _assert_integrity_rejection(_run_importer(source_root), sentinel)


def test_importer_rejects_symlinked_source_root(tmp_path: Path) -> None:
    actual_source_root = tmp_path / "actual-workbook-export"
    (actual_source_root / "builder").mkdir(parents=True)
    source_root = tmp_path / "workbook-export"
    source_root.symlink_to(actual_source_root, target_is_directory=True)

    result = _run_importer(source_root)

    assert result.returncode != 0
    assert "integrity check failed: symlink/path escape for source root" in (
        f"{result.stdout}\n{result.stderr}".lower()
    )


def test_importer_rejects_missing_manifest_input(tmp_path: Path) -> None:
    source_root = tmp_path / "workbook-export"
    (source_root / "builder").mkdir(parents=True)

    result = _run_importer(source_root)

    assert result.returncode != 0
    assert "integrity check failed: missing builder/seed.py" in (
        f"{result.stdout}\n{result.stderr}".lower()
    )


def test_importer_rejects_non_regular_manifest_input(tmp_path: Path) -> None:
    source_root = tmp_path / "workbook-export"
    (source_root / "builder" / "seed.py").mkdir(parents=True)

    result = _run_importer(source_root)

    assert result.returncode != 0
    assert "integrity check failed: non-regular file builder/seed.py" in (
        f"{result.stdout}\n{result.stderr}".lower()
    )


def test_importer_rejects_fifo_manifest_input_without_blocking(tmp_path: Path) -> None:
    source_root = tmp_path / "workbook-export"
    builder = source_root / "builder"
    builder.mkdir(parents=True)
    os.mkfifo(builder / "seed.py")

    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "scripts.import_ict_register_workbook",
            "--source",
            str(source_root),
        ],
        cwd=BACKEND_ROOT,
        env={
            **os.environ,
            "DATABASE_URL": "postgresql+asyncpg://riskhub:secret@localhost/riskhub_test",
        },
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        try:
            stdout, stderr = process.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            pytest.fail("importer blocked while opening a FIFO manifest input")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()

    assert process.returncode != 0
    assert "integrity check failed: non-regular file builder/seed.py" in (
        f"{stdout}\n{stderr}".lower()
    )


def test_importer_rejects_builder_path_escape_before_executing_seed(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "workbook-export"
    source_root.mkdir()
    external_builder = tmp_path / "external-builder"
    external_builder.mkdir()
    sentinel = tmp_path / "seed-was-executed"
    _write_malicious_seed(external_builder / "seed.py", sentinel)
    (external_builder / "source_data.json").write_text("{}\n", encoding="utf-8")
    (external_builder / "build_expected.json").write_text("{}\n", encoding="utf-8")
    (source_root / "builder").symlink_to(external_builder, target_is_directory=True)

    _assert_integrity_rejection(_run_importer(source_root), sentinel)


def test_importer_rejects_external_expected_profile_before_executing_seed(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "workbook-export"
    builder = source_root / "builder"
    builder.mkdir(parents=True)
    sentinel = tmp_path / "seed-was-executed"
    _write_malicious_seed(builder / "seed.py", sentinel)
    external_expected = tmp_path / "external-expected.json"
    external_expected.write_text("{}\n", encoding="utf-8")

    result = _run_importer(
        source_root,
        "--verify",
        "--expected",
        str(external_expected),
    )

    _assert_integrity_rejection(result, sentinel)
    assert "--expected" in f"{result.stdout}\n{result.stderr}"


@contextmanager
def _watch_file_read(path: Path) -> Iterator[Callable[[], None]]:
    if sys.platform.startswith("linux"):
        libc = ctypes.CDLL(None, use_errno=True)
        inotify_fd = libc.inotify_init1(os.O_CLOEXEC)
        if inotify_fd == -1:
            raise OSError(ctypes.get_errno(), "inotify_init1 failed")
        try:
            watch = libc.inotify_add_watch(
                inotify_fd,
                os.fsencode(path),
                0x00000001,  # IN_ACCESS
            )
            if watch == -1:
                raise OSError(ctypes.get_errno(), "inotify_add_watch failed")

            def wait_for_read() -> None:
                ready, _, _ = select.select([inotify_fd], [], [], 10)
                assert ready, "importer did not read seed.py"
                os.read(inotify_fd, 4096)

            yield wait_for_read
        finally:
            os.close(inotify_fd)
        return

    if hasattr(select, "kqueue") and hasattr(select, "KQ_NOTE_READ"):
        path_fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC)
        queue = select.kqueue()
        try:
            event = select.kevent(
                path_fd,
                filter=select.KQ_FILTER_VNODE,
                flags=select.KQ_EV_ADD | select.KQ_EV_CLEAR,
                fflags=select.KQ_NOTE_READ,
            )
            queue.control([event], 0, 0)

            def wait_for_read() -> None:
                assert queue.control(None, 1, 10), "importer did not read seed.py"

            yield wait_for_read
        finally:
            queue.close()
            os.close(path_fd)
        return

    pytest.skip("no native pre-armed file access watcher on this platform")


def test_importer_executes_only_manifest_verified_bytes_when_source_is_replaced(
    tmp_path: Path,
) -> None:
    runtime_root = tmp_path / "runtime"
    runtime_backend = runtime_root / "backend"
    runtime_scripts = runtime_backend / "scripts"
    runtime_scripts.mkdir(parents=True)
    for name in (
        "__init__.py",
        "_ict_register_cutover.py",
        "_ict_register_import_helpers.py",
        "import_ict_register_workbook.py",
    ):
        shutil.copy2(BACKEND_ROOT / "scripts" / name, runtime_scripts / name)

    source_root = tmp_path / "workbook-export"
    builder = source_root / "builder"
    builder.mkdir(parents=True)
    seed_path = builder / "seed.py"
    seed_bytes = (
        b"from pathlib import Path\n"
        b"Path(__file__).with_name('source_data.json').read_text(encoding='utf-8')\n"
    )
    source_data = b"{}\n" + (b" " * (32 * 1024 * 1024))
    expected = b"{}\n"
    seed_path.write_bytes(seed_bytes)
    os.utime(seed_path, ns=(1_000_000_000, seed_path.stat().st_mtime_ns))
    (builder / "source_data.json").write_bytes(source_data)
    (builder / "build_expected.json").write_bytes(expected)

    manifest = {
        "manifest_version": 1,
        "files": {
            name: {
                "size": len(contents),
                "sha256": hashlib.sha256(contents).hexdigest(),
            }
            for name, contents in (
                ("builder/seed.py", seed_bytes),
                ("builder/source_data.json", source_data),
                ("builder/build_expected.json", expected),
            )
        },
    }
    manifest_path = runtime_root / "docs" / "dora-ict-register" / "cutover-manifest.json"
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    sentinel = tmp_path / "replacement-seed-executed"
    replacement = tmp_path / "replacement-seed.py"
    _write_malicious_seed(replacement, sentinel)
    env = {
        **os.environ,
        "DATABASE_URL": "postgresql+asyncpg://riskhub:secret@127.0.0.1:9/riskhub_test",
        "PYTHONPATH": os.pathsep.join((str(runtime_backend), str(BACKEND_ROOT))),
    }
    with _watch_file_read(seed_path) as wait_for_read:
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "scripts.import_ict_register_workbook",
                "--source",
                str(source_root),
            ],
            cwd=runtime_backend,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            wait_for_read()
            os.replace(replacement, seed_path)
            stdout, stderr = process.communicate(timeout=20)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()

    assert process.returncode != 0
    assert "integrity" not in f"{stdout}\n{stderr}".lower()
    assert not sentinel.exists(), "replacement bytes executed after verification"
