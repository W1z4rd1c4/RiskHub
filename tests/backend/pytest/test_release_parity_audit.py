from __future__ import annotations

import importlib.util
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
