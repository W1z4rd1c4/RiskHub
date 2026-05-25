from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from install_lib.common import InstallPaths, production_public_url, run_capture, timestamp_utc


def install_state_path(paths: InstallPaths, runtime_dir: Path | None = None) -> Path:
    return (runtime_dir or paths.runtime_dir) / paths.install_state_basename


def load_install_state(paths: InstallPaths, runtime_dir: Path | None = None) -> dict | None:
    state_path = install_state_path(paths, runtime_dir)
    if not state_path.exists():
        return None
    return json.loads(state_path.read_text(encoding="utf-8"))


def write_install_state(paths: InstallPaths, payload: dict, runtime_dir: Path | None = None) -> None:
    state_path = install_state_path(paths, runtime_dir)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_production_install_state(
    paths: InstallPaths,
    *,
    target: str,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    last_command: str,
    deploy_timestamp: str | None,
    smoke_timestamp: str | None,
    release_source: dict | None,
    public_url: str | None,
) -> None:
    managed_resources = (
        {"docker_containers": ["riskhub-redis", "riskhub-backend", "riskhub-backend-scheduler", "riskhub-frontend"]}
        if target == "docker"
        else {"linux_services": ["riskhub-redis", "riskhub-backend", "riskhub-scheduler", "nginx"]}
    )
    payload = {
        "target": target,
        "config_path": str(config_path),
        "secret_dir": str(secret_dir),
        "runtime_dir": str(runtime_dir),
        "current_release_source": release_source,
        "managed_resources": managed_resources,
        "public_url": public_url or None,
        "last_successful_deploy_timestamp": deploy_timestamp,
        "last_successful_smoke_timestamp": smoke_timestamp,
        "last_successful_command": last_command,
    }
    write_install_state(paths, payload, runtime_dir)


def docker_container_state(name: str) -> str:
    result = run_capture(["docker", "inspect", "--format", "{{.State.Running}}", name])
    if result.returncode != 0:
        return "missing"
    value = result.stdout.strip().lower()
    if value == "true":
        return "running"
    if value == "false":
        return "stopped"
    return value or "unknown"


def docker_container_image(name: str) -> str | None:
    result = run_capture(["docker", "inspect", "--format", "{{.Config.Image}}", name])
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return value or None


def docker_live_release_source() -> dict:
    return {
        "kind": "docker_images",
        "backend_image": docker_container_image("riskhub-backend"),
        "frontend_image": docker_container_image("riskhub-frontend"),
        "redis_image": docker_container_image("riskhub-redis"),
    }


def linux_live_release_source(paths: InstallPaths) -> dict:
    current_link = paths.linux_current_link
    version = current_link.resolve().name if current_link.exists() else None
    return {
        "kind": "linux_release",
        "version": version,
        "current_path": str(current_link.resolve()) if current_link.exists() else None,
    }


def release_source_from_args(
    *,
    target: str,
    version: str | None,
    bundle: str | None,
    backend_image: str | None,
    backend_db_image: str | None,
    frontend_image: str | None,
    redis_image: str | None,
) -> dict:
    if target == "docker":
        if backend_image or backend_db_image or frontend_image or redis_image:
            return {
                "kind": "docker_images",
                "backend_image": backend_image,
                "backend_db_image": backend_db_image,
                "frontend_image": frontend_image,
                "redis_image": redis_image,
                "version": version,
            }
        if version:
            return {"kind": "docker_version", "version": version}
        return {
            "kind": "docker_images",
            "backend_image": backend_image,
            "backend_db_image": backend_db_image,
            "frontend_image": frontend_image,
            "redis_image": redis_image,
        }
    return {
        "kind": "linux_bundle",
        "bundle_path": bundle,
        "version": version,
    }


def resolve_production_target(paths: InstallPaths, requested_target: str | None, runtime_dir: Path) -> str:
    if requested_target:
        return requested_target
    state = load_install_state(paths, runtime_dir)
    if state and state.get("target") in {"docker", "linux"}:
        return str(state["target"])
    if docker_container_state("riskhub-backend") != "missing" or docker_container_state("riskhub-frontend") != "missing":
        return "docker"
    if paths.linux_current_link.exists():
        return "linux"
    raise RuntimeError("Production lifecycle command requires --target docker|linux when install state cannot infer the active target.")


