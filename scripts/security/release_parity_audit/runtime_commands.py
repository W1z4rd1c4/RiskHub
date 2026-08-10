"""Command builders for release parity runtime dry-run probes."""

from __future__ import annotations

import shlex
from typing import Any


def _quote(value: Any) -> str:
    return shlex.quote(str(value))


def _runtime_path_env(*, secret_dir: Any, runtime_dir: Any) -> str:
    return (
        f"RISKHUB_DEFAULT_SECRET_DIR={_quote(secret_dir)} "
        f"RISKHUB_RUNTIME_DIR={_quote(runtime_dir)}"
    )


def deploy_cli_prod_docker_dry_run_command(
    *,
    runtime_dir: Any,
    config: Any,
    secret_dir: Any,
) -> str:
    return (
        f"{_runtime_path_env(secret_dir=secret_dir, runtime_dir=runtime_dir)} "
        "./scripts/deploy.sh deploy --target docker "
        f"--config {_quote(config)} "
        f"--secret-dir {_quote(secret_dir)} "
        "--backend-image ghcr.io/example/riskhub-backend@sha256:0000000000000000000000000000000000000000000000000000000000000000 "
        "--backend-db-image ghcr.io/example/riskhub-backend-db@sha256:0000000000000000000000000000000000000000000000000000000000000000 "
        "--frontend-image ghcr.io/example/riskhub-frontend@sha256:0000000000000000000000000000000000000000000000000000000000000000 "
        "--redis-image ghcr.io/example/riskhub-redis@sha256:0000000000000000000000000000000000000000000000000000000000000000 "
        "--dry-run --yes"
    )


def backend_db_runtime_prod_dry_run_command(
    *, backend_env: Any, run_id: str, secret_dir: Any, runtime_dir: Any
) -> str:
    return (
        f"{_runtime_path_env(secret_dir=secret_dir, runtime_dir=runtime_dir)} "
        f"backend/scripts/runtime/db/prod.sh --backend-env {_quote(backend_env)} "
        f"--tag {_quote(f'release-parity-{run_id}')} --dry-run --yes"
    )


def backend_runtime_prod_dry_run_command(
    *, backend_env: Any, run_id: str, secret_dir: Any, runtime_dir: Any
) -> str:
    return (
        f"{_runtime_path_env(secret_dir=secret_dir, runtime_dir=runtime_dir)} "
        f"backend/scripts/runtime/prod.sh --backend-env {_quote(backend_env)} "
        f"--tag {_quote(f'release-parity-{run_id}')} --dry-run --yes"
    )


def frontend_runtime_prod_dry_run_command(
    *, frontend_env: Any, run_id: str, secret_dir: Any, runtime_dir: Any
) -> str:
    return (
        f"{_runtime_path_env(secret_dir=secret_dir, runtime_dir=runtime_dir)} "
        f"frontend/scripts/runtime/prod.sh --frontend-env {_quote(frontend_env)} "
        f"--tag {_quote(f'release-parity-{run_id}')} --dry-run --yes"
    )
