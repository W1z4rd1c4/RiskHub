"""Runtime path orchestration helpers for release parity audit."""

from __future__ import annotations

from typing import Any, Protocol

from release_parity_audit.cleanup import compose_down_command
from release_parity_audit.runtime_commands import (
    backend_db_runtime_prod_dry_run_command,
    backend_runtime_prod_dry_run_command,
    deploy_cli_prod_docker_dry_run_command,
    frontend_runtime_prod_dry_run_command,
)


class RuntimeAuditFacade(Protocol):
    run_id: str
    run_prod_readiness: bool
    baseline: dict[str, Any]
    fingerprints_dir: Any
    runtime_fingerprints: list[dict[str, Any]]
    ui_dir: Any

    def _append_ci_runtime_fingerprints(self) -> None: ...
    def _capture_backend_fingerprint(
        self, context_id: str, base_url: str
    ) -> dict[str, Any]: ...
    def _capture_screenshot(
        self, command_id: str, url: str, output_path: Any
    ) -> tuple[bool, str | None, dict[str, Any]]: ...
    def _compose_down(self, command_id: str, *, required: bool = False) -> Any: ...
    def _docker_container_state(self, names: list[str]) -> dict[str, Any]: ...
    def _ensure_startup_path_runtime_coverage(self) -> None: ...
    def _ingest_latest_existing_prod_readiness(self) -> None: ...
    def _ingest_prod_readiness_by_running_worktree(self) -> None: ...
    def _iso(self, ts: Any) -> str: ...
    def _launch_failure_fingerprint(
        self,
        startup_path_id: str,
        context_id: str,
        launch_result: Any,
        *,
        docker_containers: list[str] | None = None,
    ) -> dict[str, Any]: ...
    def _listener_source_identity(self, port: int) -> dict[str, Any]: ...
    def _prepare_deploy_cli_prod_layout(self) -> tuple[Any, Any, Any]: ...
    def _prepare_prod_env_files(
        self, *, secret_dir: Any, runtime_dir: Any
    ) -> tuple[Any, Any]: ...
    def _run(self, command_id: str, command: str, **kwargs: Any) -> Any: ...
    def _start_background_service(
        self, command_id: str, command: str, **kwargs: Any
    ) -> dict[str, Any]: ...
    def _stop_local_dev_processes(self) -> None: ...
    def _utc_now(self) -> Any: ...
    def _wait_http(
        self, url: str, timeout_sec: int = 90, expect_status: int | None = None
    ) -> bool: ...
    def _write_json(self, path: Any, payload: Any) -> None: ...


def _dry_run_fingerprint(
    audit: RuntimeAuditFacade, startup_path_id: str, context_id: str
) -> dict[str, Any]:
    return {
        "startup_path_id": startup_path_id,
        "context_id": context_id,
        "captured_at_utc": audit._iso(audit._utc_now()),
        "git_sha_expected": audit.baseline.get("git_sha"),
        "git_sha_observed_unavailable_reason": (
            "Dry-run evidence did not launch a runtime."
        ),
        "dry_run_only": True,
    }


def _command_fingerprint(
    audit: RuntimeAuditFacade,
    *,
    startup_path_id: str,
    context_id: str,
    command_result: Any,
    dry_run_only: bool = False,
) -> dict[str, Any]:
    fingerprint = {
        "startup_path_id": startup_path_id,
        "context_id": context_id,
        "captured_at_utc": audit._iso(audit._utc_now()),
        "git_sha_expected": audit.baseline.get("git_sha"),
        "git_sha_observed_unavailable_reason": (
            "Command evidence does not establish a persistent runtime identity."
        ),
        "command_rc": command_result.rc,
        "command_log": command_result.log_path,
    }
    if dry_run_only:
        fingerprint["dry_run_only"] = True
    return fingerprint


def _record_final_compose_cleanup(audit: RuntimeAuditFacade) -> None:
    result = audit._compose_down("cleanup_compose_down_final", required=True)
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="compose_cleanup_final",
            context_id="cleanup_compose_down_final",
            command_result=result,
        )
    )
    audit._write_json(
        audit.fingerprints_dir / "runtime.json", audit.runtime_fingerprints
    )


