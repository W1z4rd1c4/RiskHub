from __future__ import annotations

import shutil
from pathlib import Path

from install_lib.common import (
    InstallPaths,
    SharedOptions,
    bundle_version_guess,
    prompt_value,
)
from install_lib.runtime_state import load_install_state


def ensure_production_release_input(
    *,
    target: str,
    version: str | None,
    bundle: str | None,
    backend_image: str | None,
    backend_db_image: str | None,
    frontend_image: str | None,
    redis_image: str | None,
    options: SharedOptions,
) -> tuple[str | None, str | None]:
    if target == "docker":
        if version:
            return version, bundle
        if backend_image and backend_db_image and frontend_image and redis_image:
            return version, bundle
        if options.dry_run or options.yes:
            raise RuntimeError("Production docker install requires --version or all image refs.")
        return prompt_value("Docker release version", "v1.2.3", options=options), bundle

    if bundle:
        return version, bundle
    if options.dry_run or options.yes:
        raise RuntimeError("Production linux install requires --bundle PATH.")
    return version, prompt_value("Linux release bundle path", "./riskhub-linux-v1.2.3.tar.gz", options=options)


def backup_non_secret_production_state(config_path: Path, runtime_dir: Path, backup_id: str) -> None:
    backup_root = runtime_dir / "backups" / backup_id
    (backup_root / "config").mkdir(parents=True, exist_ok=True)
    (backup_root / "runtime").mkdir(parents=True, exist_ok=True)
    shutil.copy2(config_path, backup_root / "config" / config_path.name)
    for runtime_name in ("backend.env", "frontend.env", "metadata.env", "install-state.json"):
        runtime_file = runtime_dir / runtime_name
        if runtime_file.exists():
            shutil.copy2(runtime_file, backup_root / "runtime" / runtime_name)


def production_existing_install_detected(
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    paths: InstallPaths,
) -> bool:
    return (
        (config_path.exists() and secret_dir.exists() and runtime_dir.exists())
        or load_install_state(paths, runtime_dir) is not None
    )
