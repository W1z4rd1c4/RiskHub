"""Runtime contracts for the unified deployment CLI."""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy.sh"


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
case "${subcmd}" in
  ps)
    exit 0
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
      riskhub-backend) [[ "${DOCKER_BACKEND_EXISTS:-0}" == "1" ]] && exit 0 || exit 1 ;;
      riskhub-frontend) [[ "${DOCKER_FRONTEND_EXISTS:-0}" == "1" ]] && exit 0 || exit 1 ;;
      riskhub-backend-scheduler) [[ "${DOCKER_SCHEDULER_EXISTS:-0}" == "1" ]] && exit 0 || exit 1 ;;
      *) exit 1 ;;
    esac
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
    (bundle_root / "manifest.json").write_text(f'{{"version": "{version}"}}\n', encoding="utf-8")
    archive_path = root / f"riskhub-linux-{version}.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        archive.add(bundle_root, arcname=bundle_root.name)
    return archive_path


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
            ["init", "--target", "docker", "--config", str(config_path), "--secret-dir", str(secret_dir)],
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


def test_docker_preflight_succeeds_before_first_deploy_without_persistent_runtime_dir() -> None:
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
        assert not runtime_dir.exists()


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
        assert "scripts/prod/preflight.sh" in preflight.stdout

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
                "ghcr.io/example/riskhub-backend:test",
                "--frontend-image",
                "ghcr.io/example/riskhub-frontend:test",
                "--redis-image",
                "ghcr.io/example/riskhub-redis:test",
                "--dry-run",
                "--yes",
            ],
            env,
        )
        assert deploy.returncode == 0, f"{deploy.stdout}\n{deploy.stderr}"
        assert "docker pull ghcr.io/example/riskhub-backend:test" in deploy.stdout
        assert "docker pull ghcr.io/example/riskhub-redis:test" in deploy.stdout
        assert "scripts/prod/install_backend.sh" in deploy.stdout
        assert "scripts/prod/install_redis.sh" in deploy.stdout
        assert f"RISKHUB_DEFAULT_SECRET_DIR={secret_dir}" in deploy.stdout

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
                "ghcr.io/example/riskhub-backend:test2",
                "--frontend-image",
                "ghcr.io/example/riskhub-frontend:test2",
                "--redis-image",
                "ghcr.io/example/riskhub-redis:test2",
                "--dry-run",
                "--yes",
            ],
            upgrade_env,
        )
        assert upgrade.returncode == 0, f"{upgrade.stdout}\n{upgrade.stderr}"
        assert "--previous-image ghcr.io/example/riskhub-backend:previous" in upgrade.stdout
        assert "--previous-image ghcr.io/example/riskhub-frontend:previous" in upgrade.stdout

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
        assert "scripts/prod/rollback.sh" in rollback.stdout


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
            ["preflight", "--target", "linux", "--config", str(config_path), "--secret-dir", str(secret_dir), "--dry-run", "--yes"],
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
        assert "riskhub-linux-v-test.tar.gz" in deploy.stdout
        assert "riskhub-redis.service" in deploy.stdout
        assert "systemctl restart nginx" in deploy.stdout

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
        assert "ln -sfn" in upgrade.stdout

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
        assert "systemctl restart nginx" in rollback.stdout


def test_preflight_reports_missing_docker_prerequisite() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-missing-docker-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        fake_bin = tmp / "bin"
        fake_bin.mkdir()
        real_python3 = shutil.which("python3")
        real_python313 = shutil.which("python3.13") or real_python3
        assert real_python3 is not None
        assert real_python313 is not None
        _write_exec(fake_bin / "python3", f"#!/usr/bin/env bash\nexec {real_python3!s} \"$@\"\n")
        _write_exec(fake_bin / "python3.13", f"#!/usr/bin/env bash\nexec {real_python313!s} \"$@\"\n")
        _write_config(config_path)
        _write_secrets(secret_dir)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:/usr/bin:/bin:/usr/sbin:/sbin"

        result = _run_cli(
            ["preflight", "--target", "docker", "--config", str(config_path), "--secret-dir", str(secret_dir), "--dry-run", "--yes"],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "Missing required command: docker" in output


@pytest.mark.parametrize(
    ("secret_name", "placeholder_value", "expected_message"),
    [
        ("database_url", "CHANGE_ME_DATABASE_URL\n", "database_url still contains the placeholder value"),
        (
            "secret_key",
            "CHANGE_ME_SECRET_KEY_AT_LEAST_32_CHARACTERS\n",
            "secret_key still contains the placeholder value",
        ),
        ("redis_password", "CHANGE_ME_REDIS_PASSWORD\n", "redis_password still contains the placeholder value"),
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

        result = _run_cli(["secrets-check", "--target", "docker", "--secret-dir", str(secret_dir)], os.environ.copy())

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert expected_message in output


def test_secrets_check_allows_placeholder_values_for_optional_entra_scaffold_files() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-secrets-check-optional-") as td:
        tmp = Path(td)
        secret_dir = tmp / "secrets"
        _write_secrets(
            secret_dir,
            entra_client_secret="CHANGE_ME_ENTRA_CLIENT_SECRET\n",
            entra_client_certificate_private_key="CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY\n",
        )

        result = _run_cli(["secrets-check", "--target", "docker", "--secret-dir", str(secret_dir)], os.environ.copy())

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


def test_preflight_accepts_secret_mode_with_unused_certificate_placeholder_from_init_scaffold() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-secret-mode-scaffold-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        fake_bin = _make_fake_bin(tmp)

        env = os.environ.copy()
        env["PATH"] = f"{fake_bin}:{env['PATH']}"
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        init_result = _run_cli(
            ["init", "--target", "docker", "--config", str(config_path), "--secret-dir", str(secret_dir)],
            env,
        )
        assert init_result.returncode == 0, f"{init_result.stdout}\n{init_result.stderr}"

        _write_config(config_path)
        _write_secret_value(
            secret_dir,
            "database_url",
            "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub\n",
        )
        _write_secret_value(secret_dir, "secret_key", "0123456789abcdef0123456789abcdef\n")
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


def test_preflight_accepts_certificate_mode_with_unused_client_secret_placeholder_from_init_scaffold() -> None:
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
            ["init", "--target", "docker", "--config", str(config_path), "--secret-dir", str(secret_dir)],
            env,
        )
        assert init_result.returncode == 0, f"{init_result.stdout}\n{init_result.stderr}"

        _write_config(
            config_path,
            ENTRA_CLIENT_CERTIFICATE_THUMBPRINT="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        )
        _write_secret_value(
            secret_dir,
            "database_url",
            "postgresql+asyncpg://riskhub:secret@postgres.example.com:5432/riskhub\n",
        )
        _write_secret_value(secret_dir, "secret_key", "0123456789abcdef0123456789abcdef\n")
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
            ["preflight", "--target", "linux", "--config", str(config_path), "--secret-dir", str(secret_dir), "--dry-run", "--yes"],
            env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_CRO_EMAIL must be different" in output