def _append_dev_full_runtime(audit: RuntimeAuditFacade) -> None:
    dev_full_result = audit._run(
        "path_dev_sh_full", "./scripts/dev.sh --daemon", timeout_sec=900
    )
    if dev_full_result.rc == 0:
        backend_ready = audit._wait_http(
            "http://localhost:8000/api/v1/readyz", timeout_sec=90
        )
        frontend_ready = audit._wait_http("http://localhost:5173/", timeout_sec=90)
        fingerprint = audit._capture_backend_fingerprint(
            "dev_sh_full", "http://localhost:8000"
        )
        shot_file = audit.ui_dir / "dev_sh_full_login.png"
        ok, shot_hash, ui_state = audit._capture_screenshot(
            "path_dev_sh_full_screenshot", "http://localhost:5173/login", shot_file
        )
        fingerprint["screenshot"] = str(shot_file) if ok else None
        fingerprint["screenshot_sha256"] = shot_hash
        fingerprint["ui_state"] = ui_state
        fingerprint["backend_ready"] = backend_ready
        fingerprint["frontend_ready"] = frontend_ready
        fingerprint["frontend_runtime_kind"] = "vite_dev"
        fingerprint["startup_path_id"] = "dev_sh_full"
        fingerprint.pop("git_sha_observed_unavailable_reason", None)
        fingerprint.update(audit._listener_source_identity(8000))
        audit.runtime_fingerprints.append(fingerprint)
    else:
        audit.runtime_fingerprints.append(
            audit._launch_failure_fingerprint(
                "dev_sh_full", "dev_sh_full", dev_full_result
            )
        )


def _append_compose_runtime(
    audit: RuntimeAuditFacade, docker_containers: list[str]
) -> None:
    compose_up_result = audit._run(
        "path_compose_sh_up_full", "./scripts/compose.sh up", timeout_sec=2400
    )
    if compose_up_result.rc == 0:
        backend_ready = audit._wait_http(
            "http://localhost:8000/api/v1/readyz", timeout_sec=90
        )
        frontend_ready = audit._wait_http("http://localhost/", timeout_sec=90)
        fingerprint = audit._capture_backend_fingerprint(
            "compose_sh_up_full", "http://localhost:8000"
        )
        shot_file = audit.ui_dir / "compose_sh_up_full_login.png"
        ok, shot_hash, ui_state = audit._capture_screenshot(
            "path_compose_sh_up_full_screenshot", "http://localhost/login", shot_file
        )
        fingerprint["screenshot"] = str(shot_file) if ok else None
        fingerprint["screenshot_sha256"] = shot_hash
        fingerprint["ui_state"] = ui_state
        fingerprint["backend_ready"] = backend_ready
        fingerprint["frontend_ready"] = frontend_ready
        fingerprint["frontend_runtime_kind"] = "container_prod_build"
        docker_state = audit._docker_container_state(docker_containers)
        fingerprint["docker_state"] = docker_state
        source_identities = {
            name: container["source_mount"]
            for name, container in docker_state.items()
            if isinstance(container, dict)
            and isinstance(container.get("source_mount"), dict)
        }
        fingerprint["source_identities"] = source_identities
        required_source_containers = (
            "riskhub-backend",
            "riskhub-backend-scheduler-dev",
        )
        required_source_shas = [
            source_identities.get(name, {}).get("git_sha_observed")
            for name in required_source_containers
        ]
        source_shas_agree = (
            all(isinstance(sha, str) and sha for sha in required_source_shas)
            and len(set(required_source_shas)) == 1
        )
        fingerprint.pop("git_sha_observed_unavailable_reason", None)
        if source_shas_agree:
            fingerprint["git_sha_observed"] = required_source_shas[0]
        else:
            fingerprint["git_sha_observed_unavailable_reason"] = (
                "Source-mounted container Git identity was unavailable or inconsistent."
            )
        fingerprint["startup_path_id"] = "compose_sh_up_full"
        audit.runtime_fingerprints.append(fingerprint)
    else:
        audit.runtime_fingerprints.append(
            audit._launch_failure_fingerprint(
                "compose_sh_up_full",
                "compose_sh_up_full",
                compose_up_result,
                docker_containers=docker_containers,
            )
        )


