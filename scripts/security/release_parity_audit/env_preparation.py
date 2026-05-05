from __future__ import annotations

from pathlib import Path


def prepare_prod_env_files(tmp_dir: Path) -> tuple[Path, Path]:
    backend_env = tmp_dir / "backend.env"
    frontend_env = tmp_dir / "frontend.env"
    backend_env.write_text(
        "\n".join(
            [
                "DEBUG=false",
                "MOCK_AUTH_ENABLED=false",
                "AUTH_MODE=microsoft_sso",
                "SECRET_KEY=release-parity-audit-secret-key-32-characters",
                "DATABASE_URL=postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub",
                'CORS_ORIGINS=["https://riskhub.example.com"]',
                'ALLOWED_HOSTS=["riskhub.example.com"]',
                "REDIS_PASSWORD=release_parity_redis_password",
                "REDIS_URL=",
                "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
                "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
                "ENTRA_CLIENT_SECRET=release-parity-entra-client-secret",
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
    frontend_env.write_text(
        "\n".join(
            [
                "FRONTEND_HOST_PORT=28081",
                "FRONTEND_CONTAINER_PORT=80",
                "SERVER_NAME=riskhub.example.com",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return backend_env, frontend_env


def prepare_deploy_cli_prod_layout(tmp_dir: Path) -> tuple[Path, Path, Path]:
    config_path = tmp_dir / "riskhub.env"
    secret_dir = tmp_dir / "secrets"
    runtime_dir = tmp_dir / "runtime"

    config_path.write_text(
        "\n".join(
            [
                "PUBLIC_URL=https://riskhub.example.com",
                "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
                "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
                "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
                "BOOTSTRAP_CRO_EMAIL=cro@example.com",
                "API_WORKERS=4",
                "FRONTEND_BIND_PORT=28081",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    secret_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    secret_dir.chmod(0o750)
    runtime_dir.chmod(0o750)

    secrets = {
        "database_url": "postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub\n",
        "secret_key": "release-parity-audit-secret-key-32-characters\n",
        "entra_client_secret": "release-parity-entra-client-secret\n",
        "redis_password": "release_parity_redis_password\n",
    }
    for name, value in secrets.items():
        path = secret_dir / name
        path.write_text(value, encoding="utf-8")
        path.chmod(0o440)

    return config_path, secret_dir, runtime_dir
