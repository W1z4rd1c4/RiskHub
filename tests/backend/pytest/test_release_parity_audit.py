from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = REPO_ROOT / "scripts" / "security" / "run_release_parity_audit.py"
SPEC = importlib.util.spec_from_file_location("run_release_parity_audit", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
CommandResult = MODULE.CommandResult
ReleaseParityAudit = MODULE.ReleaseParityAudit
DECISION_MODULE = importlib.import_module("release_parity_audit.decision")
REPORTING_MODULE = importlib.import_module("release_parity_audit.reporting")
DEPENDENCIES_MODULE = importlib.import_module("release_parity_audit.dependencies")
RUNTIME_MODULE = importlib.import_module("release_parity_audit.runtime")
STARTUP_MODULE = importlib.import_module("release_parity_audit.startup")
UI_PARITY_MODULE = importlib.import_module("release_parity_audit.ui_parity")
RUN_STATE_MODULE = importlib.import_module("release_parity_audit.run_state")
PHASE_RUNNER_MODULE = importlib.import_module("release_parity_audit.phase_runner")
evaluate_findings_and_decision = DECISION_MODULE.evaluate_findings_and_decision
build_report = REPORTING_MODULE.build_report
build_run_status = REPORTING_MODULE.build_run_status
matrix_payload = REPORTING_MODULE.matrix_payload


def test_release_parity_audit_py_direct_help_executes() -> None:
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "audit.py"), "--help"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Run release parity audit" in result.stdout
    assert "--skip-prod-readiness" in result.stdout


def test_release_parity_run_records_public_command_result_type(tmp_path: Path) -> None:
    audit = ReleaseParityAudit("test-public-command-result", run_prod_readiness=False)
    audit.logs_dir = tmp_path

    audit._run("noop", "true", required=False)

    assert len(audit.command_results) == 1
    assert isinstance(audit.command_results[0], CommandResult)


def test_release_parity_run_state_and_phase_runner_are_deep_modules(tmp_path: Path) -> None:
    result = CommandResult(
        command_id="required_fail",
        command="false",
        cwd=str(tmp_path),
        required=True,
        rc=1,
        start_utc="2026-03-18T00:00:00+00:00",
        end_utc="2026-03-18T00:00:01+00:00",
        duration_sec=1.0,
        log_path=str(tmp_path / "required_fail.log"),
        timeout_sec=None,
    )
    state = RUN_STATE_MODULE.ReleaseParityRunState()

    state.record_command_result(result)

    calls: list[str] = []
    runner = PHASE_RUNNER_MODULE.ReleaseParityPhaseRunner()
    runner.run(
        [
            PHASE_RUNNER_MODULE.ReleaseParityPhase("capture", lambda: calls.append("capture")),
            PHASE_RUNNER_MODULE.ReleaseParityPhase("report", lambda: calls.append("report")),
        ]
    )

    assert state.command_results == [result]
    assert state.required_failures == 1
    assert calls == ["capture", "report"]


def test_release_parity_audit_exposes_modular_helper_boundaries() -> None:
    assert callable(DEPENDENCIES_MODULE.capture_dependencies)
    assert callable(RUNTIME_MODULE.run_dynamic_paths)
    assert callable(STARTUP_MODULE.build_startup_inventory)
    assert callable(UI_PARITY_MODULE.evaluate_ui_parity)


def test_release_parity_runtime_orchestration_is_not_pass_through() -> None:
    audit_source = (REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "audit.py").read_text(
        encoding="utf-8"
    )
    runtime_source = (REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "runtime.py").read_text(
        encoding="utf-8"
    )

    assert "def _run_dynamic_paths_impl" not in audit_source
    assert "_run_dynamic_paths_impl" not in runtime_source


def test_release_parity_reporting_module_preserves_report_sections(tmp_path: Path) -> None:
    report = build_report(
        run_id="test-report",
        decision={"decision": "GO"},
        required_failures=0,
        baseline={"git_branch": "main", "git_sha": "abc123"},
        findings=[],
        artifact_root=tmp_path,
        fingerprints_dir=tmp_path / "fingerprints",
        deps_dir=tmp_path / "deps",
        ui_dir=tmp_path / "ui",
    )

    assert "# Release Parity Audit (test-report)" in report
    assert "- Decision: **GO**" in report
    assert "## Evidence Map" in report


def test_release_parity_report_status_and_matrix_modules_keep_json_shape(tmp_path: Path) -> None:
    result = CommandResult(
        command_id="noop",
        command="true",
        cwd=str(tmp_path),
        required=False,
        rc=0,
        start_utc="2026-03-18T00:00:00+00:00",
        end_utc="2026-03-18T00:00:01+00:00",
        duration_sec=1.0,
        log_path=str(tmp_path / "noop.log"),
        timeout_sec=None,
    )

    status = build_run_status(
        run_id="test-status",
        generated_at_utc="2026-03-18T00:00:01+00:00",
        decision={"decision": "GO"},
        required_failures=0,
        artifact_root=tmp_path,
        matrix_path=tmp_path / "matrix.json",
    )

    assert matrix_payload([result]) == [result.to_json()]
    assert status["status"] == "complete"
    assert status["decision"] == "GO"