def production_status_payload(
    paths: InstallPaths,
    *,
    target: str,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
) -> dict:
    metadata = load_install_state(paths, runtime_dir)
    current_release = docker_live_release_source() if target == "docker" else linux_live_release_source(paths)
    stale_reasons: list[str] = []

    if metadata:
        if metadata.get("target") != target:
            stale_reasons.append("target_mismatch")
        if metadata.get("config_path") != str(config_path):
            stale_reasons.append("config_path_mismatch")
        if metadata.get("secret_dir") != str(secret_dir):
            stale_reasons.append("secret_dir_mismatch")
        if metadata.get("runtime_dir") != str(runtime_dir):
            stale_reasons.append("runtime_dir_mismatch")

        meta_release = metadata.get("current_release_source") or {}
        if current_release:
            if meta_release.get("kind") == "docker_images":
                for key in ("backend_image", "frontend_image", "redis_image"):
                    live_value = current_release.get(key)
                    meta_value = meta_release.get(key)
                    if live_value and meta_value and live_value != meta_value:
                        stale_reasons.append(f"{key}_mismatch")
            elif meta_release.get("kind") == "docker_version":
                version = meta_release.get("version")
                if version:
                    for key in ("backend_image", "frontend_image", "redis_image"):
                        live_value = current_release.get(key)
                        if live_value and not str(live_value).endswith(f":{version}"):
                            stale_reasons.append(f"{key}_version_mismatch")
            elif meta_release.get("kind") in {"linux_bundle", "linux_release"}:
                live_version = current_release.get("version")
                meta_version = meta_release.get("version")
                if live_version and meta_version and live_version != meta_version:
                    stale_reasons.append("linux_release_version_mismatch")

    services = (
        {
            "redis": docker_container_state("riskhub-redis"),
            "backend": docker_container_state("riskhub-backend"),
            "scheduler": docker_container_state("riskhub-backend-scheduler"),
            "frontend": docker_container_state("riskhub-frontend"),
        }
        if target == "docker"
        else {
            "redis": _systemctl_state(paths.linux_redis_service),
            "backend": _systemctl_state(paths.linux_backend_service),
            "scheduler": _systemctl_state(paths.linux_scheduler_service),
            "nginx": _systemctl_state("nginx"),
        }
    )

    return {
        "mode": "production",
        "target": target,
        "installed": config_path.exists() or secret_dir.exists() or runtime_dir.exists(),
        "config_path": str(config_path),
        "secret_dir": str(secret_dir),
        "runtime_dir": str(runtime_dir),
        "public_url": production_public_url(config_path) or (metadata or {}).get("public_url"),
        "metadata": {
            "present": metadata is not None,
            "stale": bool(stale_reasons),
            "stale_reasons": stale_reasons,
            "path": str(install_state_path(paths, runtime_dir)),
        },
        "current_release_source": current_release or (metadata or {}).get("current_release_source"),
        "managed_resources": (metadata or {}).get("managed_resources"),
        "last_successful_deploy_timestamp": (metadata or {}).get("last_successful_deploy_timestamp"),
        "last_successful_smoke_timestamp": (metadata or {}).get("last_successful_smoke_timestamp"),
        "last_successful_command": (metadata or {}).get("last_successful_command"),
        "services": services,
    }


def rebuild_install_state_from_live(
    paths: InstallPaths,
    *,
    target: str,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
) -> None:
    state = load_install_state(paths, runtime_dir) or {}
    write_production_install_state(
        paths,
        target=target,
        config_path=config_path,
        secret_dir=secret_dir,
        runtime_dir=runtime_dir,
        last_command=str(state.get("last_successful_command") or "production"),
        deploy_timestamp=state.get("last_successful_deploy_timestamp"),
        smoke_timestamp=timestamp_utc(),
        release_source=docker_live_release_source() if target == "docker" else linux_live_release_source(paths),
        public_url=production_public_url(config_path),
    )


def _systemctl_state(service_name: str) -> str:
    if shutil.which("systemctl") is None:
        return "unavailable"
    result = run_capture(["systemctl", "is-active", service_name])
    return result.stdout.strip() or "unavailable"