def _append_component_runtime_paths(audit: RuntimeAuditFacade) -> None:
    backend_dev_fp = audit._start_background_service(
        "path_backend_runtime_dev",
        "backend/scripts/runtime/dev.sh --port 8010 --no-reload",
        readiness_url="http://localhost:8010/api/v1/readyz",
        listener_port=8010,
        endpoint_base_url="http://localhost:8010",
    )
    backend_dev_fp["startup_path_id"] = "backend_runtime_dev"
    audit.runtime_fingerprints.append(backend_dev_fp)

    backend_test_fp = audit._start_background_service(
        "path_backend_runtime_test",
        "backend/scripts/runtime/test.sh --port 8011",
        readiness_url="http://localhost:8011/api/v1/readyz",
        listener_port=8011,
        endpoint_base_url="http://localhost:8011",
    )
    backend_test_fp["startup_path_id"] = "backend_runtime_test"
    audit.runtime_fingerprints.append(backend_test_fp)

    frontend_dev_fp = audit._start_background_service(
        "path_frontend_runtime_dev",
        "frontend/scripts/runtime/dev.sh -- --port 5174 --strictPort",
        readiness_url="http://localhost:5174",
        listener_port=5174,
        screenshot_url="http://localhost:5174/login",
        screenshot_file=audit.ui_dir / "frontend_runtime_dev_login.png",
    )
    frontend_dev_fp["startup_path_id"] = "frontend_runtime_dev"
    frontend_dev_fp["frontend_runtime_kind"] = "vite_dev_component"
    frontend_dev_fp["auth_mode_reference"] = audit._capture_backend_fingerprint(
        "frontend_runtime_dev_reference", "http://localhost:8000"
    ).get("auth_mode")
    audit.runtime_fingerprints.append(frontend_dev_fp)

    frontend_test_fp = audit._start_background_service(
        "path_frontend_runtime_test",
        "frontend/scripts/runtime/test.sh -- --port 5175 --strictPort",
        readiness_url="http://localhost:5175",
        listener_port=5175,
        screenshot_url="http://localhost:5175/login",
        screenshot_file=audit.ui_dir / "frontend_runtime_test_login.png",
    )
    frontend_test_fp["startup_path_id"] = "frontend_runtime_test"
    frontend_test_fp["frontend_runtime_kind"] = "vite_test_component"
    frontend_test_fp["auth_mode_reference"] = audit._capture_backend_fingerprint(
        "frontend_runtime_test_reference", "http://localhost:8000"
    ).get("auth_mode")
    audit.runtime_fingerprints.append(frontend_test_fp)


