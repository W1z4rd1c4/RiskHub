"""Runtime contracts for the unified deployment CLI."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy.sh"
DIGEST = "a" * 64


def _write_config(path: Path, **overrides: str) -> None:
    values = {
        "PUBLIC_URL": "https://riskhub.example.com",
        "ENTRA_TENANT_ID": "00000000-0000-0000-0000-000000000000",
        "ENTRA_CLIENT_ID": "11111111-1111-1111-1111-111111111111",
        "BOOTSTRAP_ADMIN_EMAIL": "admin@example.com",
        "BOOTSTRAP_CRO_EMAIL": "cro@example.com",
        "API_WORKERS": "4",
        "FRONTEND_BIND_PORT": "18081",
    }
    values.update(overrides)
    path.write_text(
        "\n".join(f"{key}={value}" for key, value in values.items()) + "\n",
        encoding="utf-8",
    )


def _write_secrets(path: Path, **overrides: str) -> None:
    values = {
        "database_url": "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub\n",
        "secret_key": "0123456789abcdef0123456789abcdef\n",
        "redis_password": "redis-secret\n",
        "entra_client_secret": "entra-client-secret\n",
    }
    values.update(overrides)
    path.mkdir(parents=True, exist_ok=True)
    path.chmod(0o750)
    for key, value in values.items():
        secret_path = path / key
        secret_path.write_text(value, encoding="utf-8")
        secret_path.chmod(0o440)


def _write_secret_value(secret_dir: Path, name: str, value: str) -> None:
    secret_path = secret_dir / name
    if secret_path.exists():
        secret_path.chmod(0o640)
    secret_path.write_text(value, encoding="utf-8")
    secret_path.chmod(0o440)


def _write_exec(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def _make_fake_bin(root: Path) -> Path:
    fake_bin = root / "bin"
    fake_bin.mkdir()
    real_python3 = shutil.which("python3")
    real_python313 = shutil.which("python3.13") or real_python3
    assert real_python3 is not None
    assert real_python313 is not None

    _write_exec(
        fake_bin / "python3",
        f"""#!/usr/bin/env bash
set -euo pipefail
exec {real_python3!s} "$@"
""",
    )
    _write_exec(
        fake_bin / "python3.13",
        f"""#!/usr/bin/env bash
set -euo pipefail
exec {real_python313!s} "$@"
""",
    )
    _write_exec(
        fake_bin / "docker",
        """#!/usr/bin/env bash
set -euo pipefail
subcmd="${1:-}"
shift || true
if [[ -n "${DOCKER_COMMAND_LOG:-}" ]]; then
  printf '%s\n' "${subcmd} $*" >> "$DOCKER_COMMAND_LOG"
fi
if [[ "$subcmd" == "ps" && -n "${DOCKER_FAIL_PS_NTH:-}" ]]; then
  count=0
  if [[ -f "$DOCKER_PS_COUNT_FILE" ]]; then
    count="$(cat "$DOCKER_PS_COUNT_FILE")"
  fi
  count=$((count + 1))
  printf '%s\n' "$count" > "$DOCKER_PS_COUNT_FILE"
  if [[ "$count" == "$DOCKER_FAIL_PS_NTH" ]]; then
    exit "${DOCKER_FAIL_RC:-37}"
  fi
fi
if [[ -n "${DOCKER_FAIL_MATCH:-}" && "${subcmd} $*" == *"$DOCKER_FAIL_MATCH"* ]]; then
  exit "${DOCKER_FAIL_RC:-37}"
fi
if [[ "${DOCKER_FAIL_BOOTSTRAP:-0}" == "1" && " $* " == *" scripts.bootstrap_sso_user "* ]]; then
  exit 37
