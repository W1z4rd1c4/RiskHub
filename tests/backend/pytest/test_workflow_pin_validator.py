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
RUNTIME_REQUIREMENTS = REPO_ROOT / "backend" / "requirements-runtime.txt"
PIP_AUDIT_ALLOWLIST = REPO_ROOT / "backend" / "security" / "pip-audit-allowlist.txt"
BACKEND_DOCKERFILE = REPO_ROOT / "backend" / "Dockerfile"
GITLEAKS_CONFIG = REPO_ROOT / ".gitleaks.toml"
GITLEAKS_IGNORE = REPO_ROOT / ".gitleaksignore"
RELEASE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release.yml"
RELEASE_PARITY_PR_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release-parity-pr.yml"
MAINTENANCE_GOVERNANCE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "maintenance-governance.yml"
LINT_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "lint.yml"
BACKEND_POSTGRES_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "backend-postgres.yml"
E2E_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "e2e.yml"
PLAYWRIGHT_CONFIG = REPO_ROOT / "frontend" / "playwright.config.ts"
STARTUP_SMOKE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "startup-smoke.yml"
LOCAL_PROD_AUDIT = REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh"
PROD_READINESS_PHASES = REPO_ROOT / "scripts" / "security" / "prod_readiness_audit" / "phases.py"
PUBLIC_LEAK_AUDIT = REPO_ROOT / "scripts" / "security" / "run_public_repo_leak_audit.sh"
MAKEFILE = REPO_ROOT / "scripts" / "Makefile"

DOCTOR_PLACEHOLDER_GITLEAKS_FINGERPRINTS = [
    "c01491201c5136cfe68cad8b0a1e1f3fc14b0816:scripts/install_lib/doctor.py:generic-api-key:20",
    "697ece9e12e4ba0b3a0844a35f1fce5a5fdc8dbf:scripts/install_lib/doctor.py:generic-api-key:20",
]


def _grype_ignore_entry(text: str, vulnerability: str) -> str:
    marker = f"  - vulnerability: {vulnerability}"
    start = text.index(marker)
    next_entry = text.find("\n  - vulnerability:", start + len(marker))
    if next_entry == -1:
        return text[start:]
    return text[start:next_entry]


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


