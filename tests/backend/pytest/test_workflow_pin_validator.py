from __future__ import annotations

import importlib.util
import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = REPO_ROOT / "scripts" / "security" / "validate_workflow_pins.py"
CI_HEALTH_PATH = REPO_ROOT / "scripts" / "security" / "ci_health.py"
SECURITY_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "security.yml"
GRYPE_IGNORE = REPO_ROOT / "backend" / "security" / "grype-ignore.yaml"
GITLEAKS_CONFIG = REPO_ROOT / ".gitleaks.toml"
RELEASE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release.yml"
RELEASE_PARITY_PR_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release-parity-pr.yml"
MAINTENANCE_GOVERNANCE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "maintenance-governance.yml"
LINT_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "lint.yml"
BACKEND_POSTGRES_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "backend-postgres.yml"
E2E_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "e2e.yml"
STARTUP_SMOKE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "startup-smoke.yml"
LOCAL_PROD_AUDIT = REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh"


def _load_validator_module():
    spec = importlib.util.spec_from_file_location("validate_workflow_pins", VALIDATOR_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_ci_health_module():
    spec = importlib.util.spec_from_file_location("ci_health", CI_HEALTH_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_validator_rejects_unpinned_action_ref(tmp_path: Path) -> None:
    workflow = tmp_path / "lint.yml"
    workflow.write_text(
        "\n".join(
            [
                "jobs:",
                "  lint:",
                "    steps:",
                "      - uses: actions/checkout@v4",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    validator = _load_validator_module()
    errors = validator.validate_workflow(workflow)

    assert any("full commit SHA" in error for error in errors)


def test_validator_rejects_unpinned_service_image(tmp_path: Path) -> None:
    workflow = tmp_path / "e2e.yml"
    workflow.write_text(
        "\n".join(
            [
                "jobs:",
                "  e2e:",
                "    services:",
                "      postgres:",
                "        image: postgres:15",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    validator = _load_validator_module()
    errors = validator.validate_workflow(workflow)

    assert any("service image" in error for error in errors)


def test_validator_scans_all_workflows_by_default(tmp_path: Path, monkeypatch) -> None:
    workflows_dir = tmp_path / ".github" / "workflows"
    workflows_dir.mkdir(parents=True)
    (workflows_dir / "good.yml").write_text(
        "jobs:\n  lint:\n    steps:\n      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5\n",
        encoding="utf-8",
    )
    (workflows_dir / "bad.yml").write_text(
        "jobs:\n  lint:\n    steps:\n      - uses: actions/setup-python@v5\n",
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)
    validator = _load_validator_module()

    assert validator.main([]) == 1


def test_security_and_release_workflows_invoke_directory_wide_validator() -> None:
    for workflow_path in (SECURITY_WORKFLOW, RELEASE_WORKFLOW):
        text = workflow_path.read_text(encoding="utf-8")
        assert "python3 scripts/security/validate_workflow_pins.py" in text
        assert ".github/workflows/security.yml" not in text
        assert ".github/workflows/release.yml" not in text


def test_local_prod_readiness_audit_pins_syft_and_grype_images() -> None:
    package_text = (
        LOCAL_PROD_AUDIT.read_text(encoding="utf-8")
        + (REPO_ROOT / "scripts" / "security" / "prod_readiness_audit" / "phases.py").read_text(
            encoding="utf-8"
        )
    )

    assert "anchore/syft:latest" not in package_text
    assert "anchore/grype:latest" not in package_text
    assert "anchore/syft:v1.42.3@sha256:" in package_text
    assert "anchore/grype:v0.110.0@sha256:" in package_text


def test_lint_workflow_runs_blocking_frontend_vitest_job() -> None:
    text = LINT_WORKFLOW.read_text(encoding="utf-8")

    assert "frontend-unit-tests:" in text
    assert "Run frontend Vitest coverage gate" in text
    assert "npm run test:coverage" in text
    assert "needs: [frontend-unit-tests]" in text
    assert "docs-topology-consistency" not in text


def test_lint_workflow_restores_blocking_backend_quality_gate() -> None:
    text = LINT_WORKFLOW.read_text(encoding="utf-8")

    assert "backend-quality:" in text
    assert "Backend Ruff gate" in text
    assert "Backend mypy gate" in text
    assert "Backend suppression budget gate" in text
    assert "Production contract docs gate" in text
    assert "Repo artifact + script syntax contracts" in text
    assert "python3 scripts/security/validate_production_contract_docs.py" in text
    assert "python3 scripts/security/validate_deprecated_imports.py" in text
    for forbidden in (
        "Frontend debt budget",
        "Frontend cleanup audit contract",
        "Validate ratchet status documentation contract",
        "Compute Ruff ratchet class counts",
        "Backend Ruff changed-file ratchet",
        "Backend mypy (changed backend/app files)",
    ):
        assert forbidden not in text


def test_lint_workflow_fetches_full_history_for_checkout() -> None:
    text = LINT_WORKFLOW.read_text(encoding="utf-8")

    pattern = re.compile(
        r"  lint:\n"
        r"(?:.*\n)*?"
        r"    steps:\n"
        r"(?:.*\n)*?"
        r"      - uses: actions/checkout@[^\n]+\n"
        r"        with:\n"
        r"          fetch-depth: 0\n",
        re.MULTILINE,
    )

    assert pattern.search(text), "lint job checkout must fetch full history"


def test_maintenance_workflow_keeps_backend_job_informational_only() -> None:
    text = MAINTENANCE_GOVERNANCE_WORKFLOW.read_text(encoding="utf-8")

    assert "backend-maintenance-informational:" in text
    assert "Backend Maintenance (Informational)" in text
    assert "continue-on-error: true" in text


def test_release_parity_contract_workflow_is_manual_only_and_keeps_contract_validators() -> None:
    text = RELEASE_PARITY_PR_WORKFLOW.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in text
    assert "pull_request:" not in text
    assert "continue-on-error" not in text
    for snippet in (
        "python3 scripts/check_docs_contract.py",
        "python3 scripts/security/validate_production_contract_docs.py",
        "python3 scripts/security/validate_workflow_pins.py",
        "python3 scripts/security/validate_repo_hardening.py",
        "python3 scripts/security/validate_deprecated_imports.py",
    ):
        assert snippet in text


def test_backend_postgres_workflow_uses_named_postgres_ci_contract() -> None:
    text = BACKEND_POSTGRES_WORKFLOW.read_text(encoding="utf-8")

    assert "make -f scripts/Makefile test-postgres-ci" in text
    assert "pytest -m postgres -q" not in text


def test_e2e_workflow_uses_canonical_health_route_and_no_fixed_sleep() -> None:
    text = E2E_WORKFLOW.read_text(encoding="utf-8")

    assert "sleep 10" not in text
    assert "http://localhost:8000/api/v1/readyz" in text
    assert "http://localhost:8000/health" not in text
    assert "ENABLE_SCHEDULER: 'true'" in text
    assert "SCHEDULER_JOB_PROFILE: outbox_only" in text
    assert "CORS_ORIGINS: '[\"http://localhost:5173\"]'" in text


def test_e2e_workflow_defines_production_profile_smoke_lane() -> None:
    text = E2E_WORKFLOW.read_text(encoding="utf-8")

    assert "production-profile-smoke:" in text
    for snippet in (
        "DEBUG: 'false'",
        "MOCK_AUTH_ENABLED: 'false'",
        "AUTH_MODE: microsoft_sso",
        "DIRECTORY_PROVIDER: graph",
        "ENTRA_JIT_PROVISIONING_ENABLED: 'false'",
        "AUTH_SSO_ALLOW_EMAIL_LINK: 'false'",
        "REDIS_URL: redis://localhost:6379/0",
        "image: redis:7@sha256:",
        'assert set(payload) == {"status", "ready", "database", "redis", "scheduler_role", "scheduler_status"}',
        'assert payload["redis"] == "connected"',
    ):
        assert snippet in text


def test_security_workflow_runs_container_scan_in_pull_requests() -> None:
    text = SECURITY_WORKFLOW.read_text(encoding="utf-8")

    assert "pull_request:" in text
    assert "container-security:" in text
    assert "if: github.event_name == 'push' || github.event_name == 'schedule'" not in text


def test_grype_python_runtime_suppressions_are_time_bound() -> None:
    text = GRYPE_IGNORE.read_text(encoding="utf-8")

    for cve in ("CVE-2026-6100", "CVE-2026-3298", "CVE-2026-7210", "CVE-2026-4786"):
        assert f"vulnerability: {cve}" in text
    assert text.count("\n    expires-on: 2026-06-30") == 4
    assert text.count("\n      name: python") == 4
    assert text.count("\n      version: 3.13.12") == 4
    assert "\n    fix-state:" not in text


def test_security_workflow_audits_runtime_python_requirements() -> None:
    text = SECURITY_WORKFLOW.read_text(encoding="utf-8")

    assert "requirements-runtime.txt" in text
    assert "../scripts/security/ci_health.py run-python-audit --workdir ." in text
    assert "pip-audit -r requirements-runtime.txt" not in text


def test_ci_health_python_audit_manifest_interface_covers_runtime_requirements() -> None:
    module = _load_ci_health_module()

    manifests = module.python_audit_manifests()

    assert [manifest.path.as_posix() for manifest in manifests] == [
        "backend/requirements.txt",
        "backend/requirements-runtime.txt",
    ]
    assert [manifest.report_name for manifest in manifests] == [
        "pip-audit-report.json",
        "pip-audit-runtime-report.json",
    ]


def test_security_workflow_gitleaks_parse_gate_invokes_shell_once() -> None:
    text = SECURITY_WORKFLOW.read_text(encoding="utf-8")

    assert "--entrypoint /bin/sh" in text
    assert "\\\n            -lc 'mkdir -p /tmp/gitleaks-empty" in text
    assert "\\\n            sh -lc 'mkdir -p /tmp/gitleaks-empty" not in text


def test_gitleaks_allowlist_excludes_local_generated_public_audit_noise() -> None:
    config = tomllib.loads(GITLEAKS_CONFIG.read_text(encoding="utf-8"))
    allowed_paths = "\n".join(config["allowlist"]["paths"])

    for expected_pattern in (
        r"(^|/)\.pytest_cache/",
        r"(^|/repo/)frontend/dist/",
        r"(^|/repo/)tests/backend/pytest/test_outbox_approval_flow\.py$",
    ):
        assert expected_pattern in allowed_paths


def test_maintenance_governance_workflow_owns_docs_and_maintenance_only_gates() -> None:
    text = MAINTENANCE_GOVERNANCE_WORKFLOW.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in text
    assert "docs-topology-consistency" in text
    assert "validate_lint_ratchet_docs.py" in text
    assert "python3 scripts/tools/suppression_budget.py" in text
    assert "npm run quality:debt -- --report-json" in text
    assert "npm run cleanup:deadcode" in text
    assert "mypy --config-file mypy.ini app" in text


def test_startup_smoke_workflow_asserts_health_schema_headers_and_docs_exposure() -> None:
    text = STARTUP_SMOKE_WORKFLOW.read_text(encoding="utf-8")

    assert "pull_request:" not in text
    assert "workflow_dispatch:" in text
    assert "schedule:" in text

    for snippet in (
        'assert set(readyz) == {"ready", "database", "redis", "scheduler_role", "scheduler_status"}',
        'assert set(health) == {"status", "ready", "database", "redis", "scheduler_role", "scheduler_status"}',
        "grep -qi '^x-frame-options: DENY'",
        "grep -qi '^content-security-policy:'",
        "grep -q '<script type=\"module\"'",
        "grep -q 'Swagger UI'",
    ):
        assert snippet in text