fi
container_is_fake_created() {
  [[ -n "${DOCKER_STATE_FILE:-}" && -f "$DOCKER_STATE_FILE" ]] && grep -Fxq "$1" "$DOCKER_STATE_FILE"
}
case "${subcmd}" in
  ps)
    exit 0
    ;;
  network)
    action="${1:-}"
    shift || true
    case "${action}" in
      inspect)
        name="${1:-}"
        [[ "${DOCKER_NETWORK_EXISTS:-0}" == "1" ]] || exit 1
        shift || true
        if [[ "${1:-}" == "--format" ]]; then
          printf '%s\n' "${DOCKER_NETWORK_SUBNET:-172.31.255.0/24}"
        else
          printf '[]\n'
        fi
        exit 0
        ;;
      create)
        exit 0
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
  pull)
    exit 0
    ;;
  inspect)
    if [[ "${1:-}" == "--format" ]]; then
      shift 2
      container="${1:-}"
      case "${container}" in
        riskhub-backend)
          [[ "${DOCKER_BACKEND_EXISTS:-0}" == "1" ]] || exit 1
          printf '%s\n' "${DOCKER_BACKEND_IMAGE:-ghcr.io/example/riskhub-backend:previous}"
          ;;
        riskhub-frontend)
          [[ "${DOCKER_FRONTEND_EXISTS:-0}" == "1" ]] || exit 1
          printf '%s\n' "${DOCKER_FRONTEND_IMAGE:-ghcr.io/example/riskhub-frontend:previous}"
          ;;
        riskhub-backend-scheduler)
          [[ "${DOCKER_SCHEDULER_EXISTS:-0}" == "1" ]] || exit 1
          printf '%s\n' "${DOCKER_SCHEDULER_IMAGE:-ghcr.io/example/riskhub-backend:previous}"
          ;;
        *)
          exit 1
          ;;
      esac
      exit 0
    fi
    container="${1:-}"
    case "${container}" in
      riskhub-backend) [[ "${DOCKER_BACKEND_EXISTS:-0}" == "1" ]] || container_is_fake_created "$container" ;;
      riskhub-frontend) [[ "${DOCKER_FRONTEND_EXISTS:-0}" == "1" ]] || container_is_fake_created "$container" ;;
      riskhub-backend-scheduler) [[ "${DOCKER_SCHEDULER_EXISTS:-0}" == "1" ]] || container_is_fake_created "$container" ;;
      *) exit 1 ;;
    esac
    ;;
  run)
    previous=""
    for arg in "$@"; do
      if [[ "$previous" == "--name" && -n "${DOCKER_STATE_FILE:-}" ]]; then
        printf '%s\n' "$arg" >> "$DOCKER_STATE_FILE"
        break
      fi
      previous="$arg"
    done
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
""",
    )
    for command in (
        "systemctl",
        "nginx",
        "curl",
        "redis-server",
        "tar",
        "sudo",
        "ss",
        "id",
        "groupadd",
        "useradd",
        "sleep",
    ):
        if command == "sudo":
            script = """#!/usr/bin/env bash
set -euo pipefail
exec "$@"
"""
        elif command == "id":
            script = """#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-u" && "${2:-}" == "riskhub" ]]; then
  exit 1
fi
command /usr/bin/id "$@"
"""
        elif command == "nginx":
            script = """#!/usr/bin/env bash
set -euo pipefail
exit 0
"""
        elif command == "ss":
            script = """#!/usr/bin/env bash
set -euo pipefail
printf 'State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n'
"""
        elif command == "curl":
            script = """#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${DOCKER_COMMAND_LOG:-}" ]]; then
  printf '%s\n' "curl $*" >> "$DOCKER_COMMAND_LOG"
fi
if [[ "${CURL_FAIL:-0}" == "1" ]]; then
  exit "${DOCKER_FAIL_RC:-37}"
fi
printf '200'
"""
        else:
            script = """#!/usr/bin/env bash
set -euo pipefail
exit 0
"""
        _write_exec(fake_bin / command, script)

    return fake_bin


def _make_linux_bundle(root: Path, version: str) -> Path:
    bundle_root = root / f"riskhub-linux-{version}"
    bundle_root.mkdir()
    (bundle_root / "manifest.json").write_text(
        f'{{"version": "{version}"}}\n', encoding="utf-8"
    )
    archive_path = root / f"riskhub-linux-{version}.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        archive.add(bundle_root, arcname=bundle_root.name)
    return archive_path


def _image(name: str, tag: str = "test") -> str:
    return f"ghcr.io/example/{name}:{tag}@sha256:{DIGEST}"


def _run_cli(args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(DEPLOY_SCRIPT), *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def test_deploy_script_is_executable_entrypoint() -> None:
    result = subprocess.run(
        [str(DEPLOY_SCRIPT), "--help"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "Usage: ./scripts/deploy.sh" in result.stdout


def test_init_writes_non_secret_config_and_secret_scaffold() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-init-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        env = os.environ.copy()
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)
        result = _run_cli(
            [
                "init",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
            ],
            env,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
        assert config_path.exists()
        assert (secret_dir / "database_url").exists()
        assert (secret_dir / "secret_key").exists()
        assert (secret_dir / "redis_password").exists()
        assert (secret_dir / "entra_client_secret").exists()
        assert (secret_dir / "entra_client_certificate_private_key").exists()
        assert runtime_dir.exists()
        assert (runtime_dir.stat().st_mode & 0o777) == 0o750
        text = config_path.read_text(encoding="utf-8")
        assert "PUBLIC_URL=" in text
        assert "DATABASE_URL=" not in text
        assert "SECRET_KEY=" not in text
        assert "BOOTSTRAP_CRO_EMAIL=" in text


def test_docker_preflight_succeeds_before_first_deploy_without_persistent_runtime_dir() -> (
    None
):
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-preflight-fresh-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--yes",
            ],
            env,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
        output = f"{result.stdout}\n{result.stderr}"
        assert "Production is using Entra client-secret mode" in output
        assert not runtime_dir.exists()


def test_docker_preflight_rejects_existing_network_with_mismatched_subnet() -> None:
    with tempfile.TemporaryDirectory(
        prefix="riskhub-deploy-preflight-network-mismatch-"
    ) as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)
        env["DOCKER_NETWORK_EXISTS"] = "1"
        env["DOCKER_NETWORK_SUBNET"] = "172.31.200.0/24"

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "uses subnet(s) [172.31.200.0/24], expected '172.31.255.0/24'" in output


def test_secrets_edit_uses_secret_mount_workspace_and_cleans_up() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-secrets-edit-") as td:
        tmp = Path(td)
        secret_dir = tmp / "secrets"
        _write_secrets(secret_dir)
        editor_log = tmp / "editor.log"
        editor_path = tmp / "record-editor.sh"
        _write_exec(
            editor_path,
            """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >"$RISKHUB_EDITOR_LOG"
