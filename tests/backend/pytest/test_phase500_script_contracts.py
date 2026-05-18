"""Contract checks for retained and retired production script behavior."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
PROD_SCRIPTS_DIR = REPO_ROOT / "scripts" / "prod"
BACKEND_RUNTIME_PROD = REPO_ROOT / "backend" / "scripts" / "runtime" / "prod.sh"
BACKEND_DB_RUNTIME_PROD = REPO_ROOT / "backend" / "scripts" / "runtime" / "db" / "prod.sh"
FRONTEND_RUNTIME_PROD = REPO_ROOT / "frontend" / "scripts" / "runtime" / "prod.sh"
BACKEND_DOCKERFILE = REPO_ROOT / "backend" / "Dockerfile"
LINUX_BUNDLE_BUILDER = REPO_ROOT / "scripts" / "release" / "build_linux_bundle.sh"
RELEASE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release.yml"
MAKEFILE = REPO_ROOT / "scripts" / "Makefile"
DEV_COMPOSE = REPO_ROOT / "docker-compose.yml"
RELEASE_PARITY_AUDIT_DIR = REPO_ROOT / "scripts" / "security" / "release_parity_audit"
RELEASE_PARITY_AUDIT_RUNTIME = RELEASE_PARITY_AUDIT_DIR / "runtime.py"
FRONTEND_DOCKERFILE = REPO_ROOT / "frontend" / "Dockerfile"
SECURITY_SCRIPTS_DIR = REPO_ROOT / "scripts" / "security"
EXPECTED_PROD_BOOTSTRAP_SCRIPTS = (
    "__init__.py",
    "bootstrap_sso_user.py",
    "revoke_refresh_sessions.py",
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


def _read_release_parity_package() -> str:
    return "\n".join(path.read_text(encoding="utf-8") for path in sorted(RELEASE_PARITY_AUDIT_DIR.glob("*.py")))


if str(SECURITY_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SECURITY_SCRIPTS_DIR))


def _write_clean_supply_chain_reports(reports_dir: Path) -> None:
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / "trivy-backend.json").write_text('{"Results": []}\n', encoding="utf-8")
    (reports_dir / "trivy-frontend.json").write_text('{"Results": []}\n', encoding="utf-8")
    (reports_dir / "grype-backend.json").write_text('{"matches": []}\n', encoding="utf-8")
    (reports_dir / "gitleaks-report.json").write_text("[]\n", encoding="utf-8")


def _write_protocol_probe_results(state, *, unresolved: int = 0, security_defects: int = 0) -> Path:
    probe_results = state.tmp_dir / "protocol" / "probe-results.json"
    probe_results.parent.mkdir(parents=True, exist_ok=True)
    probe_results.write_text(
        (
            "{\n"
            '  "summary": {\n'
            f'    "unresolved_contract_drift_count": {unresolved},\n'
            f'    "security_defect_count": {security_defects}\n'
            "  }\n"
            "}\n"
        ),
        encoding="utf-8",
    )
    (state.log_dir / "p2_security_contract_probe.log").write_text(
        f"wrote protocol probe output to {probe_results}\n",
        encoding="utf-8",
    )
    return probe_results


def _command_row(command_id: str, rc: int = 0, required: bool = True) -> dict[str, object]:
    return {
        "id": command_id,
        "command": command_id,
        "cwd": str(REPO_ROOT),
        "start_utc": "2026-05-05T00:00:00+00:00",
        "end_utc": "2026-05-05T00:00:01+00:00",
        "duration_sec": 1.0,
        "rc": rc,
        "log": "",
        "required": required,
        "timeout_sec": 120,
    }


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
    assert "FROM python:3.13-alpine AS runtime" in text
    assert "FROM python:3.13-alpine AS dbtasks" in text
    assert "COPY --from=builder-runtime" in text
    assert "COPY --from=builder-dbtasks" in text
    assert "FROM runtime AS final" in text
    for script_name in EXPECTED_PROD_BOOTSTRAP_SCRIPTS:
        assert f"COPY --chown=riskhub:riskhub scripts/{script_name} ./scripts/{script_name}" in text

    assert text.count("libpq") == 1
    assert "\n    curl\n" not in text
    assert "urllib.request" in text
    assert "http://localhost:8000/api/v1/livez" in text
    assert "http://localhost:8000/api/v1/readyz" not in text


def test_dev_compose_bootstrap_uses_dbtasks_target_and_backend_inherits_image_healthcheck() -> None:
    text = _read(DEV_COMPOSE)

    assert "bootstrap:" in text
    assert "target: dbtasks" in text
    assert 'command: ["sh", "-lc", "python -m alembic upgrade head && python -m app.db.seed"]' in text

    backend_block = text.split("  backend:\n", 1)[1].split("  frontend:\n", 1)[0]
    assert "healthcheck:" not in backend_block
    assert 'test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]' not in backend_block


def test_linux_bundle_builder_stages_only_bootstrap_scripts_and_prunes_dotfiles() -> None:
    text = _read(LINUX_BUNDLE_BUILDER)

    assert 'cp -R "${REPO_ROOT}/backend/scripts" "${BACKEND_STAGE}/scripts"' not in text
    assert 'cp -R "${REPO_ROOT}/backend/scripts" "${BACKEND_DB_STAGE}/scripts"' not in text
    assert 'cp "${REPO_ROOT}/backend/requirements-runtime.txt" "${BACKEND_STAGE}/requirements-runtime.txt"' in text
    assert "python3 -m pip download" in text
    assert '-r "${REPO_ROOT}/backend/requirements-db.txt"' in text
    for script_name in EXPECTED_PROD_BOOTSTRAP_SCRIPTS:
        assert (
            f'cp "${{REPO_ROOT}}/backend/scripts/{script_name}" "${{BACKEND_DB_STAGE}}/scripts/{script_name}"' in text
        )

    assert "../backend/requirements-runtime.txt" in text
    assert 'find "${STAGE_ROOT}" -name ".DS_Store" -delete' in text


def test_prod_install_and_release_gates_assert_minimal_backend_artifact_contract() -> None:
    makefile_text = _read(MAKEFILE)
    workflow_text = _read(RELEASE_WORKFLOW)

    assert "riskhub-backend-db" in makefile_text
    assert "riskhub-backend-db" in workflow_text
    assert "backend_db" in workflow_text
    assert "db-venv" in workflow_text

    for text in (makefile_text, workflow_text):
        assert "__init__.py" in text
        assert "bootstrap_sso_user.py" in text
        assert "revoke_refresh_sessions.py" in text
        assert "seed_departments.py" in text
        assert "seed_roles_permissions.py" in text
        assert "hidden = sorted" in text
        assert ".DS_Store" not in text or "rglob" in text or "find " in text


def test_install_frontend_applies_capability_hardening() -> None:
    text = _script_text("install_frontend.sh")
    assert "--security-opt no-new-privileges" in text
    assert "--cap-drop ALL" in text
    assert "--cap-add NET_BIND_SERVICE" in text


def test_frontend_dockerfile_uses_legacy_peer_resolution_for_container_builds() -> None:
    text = _read(FRONTEND_DOCKERFILE)
    assert "npm ci --include=dev --legacy-peer-deps" in text


def test_install_redis_passes_password_file_override_for_custom_secret_dir() -> None:
    text = _script_text("install_redis.sh")
    assert "RISKHUB_REDIS_PASSWORD_FILE=${SECRET_DIR}/redis_password" in text


def test_removed_unsupported_deployment_artifacts_are_absent() -> None:
    for path in REMOVED_DEPLOYMENT_ARTIFACTS:
        assert not path.exists(), f"Unsupported deployment artifact should be removed: {path}"


@pytest.mark.parametrize(
    ("path", "default_var", "help_var"),
    [
        (BACKEND_RUNTIME_PROD, 'DEFAULT_BACKEND_ENV="${RUNTIME_DIR}/backend.env"', "Default: ${DEFAULT_BACKEND_ENV}"),
        (
            BACKEND_DB_RUNTIME_PROD,
            'DEFAULT_BACKEND_ENV="${RUNTIME_DIR}/backend.env"',
            "Default: ${DEFAULT_BACKEND_ENV}",
        ),
        (
            FRONTEND_RUNTIME_PROD,
            'DEFAULT_FRONTEND_ENV="${RUNTIME_DIR}/frontend.env"',
            "Default: ${DEFAULT_FRONTEND_ENV}",
        ),
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


def test_release_parity_audit_uses_deploy_cli_for_prod_runtime_path() -> None:
    runtime_text = _read(RELEASE_PARITY_AUDIT_RUNTIME)
    assert "deploy_cli_prod_docker" in runtime_text
    text = _read_release_parity_package()
    assert "./scripts/deploy.sh deploy --target docker" in text
    legacy_setup_mode_prod = "./scripts/" + "setup.sh --mode prod"
    forbidden = (
        legacy_setup_mode_prod,
        "setup_mode_prod",
        "path_setup_mode_prod_dryrun",
    )
    for token in forbidden:
        assert token not in text


def test_prod_readiness_audit_uses_deploy_cli_for_operator_lifecycle() -> None:
    shell_text = _read(REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh")
    phase_text = _read(REPO_ROOT / "scripts" / "security" / "prod_readiness_audit" / "phases.py")
    package_text = shell_text + phase_text
    assert "prod_readiness_audit.cli" in shell_text

    required = (
        "./scripts/deploy.sh init --target docker",
        "./scripts/deploy.sh preflight --target docker",
        "./scripts/deploy.sh deploy --target docker",
        "./scripts/deploy.sh upgrade --target docker",
        "./scripts/deploy.sh rollback --target docker",
        "./scripts/deploy.sh smoke --target docker",
        "./scripts/deploy.sh status --target docker",
    )
    for token in required:
        assert token in package_text

    legacy_setup_mode_prod = "./scripts/" + "setup.sh --mode prod"
    forbidden = (
        "scripts/prod/setup.sh --",
        "scripts/prod/deploy.sh --",
        "scripts/prod/upgrade.sh --",
        "scripts/prod/stop.sh --",
        legacy_setup_mode_prod,
    )
    for token in forbidden:
        assert token not in package_text


def test_prod_readiness_phase_plan_prepares_config_and_images_before_preflight_and_deploy() -> None:
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_run_state

    state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
    phases = build_prod_readiness_phases(state)
    command_ids = [command.command_id for phase in phases for command in phase.commands]
    commands_by_id = {command.command_id: command.command for phase in phases for command in phase.commands}

    assert command_ids.index("p2_deploy_cli_init") < command_ids.index("p2_populate_audit_config")
    assert command_ids.index("p2_populate_audit_config") < command_ids.index("p3_cli_preflight")
    assert command_ids.index("p3_build_push_backend_deploy") < command_ids.index("p3_cli_deploy")
    assert command_ids.index("p3_build_push_backend_db_deploy") < command_ids.index("p3_cli_deploy")
    assert command_ids.index("p3_build_push_frontend_deploy") < command_ids.index("p3_cli_deploy")
    assert command_ids.index("p3_build_push_redis_deploy") < command_ids.index("p3_cli_deploy")
    assert command_ids.index("p3_build_push_backend_upgrade") < command_ids.index("p3_cli_upgrade")
    assert command_ids.index("p3_build_push_backend_db_upgrade") < command_ids.index("p3_cli_upgrade")
    assert command_ids.index("p3_build_push_frontend_upgrade") < command_ids.index("p3_cli_upgrade")
    assert command_ids.index("p3_build_push_redis_upgrade") < command_ids.index("p3_cli_upgrade")
    assert "127.0.0.1:" in commands_by_id["p3_cli_deploy"]
    assert "127.0.0.1:" in commands_by_id["p3_cli_upgrade"]


def test_prod_readiness_phase_plan_restores_negative_probes_and_runtime_verification() -> None:
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_run_state

    state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
    phases = build_prod_readiness_phases(state)
    command_ids = [command.command_id for phase in phases for command in phase.commands]
    commands_by_id = {command.command_id: command for phase in phases for command in phase.commands}

    for command_id in (
        "p2_unsupported_prod_artifacts_absent",
        "p2_preflight_invalid_host_range",
        "p2_preflight_invalid_container_port",
    ):
        assert command_id in command_ids
        assert commands_by_id[command_id].required is False
        assert command_ids.index("p2_populate_audit_config") < command_ids.index(command_id)

    assert command_ids.index("p3_status_after_deploy") < command_ids.index("p3_verify_runtime")
    assert command_ids.index("p3_verify_runtime") < command_ids.index("p3_cli_smoke_after_deploy")


def test_prod_readiness_audit_restores_full_supply_chain_gates() -> None:
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_run_state

    state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
    supply_chain = next(phase for phase in build_prod_readiness_phases(state) if phase.name == "supply_chain")
    command_ids = {command.command_id for command in supply_chain.commands}
    command_text = "\n".join(command.command for command in supply_chain.commands)

    assert {
        "p4_bandit_high_gate",
        "p4_pip_audit",
        "p4_npm_audit_high",
        "p4_trivy_backend",
        "p4_trivy_frontend",
        "p4_syft_backend",
        "p4_grype_backend",
        "p4_gitleaks_scan",
    }.issubset(command_ids)
    assert ":latest" not in command_text


def test_prod_readiness_audit_input_writer_replaces_init_placeholders() -> None:
    from prod_readiness_audit.audit_inputs import write_audit_inputs
    from prod_readiness_audit.run_state import build_run_state

    with tempfile.TemporaryDirectory(prefix="riskhub-prod-readiness-inputs-") as td:
        state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
        state.artifact_root = Path(td)
        state.ensure_directories()

        write_audit_inputs(state)

        assert "CHANGE_ME" not in state.config_path.read_text(encoding="utf-8")
        assert "CHANGE_ME" not in (state.secret_dir / "database_url").read_text(encoding="utf-8")
        assert (state.secret_dir / "secret_key").read_text(encoding="utf-8").strip()
        assert (state.secret_dir / "redis_password").read_text(encoding="utf-8").strip()
        assert (state.runtime_dir / "redis_url").read_text(encoding="utf-8").strip()
        assert (state.tmp_dir / "backend_valid.env").exists()
        assert "FRONTEND_HOST_PORT=70000" in (state.tmp_dir / "frontend_invalid_host.env").read_text(
            encoding="utf-8"
        )
        assert "FRONTEND_CONTAINER_PORT=abc" in (state.tmp_dir / "frontend_invalid_container.env").read_text(
            encoding="utf-8"
        )


def test_prod_readiness_scoring_fails_semantic_mandatory_control_regressions() -> None:
    from prod_readiness_audit.run_state import build_run_state
    from prod_readiness_audit.scoring import score_command_results

    with tempfile.TemporaryDirectory(prefix="riskhub-prod-readiness-scoring-fail-") as td:
        state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
        state.artifact_root = Path(td)
        state.ensure_directories()
        _write_clean_supply_chain_reports(state.reports_dir)
        _write_protocol_probe_results(state)
        (state.log_dir / "p3_frontend_uid.log").write_text("0\n", encoding="utf-8")
        (state.log_dir / "p3_backend_docs_code.log").write_text("200\n", encoding="utf-8")
        (state.log_dir / "p3_backend_openapi_code.log").write_text("200\n", encoding="utf-8")
        state.command_results = [
            _command_row("p2_security_contract_probe"),
            _command_row("p2_preflight_invalid_host_range", rc=0, required=False),
            _command_row("p2_preflight_invalid_container_port", rc=0, required=False),
            _command_row("p2_unsupported_prod_artifacts_absent", rc=0, required=False),
            _command_row("p3_cli_preflight"),
            _command_row("p3_cli_deploy"),
            _command_row("p3_status_after_deploy"),
            _command_row("p3_cli_smoke_after_deploy"),
            _command_row("p3_cli_upgrade"),
            _command_row("p3_cli_rollback"),
            _command_row("p3_cli_smoke_after_rollback"),
            _command_row("p3_backend_docs_code"),
            _command_row("p3_backend_openapi_code"),
            _command_row("p3_frontend_uid"),
        ]

        findings, _scorecard = score_command_results(state)

    finding_ids = {str(finding["id"]) for finding in findings}
    assert {"MC-06", "MC-08", "MC-09", "MC-10"}.issubset(finding_ids)


def test_prod_readiness_scoring_fails_protocol_probe_summary_regressions() -> None:
    from prod_readiness_audit.run_state import build_run_state
    from prod_readiness_audit.scoring import score_command_results

    with tempfile.TemporaryDirectory(prefix="riskhub-prod-readiness-scoring-protocol-") as td:
        state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
        state.artifact_root = Path(td)
        state.ensure_directories()
        _write_clean_supply_chain_reports(state.reports_dir)
        _write_protocol_probe_results(state, unresolved=2, security_defects=1)
        (state.log_dir / "p3_frontend_uid.log").write_text("101\n", encoding="utf-8")
        (state.log_dir / "p3_backend_docs_code.log").write_text("404\n", encoding="utf-8")
        (state.log_dir / "p3_backend_openapi_code.log").write_text("404\n", encoding="utf-8")
        state.command_results = [
            _command_row("p2_security_contract_probe"),
            _command_row("p2_preflight_invalid_host_range", rc=1, required=False),
            _command_row("p2_preflight_invalid_container_port", rc=1, required=False),
            _command_row("p2_unsupported_prod_artifacts_absent", rc=0, required=False),
            _command_row("p3_cli_preflight"),
            _command_row("p3_cli_deploy"),
            _command_row("p3_status_after_deploy"),
            _command_row("p3_verify_runtime"),
            _command_row("p3_cli_smoke_after_deploy"),
            _command_row("p3_cli_upgrade"),
            _command_row("p3_cli_rollback"),
            _command_row("p3_cli_smoke_after_rollback"),
            _command_row("p3_backend_docs_code"),
            _command_row("p3_backend_openapi_code"),
            _command_row("p3_frontend_uid"),
        ]

        findings, _scorecard = score_command_results(state)

    matching = [finding for finding in findings if finding["id"] == "MC-11"]
    assert matching
    assert matching[0]["details"] == {"unresolved_contract_drift_count": 2, "security_defect_count": 1}


def test_prod_readiness_scoring_passes_semantic_mandatory_controls() -> None:
    from prod_readiness_audit.run_state import build_run_state
    from prod_readiness_audit.scoring import score_command_results

    with tempfile.TemporaryDirectory(prefix="riskhub-prod-readiness-scoring-pass-") as td:
        state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
        state.artifact_root = Path(td)
        state.ensure_directories()
        _write_clean_supply_chain_reports(state.reports_dir)
        _write_protocol_probe_results(state)
        (state.log_dir / "p3_frontend_uid.log").write_text("101\n", encoding="utf-8")
        (state.log_dir / "p3_backend_docs_code.log").write_text("404\n", encoding="utf-8")
        (state.log_dir / "p3_backend_openapi_code.log").write_text("404\n", encoding="utf-8")
        state.command_results = [
            _command_row("p2_security_contract_probe"),
            _command_row("p2_preflight_invalid_host_range", rc=1, required=False),
            _command_row("p2_preflight_invalid_container_port", rc=1, required=False),
            _command_row("p2_unsupported_prod_artifacts_absent", rc=0, required=False),
            _command_row("p3_cli_preflight"),
            _command_row("p3_cli_deploy"),
            _command_row("p3_status_after_deploy"),
            _command_row("p3_verify_runtime"),
            _command_row("p3_cli_smoke_after_deploy"),
            _command_row("p3_cli_upgrade"),
            _command_row("p3_cli_rollback"),
            _command_row("p3_cli_smoke_after_rollback"),
            _command_row("p3_backend_docs_code"),
            _command_row("p3_backend_openapi_code"),
            _command_row("p3_frontend_uid"),
        ]

        findings, _scorecard = score_command_results(state)

    assert findings == []


def test_prod_readiness_timeout_records_matrix_row_and_continues(monkeypatch: pytest.MonkeyPatch) -> None:
    from prod_readiness_audit.commands import ProdReadinessCommand, run_command
    from prod_readiness_audit.run_state import build_run_state

    def raise_timeout(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(
            cmd="sleep 10",
            timeout=1,
            output="partial stdout",
            stderr="partial stderr",
        )

    monkeypatch.setattr(subprocess, "run", raise_timeout)
    with tempfile.TemporaryDirectory(prefix="riskhub-prod-readiness-timeout-") as td:
        state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
        state.artifact_root = Path(td)
        state.ensure_directories()

        row = run_command(
            state,
            ProdReadinessCommand("non_required_timeout", "sleep 10", required=False, timeout_sec=1),
        )

        assert row["rc"] == 124
        assert row["timed_out"] is True
        assert state.required_failures == 0
        assert "partial stdout" in (state.log_dir / "non_required_timeout.log").read_text(encoding="utf-8")
        assert '"timed_out": true' in state.matrix_ndjson.read_text(encoding="utf-8")

        run_command(state, ProdReadinessCommand("required_timeout", "sleep 10", timeout_sec=1))

        assert state.required_failures == 1


def test_prod_readiness_audit_preserves_run_status_and_exit_finalization() -> None:
    shell_text = _read(REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh")
    run_state_text = _read(REPO_ROOT / "scripts" / "security" / "prod_readiness_audit" / "run_state.py")
    artifacts_text = _read(REPO_ROOT / "scripts" / "security" / "prod_readiness_audit" / "artifacts.py")
    cli_text = _read(REPO_ROOT / "scripts" / "security" / "prod_readiness_audit" / "cli.py")

    assert "python3 -m prod_readiness_audit.cli" in shell_text
    assert 'return self.reports_dir / "run_status.json"' in run_state_text
    assert 'return self.reports_dir / "report.md"' in run_state_text
    assert "def write_json(" in artifacts_text
    assert "def write_incomplete_artifacts(" in artifacts_text
    assert "except BaseException" in cli_text
    assert "write_final_artifacts(state)" in cli_text


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
