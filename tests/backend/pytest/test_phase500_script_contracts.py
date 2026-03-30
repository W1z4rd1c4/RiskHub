"""Contract checks for retained and retired production script behavior."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
PROD_SCRIPTS_DIR = REPO_ROOT / "scripts" / "prod"
PROD_COMMON = PROD_SCRIPTS_DIR / "lib" / "common.sh"
PROD_SMOKE_TEST = PROD_SCRIPTS_DIR / "smoke_test.sh"
BACKEND_RUNTIME_PROD = REPO_ROOT / "backend" / "scripts" / "runtime" / "prod.sh"
BACKEND_DB_RUNTIME_PROD = REPO_ROOT / "backend" / "scripts" / "runtime" / "db" / "prod.sh"
FRONTEND_RUNTIME_PROD = REPO_ROOT / "frontend" / "scripts" / "runtime" / "prod.sh"
BACKEND_DOCKERFILE = REPO_ROOT / "backend" / "Dockerfile"
LINUX_BUNDLE_BUILDER = REPO_ROOT / "scripts" / "release" / "build_linux_bundle.sh"
RELEASE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release.yml"
MAKEFILE = REPO_ROOT / "scripts" / "Makefile"
PROD_READINESS_AUDIT = REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh"
DEV_COMPOSE = REPO_ROOT / "docker-compose.yml"
EXPECTED_PROD_BOOTSTRAP_SCRIPTS = (
    "__init__.py",
    "bootstrap_sso_user.py",
    "seed_departments.py",
    "seed_roles_permissions.py",
)
ACTIVE_DOCS = [
    REPO_ROOT / "AGENTS.md",
    REPO_ROOT / "docs" / "deployment" / "README.md",
    REPO_ROOT / "docs" / "deployment" / "advanced.md",
    REPO_ROOT / "docs" / "deployment" / "production.md",
    REPO_ROOT / "docs" / "deployment" / "reference.md",
    REPO_ROOT / "docs" / "deployment" / "security-checklist.md",
    REPO_ROOT / "docs" / "agent" / "README.md",
    REPO_ROOT / "docs" / "agent" / "AGENTS_DOC_COVERAGE.md",
    REPO_ROOT / ".planning" / "PROJECT.md",
    REPO_ROOT / ".planning" / "STATE.md",
    REPO_ROOT / ".planning" / "codebase" / "STRUCTURE.md",
    REPO_ROOT / ".planning" / "codebase" / "ARCHITECTURE.md",
    REPO_ROOT / ".planning" / "codebase" / "INTEGRATIONS.md",
    REPO_ROOT / ".planning" / "codebase" / "STACK.md",
    REPO_ROOT / "scripts" / "README.md",
    REPO_ROOT / "scripts" / "prod" / "README.md",
    REPO_ROOT / "scripts" / "prod" / "config" / "README.md",
    REPO_ROOT / "scripts" / "prod" / "config" / "backend.env.example",
    REPO_ROOT / "scripts" / "prod" / "config" / "frontend.env.example",
]
REMOVED_DEPLOYMENT_ARTIFACTS = [
    REPO_ROOT / "docs" / "deployment" / "docker-compose-prod.md",
    REPO_ROOT / "docs" / "deployment" / "kubernetes.md",
    REPO_ROOT / "docs" / "deployment" / "installation-manual.md",
    REPO_ROOT / "docs" / "deployment" / "external-postgres-install-scripts.md",
    REPO_ROOT / "docs" / "deployment" / "component-runtime-entrypoints.md",
    REPO_ROOT / "scripts" / "prod" / "setup.sh",
    REPO_ROOT / "scripts" / "prod" / "deploy.sh",
    REPO_ROOT / "scripts" / "prod" / "upgrade.sh",
    REPO_ROOT / "scripts" / "prod" / "stop.sh",
    REPO_ROOT / "docker-compose.prod.yml",
]


def _script_text(name: str) -> str:
    return (PROD_SCRIPTS_DIR / name).read_text(encoding="utf-8")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _run_runtime_help(path: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(path), "--help"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def test_preflight_exposes_allow_frontend_port_in_use_flag() -> None:
    text = _script_text("preflight.sh")
    assert "--allow-frontend-port-in-use" in text
    assert "allow_frontend_port_in_use=true" in text
    assert 'preflight_frontend_env "$FRONTEND_ENV" "$allow_frontend_port_in_use"' in text


def test_preflight_contains_frontend_port_validation_messages() -> None:
    text = _script_text("lib/preflight.sh")
    assert "FRONTEND_HOST_PORT must be between 1 and 65535" in text
    assert "FRONTEND_CONTAINER_PORT must be numeric" in text
    assert "FRONTEND_CONTAINER_PORT must be between 1 and 65535" in text


def test_bootstrap_db_uses_module_execution_for_seed_scripts() -> None:
    text = _script_text("bootstrap_db.sh")
    assert "python -m scripts.seed_roles_permissions" in text
    assert "python -m scripts.seed_departments" in text
    assert "python -m scripts.bootstrap_sso_user" in text


def test_backend_dockerfile_copies_only_bootstrap_scripts_and_uses_python_healthcheck() -> None:
    text = _read(BACKEND_DOCKERFILE)

    assert "COPY --chown=riskhub:riskhub scripts ./scripts" not in text
    assert "COPY requirements-db.txt ./requirements-db.txt" in text
    assert "pip install --no-cache-dir --user -r requirements-db.txt" in text
    assert "FROM python:3.13-alpine AS runtime" in text
    assert "FROM python:3.13-alpine AS dbtasks" not in text
    assert "COPY --from=builder-runtime" in text
    assert "COPY --from=builder-dbtasks" not in text
    assert "FROM runtime AS final" in text
    for script_name in EXPECTED_PROD_BOOTSTRAP_SCRIPTS:
        assert f"COPY --chown=riskhub:riskhub scripts/{script_name} ./scripts/{script_name}" in text

    assert text.count("libpq") == 1
    assert "\n    curl\n" not in text
    assert "urllib.request" in text
    assert "http://localhost:8000/api/v1/health" in text


def test_dev_compose_bootstrap_reuses_backend_runtime_image_and_backend_inherits_image_healthcheck() -> None:
    text = _read(DEV_COMPOSE)

    assert "bootstrap:" in text
    assert "target: dbtasks" not in text
    assert 'command: ["sh", "-lc", "python -m alembic upgrade head && python -m app.db.seed"]' in text

    backend_block = text.split("  backend:\n", 1)[1].split("  frontend:\n", 1)[0]
    assert "healthcheck:" not in backend_block
    assert 'test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]' not in backend_block


def test_linux_bundle_builder_stages_only_bootstrap_scripts_and_prunes_dotfiles() -> None:
    text = _read(LINUX_BUNDLE_BUILDER)

    assert 'cp -R "${REPO_ROOT}/backend/scripts" "${BACKEND_STAGE}/scripts"' not in text
    assert 'cp "${REPO_ROOT}/scripts/deploy.sh" "${SCRIPTS_STAGE}/deploy.sh"' in text
    assert 'cp -R "${REPO_ROOT}/scripts/deploy" "${SCRIPTS_STAGE}/deploy"' in text
    assert 'cp "${REPO_ROOT}/backend/requirements-runtime.txt" "${BACKEND_STAGE}/requirements-runtime.txt"' in text
    assert 'cp "${REPO_ROOT}/backend/requirements-db.txt" "${BACKEND_STAGE}/requirements-db.txt"' in text
    assert 'python3 -m pip download' in text
    assert '-r "${REPO_ROOT}/backend/requirements-db.txt"' in text
    for script_name in EXPECTED_PROD_BOOTSTRAP_SCRIPTS:
        assert f'cp "${{REPO_ROOT}}/backend/scripts/{script_name}" "${{BACKEND_STAGE}}/scripts/{script_name}"' in text

    assert "BACKEND_DB_STAGE" not in text
    assert "DEPLOY_STAGE" not in text
    assert 'find "${STAGE_ROOT}" -name ".DS_Store" -delete' in text


def test_prod_install_and_release_gates_assert_minimal_backend_artifact_contract() -> None:
    makefile_text = _read(MAKEFILE)
    workflow_text = _read(RELEASE_WORKFLOW)

    assert "riskhub-backend-db" not in makefile_text
    assert "riskhub-backend-db" not in workflow_text
    assert "seed_roles_permissions.py" in makefile_text
    assert "bootstrap_sso_user.py" in makefile_text
    assert "backend/scripts" in workflow_text
    assert "backend/requirements-db.txt" in workflow_text
    assert "scripts/deploy.sh" in workflow_text
    assert "scripts/deploy/templates/secrets/README.md" in workflow_text
    assert 'bash "${release_dir}/scripts/deploy.sh" install' in workflow_text
    assert "backend_db" not in workflow_text
    assert "db-venv" not in workflow_text

    for text in (makefile_text, workflow_text):
        assert "__init__.py" in text
        assert "bootstrap_sso_user.py" in text
        assert "seed_departments.py" in text
        assert "seed_roles_permissions.py" in text
        assert "hidden = sorted" in text
        assert ".DS_Store" not in text or "rglob" in text or "find " in text


def test_component_backend_prod_wrapper_uses_single_backend_image_for_db_lifecycle() -> None:
    text = _read(BACKEND_RUNTIME_PROD)

    assert "riskhub-backend-db" not in text
    assert "--backend-db-image" not in text
    assert "docker build --target dbtasks" not in text
    assert 'db_args=(--backend-env "$BACKEND_ENV" --backend-image "$backend_image")' in text


def test_install_backend_primes_logs_volume_for_non_root_runtime() -> None:
    common_text = _read(PROD_COMMON)
    backend_install_text = _script_text("install_backend.sh")

    assert "prepare_volume_ownership()" in common_text
    assert "--user 0:0" in common_text
    assert '--entrypoint sh \\' in common_text
    assert 'prepare_volume_ownership "$BACKEND_LOGS_VOLUME" "$backend_image" "/app/logs" "10001:10001"' in backend_install_text


def test_common_container_replace_prefers_graceful_stop_before_remove() -> None:
    common_text = _read(PROD_COMMON)

    assert 'docker inspect --format \'{{.State.Running}}\'' in common_text
    assert 'run docker stop -t 20 "$name" >/dev/null' in common_text
    assert 'run docker rm "$name" >/dev/null' in common_text
    assert 'run docker rm -f "$name" >/dev/null' not in common_text


def test_install_frontend_applies_capability_hardening() -> None:
    text = _script_text("install_frontend.sh")
    assert "--security-opt no-new-privileges" in text
    assert "--cap-drop ALL" in text
    assert "--cap-add NET_BIND_SERVICE" in text


def test_install_redis_passes_password_file_override_for_custom_secret_dir() -> None:
    text = _script_text("install_redis.sh")
    assert 'RISKHUB_REDIS_PASSWORD_FILE=${SECRET_DIR}/redis_password' in text


def test_install_redis_primes_data_volume_for_non_root_runtime() -> None:
    text = _script_text("install_redis.sh")
    assert 'prepare_volume_ownership "$REDIS_DATA_VOLUME" "$redis_image" "/data" "10001:10001"' in text


def test_smoke_test_probes_backend_docs_without_in_container_curl() -> None:
    text = _read(PROD_SMOKE_TEST)

    assert 'docker exec "$BACKEND_CONTAINER" curl' not in text
    assert 'docker exec %s curl' not in text
    assert 'backend_container_http_code "/docs"' in text
    assert 'backend_container_http_code "/openapi.json"' in text
    assert "urllib" in text


def test_prod_readiness_audit_uses_python_probe_for_backend_docs_checks() -> None:
    text = _read(PROD_READINESS_AUDIT)

    assert "docker exec riskhub-backend curl" not in text
    assert 'python - \'/docs\'' in text
    assert 'python - \'/openapi.json\'' in text
    assert "request.urlopen" in text


def test_removed_unsupported_deployment_artifacts_are_absent() -> None:
    for path in REMOVED_DEPLOYMENT_ARTIFACTS:
        assert not path.exists(), f"Unsupported deployment artifact should be removed: {path}"


@pytest.mark.parametrize(
    ("path", "default_var", "help_var"),
    [
        (BACKEND_RUNTIME_PROD, 'DEFAULT_BACKEND_ENV="${RUNTIME_DIR}/backend.env"', "Default: ${DEFAULT_BACKEND_ENV}"),
        (BACKEND_DB_RUNTIME_PROD, 'DEFAULT_BACKEND_ENV="${RUNTIME_DIR}/backend.env"', "Default: ${DEFAULT_BACKEND_ENV}"),
        (FRONTEND_RUNTIME_PROD, 'DEFAULT_FRONTEND_ENV="${RUNTIME_DIR}/frontend.env"', "Default: ${DEFAULT_FRONTEND_ENV}"),
    ],
)
def test_component_prod_wrappers_bind_default_env_paths_to_runtime_dir(
    path: Path,
    default_var: str,
    help_var: str,
) -> None:
    text = _read(path)

    assert default_var in text
    assert help_var in text
    assert "/etc/riskhub/backend.env" not in text
    assert "/etc/riskhub/frontend.env" not in text


@pytest.mark.parametrize(
    ("path", "expected_default"),
    [
        (BACKEND_RUNTIME_PROD, "Default: /etc/riskhub/runtime/backend.env"),
        (BACKEND_DB_RUNTIME_PROD, "Default: /etc/riskhub/runtime/backend.env"),
        (FRONTEND_RUNTIME_PROD, "Default: /etc/riskhub/runtime/frontend.env"),
    ],
)
def test_component_prod_wrappers_help_shows_runtime_dir_defaults(path: Path, expected_default: str) -> None:
    result = _run_runtime_help(path, env=os.environ.copy())
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert expected_default in output


@pytest.mark.parametrize(
    ("path", "expected_suffix"),
    [
        (BACKEND_RUNTIME_PROD, "backend.env"),
        (BACKEND_DB_RUNTIME_PROD, "backend.env"),
        (FRONTEND_RUNTIME_PROD, "frontend.env"),
    ],
)
def test_component_prod_wrappers_help_honors_runtime_dir_override(path: Path, expected_suffix: str) -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-runtime-help-") as td:
        env = os.environ.copy()
        env["RISKHUB_RUNTIME_DIR"] = td

        result = _run_runtime_help(path, env=env)
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert f"Default: {Path(td) / expected_suffix}" in output


def test_release_parity_audit_uses_install_cli_for_prod_runtime_path() -> None:
    text = _read(REPO_ROOT / "scripts" / "security" / "run_release_parity_audit.py")
    assert "./scripts/deploy.sh install --target docker" in text
    assert "install_cli_prod_docker" in text
    assert "--backend-db-image" not in text
    legacy_setup_mode_prod = "./scripts/" + "setup.sh --mode prod"
    forbidden = (
        legacy_setup_mode_prod,
        "setup_mode_prod",
        "path_setup_mode_prod_dryrun",
    )
    for token in forbidden:
        assert token not in text


def test_prod_readiness_audit_uses_deploy_cli_for_operator_lifecycle() -> None:
    text = _read(REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh")
    required = (
        "./scripts/deploy.sh install --target docker",
        "./scripts/deploy.sh doctor --target docker",
        "./scripts/deploy.sh upgrade --target docker",
        "./scripts/deploy.sh rollback --target docker",
    )
    for token in required:
        assert token in text

    legacy_setup_mode_prod = "./scripts/" + "setup.sh --mode prod"
    forbidden = (
        "./scripts/deploy.sh init --target docker",
        "./scripts/deploy.sh preflight --target docker",
        "./scripts/deploy.sh deploy --target docker",
        "./scripts/deploy.sh status --target docker",
        "./scripts/deploy.sh smoke --target docker",
        "--backend-db-image",
        "scripts/prod/setup.sh --",
        "scripts/prod/deploy.sh --",
        "scripts/prod/upgrade.sh --",
        "scripts/prod/stop.sh --",
        legacy_setup_mode_prod,
    )
    for token in forbidden:
        assert token not in text


def test_prod_readiness_audit_preserves_run_status_and_exit_finalization() -> None:
    text = _read(REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh")

    assert 'RUN_STATUS_JSON="$REPORTS_DIR/run_status.json"' in text
    assert 'REPORT_ARTIFACT_PATH="$REPORTS_DIR/report.md"' in text
    assert "write_locked_file()" in text
    assert "emit_incomplete_artifacts()" in text
    assert "trap finalize_on_exit EXIT" in text


def test_redis_entrypoint_allows_passthrough_commands_for_image_contract_checks() -> None:
    text = _read(REPO_ROOT / "docker" / "redis" / "entrypoint.sh")

    assert 'if [ "$#" -gt 0 ] && [ "$1" != "redis-server" ]; then' in text
    assert 'exec "$@"' in text


def test_active_docs_do_not_reference_removed_or_unsupported_deployment_paths() -> None:
    forbidden_tokens = (
        "scripts/prod/setup.sh",
        "scripts/prod/deploy.sh",
        "scripts/prod/upgrade.sh",
        "scripts/prod/stop.sh",
        "component-runtime-entrypoints.md",
        "docker-compose.prod.yml",
        "docs/deployment/docker-compose-prod.md",
        "docs/deployment/kubernetes.md",
        "docs/deployment/installation-manual.md",
        "docs/deployment/external-postgres-install-scripts.md",
        "Docker/K8s",
        "Docker + K8s",
    )
    for path in ACTIVE_DOCS:
        text = _read(path)
        for token in forbidden_tokens:
            assert token not in text, f"Unsupported deployment reference in {path}: {token}"