def test_release_parity_decision_module_preserves_invalid_environment_decision(tmp_path: Path) -> None:
    findings, decision = evaluate_findings_and_decision(
        run_id="test-invalid-env-module",
        baseline={"git_sha": "abc123", "git_branch": "main"},
        runtime_fingerprints=[
            {
                "startup_path_id": "dev_sh_full",
                "context_id": "dev_sh_full",
                "git_sha_expected": "abc123",
                "git_sha_observed": "abc123",
                "launch_failed": True,
                "launch_rc": 1,
                "launch_log": "/tmp/dev.log",
                "launch_failure": {
                    "classification": "environment_contamination",
                    "code": "unexpected_port_owner",
                    "summary": "A required local port was owned by an unexpected process on the audit host.",
                },
            }
        ],
        static_resolution={"ci_runtime_policy": {"node_versions": ["24"]}, "dev_startup": {}},
        toolchain_fingerprint={"dev_sh_effective_node": {"selected": True, "major": 24}},
        dep_diffs={"backend_drift": [], "frontend_drift": []},
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=1,
        artifact_root=tmp_path,
        deps_dir=tmp_path / "deps",
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-03-18T00:00:01+00:00",
    )

    assert decision["decision"] == "INVALID_ENVIRONMENT"
    assert decision["finding_counts"]["ENV"] == 2
    assert any(item["severity"] == "ENV" for item in findings)


def test_launch_failure_fingerprint_classifies_unexpected_port_owner_as_environment_contamination(
    tmp_path: Path,
) -> None:
    audit = ReleaseParityAudit("test-port-conflict", run_prod_readiness=False)
    log_path = tmp_path / "port-conflict.log"
    log_path.write_text("DEV_PORT_CONFLICT_UNEXPECTED_PROCESS: refusing to stop unexpected process\n", encoding="utf-8")
    result = CommandResult(
        command_id="path_dev_sh_full",
        command="./scripts/dev.sh --daemon",
        cwd=str(tmp_path),
        required=False,
        rc=1,
        start_utc="2026-03-18T00:00:00+00:00",
        end_utc="2026-03-18T00:00:01+00:00",
        duration_sec=1.0,
        log_path=str(log_path),
        timeout_sec=900,
    )

    fingerprint = audit._launch_failure_fingerprint("dev_sh_full", "dev_sh_full", result)

    assert fingerprint["launch_failure"]["classification"] == "environment_contamination"
    assert fingerprint["launch_failure"]["code"] == "unexpected_port_owner"


def test_release_parity_uses_invalid_environment_for_env_only_failures() -> None:
    audit = ReleaseParityAudit("test-invalid-env", run_prod_readiness=False)
    audit.baseline = {"git_sha": "abc123", "git_branch": "main"}
    audit.runtime_fingerprints = [
        {
            "startup_path_id": "dev_sh_full",
            "context_id": "dev_sh_full",
            "git_sha_expected": "abc123",
            "git_sha_observed": "abc123",
            "launch_failed": True,
            "launch_rc": 1,
            "launch_log": "/tmp/dev.log",
            "launch_failure": {
                "classification": "environment_contamination",
                "code": "unexpected_port_owner",
                "summary": "A required local port was owned by an unexpected process on the audit host.",
            },
        }
    ]
    audit.static_resolution = {"ci_runtime_policy": {"node_versions": ["24"]}, "dev_startup": {}}
    audit.toolchain_fingerprint = {
        "dev_sh_effective_node": {"selected": True, "major": 24},
    }
    audit.dep_diffs = {"backend_drift": [], "frontend_drift": []}
    audit.ui_parity = {"mismatches_same_auth_mode_same_commit": []}
    audit.required_failures = 1

    audit._evaluate_findings_and_decision()

    assert audit.decision["decision"] == "INVALID_ENVIRONMENT"
    assert any(item["severity"] == "ENV" for item in audit.findings)
    assert not any(str(item["id"]).startswith("P1-startup-path-failed-") for item in audit.findings)


def test_release_parity_keeps_real_startup_failures_blocking() -> None:
    audit = ReleaseParityAudit("test-product-failure", run_prod_readiness=False)
    audit.baseline = {"git_sha": "abc123", "git_branch": "main"}
    audit.runtime_fingerprints = [
        {
            "startup_path_id": "compose_sh_up_full",
            "context_id": "compose_sh_up_full",
            "git_sha_expected": "abc123",
            "git_sha_observed": "abc123",
            "launch_failed": True,
            "launch_rc": 1,
            "launch_log": "/tmp/compose.log",
            "launch_failure": {
                "classification": "product_failure",
                "code": "startup_path_failed",
                "summary": "Startup path compose_sh_up_full failed before parity fingerprints could be captured.",
            },
        }
    ]
    audit.static_resolution = {"ci_runtime_policy": {"node_versions": ["24"]}, "dev_startup": {}}
    audit.toolchain_fingerprint = {
        "dev_sh_effective_node": {"selected": True, "major": 24},
    }
    audit.dep_diffs = {"backend_drift": [], "frontend_drift": []}
    audit.ui_parity = {"mismatches_same_auth_mode_same_commit": []}

    audit._evaluate_findings_and_decision()

    assert audit.decision["decision"] == "NO-GO"
    assert any(str(item["id"]).startswith("P1-startup-path-failed-") for item in audit.findings)
