from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
INSTALL_SCRIPT = REPO_ROOT / "scripts" / "install.sh"
COMPOSE_SCRIPT = REPO_ROOT / "scripts" / "compose.sh"
DEV_SCRIPT = REPO_ROOT / "scripts" / "dev.sh"
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy.sh"


def _run_install(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(INSTALL_SCRIPT), *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )


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


def test_install_help_lists_public_commands() -> None:
    result = _run_install("--help")
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "Usage: ./scripts/install.sh" in result.stdout
    assert "demo" in result.stdout
    assert "dev" in result.stdout
    assert "production" in result.stdout
    assert "verify" in result.stdout


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
    assert "curl -fsS http://localhost:8000/api/v1/health" in output
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


def test_manual_scripts_reference_install_wrapper_in_help_text() -> None:
    compose_text = COMPOSE_SCRIPT.read_text(encoding="utf-8")
    dev_text = DEV_SCRIPT.read_text(encoding="utf-8")
    deploy_text = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert "./scripts/install.sh demo" in compose_text
    assert "./scripts/install.sh dev" in dev_text
    assert "./scripts/install.sh production --target docker|linux" in deploy_text
