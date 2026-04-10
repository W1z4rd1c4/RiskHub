from __future__ import annotations

import json
from pathlib import Path

from install_lib.common import InstallPaths, SharedOptions, command_exists, curl_ok, port_listening, production_public_url, run_command
from install_lib.production import summary_demo, summary_dev, summary_production_lifecycle, verify_demo, verify_dev
from install_lib.runtime_state import (
    docker_container_state,
    load_install_state,
    production_status_payload,
    rebuild_install_state_from_live,
    resolve_production_target,
)


def _write_secret_placeholder(secret_path: Path) -> None:
    placeholders = {
        "database_url": "postgresql+asyncpg://riskhub:replace-me@db.example.com:5432/riskhub\n",
        "secret_key": "replace-with-32-char-secret-key\n",
        "redis_password": "replace-with-redis-password\n",
    }
    secret_path.write_text(placeholders.get(secret_path.name, "replace-me\n"), encoding="utf-8")


def run_doctor(
    *,
    mode: str,
    target: str | None,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    json_output: bool,
    repair: bool,
    deep: bool,
    options: SharedOptions,
    paths: InstallPaths,
) -> None:
    findings: list[str] = []
    actions: list[str] = []
    repair_applied = False
    deep_check = "not_run"

    payload: dict

    if mode == "demo":
        if not command_exists("docker"):
            findings.append("docker_daemon_unavailable")
        for name, key in (
            ("riskhub-db", "db_container_not_running"),
            ("riskhub-redis", "redis_container_not_running"),
            ("riskhub-backend", "backend_container_not_running"),
            ("riskhub-frontend", "frontend_container_not_running"),
        ):
            if docker_container_state(name) != "running":
                findings.append(key)
        if not curl_ok("http://localhost/login"):
            findings.append("login_page_unreachable")
        if not curl_ok("http://localhost/api/v1/auth/config"):
            findings.append("auth_config_unreachable")

        if deep:
            if options.dry_run:
                run_command(["curl", "-fsS", "http://localhost/login"], options=options)
                run_command(["curl", "-fsS", "http://localhost/api/v1/auth/config"], options=options)
                deep_check = "dry_run"
            else:
                try:
                    verify_demo(options)
                    deep_check = "pass"
                except Exception:
                    deep_check = "fail"
                    findings.append("deep_verify_failed")

        if repair:
            actions.append(f"{paths.compose_script} up")
            run_command([paths.compose_script, "up"], options=options)
            if not options.dry_run:
                repair_applied = True
                verify_demo(options)

        payload = {
            "mode": "demo",
            "repair_requested": repair,
            "repair_applied": repair_applied,
            "deep_check": deep_check,
            "findings": findings,
            "actions": actions,
        }
    elif mode == "dev":
        if docker_container_state("riskhub-db") != "running":
            findings.append("db_container_not_running")
        if docker_container_state("riskhub-redis") != "running":
            findings.append("redis_container_not_running")
        if not port_listening(8000):
            findings.append("backend_listener_missing")
        if not port_listening(5173):
            findings.append("frontend_listener_missing")
        if not (paths.repo_root / "backend" / "venv").is_dir():
            findings.append("backend_venv_missing")
        if not (paths.repo_root / "frontend" / "node_modules").is_dir():
            findings.append("frontend_node_modules_missing")
        if not command_exists("node"):
            findings.append("node_major_invalid")
        if not curl_ok("http://localhost:8000/api/v1/auth/config"):
            findings.append("auth_config_unreachable")

        if deep:
            if options.dry_run:
                for command in (
                    ["curl", "-fsS", "http://localhost:5173/login"],
                    ["curl", "-fsS", "http://localhost:8000/api/v1/readyz"],
                    ["curl", "-fsS", "http://localhost:8000/api/v1/auth/config"],
                ):
                    run_command(command, options=options)
                deep_check = "dry_run"
            else:
                try:
                    verify_dev(options)
                    deep_check = "pass"
                except Exception:
                    deep_check = "fail"
                    findings.append("deep_verify_failed")

        if repair:
            actions.append(f"{paths.compose_script} up --profile db-only")
            actions.append(f"{paths.dev_script} --daemon")
            run_command([paths.compose_script, "up", "--profile", "db-only"], options=options)
            run_command([paths.dev_script, "--daemon"], options=options)
            if not options.dry_run:
                repair_applied = True
                verify_dev(options)

        payload = {
            "mode": "dev",
            "repair_requested": repair,
            "repair_applied": repair_applied,
            "deep_check": deep_check,
            "findings": findings,
            "actions": actions,
        }
    else:
        resolved_target = resolve_production_target(paths, target, runtime_dir)
        state_payload = production_status_payload(
            paths,
            target=resolved_target,
            config_path=config_path,
            secret_dir=secret_dir,
            runtime_dir=runtime_dir,
        )
        if not state_payload["metadata"]["present"]:
            findings.append("install_state_missing")
        if state_payload["metadata"]["stale"]:
            findings.append("install_state_stale")
        if not config_path.exists():
            findings.append("config_missing")
        if not secret_dir.exists():
            findings.append("secret_dir_missing")
        if not runtime_dir.exists():
            findings.append("runtime_dir_missing")
        for secret_name in ("database_url", "secret_key", "redis_password"):
            secret_path = secret_dir / secret_name
            if not secret_path.exists() or not secret_path.read_text(encoding="utf-8").strip():
                findings.append(f"{secret_name}_missing")

        if resolved_target == "docker":
            for container_name, finding_name in (
                ("riskhub-redis", "redis_not_running"),
                ("riskhub-backend", "backend_not_running"),
                ("riskhub-backend-scheduler", "scheduler_not_running"),
                ("riskhub-frontend", "frontend_not_running"),
            ):
                if docker_container_state(container_name) != "running":
                    findings.append(finding_name)

        if deep:
            smoke_command = [
                paths.deploy_script,
                "smoke",
                "--target",
                resolved_target,
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
            ]
            if options.dry_run:
                run_command(smoke_command, options=options)
                deep_check = "dry_run"
            else:
                try:
                    run_command(smoke_command, options=options)
                    deep_check = "pass"
                except Exception:
                    deep_check = "fail"
                    findings.append("smoke_check_failed")

        if repair:
            if not config_path.exists():
                actions.append(f"{paths.deploy_script} init --target {resolved_target} --config {config_path} --secret-dir {secret_dir}")
                run_command([paths.deploy_script, "init", "--target", resolved_target, "--config", str(config_path), "--secret-dir", str(secret_dir)], options=options)
            actions.append(f"ensure runtime/scaffold directories at {secret_dir} and {runtime_dir}")
            if not options.dry_run:
                secret_dir.mkdir(parents=True, exist_ok=True)
                runtime_dir.mkdir(parents=True, exist_ok=True)
            else:
                run_command(["mkdir", "-p", str(secret_dir)], options=options)
                run_command(["mkdir", "-p", str(runtime_dir)], options=options)

            for secret_name in ("database_url", "secret_key", "redis_password"):
                secret_path = secret_dir / secret_name
                if not secret_path.exists():
                    actions.append(f"create missing secret scaffold: {secret_name}")
                    if options.dry_run:
                        run_command(["touch", str(secret_path)], options=options)
                    else:
                        secret_dir.mkdir(parents=True, exist_ok=True)
                        _write_secret_placeholder(secret_path)

            if resolved_target == "docker":
                actions.append("restart docker managed resources")
                for container_name in ("riskhub-redis", "riskhub-backend", "riskhub-backend-scheduler", "riskhub-frontend"):
                    if docker_container_state(container_name) != "missing":
                        run_command(["docker", "restart", container_name], options=options)

            actions.append(f"{paths.deploy_script} status --target {resolved_target}")
            actions.append(f"{paths.deploy_script} smoke --target {resolved_target} --config {config_path} --secret-dir {secret_dir}")
            run_command([paths.deploy_script, "status", "--target", resolved_target], options=options)
            run_command([paths.deploy_script, "smoke", "--target", resolved_target, "--config", str(config_path), "--secret-dir", str(secret_dir)], options=options)
            if not options.dry_run:
                rebuild_install_state_from_live(
                    paths,
                    target=resolved_target,
                    config_path=config_path,
                    secret_dir=secret_dir,
                    runtime_dir=runtime_dir,
                )
                repair_applied = True

        payload = {
            "mode": "production",
            "target": resolved_target,
            "repair_requested": repair,
            "repair_applied": repair_applied,
            "deep_check": deep_check,
            "findings": findings,
            "actions": actions,
        }

    if json_output:
        print(json.dumps(payload, sort_keys=True))
        return

    print("\n=== RiskHub Doctor ===")
    print(f"Mode: {payload['mode']}")
    if payload.get("target"):
        print(f"Target: {payload['target']}")
    print(f"Repair requested: {'yes' if payload.get('repair_requested') else 'no'}")
    print(f"Repair applied: {'yes' if payload.get('repair_applied') else 'no'}")
    if payload.get("findings"):
        print("Findings:")
        for finding in payload["findings"]:
            print(f"  - {finding}")
    if repair_applied:
        if mode == "demo":
            summary_demo()
        elif mode == "dev":
            summary_dev()
        else:
            summary_production_lifecycle("doctor", payload["target"], config_path, secret_dir)
