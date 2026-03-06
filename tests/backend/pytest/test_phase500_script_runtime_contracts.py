"""Runtime contracts for Phase 500 production scripts."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
PROD_SCRIPTS_DIR = REPO_ROOT / "scripts" / "prod"


def _docker_available() -> bool:
    try:
        result = subprocess.run(
            ["docker", "ps"],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return False
    return result.returncode == 0


def _run_script(name: str, args: list[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(PROD_SCRIPTS_DIR / name), *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def _write_backend_env(path: Path, runtime_dir: Path, secret_dir: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "DEBUG=false",
                "MOCK_AUTH_ENABLED=false",
                "AUTH_MODE=microsoft_sso",
                f"SECRET_KEY_FILE={secret_dir / 'secret_key'}",
                f"DATABASE_URL_FILE={secret_dir / 'database_url'}",
                'CORS_ORIGINS=["https://riskhub.example.com"]',
                'ALLOWED_HOSTS=["riskhub.example.com"]',
                f"REDIS_URL_FILE={runtime_dir / 'redis_url'}",
                "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
                "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
                f"ENTRA_CLIENT_SECRET_FILE={secret_dir / 'entra_client_secret'}",
                "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
                "BOOTSTRAP_ADMIN_ROLE=admin",
                "BOOTSTRAP_ADMIN_ACCESS_SCOPE=global",
                "BOOTSTRAP_CRO_EMAIL=cro@example.com",
                "BOOTSTRAP_CRO_ACCESS_SCOPE=global",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def _write_secret_runtime(secret_dir: Path, runtime_dir: Path) -> None:
    secret_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (secret_dir / "secret_key").write_text("phase500-local-test-key-phase500-local-test\n", encoding="utf-8")
    (secret_dir / "database_url").write_text(
        "postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub\n",
        encoding="utf-8",
    )
    (secret_dir / "entra_client_secret").write_text("phase500-test-entra-client-secret\n", encoding="utf-8")
    (runtime_dir / "redis_url").write_text("redis://:riskhub_test_password@redis:6379/0\n", encoding="utf-8")


def _write_frontend_env(path: Path, *, host_port: str, container_port: str) -> None:
    path.write_text(
        f"FRONTEND_HOST_PORT={host_port}\n"
        f"FRONTEND_CONTAINER_PORT={container_port}\n"
        "SERVER_NAME=riskhub.example.com\n",
        encoding="utf-8",
    )


@pytest.mark.skipif(not _docker_available(), reason="Docker daemon is required for preflight script runtime checks")
def test_preflight_rejects_invalid_host_port_range() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-preflight-host-range-") as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(secret_dir, runtime_dir)
        _write_backend_env(backend_env, runtime_dir, secret_dir)
        _write_frontend_env(frontend_env, host_port="70000", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            ["--backend-env", str(backend_env), "--frontend-env", str(frontend_env), "--yes"],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode != 0
        assert "FRONTEND_HOST_PORT must be between 1 and 65535" in output


@pytest.mark.skipif(not _docker_available(), reason="Docker daemon is required for preflight script runtime checks")
def test_preflight_rejects_invalid_container_port_format() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-preflight-container-port-") as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(secret_dir, runtime_dir)
        _write_backend_env(backend_env, runtime_dir, secret_dir)
        _write_frontend_env(frontend_env, host_port="18081", container_port="abc")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            ["--backend-env", str(backend_env), "--frontend-env", str(frontend_env), "--yes"],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode != 0
        assert "FRONTEND_CONTAINER_PORT must be numeric" in output


@pytest.mark.skipif(not _docker_available(), reason="Docker daemon is required for setup script runtime checks")
def test_setup_dry_run_cleans_wizard_temp_directory() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-setup-tmpdir-") as td:
        env = os.environ.copy()
        env["TMPDIR"] = td

        result = _run_script(
            "setup.sh",
            [
                "--yes",
                "--dry-run",
                "--action",
                "exit",
                "--backend-env",
                "/etc/riskhub/backend.env",
                "--frontend-env",
                "/etc/riskhub/frontend.env",
                "--public-url",
                "https://riskhub.example.com",
                "--database-url",
                "postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub",
                "--entra-tenant-id",
                "00000000-0000-0000-0000-000000000000",
                "--entra-client-id",
                "11111111-1111-1111-1111-111111111111",
                "--entra-client-secret",
                "phase500-test-entra-client-secret",
                "--bootstrap-admin-email",
                "admin@example.com",
                "--bootstrap-cro-email",
                "cro@example.com",
            ],
            env=env,
        )

        output = f"{result.stdout}\n{result.stderr}"
        remaining_tmp_dirs = sorted(Path(td).glob("riskhub-setup.*"))

        assert result.returncode == 0, output
        assert not remaining_tmp_dirs, f"Expected no residual riskhub-setup temp dirs, found: {remaining_tmp_dirs}"
