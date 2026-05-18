"""Command builders for release parity runtime dry-run probes."""

from __future__ import annotations

import shlex
from typing import Any


def _quote(value: Any) -> str:
    return shlex.quote(str(value))


def deploy_cli_prod_docker_dry_run_command(
    *,
    runtime_dir: Any,
    config: Any,
    secret_dir: Any,
) -> str:
    return (
        f"RISKHUB_RUNTIME_DIR={_quote(runtime_dir)} "
        "./scripts/deploy.sh deploy --target docker "
        f"--config {_quote(config)} "
        f"--secret-dir {_quote(secret_dir)} "
        "--backend-image ghcr.io/example/riskhub-backend:release-parity "
        "--backend-db-image ghcr.io/example/riskhub-backend-db:release-parity "
        "--frontend-image ghcr.io/example/riskhub-frontend:release-parity "
        "--redis-image ghcr.io/example/riskhub-redis:release-parity "
        "--dry-run --yes"
    )


def backend_db_runtime_prod_dry_run_command(*, backend_env: Any, run_id: str) -> str:
    return (
        f"backend/scripts/runtime/db/prod.sh --backend-env {_quote(backend_env)} "
        f"--tag release-parity-{run_id} --dry-run --yes"
    )


def backend_runtime_prod_dry_run_command(*, backend_env: Any, run_id: str) -> str:
    return (
        f"backend/scripts/runtime/prod.sh --backend-env {_quote(backend_env)} "
        f"--tag release-parity-{run_id} --dry-run --yes"
    )


def frontend_runtime_prod_dry_run_command(*, frontend_env: Any, run_id: str) -> str:
    return (
        f"frontend/scripts/runtime/prod.sh --frontend-env {_quote(frontend_env)} "
        f"--tag release-parity-{run_id} --dry-run --yes"
    )
