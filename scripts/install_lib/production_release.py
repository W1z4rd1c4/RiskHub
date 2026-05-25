from __future__ import annotations

import re
import shutil
from pathlib import Path

from install_lib.common import (
    InstallPaths,
    SharedOptions,
    bundle_version_guess,
    prompt_value,
)
from install_lib.runtime_state import load_install_state

IMAGE_DIGEST_RE = re.compile(r"@sha256:[0-9a-fA-F]{64}$")
METADATA_ENV_BACKUP_ALLOWLIST = {
    "TARGET",
    "PUBLIC_URL",
    "SERVER_NAME",
    "CORS_ORIGINS_JSON",
    "ALLOWED_HOSTS_JSON",
    "TRUSTED_PROXIES_JSON",
    "SECRET_DIR",
    "RUNTIME_DIR",
    "REDIS_URL_FILE",
    "REDIS_PASSWORD_FILE",
    "ENTRA_GRAPH_CREDENTIAL_MODE",
    "API_WORKERS",
    "FRONTEND_BIND_PORT",
    "BACKEND_BIND_HOST",
    "BACKEND_BIND_PORT",
    "SCHEDULER_BIND_HOST",
    "SCHEDULER_BIND_PORT",
    "SCHEDULER_ENABLED",
    "SCHEDULER_WORKERS",
    "DOCKER_NETWORK_SUBNET",
}


def image_ref_is_immutable(image_ref: str | None) -> bool:
    return bool(image_ref and IMAGE_DIGEST_RE.search(image_ref))


def all_image_refs_are_immutable(*image_refs: str | None) -> bool:
    return all(image_ref_is_immutable(image_ref) for image_ref in image_refs)


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
        has_all_images = bool(backend_image and backend_db_image and frontend_image and redis_image)
        if has_all_images and not all_image_refs_are_immutable(
            backend_image,
            backend_db_image,
            frontend_image,
            redis_image,
        ):
            raise RuntimeError("Production docker image refs must be immutable image refs with @sha256:<64 hex>.")
        if version and not has_all_images:
            raise RuntimeError(
                "Production docker --version requires immutable image digests from a digest manifest; "
                "pass all four explicit digest image refs for now."
            )
        if version:
            return version, bundle
        if has_all_images:
            return version, bundle
        raise RuntimeError("Production docker install requires all image refs as immutable digest refs.")

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
            destination = backup_root / "runtime" / runtime_name
            if runtime_name == "metadata.env":
                _write_sanitized_metadata_backup(runtime_file, destination)
            else:
                shutil.copy2(runtime_file, destination)


def _write_sanitized_metadata_backup(source: Path, destination: Path) -> None:
    sanitized_lines: list[str] = []
    for raw_line in source.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#") or "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        if key.strip() in METADATA_ENV_BACKUP_ALLOWLIST:
            sanitized_lines.append(f"{key.strip()}={value}")
    destination.write_text("\n".join(sanitized_lines) + ("\n" if sanitized_lines else ""), encoding="utf-8")


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
