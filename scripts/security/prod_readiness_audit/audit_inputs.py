from __future__ import annotations

import argparse
from pathlib import Path

from prod_readiness_audit.run_state import ProdReadinessRunState


def _write_locked_file(path: Path, content: str, mode: int = 0o440) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.parent / f".{path.name}.tmp"
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.chmod(mode)
    tmp_path.replace(path)


def write_audit_input_files(
    *,
    config_path: Path,
    secret_dir: Path,
    runtime_dir: Path,
    postgres_port: int,
    frontend_host_port: int,
) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        "\n".join(
            [
                "PUBLIC_URL=https://riskhub.example.com",
                "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
                "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
                "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
                "BOOTSTRAP_CRO_EMAIL=cro@example.com",
                "API_WORKERS=4",
                f"FRONTEND_BIND_PORT={frontend_host_port}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    config_path.chmod(0o600)
    secret_dir.mkdir(parents=True, exist_ok=True)
    secret_dir.chmod(0o750)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.chmod(0o750)

    _write_locked_file(
        secret_dir / "database_url",
        f"postgresql+asyncpg://riskhub:riskhub_audit@host.docker.internal:{postgres_port}/riskhub\n",
    )
    _write_locked_file(secret_dir / "secret_key", "phase500-local-test-key-phase500-local-test\n")
    _write_locked_file(secret_dir / "entra_client_secret", "phase500-test-entra-client-secret\n")
    _write_locked_file(secret_dir / "redis_password", "riskhub_audit_redis_password\n")
    _write_locked_file(runtime_dir / "redis_url", "redis://:riskhub_audit_redis_password@redis:6379/0\n")

    (config_path.parent / "backend_valid.env").write_text(
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
    (config_path.parent / "frontend_invalid_host.env").write_text(
        "\n".join(
            [
                "FRONTEND_HOST_PORT=70000",
                "FRONTEND_CONTAINER_PORT=80",
                "SERVER_NAME=riskhub.example.com",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (config_path.parent / "frontend_invalid_container.env").write_text(
        "\n".join(
            [
                f"FRONTEND_HOST_PORT={frontend_host_port}",
                "FRONTEND_CONTAINER_PORT=abc",
                "SERVER_NAME=riskhub.example.com",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def write_audit_inputs(state: ProdReadinessRunState) -> None:
    write_audit_input_files(
        config_path=state.config_path,
        secret_dir=state.secret_dir,
        runtime_dir=state.runtime_dir,
        postgres_port=state.postgres_port,
        frontend_host_port=state.frontend_host_port,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write local production-readiness audit inputs")
    parser.add_argument("--config-path", type=Path, required=True)
    parser.add_argument("--secret-dir", type=Path, required=True)
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--postgres-port", type=int, required=True)
    parser.add_argument("--frontend-host-port", type=int, required=True)
    args = parser.parse_args(argv)

    write_audit_input_files(
        config_path=args.config_path,
        secret_dir=args.secret_dir,
        runtime_dir=args.runtime_dir,
        postgres_port=args.postgres_port,
        frontend_host_port=args.frontend_host_port,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
