"""Startup inventory helpers for release parity audit."""

from __future__ import annotations

from typing import Any


def build_startup_inventory() -> list[dict[str, Any]]:
    return [
        {
            "id": "dev_sh_full",
            "entrypoint": "scripts/dev.sh",
            "mode": "full",
            "command": "./scripts/dev.sh --daemon",
            "type": "runtime",
        },
        {
            "id": "dev_sh_backend",
            "entrypoint": "scripts/dev.sh",
            "mode": "backend",
            "command": "./scripts/dev.sh --backend",
            "type": "runtime",
        },
        {
            "id": "compose_sh_up_full",
            "entrypoint": "scripts/compose.sh",
            "mode": "full",
            "command": "./scripts/compose.sh up",
            "type": "runtime",
        },
        {
            "id": "compose_sh_up_db_only",
            "entrypoint": "scripts/compose.sh",
            "mode": "db_only",
            "command": "./scripts/compose.sh up --profile db-only",
            "type": "runtime",
        },
        {
            "id": "compose_sh_reset_test",
            "entrypoint": "scripts/compose.sh",
            "mode": "test",
            "command": "./scripts/compose.sh reset --dataset test",
            "type": "runtime",
        },
        {
            "id": "deploy_cli_prod_docker",
            "entrypoint": "scripts/deploy.sh",
            "mode": "prod_docker",
            "command": (
                "./scripts/deploy.sh deploy --target docker --config /etc/riskhub/riskhub.env "
                "--secret-dir /etc/riskhub/secrets --version <version>"
            ),
            "type": "runtime",
        },
        {
            "id": "backend_runtime_dev",
            "entrypoint": "backend/scripts/runtime/dev.sh",
            "mode": "dev",
            "command": "backend/scripts/runtime/dev.sh",
            "type": "runtime",
        },
        {
            "id": "backend_runtime_test",
            "entrypoint": "backend/scripts/runtime/test.sh",
            "mode": "test",
            "command": "backend/scripts/runtime/test.sh",
            "type": "runtime",
        },
        {
            "id": "backend_runtime_prod",
            "entrypoint": "backend/scripts/runtime/prod.sh",
            "mode": "prod",
            "command": "backend/scripts/runtime/prod.sh --tag <tag>",
            "type": "runtime",
        },
        {
            "id": "backend_db_runtime_dev",
            "entrypoint": "backend/scripts/runtime/db/dev.sh",
            "mode": "dev",
            "command": "backend/scripts/runtime/db/dev.sh",
            "type": "runtime",
        },
        {
            "id": "backend_db_runtime_test",
            "entrypoint": "backend/scripts/runtime/db/test.sh",
            "mode": "test",
            "command": "backend/scripts/runtime/db/test.sh --yes",
            "type": "runtime",
        },
        {
            "id": "backend_db_runtime_prod",
            "entrypoint": "backend/scripts/runtime/db/prod.sh",
            "mode": "prod",
            "command": "backend/scripts/runtime/db/prod.sh --tag <tag>",
            "type": "runtime",
        },
        {
            "id": "frontend_runtime_dev",
            "entrypoint": "frontend/scripts/runtime/dev.sh",
            "mode": "dev",
            "command": "frontend/scripts/runtime/dev.sh",
            "type": "runtime",
        },
        {
            "id": "frontend_runtime_test",
            "entrypoint": "frontend/scripts/runtime/test.sh",
            "mode": "test",
            "command": "frontend/scripts/runtime/test.sh",
            "type": "runtime",
        },
        {
            "id": "frontend_runtime_prod",
            "entrypoint": "frontend/scripts/runtime/prod.sh",
            "mode": "prod",
            "command": "frontend/scripts/runtime/prod.sh --tag <tag>",
            "type": "runtime",
        },
        {
            "id": "ci_e2e",
            "entrypoint": ".github/workflows/e2e.yml",
            "mode": "ci",
            "command": "workflow",
            "type": "ci",
        },
        {
            "id": "ci_lint",
            "entrypoint": ".github/workflows/lint.yml",
            "mode": "ci",
            "command": "workflow",
            "type": "ci",
        },
        {
            "id": "ci_security",
            "entrypoint": ".github/workflows/security.yml",
            "mode": "ci",
            "command": "workflow",
            "type": "ci",
        },
        {
            "id": "prod_readiness",
            "entrypoint": "scripts/security/run_prod_readiness_audit_local.sh",
            "mode": "prod-sim",
            "command": "scripts/security/run_prod_readiness_audit_local.sh",
            "type": "runtime",
        },
    ]