""",
        )

        env = os.environ.copy()
        env["EDITOR"] = str(editor_path)
        env["RISKHUB_EDITOR_LOG"] = str(editor_log)

        result = _run_cli(
            ["secrets-edit", "--target", "docker", "--secret-dir", str(secret_dir)],
            env,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
        buffer_path = Path(editor_log.read_text(encoding="utf-8").strip())
        assert buffer_path.parent.name.startswith(".riskhub-secrets-edit.")
        assert buffer_path.parent.parent == secret_dir.parent
        assert not buffer_path.parent.exists()


def test_docker_cli_supports_preflight_deploy_upgrade_and_rollback_dry_run() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-docker-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        preflight = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert preflight.returncode == 0, f"{preflight.stdout}\n{preflight.stderr}"
        preflight_output = f"{preflight.stdout}\n{preflight.stderr}"
        assert "scripts/prod/preflight.sh" in preflight_output

        deploy = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend"),
                "--backend-db-image",
                _image("riskhub-backend-db"),
                "--frontend-image",
                _image("riskhub-frontend"),
                "--redis-image",
                _image("riskhub-redis"),
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert deploy.returncode == 0, f"{deploy.stdout}\n{deploy.stderr}"
        deploy_output = f"{deploy.stdout}\n{deploy.stderr}"
        assert f"docker pull {_image('riskhub-backend')}" in deploy_output
        assert f"docker pull {_image('riskhub-backend-db')}" in deploy_output
        assert f"docker pull {_image('riskhub-redis')}" in deploy_output
        assert "scripts/prod/install_backend.sh" in deploy_output
        assert "scripts/prod/install_redis.sh" in deploy_output
        assert f"--backend-db-image {_image('riskhub-backend-db')}" in deploy_output
        assert f"RISKHUB_DEFAULT_SECRET_DIR={secret_dir}" in deploy_output

        upgrade_env = env | {
            "DOCKER_BACKEND_EXISTS": "1",
            "DOCKER_SCHEDULER_EXISTS": "1",
            "DOCKER_FRONTEND_EXISTS": "1",
        }
        upgrade = _run_cli(
            [
                "upgrade",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend", "test2"),
                "--backend-db-image",
                _image("riskhub-backend-db", "test2"),
                "--frontend-image",
                _image("riskhub-frontend", "test2"),
                "--redis-image",
                _image("riskhub-redis", "test2"),
                "--dry-run",
                "--yes",
            ],
            upgrade_env,
        )
        assert upgrade.returncode == 0, f"{upgrade.stdout}\n{upgrade.stderr}"
        upgrade_output = f"{upgrade.stdout}\n{upgrade.stderr}"
        assert (
            "--previous-image ghcr.io/example/riskhub-backend:previous"
            in upgrade_output
        )
        assert (
            "--previous-image ghcr.io/example/riskhub-frontend:previous"
            in upgrade_output
        )

        rollback = _run_cli(
            [
                "rollback",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--service",
                "all",
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert rollback.returncode == 0, f"{rollback.stdout}\n{rollback.stderr}"
        rollback_output = f"{rollback.stdout}\n{rollback.stderr}"
        assert "scripts/prod/rollback.sh" in rollback_output


def test_docker_deploy_dry_run_keeps_env_arguments_and_rendered_env_files_clean() -> (
    None
):
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-dryrun-clean-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        deploy = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend"),
                "--backend-db-image",
                _image("riskhub-backend-db"),
                "--frontend-image",
                _image("riskhub-frontend"),
                "--redis-image",
                _image("riskhub-redis"),
                "--dry-run",
                "--yes",
            ],
            env,
        )

        assert deploy.returncode == 0, f"{deploy.stdout}\n{deploy.stderr}"
        deploy_output = f"{deploy.stdout}\n{deploy.stderr}"
        assert "+ mkdir -p" in deploy.stderr
        assert "+ mkdir -p" not in deploy.stdout

        env_args = re.findall(r"--(backend|frontend)-env\s+([^\s]+)", deploy_output)
        assert env_args, deploy_output
        for _, raw_path in env_args:
            clean_path = raw_path.strip("\"'")
            assert clean_path.endswith(".env")
            assert "+ " not in clean_path
            env_file = Path(clean_path)
            if env_file.exists():
                for line in env_file.read_text(encoding="utf-8").splitlines():
                    if not line.strip():
                        continue
                    assert "=" in line
                    assert not line.startswith("+ ")


def test_docker_deploy_propagates_bootstrap_failure_before_app_install() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-bootstrap-failure-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        command_log = tmp / "docker.log"
        admin_external_id = "11111111-2222-4333-8444-555555555555"
        cro_external_id = "66666666-7777-4888-8999-aaaaaaaaaaaa"
        _write_config(
            config_path,
            BOOTSTRAP_ADMIN_EXTERNAL_ID=admin_external_id,
            BOOTSTRAP_CRO_EXTERNAL_ID=cro_external_id,
        )
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{fake_bin}:{env['PATH']}",
                "RISKHUB_RUNTIME_DIR": str(runtime_dir),
                "DOCKER_COMMAND_LOG": str(command_log),
                "DOCKER_FAIL_BOOTSTRAP": "1",
            }
        )

        deploy = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend"),
                "--backend-db-image",
                _image("riskhub-backend-db"),
                "--frontend-image",
                _image("riskhub-frontend"),
                "--redis-image",
                _image("riskhub-redis"),
                "--yes",
            ],
            env,
        )

        docker_commands = command_log.read_text(encoding="utf-8")
        assert deploy.returncode == 37, f"{deploy.stdout}\n{deploy.stderr}"
        assert f"--external-id {admin_external_id}" in docker_commands
        assert f"--external-id {cro_external_id}" not in docker_commands
        assert "uvicorn app.main:app" not in docker_commands


@pytest.mark.parametrize(
    ("stage", "failure_match", "later_match", "expected_rc"),
    [
        ("preflight", "", "pull ghcr.io/example/riskhub-backend", 1),
        ("pull", "pull ghcr.io/example/riskhub-backend", " python -", 73),
        ("db_preflight", " python -", "--name riskhub-redis", 73),
        ("redis", "--name riskhub-redis", "alembic upgrade head", 73),
        ("migration", "alembic upgrade head", "scripts.seed_roles_permissions", 73),
        ("bootstrap", "scripts.bootstrap_sso_user", "--name riskhub-backend", 73),
        ("api", "--name riskhub-backend ", "--name riskhub-backend-scheduler", 73),
        (
            "scheduler",
            "--name riskhub-backend-scheduler",
            "--name riskhub-frontend",
            73,
        ),
        ("frontend", "--name riskhub-frontend", "exec riskhub-backend", 73),
        ("smoke", "curl ", None, 1),
    ],
)
def test_docker_deploy_fails_fast_at_every_mandatory_stage_and_cleans_once(
    stage: str, failure_match: str, later_match: str | None, expected_rc: int
) -> None:
    with tempfile.TemporaryDirectory(prefix=f"riskhub-deploy-fail-{stage}-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        command_log = tmp / "docker.log"
        cleanup_log = tmp / "cleanup.log"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)
        real_rm = shutil.which("rm")
        assert real_rm is not None
        _write_exec(
            fake_bin / "rm",
            f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *".riskhub-deploy."* ]]; then
  printf '%s\n' "$*" >> "${{DOCKER_CLEANUP_LOG}}"
fi
exec {real_rm} "$@"
""",
        )

        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{fake_bin}:{env['PATH']}",
                "RISKHUB_RUNTIME_DIR": str(runtime_dir),
                "DOCKER_COMMAND_LOG": str(command_log),
                "DOCKER_CLEANUP_LOG": str(cleanup_log),
                "DOCKER_FAIL_MATCH": failure_match,
                "DOCKER_FAIL_RC": "73",
                "DOCKER_NETWORK_EXISTS": "1",
                "DOCKER_PS_COUNT_FILE": str(tmp / "docker-ps-count"),
                "DOCKER_STATE_FILE": str(tmp / "docker-state"),
            }
        )
        if stage == "preflight":
            env["DOCKER_FAIL_PS_NTH"] = "2"
        if stage == "smoke":
            env["CURL_FAIL"] = "1"

        deploy = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend"),
                "--backend-db-image",
                _image("riskhub-backend-db"),
                "--frontend-image",
                _image("riskhub-frontend"),
                "--redis-image",
                _image("riskhub-redis"),
                "--yes",
            ],
            env,
        )

        docker_commands = command_log.read_text(encoding="utf-8")
        assert deploy.returncode == expected_rc, f"{deploy.stdout}\n{deploy.stderr}"
        if failure_match:
            assert failure_match in docker_commands, f"{deploy.stdout}\n{deploy.stderr}"
        if later_match is not None:
            assert later_match not in docker_commands
        cleanup_lines = cleanup_log.read_text(encoding="utf-8").splitlines()
        assert cleanup_lines
        assert len(cleanup_lines) == len(set(cleanup_lines))
        assert all(".riskhub-deploy." in line for line in cleanup_lines)
        assert not list(runtime_dir.parent.glob(".riskhub-deploy.*"))


