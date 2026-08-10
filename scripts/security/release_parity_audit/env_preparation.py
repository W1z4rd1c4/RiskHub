from __future__ import annotations

from pathlib import Path


def prepare_prod_env_files(
    tmp_dir: Path, *, secret_dir: Path, runtime_dir: Path
) -> tuple[Path, Path]:
    backend_env = tmp_dir / "backend.env"
    frontend_env = tmp_dir / "frontend.env"
    backend_env.write_text(
        "\n".join(
            [
                "DEBUG=false",
                "MOCK_AUTH_ENABLED=false",
                "AUTH_MODE=microsoft_sso",
                "DIRECTORY_PROVIDER=graph",
                f"SECRET_KEY_FILE={secret_dir / 'secret_key'}",
                f"DATABASE_URL_FILE={secret_dir / 'database_url'}",
                'CORS_ORIGINS=["https://riskhub.example.com"]',
                'ALLOWED_HOSTS=["riskhub.example.com"]',
                f"REDIS_URL_FILE={runtime_dir / 'redis_url'}",
                "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
                "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
                f"ENTRA_CLIENT_SECRET_FILE={secret_dir / 'entra_client_secret'}",
                "ENTRA_JIT_PROVISIONING_ENABLED=false",
                "AUTH_SSO_ALLOW_EMAIL_LINK=false",
                "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
                "BOOTSTRAP_ADMIN_ROLE=admin",
                "BOOTSTRAP_ADMIN_ACCESS_SCOPE=global",
                "BOOTSTRAP_ADMIN_EXTERNAL_ID=11111111-2222-4333-8444-555555555555",
                "BOOTSTRAP_CRO_EMAIL=cro@example.com",
                "BOOTSTRAP_CRO_ACCESS_SCOPE=global",
                "BOOTSTRAP_CRO_EXTERNAL_ID=66666666-7777-4888-8999-aaaaaaaaaaaa",
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
                "BOOTSTRAP_ADMIN_EXTERNAL_ID=11111111-2222-4333-8444-555555555555",
                "BOOTSTRAP_CRO_EMAIL=cro@example.com",
                "BOOTSTRAP_CRO_EXTERNAL_ID=66666666-7777-4888-8999-aaaaaaaaaaaa",
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
    redis_url = runtime_dir / "redis_url"
    redis_url.write_text(
        "redis://:release_parity_redis_password@redis:6379/0\n", encoding="utf-8"
    )
    redis_url.chmod(0o440)

    return config_path, secret_dir, runtime_dir