def _execute_dynamic_paths(audit: RuntimeAuditFacade) -> None:
    deploy_config, deploy_secret_dir, deploy_runtime_dir = (
        audit._prepare_deploy_cli_prod_layout()
    )
    backend_env, frontend_env = audit._prepare_prod_env_files(
        secret_dir=deploy_secret_dir, runtime_dir=deploy_runtime_dir
    )

    audit._stop_local_dev_processes()
    audit._compose_down("cleanup_compose_down_pre")

    _append_dev_full_runtime(audit)
    audit._stop_local_dev_processes()

    docker_containers = [
        "riskhub-db",
        "riskhub-redis",
        "riskhub-backend",
        "riskhub-backend-scheduler-dev",
        "riskhub-frontend",
    ]
    _append_compose_runtime(audit, docker_containers)

    audit._run(
        "path_compose_sh_reset_test_dryrun",
        "./scripts/compose.sh reset --dataset test --dry-run --no-build",
        required=False,
        timeout_sec=900,
    )
    audit.runtime_fingerprints.append(
        _dry_run_fingerprint(
            audit, "compose_sh_reset_test", "compose_sh_reset_test_dryrun"
        )
    )

    compose_boundary_command = compose_down_command(
        "cleanup_compose_down_before_prod_dryruns"
    )
    compose_boundary_result = audit._run(
        compose_boundary_command.command_id,
        compose_boundary_command.command,
        required=True,
        timeout_sec=240,
    )
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="compose_to_prod_lifecycle_boundary",
            context_id="cleanup_compose_down_before_prod_dryruns",
            command_result=compose_boundary_result,
        )
    )
    if compose_boundary_result.rc != 0:
        audit._ensure_startup_path_runtime_coverage()
        audit._write_json(
            audit.fingerprints_dir / "runtime.json", audit.runtime_fingerprints
        )
        _record_final_compose_cleanup(audit)
        audit._stop_local_dev_processes()
        return

    prod_deploy_cmd = deploy_cli_prod_docker_dry_run_command(
        runtime_dir=deploy_runtime_dir,
        config=deploy_config,
        secret_dir=deploy_secret_dir,
    )
    prod_deploy_result = audit._run(
        "path_deploy_cli_prod_docker_dryrun",
        prod_deploy_cmd,
        required=True,
        timeout_sec=1200,
    )
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="deploy_cli_prod_docker",
            context_id="deploy_cli_prod_docker_dryrun",
            command_result=prod_deploy_result,
            dry_run_only=True,
        )
    )

    db_test_result = audit._run(
        "path_backend_db_runtime_test_dryrun",
        "backend/scripts/runtime/db/test.sh --yes --dry-run",
        required=False,
        timeout_sec=240,
    )
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="backend_db_runtime_test",
            context_id="path_backend_db_runtime_test_dryrun",
            command_result=db_test_result,
            dry_run_only=True,
        )
    )
    db_prod_result = audit._run(
        "path_backend_db_runtime_prod_dryrun",
        backend_db_runtime_prod_dry_run_command(
            backend_env=backend_env,
            run_id=audit.run_id,
            secret_dir=deploy_secret_dir,
            runtime_dir=deploy_runtime_dir,
        ),
        required=True,
        timeout_sec=1200,
    )
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="backend_db_runtime_prod",
            context_id="path_backend_db_runtime_prod_dryrun",
            command_result=db_prod_result,
            dry_run_only=True,
        )
    )

    backend_prod_result = audit._run(
        "path_backend_runtime_prod_dryrun",
        backend_runtime_prod_dry_run_command(
            backend_env=backend_env,
            run_id=audit.run_id,
            secret_dir=deploy_secret_dir,
            runtime_dir=deploy_runtime_dir,
        ),
        required=True,
        timeout_sec=1800,
    )
    frontend_prod_result = audit._run(
        "path_frontend_runtime_prod_dryrun",
        frontend_runtime_prod_dry_run_command(
            frontend_env=frontend_env,
            run_id=audit.run_id,
            secret_dir=deploy_secret_dir,
            runtime_dir=deploy_runtime_dir,
        ),
        required=True,
        timeout_sec=1800,
    )
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="backend_runtime_prod",
            context_id="backend_runtime_prod_dryrun",
            command_result=backend_prod_result,
            dry_run_only=True,
        )
    )
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="frontend_runtime_prod",
            context_id="frontend_runtime_prod_dryrun",
            command_result=frontend_prod_result,
            dry_run_only=True,
        )
    )

    db_dev_result = audit._run(
        "path_backend_db_runtime_dev",
        "backend/scripts/runtime/db/dev.sh",
        required=False,
        timeout_sec=240,
    )
    audit.runtime_fingerprints.append(
        _command_fingerprint(
            audit,
            startup_path_id="backend_db_runtime_dev",
            context_id="path_backend_db_runtime_dev",
            command_result=db_dev_result,
        )
    )

    _append_component_runtime_paths(audit)

    audit._run(
        "path_prod_verify_runtime",
        "./scripts/prod/verify_runtime.sh",
        required=False,
        timeout_sec=180,
    )

    if audit.run_prod_readiness:
        audit._ingest_prod_readiness_by_running_worktree()
    else:
        audit._ingest_latest_existing_prod_readiness()

    audit._append_ci_runtime_fingerprints()
    audit._ensure_startup_path_runtime_coverage()
    audit._write_json(
        audit.fingerprints_dir / "runtime.json", audit.runtime_fingerprints
    )

    _record_final_compose_cleanup(audit)
    audit._stop_local_dev_processes()


def _cleanup_dynamic_paths_after_failure(audit: RuntimeAuditFacade) -> None:
    try:
        audit._compose_down("cleanup_compose_down_final")
    except BaseException:
        pass
    try:
        audit._stop_local_dev_processes()
    except BaseException:
        pass


def run_dynamic_paths(audit: RuntimeAuditFacade) -> None:
    try:
        _execute_dynamic_paths(audit)
    except BaseException:
        _cleanup_dynamic_paths_after_failure(audit)
        raise