@pytest.mark.parametrize("include_external_ids", [False, True])
def test_linux_db_bootstrap_runtime_argv_preserves_optional_external_ids(
    include_external_ids: bool,
) -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-linux-bootstrap-argv-") as td:
        tmp = Path(td)
        release_dir = tmp / "release"
        (release_dir / "backend").mkdir(parents=True)
        (release_dir / "backend_db").mkdir()
        (release_dir / "db-venv" / "bin").mkdir(parents=True)
        argv_log = tmp / "argv.log"
        backend_env = tmp / "backend.env"
        env_lines = [
            "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
            "BOOTSTRAP_CRO_EMAIL=cro@example.com",
        ]
        if include_external_ids:
            env_lines += [
                "BOOTSTRAP_ADMIN_EXTERNAL_ID=11111111-2222-4333-8444-555555555555",
                "BOOTSTRAP_CRO_EXTERNAL_ID=66666666-7777-4888-8999-aaaaaaaaaaaa",
            ]
        backend_env.write_text("\n".join(env_lines) + "\n", encoding="utf-8")
        _write_exec(
            release_dir / "db-venv" / "bin" / "python",
            """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$LINUX_ARGV_LOG"
""",
        )
        _write_exec(
            release_dir / "db-venv" / "bin" / "alembic",
            "#!/usr/bin/env bash\nset -euo pipefail\n",
        )
        harness = f"""
set -euo pipefail
source {str(REPO_ROOT / 'scripts/deploy/lib/common.sh')!r}
source {str(REPO_ROOT / 'scripts/deploy/lib/linux.sh')!r}
LINUX_BACKEND_ENV={str(backend_env)!r}
run_privileged_sh() {{ bash -lc "$2"; }}
linux_run_db_tasks {str(release_dir)!r}
"""
        result = subprocess.run(
            ["bash", "-c", harness],
            cwd=REPO_ROOT,
            env={**os.environ, "LINUX_ARGV_LOG": str(argv_log)},
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
        commands = argv_log.read_text(encoding="utf-8").splitlines()
        admin = next(line for line in commands if "--role admin" in line)
        cro = next(line for line in commands if "--role cro" in line)
        if include_external_ids:
            assert "--external-id 11111111-2222-4333-8444-555555555555" in admin
            assert "--external-id 66666666-7777-4888-8999-aaaaaaaaaaaa" in cro
        else:
            assert "--external-id" not in admin
            assert "--external-id" not in cro


@pytest.mark.parametrize("include_external_ids", [False, True])
def test_docker_db_bootstrap_runtime_argv_matches_linux_optional_external_ids(
    include_external_ids: bool,
) -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-docker-bootstrap-argv-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        command_log = tmp / "docker.log"
        config_overrides = {}
        if include_external_ids:
            config_overrides = {
                "BOOTSTRAP_ADMIN_EXTERNAL_ID": "11111111-2222-4333-8444-555555555555",
                "BOOTSTRAP_CRO_EXTERNAL_ID": "66666666-7777-4888-8999-aaaaaaaaaaaa",
            }
        _write_config(config_path, **config_overrides)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{fake_bin}:{env['PATH']}",
                "RISKHUB_RUNTIME_DIR": str(runtime_dir),
                "DOCKER_COMMAND_LOG": str(command_log),
                "DOCKER_FAIL_MATCH": "--name riskhub-backend ",
                "DOCKER_NETWORK_EXISTS": "1",
                "DOCKER_STATE_FILE": str(tmp / "docker-state"),
            }
        )

        result = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend"),
                "--backend-db-image",
                _image("riskhub-backend-db"),
                "--frontend-image",
                _image("riskhub-frontend"),
                "--redis-image",
                _image("riskhub-redis"),
                "--yes",
            ],
            env,
        )

        assert result.returncode == 37, f"{result.stdout}\n{result.stderr}"
        bootstrap_commands = [
            line
            for line in command_log.read_text(encoding="utf-8").splitlines()
            if "scripts.bootstrap_sso_user" in line
        ]
        assert len(bootstrap_commands) == 2
        if include_external_ids:
            assert (
                "--external-id 11111111-2222-4333-8444-555555555555"
                in bootstrap_commands[0]
            )
            assert (
                "--external-id 66666666-7777-4888-8999-aaaaaaaaaaaa"
                in bootstrap_commands[1]
            )
        else:
            assert all("--external-id" not in command for command in bootstrap_commands)


