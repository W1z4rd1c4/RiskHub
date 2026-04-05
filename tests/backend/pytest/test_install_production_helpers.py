from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_ROOT = REPO_ROOT / "scripts"
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

from install_lib.common import InstallPaths
from install_lib.production_release import backup_non_secret_production_state, production_existing_install_detected
from install_lib.production_secrets import production_scaffold_missing


def _paths(tmp_path: Path) -> InstallPaths:
    return InstallPaths(
        repo_root=REPO_ROOT,
        config_path=tmp_path / "riskhub.env",
        secret_dir=tmp_path / "secrets",
        runtime_dir=tmp_path / "runtime",
        linux_root=tmp_path / "linux-root",
        linux_current_link=tmp_path / "linux-root" / "current",
        compose_script=REPO_ROOT / "scripts" / "compose.sh",
        dev_script=REPO_ROOT / "scripts" / "dev.sh",
        deploy_script=REPO_ROOT / "scripts" / "deploy.sh",
    )


def test_production_scaffold_missing_detects_required_config_and_secrets(tmp_path: Path) -> None:
    paths = _paths(tmp_path)

    assert production_scaffold_missing(paths.config_path, paths.secret_dir) is True

    paths.config_path.write_text("PUBLIC_URL=https://riskhub.example.com\n", encoding="utf-8")
    paths.secret_dir.mkdir(parents=True, exist_ok=True)
    (paths.secret_dir / "database_url").write_text("postgresql+asyncpg://riskhub:secret@db/riskhub\n", encoding="utf-8")
    (paths.secret_dir / "secret_key").write_text("0123456789abcdef0123456789abcdef\n", encoding="utf-8")
    assert production_scaffold_missing(paths.config_path, paths.secret_dir) is True

    (paths.secret_dir / "redis_password").write_text("redis-secret\n", encoding="utf-8")
    assert production_scaffold_missing(paths.config_path, paths.secret_dir) is False


def test_backup_non_secret_production_state_copies_known_runtime_files(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    runtime_dir = paths.runtime_dir
    runtime_dir.mkdir(parents=True, exist_ok=True)
    paths.config_path.write_text("PUBLIC_URL=https://riskhub.example.com\n", encoding="utf-8")
    (runtime_dir / "backend.env").write_text("backend=1\n", encoding="utf-8")
    (runtime_dir / "install-state.json").write_text('{"target":"docker"}\n', encoding="utf-8")

    backup_non_secret_production_state(paths.config_path, runtime_dir, "20260405T120000Z")

    backup_root = runtime_dir / "backups" / "20260405T120000Z"
    assert (backup_root / "config" / "riskhub.env").exists()
    assert (backup_root / "runtime" / "backend.env").exists()
    assert (backup_root / "runtime" / "install-state.json").exists()


def test_production_existing_install_detected_uses_runtime_metadata(monkeypatch, tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    paths.runtime_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr("install_lib.production_release.load_install_state", lambda *_args, **_kwargs: {"target": "docker"})

    assert production_existing_install_detected(
        paths.config_path,
        paths.secret_dir,
        paths.runtime_dir,
        paths,
    ) is True
