"""Contract checks for the unified deployment renderer."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
RENDERER = REPO_ROOT / "scripts" / "deploy" / "lib" / "render.py"


def _write_config(path: Path, **overrides: str) -> None:
    values = {
        "PUBLIC_URL": "https://riskhub.example.com",
        "ENTRA_TENANT_ID": "00000000-0000-0000-0000-000000000000",
        "ENTRA_CLIENT_ID": "11111111-1111-1111-1111-111111111111",
        "BOOTSTRAP_ADMIN_EMAIL": "admin@example.com",
        "BOOTSTRAP_CRO_EMAIL": "cro@example.com",
        "API_WORKERS": "4",
        "FRONTEND_BIND_PORT": "18080",
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


def _parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if not raw_line or raw_line.startswith("#") or "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        values[key] = value
    return values


def test_renderer_derives_public_url_hosts_and_target_specific_redis_urls_without_emitting_raw_secrets() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-render-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        docker_out = tmp / "docker"
        linux_out = tmp / "linux"
        _write_config(config_path)
        _write_secrets(secret_dir)

        subprocess.run(
            [
                "python3",
                str(RENDERER),
                "write-runtime",
                "--config",
                str(config_path),
                "--target",
                "docker",
                "--secret-dir",
                str(secret_dir),
                "--runtime-dir",
                str(runtime_dir),
                "--out-dir",
                str(docker_out),
            ],
            cwd=REPO_ROOT,
            check=True,
        )
        subprocess.run(
            [
                "python3",
                str(RENDERER),
                "write-runtime",
                "--config",
                str(config_path),
                "--target",
                "linux",
                "--secret-dir",
                str(secret_dir),
                "--runtime-dir",
                str(runtime_dir),
                "--out-dir",
                str(linux_out),
            ],
            cwd=REPO_ROOT,
            check=True,
        )

        docker_backend = _parse_env(docker_out / "backend.env")
        linux_backend = _parse_env(linux_out / "backend.env")
        docker_meta = _parse_env(docker_out / "metadata.env")
        linux_meta = _parse_env(linux_out / "metadata.env")

        assert docker_backend["CORS_ORIGINS"] == '["https://riskhub.example.com"]'
        assert docker_backend["ALLOWED_HOSTS"] == '["riskhub.example.com"]'
        assert docker_backend["DATABASE_URL_FILE"] == str(secret_dir / "database_url")
        assert docker_backend["SECRET_KEY_FILE"] == str(secret_dir / "secret_key")
        assert docker_backend["ENTRA_CLIENT_SECRET_FILE"] == str(secret_dir / "entra_client_secret")
        assert "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT" not in docker_backend
        assert "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE" not in docker_backend
        assert docker_backend["REDIS_URL_FILE"] == str(runtime_dir / "redis_url")
        assert "DATABASE_URL" not in docker_backend
        assert "SECRET_KEY" not in docker_backend
        assert "ENTRA_CLIENT_SECRET" not in docker_backend
        assert "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY" not in docker_backend
        assert "REDIS_PASSWORD" not in docker_backend
        assert (docker_out / "redis_url").read_text(encoding="utf-8") == "redis://:redis-secret@redis:6379/0\n"
        assert (linux_out / "redis_url").read_text(encoding="utf-8") == "redis://:redis-secret@127.0.0.1:6379/0\n"
        assert docker_meta["SERVER_NAME"] == "riskhub.example.com"
        assert docker_meta["FRONTEND_BIND_PORT"] == "18080"
        assert linux_meta["BACKEND_BIND_PORT"] == "8000"
        assert docker_meta["ENTRA_GRAPH_CREDENTIAL_MODE"] == "secret"


def test_renderer_prefers_certificate_mode_and_omits_secret_file_from_runtime_env() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-render-cert-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        out_dir = tmp / "rendered"
        _write_config(
            config_path,
            ENTRA_CLIENT_CERTIFICATE_THUMBPRINT="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        )
        _write_secrets(
            secret_dir,
            entra_client_certificate_private_key="-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----\n",
        )

        subprocess.run(
            [
                "python3",
                str(RENDERER),
                "write-runtime",
                "--config",
                str(config_path),
                "--target",
                "docker",
                "--secret-dir",
                str(secret_dir),
                "--runtime-dir",
                str(runtime_dir),
                "--out-dir",
                str(out_dir),
            ],
            cwd=REPO_ROOT,
            check=True,
        )

        backend_env = _parse_env(out_dir / "backend.env")
        metadata = _parse_env(out_dir / "metadata.env")

        assert backend_env["ENTRA_CLIENT_CERTIFICATE_THUMBPRINT"] == "ABCDEF1234567890ABCDEF1234567890ABCDEF12"
        assert backend_env["ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE"] == str(
            secret_dir / "entra_client_certificate_private_key"
        )
        assert "ENTRA_CLIENT_SECRET_FILE" not in backend_env
        assert metadata["ENTRA_GRAPH_CREDENTIAL_MODE"] == "certificate"


def test_renderer_rejects_partial_certificate_configuration() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-render-cert-invalid-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(
            config_path,
            ENTRA_CLIENT_CERTIFICATE_THUMBPRINT="ABCDEF1234567890ABCDEF1234567890ABCDEF12",
        )
        _write_secrets(secret_dir)

        result = subprocess.run(
            [
                "python3",
                str(RENDERER),
                "show-json",
                "--config",
                str(config_path),
                "--target",
                "docker",
                "--secret-dir",
                str(secret_dir),
                "--runtime-dir",
                str(runtime_dir),
            ],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is set but no valid entra_client_certificate_private_key" in output


def test_renderer_enforces_scheduler_singleton_runtime_contract() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-scheduler-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        runtime_out = tmp / "rendered"
        backend_unit = tmp / "riskhub-backend.service"
        scheduler_unit = tmp / "riskhub-scheduler.service"
        redis_unit = tmp / "riskhub-redis.service"
        _write_config(config_path, API_WORKERS="6")
        _write_secrets(secret_dir)

        subprocess.run(
            [
                "python3",
                str(RENDERER),
                "write-runtime",
                "--config",
                str(config_path),
                "--target",
                "linux",
                "--secret-dir",
                str(secret_dir),
                "--runtime-dir",
                str(runtime_dir),
                "--out-dir",
                str(runtime_out),
            ],
            cwd=REPO_ROOT,
            check=True,
        )
        backend_result = subprocess.run(
            [
                "python3",
                str(RENDERER),
                "render-linux-backend-unit",
                "--config",
                str(config_path),
                "--current-link",
                "/opt/riskhub/current",
                "--runtime-dir",
                str(runtime_dir),
                "--redis-service",
                "riskhub-redis",
            ],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        scheduler_result = subprocess.run(
            [
                "python3",
                str(RENDERER),
                "render-linux-scheduler-unit",
                "--current-link",
                "/opt/riskhub/current",
                "--runtime-dir",
                str(runtime_dir),
                "--redis-service",
                "riskhub-redis",
            ],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        redis_result = subprocess.run(
            [
                "python3",
                str(RENDERER),
                "render-linux-redis-unit",
                "--secret-dir",
                str(secret_dir),
            ],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        backend_unit.write_text(backend_result.stdout, encoding="utf-8")
        scheduler_unit.write_text(scheduler_result.stdout, encoding="utf-8")
        redis_unit.write_text(redis_result.stdout, encoding="utf-8")

        metadata = _parse_env(runtime_out / "metadata.env")

        assert metadata["SCHEDULER_ENABLED"] == "true"
        assert metadata["SCHEDULER_WORKERS"] == "1"
        assert metadata["SCHEDULER_BIND_PORT"] == "8001"
        assert "Environment=ENABLE_SCHEDULER=false" in backend_unit.read_text(encoding="utf-8")
        assert "--workers 6" in backend_unit.read_text(encoding="utf-8")
        assert "--port 8000" in backend_unit.read_text(encoding="utf-8")
        assert "Requires=riskhub-redis.service" in backend_unit.read_text(encoding="utf-8")
        assert "Environment=ENABLE_SCHEDULER=true" in scheduler_unit.read_text(encoding="utf-8")
        assert "--workers 1" in scheduler_unit.read_text(encoding="utf-8")
        assert "--port 8001" in scheduler_unit.read_text(encoding="utf-8")
        assert "ExecStart=redis-server /run/riskhub/redis.conf" in redis_unit.read_text(encoding="utf-8")
        assert str(secret_dir / "redis_password") in redis_unit.read_text(encoding="utf-8")


def test_renderer_rejects_invalid_api_workers() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-deploy-invalid-workers-") as td:
        tmp = Path(td)
        config_path = tmp / "riskhub.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_config(config_path, API_WORKERS="0")
        _write_secrets(secret_dir)

        result = subprocess.run(
            [
                "python3",
                str(RENDERER),
                "show-json",
                "--config",
                str(config_path),
                "--target",
                "docker",
                "--secret-dir",
                str(secret_dir),
                "--runtime-dir",
                str(runtime_dir),
            ],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

        output = f"{result.stdout}\n{result.stderr}"
        assert result.returncode != 0
        assert "API_WORKERS must be at least 1" in output