def test_docker_deploy_requires_backend_db_image_when_version_is_omitted() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-missing-db-image-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend"),
                "--frontend-image",
                _image("riskhub-frontend"),
                "--redis-image",
                _image("riskhub-redis"),
                "--dry-run",
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "--backend-db-image" in output


@pytest.mark.parametrize("command", ["deploy", "upgrade"])
def test_docker_cli_dry_run_supports_paths_with_spaces(command: str) -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-spaces-") as td:
        tmp = Path(td) / "workspace with spaces"
        tmp.mkdir(parents=True)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets with spaces"
        runtime_dir = tmp / "runtime with spaces"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)
        if command == "upgrade":
            env |= {
                "DOCKER_BACKEND_EXISTS": "1",
                "DOCKER_SCHEDULER_EXISTS": "1",
                "DOCKER_FRONTEND_EXISTS": "1",
            }

        result = _run_cli(
            [
                command,
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                _image("riskhub-backend"),
                "--backend-db-image",
                _image("riskhub-backend-db"),
                "--frontend-image",
                _image("riskhub-frontend"),
                "--redis-image",
                _image("riskhub-redis"),
                "--dry-run",
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode == 0, output
        assert "command not found" not in output
        assert f"--backend-db-image {_image('riskhub-backend-db')}" in output
        if command == "deploy":
            assert "scripts/prod/install_backend.sh" in output
        else:
            assert "--previous-image ghcr.io/example/riskhub-backend:previous" in output


def test_linux_cli_supports_preflight_deploy_upgrade_and_rollback_dry_run() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-linux-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        linux_root = tmp / "linux-root"
        runtime_root = tmp / "runtime"
        nginx_site = tmp / "riskhub.conf"
        bundle_path = _make_linux_bundle(tmp, "v-test")
        _write_config(config_path, FRONTEND_BIND_PORT="18082")
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_LINUX_ROOT"] = str(linux_root)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_root)
        env["RISKHUB_LINUX_NGINX_SITE"] = str(nginx_site)

        preflight = _run_cli(
            [
                "preflight",
                "--target",
                "linux",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert preflight.returncode == 0, f"{preflight.stdout}\n{preflight.stderr}"

        deploy = _run_cli(
            [
                "deploy",
                "--target",
                "linux",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--bundle",
                str(bundle_path),
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert deploy.returncode == 0, f"{deploy.stdout}\n{deploy.stderr}"
        deploy_output = f"{deploy.stdout}\n{deploy.stderr}"
        assert "riskhub-linux-v-test.tar.gz" in deploy_output
        assert "riskhub-redis.service" in deploy_output
        assert "systemctl restart nginx" in deploy_output

        release_dir = linux_root / "releases" / "v-previous"
        release_dir.mkdir(parents=True)
        previous_dir = linux_root / "releases" / "v-old"
        previous_dir.mkdir(parents=True)
        (linux_root / "current").symlink_to(release_dir)
        (linux_root / "previous").symlink_to(previous_dir)

        upgrade = _run_cli(
            [
                "upgrade",
                "--target",
                "linux",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--bundle",
                str(bundle_path),
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert upgrade.returncode == 0, f"{upgrade.stdout}\n{upgrade.stderr}"
        upgrade_output = f"{upgrade.stdout}\n{upgrade.stderr}"
        assert "ln -sfn" in upgrade_output

        rollback = _run_cli(
            [
                "rollback",
                "--target",
                "linux",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert rollback.returncode == 0, f"{rollback.stdout}\n{rollback.stderr}"
        rollback_output = f"{rollback.stdout}\n{rollback.stderr}"
        assert "systemctl restart nginx" in rollback_output


def test_preflight_reports_missing_docker_prerequisite() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-missing-docker-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        fake_bin = tmp / "bin"
        fake_bin.mkdir()
        real_bash = shutil.which("bash")
        real_cat = shutil.which("cat")
        real_date = shutil.which("date")
        real_dirname = shutil.which("dirname")
        real_python3 = shutil.which("python3")
        real_python313 = shutil.which("python3.13") or real_python3
        assert real_bash is not None
        assert real_cat is not None
        assert real_date is not None
        assert real_dirname is not None
        assert real_python3 is not None
        assert real_python313 is not None
        _write_exec(fake_bin / "bash", f'#!/bin/sh\nexec {real_bash!s} "$@"\n')
        _write_exec(fake_bin / "cat", f'#!/bin/sh\nexec {real_cat!s} "$@"\n')
        _write_exec(fake_bin / "date", f'#!/bin/sh\nexec {real_date!s} "$@"\n')
        _write_exec(fake_bin / "dirname", f'#!/bin/sh\nexec {real_dirname!s} "$@"\n')
        _write_exec(fake_bin / "python3", f'#!/bin/sh\nexec {real_python3!s} "$@"\n')
        _write_exec(
            fake_bin / "python3.13", f'#!/bin/sh\nexec {real_python313!s} "$@"\n'
        )
        _write_config(config_path)
        _write_secrets(secret_dir)

        env = os.environ.copy()
        env["PATH"] = str(fake_bin)

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--dry-run",
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "Missing required command: docker" in output


def test_docker_preflight_rejects_wildcard_public_url_before_rendering_allowed_hosts() -> (
    None
):
    with tempfile.TemporaryDirectory(
        prefix="riskhub-deploy-preflight-wildcard-host-"
    ) as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path, PUBLIC_URL="https://*.example.com")
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "PUBLIC_URL host must not contain wildcard" in output
        assert "scripts/prod/preflight.sh" not in output


@pytest.mark.parametrize(
    ("flag", "value"),
    [
        ("--backend-image", "ghcr.io/example/riskhub-backend:test"),
        ("--backend-db-image", "ghcr.io/example/riskhub-backend-db:test"),
        ("--frontend-image", "ghcr.io/example/riskhub-frontend:test"),
        ("--redis-image", "ghcr.io/example/riskhub-redis:test"),
    ],
)
def test_docker_deploy_rejects_mutable_explicit_image_refs(
    flag: str, value: str
) -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-mutable-image-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        images = {
            "--backend-image": _image("riskhub-backend"),
            "--backend-db-image": _image("riskhub-backend-db"),
            "--frontend-image": _image("riskhub-frontend"),
            "--redis-image": _image("riskhub-redis"),
        }
        images[flag] = value
        image_args = [item for pair in images.items() for item in pair]

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                *image_args,
                "--dry-run",
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "must be immutable image refs with @sha256:<64 hex>" in output


def test_docker_deploy_accepts_digest_only_image_refs() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-digest-only-image-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path)
        _write_secrets(secret_dir)
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_cli(
            [
                "deploy",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--backend-image",
                f"ghcr.io/example/riskhub-backend@sha256:{DIGEST}",
                "--backend-db-image",
                f"ghcr.io/example/riskhub-backend-db@sha256:{DIGEST}",
                "--frontend-image",
                f"ghcr.io/example/riskhub-frontend@sha256:{DIGEST}",
                "--redis-image",
                f"ghcr.io/example/riskhub-redis@sha256:{DIGEST}",
                "--dry-run",
                "--yes",
            ],
            env,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


@pytest.mark.parametrize(
    ("secret_name", "placeholder_value", "expected_message"),
    [
        (
            "database_url",
            "CHANGE_ME_DATABASE_URL\n",
            "database_url still contains the placeholder value",
        ),
        (
            "secret_key",
            "CHANGE_ME_SECRET_KEY_AT_LEAST_32_CHARACTERS\n",
            "secret_key still contains the placeholder value",
        ),
        (
            "redis_password",
            "CHANGE_ME_REDIS_PASSWORD\n",
            "redis_password still contains the placeholder value",
        ),
    ],
)
def test_secrets_check_rejects_placeholder_values(
    secret_name: str,
    placeholder_value: str,
    expected_message: str,
) -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-secrets-check-") as td:
        tmp = Path(td)
        secret_dir = tmp / "secrets"
        _write_secrets(secret_dir, **{secret_name: placeholder_value})

        result = _run_cli(
            ["secrets-check", "--target", "docker", "--secret-dir", str(secret_dir)],
            os.environ.copy(),
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert expected_message in output


def test_secrets_check_allows_placeholder_values_for_optional_entra_scaffold_files() -> (
    None
):
    with tempfile.TemporaryDirectory(
        prefix="riskhub-deploy-secrets-check-optional-"
    ) as td:
        tmp = Path(td)
        secret_dir = tmp / "secrets"
        _write_secrets(
            secret_dir,
            entra_client_secret="CHANGE_ME_ENTRA_CLIENT_SECRET\n",
            entra_client_certificate_private_key="CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY\n",
        )

        result = _run_cli(
            ["secrets-check", "--target", "docker", "--secret-dir", str(secret_dir)],
            os.environ.copy(),
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


def test_preflight_rejects_certificate_placeholder_before_prod_preflight() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-cert-placeholder-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(
            config_path,
            ENTRA_CLIENT_CERTIFICATE_THUMBPRINT="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        )
        _write_secrets(
            secret_dir,
            entra_client_certificate_private_key="CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY\n",
        )
        (secret_dir / "entra_client_secret").unlink()
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert (
            "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is set but no valid "
            "entra_client_certificate_private_key secret file was found"
        ) in output
        assert "Preflight: OK" not in output


def test_preflight_accepts_secret_mode_with_unused_certificate_placeholder_from_init_scaffold() -> (
    None
):
    with tempfile.TemporaryDirectory(
        prefix="riskhub-deploy-secret-mode-scaffold-"
    ) as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        init_result = _run_cli(
            [
                "init",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
            ],
            env,
        )
        assert (
            init_result.returncode == 0
        ), f"{init_result.stdout}\n{init_result.stderr}"

        _write_config(config_path)
        _write_secret_value(
            secret_dir,
            "database_url",
            "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub\n",
        )
        _write_secret_value(
            secret_dir, "secret_key", "0123456789abcdef0123456789abcdef\n"
        )
        _write_secret_value(secret_dir, "redis_password", "redis-secret\n")
        _write_secret_value(secret_dir, "entra_client_secret", "entra-client-secret\n")

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--yes",
            ],
            env,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


def test_preflight_accepts_certificate_mode_with_unused_client_secret_placeholder_from_init_scaffold() -> (
    None
):
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-cert-mode-scaffold-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        init_result = _run_cli(
            [
                "init",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
            ],
            env,
        )
        assert (
            init_result.returncode == 0
        ), f"{init_result.stdout}\n{init_result.stderr}"

        _write_config(
            config_path,
            ENTRA_CLIENT_CERTIFICATE_THUMBPRINT="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        )
        _write_secret_value(
            secret_dir,
            "database_url",
            "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub\n",
        )
        _write_secret_value(
            secret_dir, "secret_key", "0123456789abcdef0123456789abcdef\n"
        )
        _write_secret_value(secret_dir, "redis_password", "redis-secret\n")
        _write_secret_value(
            secret_dir,
            "entra_client_certificate_private_key",
            "-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----\n",
        )

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--yes",
            ],
            env,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


def test_preflight_accepts_certificate_mode_without_entra_client_secret() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-cert-preflight-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(
            config_path,
            ENTRA_CLIENT_CERTIFICATE_THUMBPRINT="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        )
        _write_secrets(
            secret_dir,
            entra_client_certificate_private_key="-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----\n",
        )
        (secret_dir / "entra_client_secret").unlink()
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_cli(
            [
                "preflight",
                "--target",
                "docker",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--yes",
            ],
            env,
        )

        assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"


def test_preflight_reports_config_validation_failures() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-invalid-config-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        fake_bin = _make_fake_bin(tmp)
        _write_config(config_path, BOOTSTRAP_CRO_EMAIL="admin@example.com")
        _write_secrets(secret_dir)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"

        result = _run_cli(
            [
                "preflight",
                "--target",
                "linux",
                "--config",
                str(config_path),
                "--secret-dir",
                str(secret_dir),
                "--dry-run",
                "--yes",
            ],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert (
            "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_CRO_EMAIL must be different" in output
        )