def test_validator_rejects_mutable_scanner_docker_run_refs(tmp_path: Path) -> None:
    workflow = tmp_path / "security.yml"
    workflow.write_text(
        "\n".join(
            [
                "jobs:",
                "  scan:",
                "    steps:",
                "      - run: docker run --rm aquasec/trivy:0.57.1 image riskhub-backend:scan",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    validator = _load_validator_module()
    errors = validator.validate_workflow(workflow)

    assert any("scanner image" in error and "aquasec/trivy:0.57.1" in error for error in errors)


def test_validator_accepts_digest_pinned_scanner_docker_run_refs(tmp_path: Path) -> None:
    workflow = tmp_path / "security.yml"
    workflow.write_text(
        "\n".join(
            [
                "jobs:",
                "  scan:",
                "    steps:",
                "      - run: docker run --rm aquasec/trivy:0.57.1@sha256:"
                + ("a" * 64)
                + " image riskhub-backend:scan",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    validator = _load_validator_module()
    errors = validator.validate_workflow(workflow)

    assert not errors


def test_validator_scans_python_shell_makefile_and_workflow_scanner_refs(tmp_path: Path) -> None:
    files = {
        "security.yml": "run: docker run --rm aquasec/trivy:0.57.1 image riskhub-backend:scan\n",
        "phases.py": '"docker run --rm zricethezav/gitleaks:v8.18.2 detect"\n',
        "audit.sh": 'GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-gitleaks/gitleaks:v8.18.2}"\n',
        "Makefile": "\tdocker run --rm koalaman/shellcheck:stable -x scripts/deploy.sh\n",
    }
    validator = _load_validator_module()

    errors: list[str] = []
    for filename, content in files.items():
        path = tmp_path / filename
        path.write_text(content, encoding="utf-8")
        errors.extend(validator.validate_workflow(path))

    for image in (
        "aquasec/trivy:0.57.1",
        "zricethezav/gitleaks:v8.18.2",
        "gitleaks/gitleaks:v8.18.2",
        "koalaman/shellcheck:stable",
    ):
        assert any(image in error for error in errors), image


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


def test_scanner_docker_run_refs_are_digest_pinned_in_security_adapters() -> None:
    validator = _load_validator_module()
    errors: list[str] = []
    for path in (SECURITY_WORKFLOW, PROD_READINESS_PHASES, PUBLIC_LEAK_AUDIT, MAKEFILE):
        errors.extend(validator.validate_workflow(path))

    assert not [error for error in errors if "scanner image" in error]


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


def test_lint_workflow_installs_repo_contract_python_dependencies_before_contract_gate() -> None:
    text = LINT_WORKFLOW.read_text(encoding="utf-8")

    install_step = "Install repo contract Python dependencies"
    contract_step = "Repo artifact + script syntax contracts"
    assert install_step in text
    assert "python -m pip install -r backend/requirements-dev.txt" in text
    assert text.index(install_step) < text.index(contract_step)


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


def test_e2e_workflow_has_manual_dispatch_and_no_path_ignore() -> None:
    text = E2E_WORKFLOW.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in text
    assert "paths-ignore:" not in text
    assert "paths_ignore:" not in text


def test_e2e_workflow_classifies_scope_before_expensive_playwright_steps() -> None:
    text = E2E_WORKFLOW.read_text(encoding="utf-8")

    assert "id: e2e-scope" in text
    assert "run-e2e=false" in text
    assert "run-e2e=true" in text
    for path_pattern in (
        "backend/*",
        "frontend/*",
        "tests/frontend/e2e/*",
        "backend/scripts/seed_e2e_*",
        "scripts/install.sh",
        "scripts/dev.sh",
        "scripts/compose.sh",
        "scripts/Makefile",
        "docker-compose.yml",
        ".github/workflows/e2e.yml",
    ):
        assert path_pattern in text
    assert "steps.e2e-scope.outputs.run-e2e == 'true'" in text
    assert "steps.e2e-scope.outputs.run-e2e != 'true'" in text


def test_e2e_workflow_caches_playwright_browsers_and_uses_shell_only_chromium() -> None:
    text = E2E_WORKFLOW.read_text(encoding="utf-8")

    assert "actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830" in text
    assert "path: ~/.cache/ms-playwright" in text
    assert "key: playwright-${{ runner.os }}-${{ hashFiles('frontend/package-lock.json') }}" in text
    assert "PLAYWRIGHT_BROWSERS_PATH:" in text
    assert "ms-playwright" in text
    assert "npx playwright install --with-deps --only-shell chromium" in text
    assert "npx playwright install --with-deps chromium" not in text


def test_e2e_workflow_prefers_system_chrome_with_bounded_browser_fallback() -> None:
    text = E2E_WORKFLOW.read_text(encoding="utf-8")
    install_step = text[text.index("      - name: Install Playwright browsers") : text.index("      - name: Start backend")]

    assert "id: system-chrome" in text
    assert "command -v google-chrome" in text
    assert "command -v google-chrome-stable" in text
    assert "steps.system-chrome.outputs.available != 'true'" in install_step
    assert "timeout-minutes: 8" in install_step
    assert "--project=ci" in text
    assert "--project=chromium" in text
    assert "PLAYWRIGHT_CHROMIUM_CHANNEL: chrome" in text


def test_playwright_ci_project_allows_workflow_selected_chromium_channel() -> None:
    text = PLAYWRIGHT_CONFIG.read_text(encoding="utf-8")

    assert "PLAYWRIGHT_CHROMIUM_CHANNEL" in text
    assert "process.env.PLAYWRIGHT_CHROMIUM_CHANNEL" in text


def test_e2e_workflow_allows_runtime_headroom_for_cache_misses() -> None:
    text = E2E_WORKFLOW.read_text(encoding="utf-8")
    playwright_job = text[text.index("  e2e-tests:") : text.index("  production-profile-smoke:")]

    assert "timeout-minutes: 45" in playwright_job
    assert "timeout-minutes: 30" not in playwright_job


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
    assert text.count("\n      version: 3.13.13") == 4
    assert "\n    fix-state:" not in text


def test_grype_python_runtime_suppressions_include_policy_evidence() -> None:
    text = GRYPE_IGNORE.read_text(encoding="utf-8")

    for cve in ("CVE-2026-6100", "CVE-2026-3298", "CVE-2026-7210", "CVE-2026-4786"):
        entry = _grype_ignore_entry(text, cve)
        assert "Owner:" in entry
        assert "Decision:" in entry
        assert "Scanner evidence:" in entry
        assert "No-fix proof:" in entry
        assert "\n    expires-on: 2026-06-30" in entry
        assert "\n      name: python" in entry
        assert "\n      version: 3.13.13" in entry


def test_backend_dockerfile_pins_python_alpine_base_digest() -> None:
    text = BACKEND_DOCKERFILE.read_text(encoding="utf-8")
    pinned_base = "python:3.13-alpine@sha256:420cd0bf0f3998275875e02ecd5808168cf0843cbb4d3c536432f729247b2acc"

    assert text.count(f"FROM {pinned_base}") == 3
    assert "FROM python:3.13-alpine AS" not in text


def test_security_workflow_audits_runtime_python_requirements() -> None:
    text = SECURITY_WORKFLOW.read_text(encoding="utf-8")

    assert "requirements-runtime.txt" in text
    assert "../scripts/security/ci_health.py run-python-audit --workdir ." in text
    assert "pip-audit -r requirements-runtime.txt" not in text


def test_backend_runtime_fastapi_pin_avoids_mal_2026_4750() -> None:
    runtime_lines = [
        raw_line.split("#", 1)[0].strip()
        for raw_line in RUNTIME_REQUIREMENTS.read_text(encoding="utf-8").splitlines()
    ]
    active_runtime_lines = [line for line in runtime_lines if line]
    allowlist_text = PIP_AUDIT_ALLOWLIST.read_text(encoding="utf-8")

    assert "fastapi==0.135.4" in active_runtime_lines
    assert "fastapi==0.136.3" not in active_runtime_lines
    assert "MAL-2026-4750" not in allowlist_text

    for manifest_path in sorted((REPO_ROOT / "backend").glob("requirements*.txt")):
        manifest_text = manifest_path.read_text(encoding="utf-8").lower()
        assert "fastapi[standard]" not in manifest_text
        assert "fastar" not in manifest_text


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


def test_gitleaks_legacy_doctor_placeholder_ignores_are_exact_fingerprints() -> None:
    ignored_fingerprints = [
        raw_line.strip()
        for raw_line in GITLEAKS_IGNORE.read_text(encoding="utf-8").splitlines()
        if raw_line.strip() and not raw_line.lstrip().startswith("#")
    ]
    config = tomllib.loads(GITLEAKS_CONFIG.read_text(encoding="utf-8"))
    allowed_paths = "\n".join(config["allowlist"]["paths"])

    assert ignored_fingerprints == DOCTOR_PLACEHOLDER_GITLEAKS_FINGERPRINTS
    assert "scripts/install_lib/doctor.py" not in allowed_paths
    assert "doctor.py:generic-api-key" not in GITLEAKS_CONFIG.read_text(encoding="utf-8")


def test_security_workflow_keeps_scheduled_full_history_gitleaks_scan() -> None:
    text = SECURITY_WORKFLOW.read_text(encoding="utf-8")
    secrets_job = text[text.index("secrets-detection:") :]

    assert "schedule:" in text
    assert "fetch-depth: 0" in secrets_job
    assert "uses: gitleaks/gitleaks-action@" in secrets_job
    assert "GITLEAKS_CONFIG: .gitleaks.toml" in secrets_job
    assert "--log-opts=-1" not in secrets_job


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
