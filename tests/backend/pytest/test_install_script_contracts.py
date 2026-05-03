from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from install_lib.common import InstallPaths  # noqa: E402

INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install.sh"
COMPOSE_SCRIPT = REPO_ROOT / "scripts" / "compose.sh"
DEV_SCRIPT = REPO_ROOT / "scripts" / "dev.sh"
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy.sh"


def _run_install(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    effective_env = os.environ.copy()
    if env:
        effective_env.update(env)
    return subprocess.run(
        ["bash", str(INSTALL_SCRIPT), *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=effective_env,
    )


def _install_paths() -> InstallPaths:
    return InstallPaths(
        repo_root=REPO_ROOT,
        config_path=Path("/tmp/riskhub.env"),
        secret_dir=Path("/tmp/riskhub-secrets"),
        runtime_dir=Path("/tmp/riskhub-runtime"),
        linux_root=Path("/opt/riskhub"),
        linux_current_link=Path("/opt/riskhub/current"),
        compose_script=COMPOSE_SCRIPT,
        dev_script=DEV_SCRIPT,
        deploy_script=DEPLOY_SCRIPT,
    )


def test_install_lifecycle_builders_describe_reusable_command_plans() -> None:
    from install_lib.lifecycle import (
        build_doctor_diagnostic_plan,
        build_doctor_repair_plan,
        build_logs_command,
        build_status_diagnostic_plan,
        build_status_dry_run_commands,
    )

    paths = _install_paths()

    assert build_logs_command(paths=paths, mode="dev", resolved_target=None, tail="25", follow=False) == [
        "tail",
        "-n",
        "25",
        str(REPO_ROOT / ".dev-backend.log"),
        str(REPO_ROOT / ".dev-frontend.log"),
    ]
    assert build_status_dry_run_commands(paths=paths, mode="demo", resolved_target=None) == [
        ["docker", "inspect", "riskhub-db"],
        ["docker", "inspect", "riskhub-redis"],
        ["docker", "inspect", "riskhub-backend"],
        ["docker", "inspect", "riskhub-frontend"],
        ["curl", "-fsS", "http://localhost/login"],
        ["curl", "-fsS", "http://localhost/api/v1/auth/config"],
    ]

    repair_plan = build_doctor_repair_plan(paths=paths, mode="dev", resolved_target=None)

    assert repair_plan.actions == (
        f"{COMPOSE_SCRIPT} up --profile db-only",
        f"{DEV_SCRIPT} --daemon",
    )
    assert repair_plan.commands == (
        [COMPOSE_SCRIPT, "up", "--profile", "db-only"],
        [DEV_SCRIPT, "--daemon"],
    )

    status_plan = build_status_diagnostic_plan(paths=paths, mode="demo", resolved_target=None)
    assert status_plan.probe_commands == tuple(
        build_status_dry_run_commands(paths=paths, mode="demo", resolved_target=None)
    )

    doctor_plan = build_doctor_diagnostic_plan(
        paths=paths,
        mode="production",
        resolved_target="docker",
        config_path=Path("/tmp/riskhub.env"),
        secret_dir=Path("/tmp/riskhub-secrets"),
        repair=True,
        deep=True,
    )
    assert doctor_plan.payload_defaults == {
        "mode": "production",
        "target": "docker",
        "repair_requested": True,
        "repair_applied": False,
        "deep_check": "not_run",
    }
    assert doctor_plan.deep_check_commands == (
        [
            DEPLOY_SCRIPT,
            "smoke",
            "--target",
            "docker",
            "--config",
            "/tmp/riskhub.env",
            "--secret-dir",
            "/tmp/riskhub-secrets",
        ],
    )
    assert doctor_plan.repair_plan.actions == (f"{DEPLOY_SCRIPT} status --target docker",)


def _write_config(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "PUBLIC_URL=https://riskhub.example.com.internal",
                "ENTRA_TENANT_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "ENTRA_CLIENT_ID=11111111-2222-3333-4444-555555555555",
                "BOOTSTRAP_ADMIN_EMAIL=admin@riskhub.example.com",
                "BOOTSTRAP_CRO_EMAIL=cro@riskhub.example.com",
                "API_WORKERS=4",
                "FRONTEND_BIND_PORT=18080",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def _write_secrets(secret_dir: Path) -> None:
    secret_dir.mkdir(parents=True, exist_ok=True)
    for name, value in {
        "database_url": "postgresql+asyncpg://riskhub:secret@db.example.com:5432/riskhub\n",
        "secret_key": "0123456789abcdef0123456789abcdef\n",
        "redis_password": "redis-secret\n",
        "entra_client_secret": "entra-client-secret\n",
        "entra_client_certificate_private_key": "unused\n",
    }.items():
        (secret_dir / name).write_text(value, encoding="utf-8")


def _write_install_state(runtime_dir: Path, payload: dict[str, object]) -> None:
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / "install-state.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _make_fake_deploy_script(tmp: Path) -> Path:
    script_path = tmp / "fake-deploy.sh"
    script_path.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${RISKHUB_TEST_COMMAND_LOG:-}" ]]; then
  printf '%s\\n' "$0 $*" >> "${RISKHUB_TEST_COMMAND_LOG}"
fi
exit 0
""",
        encoding="utf-8",
    )
    script_path.chmod(0o755)
    return script_path


def _make_fake_bin(tmp: Path) -> Path:
    fake_bin = tmp / "bin"
    fake_bin.mkdir()

    docker_script = fake_bin / "docker"
    docker_script.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
subcmd="${1:-}"
shift || true
case "${subcmd}" in
  info|ps|restart)
    exit 0
    ;;
  inspect)
    if [[ "${1:-}" == "--format" ]]; then
      format="${2:-}"
      shift 2
      container="${1:-}"
      case "${container}" in
        riskhub-redis)
          if [[ "$format" == *".State.Running"* ]]; then
            printf 'true\\n'
          else
            printf '%s\\n' "${RISKHUB_TEST_REDIS_IMAGE:-ghcr.io/example/riskhub-redis:v1.2.3}"
          fi
          ;;
        riskhub-backend)
          if [[ "$format" == *".State.Running"* ]]; then
            printf 'true\\n'
          else
            printf '%s\\n' "${RISKHUB_TEST_BACKEND_IMAGE:-ghcr.io/example/riskhub-backend:v1.2.3}"
          fi
          ;;
        riskhub-backend-scheduler)
          if [[ "$format" == *".State.Running"* ]]; then
            printf 'true\\n'
          else
            printf '%s\\n' "${RISKHUB_TEST_BACKEND_IMAGE:-ghcr.io/example/riskhub-backend:v1.2.3}"
          fi
          ;;
        riskhub-frontend)
          if [[ "$format" == *".State.Running"* ]]; then
            printf 'true\\n'
          else
            printf '%s\\n' "${RISKHUB_TEST_FRONTEND_IMAGE:-ghcr.io/example/riskhub-frontend:v1.2.3}"
          fi
          ;;
        *)
          exit 1
          ;;
      esac
      exit 0
    fi
    case "${1:-}" in
      riskhub-redis|riskhub-backend|riskhub-backend-scheduler|riskhub-frontend) exit 0 ;;
      *) exit 1 ;;
    esac
    ;;
  *)
    exit 0
    ;;
esac
""",
        encoding="utf-8",
    )
    docker_script.chmod(0o755)

    return fake_bin


def test_install_help_lists_public_commands() -> None:
    result = _run_install("--help")
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "Usage: ./scripts/install.sh" in result.stdout
    assert "demo" in result.stdout
    assert "dev" in result.stdout
    assert "production" in result.stdout
    assert "upgrade" in result.stdout
    assert "verify" in result.stdout
    assert "status" in result.stdout
    assert "logs" in result.stdout
    assert "doctor" in result.stdout


def test_install_demo_dry_run_dispatches_to_compose_and_verification() -> None:
    result = _run_install("demo", "--dry-run", "--reset", "test")
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "scripts/compose.sh" in output
    assert "reset --dataset test --dry-run" in output
    assert "curl -fsS http://localhost/login" in output
    assert "curl -fsS http://localhost/api/v1/auth/config" in output
    assert "Mode: demo" in output


def test_install_dev_dry_run_dispatches_to_dev_and_verification() -> None:
    result = _run_install("dev", "--dry-run", "--backend")
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "scripts/dev.sh" in output
    assert "--backend" in output
    assert "curl -fsS http://localhost:5173/login" in output
    assert "curl -fsS http://localhost:8000/api/v1/readyz" in output
    assert "Mode: dev" in output


def test_install_production_docker_dry_run_dispatches_full_sequence() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-install-docker-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        _write_config(config_path)
        _write_secrets(secret_dir)

        result = _run_install(
            "production",
            "--dry-run",
            "--yes",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--version",
            "v1.2.3",
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert "scripts/deploy.sh" in output
        assert "preflight --target docker" in output
        assert "deploy --target docker" in output
        assert "--version v1.2.3" in output
        assert "status --target docker" in output
        assert "smoke --target docker" in output
        assert "Mode: production" in output


def test_install_production_linux_dry_run_dispatches_full_sequence() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-install-linux-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        _write_config(config_path)
        _write_secrets(secret_dir)

        result = _run_install(
            "production",
            "--dry-run",
            "--yes",
            "--target",
            "linux",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--bundle",
            "./riskhub-linux-v1.2.3.tar.gz",
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert "preflight --target linux" in output
        assert "deploy --target linux" in output
        assert "--bundle ./riskhub-linux-v1.2.3.tar.gz" in output
        assert "status --target linux" in output
        assert "smoke --target linux" in output


def test_install_production_dry_run_initializes_missing_scaffold_before_lifecycle() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-install-scaffold-") as td:
        tmp = Path(td)
        config_path = tmp / "missing.env"
        secret_dir = tmp / "missing-secrets"

        result = _run_install(
            "production",
            "--dry-run",
            "--yes",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--version",
            "v1.2.3",
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert "init --target docker --config" in output
        assert "preflight --target docker" not in output
        assert "deploy --target docker" not in output


def test_install_production_dry_run_initializes_missing_secret_scaffold_before_lifecycle() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-install-secret-scaffold-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        _write_config(config_path)
        secret_dir.mkdir(parents=True, exist_ok=True)

        result = _run_install(
            "production",
            "--dry-run",
            "--yes",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--version",
            "v1.2.3",
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert "secrets-init --target docker --secret-dir" in output
        assert "preflight --target docker" not in output
        assert "deploy --target docker" not in output


def test_install_verify_production_dry_run_is_non_mutating() -> None:
    result = _run_install(
        "verify",
        "--dry-run",
        "--mode",
        "production",
        "--target",
        "docker",
        "--config",
        "/tmp/riskhub.env",
        "--secret-dir",
        "/tmp/riskhub-secrets",
    )
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "status --target docker" in output
    assert "smoke --target docker --config /tmp/riskhub.env --secret-dir /tmp/riskhub-secrets --dry-run" in output
    assert "deploy --target docker" not in output


def test_install_status_dry_run_dispatches_by_mode() -> None:
    demo = _run_install("status", "--dry-run", "--mode", "demo")
    dev = _run_install("status", "--dry-run", "--mode", "dev")
    production = _run_install(
        "status",
        "--dry-run",
        "--mode",
        "production",
        "--target",
        "docker",
    )

    assert "docker inspect riskhub-db" in f"{demo.stdout}\n{demo.stderr}"
    assert "curl -fsS http://localhost/login" in f"{demo.stdout}\n{demo.stderr}"

    dev_output = f"{dev.stdout}\n{dev.stderr}"
    assert "lsof -nP -iTCP:8000 -sTCP:LISTEN" in dev_output
    assert "curl -fsS http://localhost:8000/api/v1/auth/config" in dev_output

    production_output = f"{production.stdout}\n{production.stderr}"
    assert "scripts/deploy.sh" in production_output
    assert "status --target docker" in production_output


def test_install_logs_dry_run_dispatches_by_mode() -> None:
    demo = _run_install("logs", "--dry-run", "--mode", "demo", "--tail", "50", "--follow")
    dev = _run_install("logs", "--dry-run", "--mode", "dev", "--tail", "25")
    production = _run_install(
        "logs",
        "--dry-run",
        "--mode",
        "production",
        "--target",
        "linux",
        "--tail",
        "10",
        "--follow",
    )

    assert "scripts/compose.sh" in f"{demo.stdout}\n{demo.stderr}"
    assert "logs --tail 50 --follow" in f"{demo.stdout}\n{demo.stderr}"

    dev_output = f"{dev.stdout}\n{dev.stderr}"
    assert ".dev-backend.log" in dev_output
    assert ".dev-frontend.log" in dev_output
    assert "tail -n 25" in dev_output

    production_output = f"{production.stdout}\n{production.stderr}"
    assert "scripts/deploy.sh" in production_output
    assert "logs --target linux --service all --tail 10 --follow" in production_output


def test_install_doctor_dry_run_is_non_mutating() -> None:
    result = _run_install("doctor", "--dry-run", "--mode", "production", "--target", "docker")
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "status --target docker" not in output
    assert "smoke --target docker" not in output
    assert "init --target docker" not in output


def test_install_doctor_repair_dry_run_prints_safe_fix_actions() -> None:
    result = _run_install("doctor", "--dry-run", "--mode", "dev", "--repair")
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "scripts/compose.sh" in output
    assert "up --profile db-only" in output
    assert "scripts/dev.sh" in output
    assert "--daemon" in output


def test_install_upgrade_docker_dry_run_dispatches_full_sequence() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-upgrade-docker-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        _write_install_state(
            runtime_dir,
            {
                "target": "docker",
                "config_path": str(config_path),
                "secret_dir": str(secret_dir),
                "runtime_dir": str(runtime_dir),
                "current_release_source": {"kind": "docker_version", "version": "v1.2.3"},
                "managed_resources": {"docker_containers": ["riskhub-backend"]},
                "public_url": "https://riskhub.example.com.internal",
                "last_successful_deploy_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_smoke_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_command": "production",
            },
        )

        env = {"RISKHUB_RUNTIME_DIR": str(runtime_dir)}
        result = _run_install(
            "upgrade",
            "--dry-run",
            "--yes",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--version",
            "v1.2.4",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert "scripts/deploy.sh" in output
        assert "preflight --target docker" in output
        assert "upgrade --target docker" in output
        assert "status --target docker" in output
        assert "smoke --target docker" in output


def test_install_upgrade_linux_dry_run_dispatches_full_sequence() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-upgrade-linux-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        _write_install_state(
            runtime_dir,
            {
                "target": "linux",
                "config_path": str(config_path),
                "secret_dir": str(secret_dir),
                "runtime_dir": str(runtime_dir),
                "current_release_source": {"kind": "linux_bundle", "version": "v1.2.3"},
                "managed_resources": {"linux_services": ["riskhub-backend"]},
                "public_url": "https://riskhub.example.com.internal",
                "last_successful_deploy_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_smoke_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_command": "production",
            },
        )

        env = {"RISKHUB_RUNTIME_DIR": str(runtime_dir)}
        result = _run_install(
            "upgrade",
            "--dry-run",
            "--yes",
            "--target",
            "linux",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--bundle",
            "./riskhub-linux-v1.2.4.tar.gz",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert "preflight --target linux" in output
        assert "upgrade --target linux" in output
        assert "--bundle ./riskhub-linux-v1.2.4.tar.gz" in output
        assert "status --target linux" in output
        assert "smoke --target linux" in output


def test_install_production_writes_install_state_after_successful_run() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-install-state-write-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        command_log = tmp / "commands.log"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_deploy = _make_fake_deploy_script(tmp)

        env = {
            "RISKHUB_RUNTIME_DIR": str(runtime_dir),
            "RISKHUB_INSTALL_DEPLOY_SCRIPT": str(fake_deploy),
            "RISKHUB_TEST_COMMAND_LOG": str(command_log),
        }
        result = _run_install(
            "production",
            "--yes",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--version",
            "v1.2.3",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        state_path = runtime_dir / "install-state.json"
        assert state_path.exists()
        payload = json.loads(state_path.read_text(encoding="utf-8"))
        assert payload["target"] == "docker"
        assert payload["config_path"] == str(config_path)
        assert payload["secret_dir"] == str(secret_dir)
        assert payload["runtime_dir"] == str(runtime_dir)
        assert payload["current_release_source"]["kind"] == "docker_version"
        assert payload["current_release_source"]["version"] == "v1.2.3"
        assert payload["last_successful_command"] == "production"
        assert payload["last_successful_deploy_timestamp"] is not None
        assert payload["last_successful_smoke_timestamp"] is not None
        command_text = command_log.read_text(encoding="utf-8")
        assert "preflight --target docker" in command_text
        assert "deploy --target docker" in command_text
        assert "status --target docker" in command_text
        assert "smoke --target docker" in command_text


def test_install_production_refuses_unresolved_secret_placeholders_before_deploy() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-install-placeholder-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        fake_deploy = _make_fake_deploy_script(tmp)
        _write_config(config_path)
        secret_dir.mkdir(parents=True, exist_ok=True)
        for name, value in {
            "database_url": "CHANGE_ME_DATABASE_URL\n",
            "secret_key": "CHANGE_ME_SECRET_KEY_AT_LEAST_32_CHARACTERS\n",
            "redis_password": "CHANGE_ME_REDIS_PASSWORD\n",
            "entra_client_secret": "CHANGE_ME_ENTRA_CLIENT_SECRET\n",
        }.items():
            (secret_dir / name).write_text(value, encoding="utf-8")

        env = {
            "EDITOR": "true",
            "RISKHUB_INSTALL_DEPLOY_SCRIPT": str(fake_deploy),
        }
        result = _run_install(
            "production",
            "--yes",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--version",
            "v1.2.3",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode != 0
        assert "still contains the placeholder value" in output


def test_install_upgrade_writes_non_secret_runtime_backup() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-upgrade-backup-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        command_log = tmp / "commands.log"
        fake_deploy = _make_fake_deploy_script(tmp)
        _write_config(config_path)
        _write_secrets(secret_dir)
        runtime_dir.mkdir(parents=True, exist_ok=True)
        (runtime_dir / "backend.env").write_text("backend=1\n", encoding="utf-8")
        (runtime_dir / "metadata.env").write_text("metadata=1\n", encoding="utf-8")
        _write_install_state(
            runtime_dir,
            {
                "target": "docker",
                "config_path": str(config_path),
                "secret_dir": str(secret_dir),
                "runtime_dir": str(runtime_dir),
                "current_release_source": {"kind": "docker_version", "version": "v1.2.3"},
                "managed_resources": {"docker_containers": ["riskhub-backend"]},
                "public_url": "https://riskhub.example.com.internal",
                "last_successful_deploy_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_smoke_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_command": "production",
            },
        )

        env = {
            "RISKHUB_RUNTIME_DIR": str(runtime_dir),
            "RISKHUB_INSTALL_DEPLOY_SCRIPT": str(fake_deploy),
            "RISKHUB_TEST_COMMAND_LOG": str(command_log),
        }
        result = _run_install(
            "upgrade",
            "--yes",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--version",
            "v1.2.4",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        backups = list((runtime_dir / "backups").glob("*"))
        assert backups
        latest_backup = sorted(backups)[-1]
        assert (latest_backup / "config" / config_path.name).exists()
        assert (latest_backup / "runtime" / "backend.env").exists()
        assert (latest_backup / "runtime" / "metadata.env").exists()
        assert (latest_backup / "runtime" / "install-state.json").exists()


def test_install_status_json_reconstructs_production_state_when_metadata_missing() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-status-reconstruct-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        fake_bin = _make_fake_bin(tmp)
        _write_config(config_path)
        _write_secrets(secret_dir)
        runtime_dir.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_install(
            "status",
            "--mode",
            "production",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--json",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        payload = json.loads(result.stdout)
        assert payload["metadata"]["present"] is False
        assert payload["current_release_source"]["kind"] == "docker_images"
        assert payload["current_release_source"]["backend_image"] == "ghcr.io/example/riskhub-backend:v1.2.3"


def test_install_status_json_flags_stale_production_metadata() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-status-stale-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        fake_bin = _make_fake_bin(tmp)
        _write_config(config_path)
        _write_secrets(secret_dir)
        _write_install_state(
            runtime_dir,
            {
                "target": "docker",
                "config_path": str(config_path),
                "secret_dir": str(secret_dir),
                "runtime_dir": str(runtime_dir),
                "current_release_source": {
                    "kind": "docker_images",
                    "backend_image": "ghcr.io/example/riskhub-backend:old",
                    "frontend_image": "ghcr.io/example/riskhub-frontend:old",
                    "redis_image": "ghcr.io/example/riskhub-redis:old",
                },
                "managed_resources": {"docker_containers": ["riskhub-backend"]},
                "public_url": "https://riskhub.example.com.internal",
                "last_successful_deploy_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_smoke_timestamp": "2026-04-04T10:00:00Z",
                "last_successful_command": "production",
            },
        )

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_install(
            "status",
            "--mode",
            "production",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--json",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        payload = json.loads(result.stdout)
        assert payload["metadata"]["present"] is True
        assert payload["metadata"]["stale"] is True
        assert "backend_image_mismatch" in payload["metadata"]["stale_reasons"]


def test_install_doctor_repair_reconstructs_missing_production_metadata() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-doctor-rebuild-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        fake_bin = _make_fake_bin(tmp)
        fake_deploy = _make_fake_deploy_script(tmp)
        _write_config(config_path)
        _write_secrets(secret_dir)
        runtime_dir.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)
        env["RISKHUB_INSTALL_DEPLOY_SCRIPT"] = str(fake_deploy)

        result = _run_install(
            "doctor",
            "--mode",
            "production",
            "--target",
            "docker",
            "--config",
            str(config_path),
            "--secret-dir",
            str(secret_dir),
            "--repair",
            "--json",
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        payload = json.loads(result.stdout)
        assert payload["repair_requested"] is True
        assert payload["repair_applied"] is True
        state_path = runtime_dir / "install-state.json"
        assert state_path.exists()
        state = json.loads(state_path.read_text(encoding="utf-8"))
        assert state["target"] == "docker"
        assert state["current_release_source"]["kind"] == "docker_images"
        assert state["last_successful_smoke_timestamp"] is not None


def test_manual_scripts_reference_install_wrapper_in_help_text() -> None:
    compose_text = COMPOSE_SCRIPT.read_text(encoding="utf-8")
    dev_text = DEV_SCRIPT.read_text(encoding="utf-8")
    deploy_text = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert "./scripts/install.sh demo" in compose_text
    assert "./scripts/install.sh dev" in dev_text
    assert "./scripts/install.sh production --target docker|linux" in deploy_text
