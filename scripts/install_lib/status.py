from __future__ import annotations

import json
from pathlib import Path

from install_lib.common import (
    InstallPaths,
    SharedOptions,
    command_exists,
    curl_ok,
    port_listening,
    run_capture,
    run_command,
)
from install_lib.lifecycle import build_status_dry_run_commands
from install_lib.runtime_state import docker_container_state, production_status_payload, resolve_production_target


def resolved_dev_node_status() -> dict:
    if not command_exists("node"):
        return {"present": False, "major": None, "required_major": 24, "valid": False}
    result = run_capture(["node", "-p", "process.versions.node.split('.')[0]"])
    major = int(result.stdout.strip()) if result.returncode == 0 and result.stdout.strip().isdigit() else None
    return {"present": major is not None, "major": major, "required_major": 24, "valid": major == 24}


def demo_status_payload() -> dict:
    return {
        "mode": "demo",
        "docker_ready": command_exists("docker"),
        "containers": {
            "db": docker_container_state("riskhub-db"),
            "redis": docker_container_state("riskhub-redis"),
            "backend": docker_container_state("riskhub-backend"),
            "frontend": docker_container_state("riskhub-frontend"),
        },
        "http": {
            "login": curl_ok("http://localhost/login"),
            "auth_config": curl_ok("http://localhost/api/v1/auth/config"),
        },
    }


def dev_status_payload(paths: InstallPaths) -> dict:
    readiness_ok = curl_ok("http://localhost:8000/api/v1/readyz")
    return {
        "mode": "dev",
        "docker": {
            "db": docker_container_state("riskhub-db"),
            "redis": docker_container_state("riskhub-redis"),
        },
        "listeners": {
            "backend_8000": port_listening(8000),
            "frontend_5173": port_listening(5173),
        },
        "http": {
            "login": curl_ok("http://localhost:5173/login"),
            "health": readiness_ok,
            "readyz": readiness_ok,
            "auth_config": curl_ok("http://localhost:8000/api/v1/auth/config"),
        },
        "dependencies": {
            "backend_venv": (paths.repo_root / "backend" / "venv").is_dir(),
            "frontend_node_modules": (paths.repo_root / "frontend" / "node_modules").is_dir(),
        },
        "node": resolved_dev_node_status(),
    }


def print_status_human(payload: dict) -> None:
    print("\n=== RiskHub Status ===")
    print(f"Mode: {payload['mode']}")
    if payload["mode"] == "production":
        print(f"Target: {payload['target']}")
        print(f"Public URL: {payload.get('public_url') or 'unknown'}")
    if payload["mode"] == "demo":
        print(f"Docker ready: {'yes' if payload['docker_ready'] else 'no'}")


def run_status(
    mode: str,
    *,
    target: str | None,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    json_output: bool,
    options: SharedOptions,
    paths: InstallPaths,
) -> None:
    if options.dry_run:
        resolved_target = None
        if mode not in {"demo", "dev"}:
            resolved_target = resolve_production_target(paths, target, runtime_dir)
        for command in build_status_dry_run_commands(paths=paths, mode=mode, resolved_target=resolved_target):
            run_command(command, options=options)
        return

    if mode == "demo":
        payload = demo_status_payload()
    elif mode == "dev":
        payload = dev_status_payload(paths)
    else:
        resolved_target = resolve_production_target(paths, target, runtime_dir)
        payload = production_status_payload(
            paths,
            target=resolved_target,
            config_path=config_path,
            secret_dir=secret_dir,
            runtime_dir=runtime_dir,
        )

    if json_output:
        print(json.dumps(payload, sort_keys=True))
    else:
        print_status_human(payload)
