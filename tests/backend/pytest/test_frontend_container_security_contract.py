from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = REPO_ROOT / "scripts/security/validate_frontend_container_gate.py"
STATUS_HELPER = REPO_ROOT / "scripts/security/frontend_trivy_status.py"
SECURITY_WORKFLOW = REPO_ROOT / ".github/workflows/security.yml"
SARIF_SCHEMA = (
    "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/"
    "sarif-2.1/schema/sarif-schema-2.1.0.json"
)


def _run_status(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(STATUS_HELPER), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def _validator_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "riskhub_frontend_container_validator",
        VALIDATOR,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _validate_workflow_text(tmp_path: Path, workflow: str) -> list[str]:
    module = _validator_module()
    mutated = tmp_path / "security.yml"
    mutated.write_text(workflow, encoding="utf-8")
    module.WORKFLOW_PATH = mutated
    return module.validate()


def _write_sarif(
    path: Path,
    *,
    findings: int = 0,
    severity: str = "CRITICAL",
    schema_uri: str = SARIF_SCHEMA,
    include_messages: bool = True,
    rules_override: list[object] | None = None,
) -> None:
    rules: list[object] = []
    results: list[dict[str, object]] = []
    for index in range(findings):
        rule_id = f"CVE-TEST-{index}"
        rules.append(
            {
                "id": rule_id,
                "name": "InjectedContainerVulnerability",
                "defaultConfiguration": {"level": "error"},
                "properties": {
                    "security-severity": "9.8",
                    "tags": ["vulnerability", "security", severity],
                },
            }
        )
        result: dict[str, object] = {
            "ruleId": rule_id,
            "ruleIndex": index,
            "level": "error",
        }
        if include_messages:
            result["message"] = {"text": f"Injected test finding {index}"}
        results.append(result)

    path.write_text(
        json.dumps(
            {
                "$schema": schema_uri,
                "version": "2.1.0",
                "runs": [
                    {
                        "tool": {
                            "driver": {
                                "name": "Trivy",
                                "fullName": "Trivy Vulnerability Scanner",
                                "informationUri": "https://github.com/aquasecurity/trivy",
                                "rules": rules if rules_override is None else rules_override,
                            }
                        },
                        "results": results,
                    }
                ],
            }
        )
        + "\n",
        encoding="utf-8",
    )


def _record_status(*, sarif: Path, status: Path, outcome: str = "success") -> dict:
    recorded = _run_status(
        "record",
        "--outcome",
        outcome,
        "--sarif",
        str(sarif),
        "--output",
        str(status),
    )
    assert recorded.returncode == 0, recorded.stderr
    return json.loads(status.read_text(encoding="utf-8"))


def test_frontend_container_vulnerability_gate_contract() -> None:
    subprocess.run(
        [sys.executable, str(VALIDATOR)],
        cwd=REPO_ROOT,
        check=True,
    )


def test_frontend_container_gate_accepts_clean_retained_status(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif)

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "clean"
    assert payload["scanner"] == "trivy"
    assert payload["image"] == "riskhub-frontend:scan"
    assert len(payload["sarif_sha256"]) == 64

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode == 0, enforced.stderr
    assert "status=clean" in enforced.stdout


def test_frontend_container_gate_retains_missing_sarif_failure(tmp_path: Path) -> None:
    status = tmp_path / "frontend-status.json"
    missing = tmp_path / "trivy-frontend.sarif"

    payload = _record_status(sarif=missing, status=status, outcome="failure")
    assert payload["status"] == "scan_failed"
    assert payload["reason"] == "sarif_missing"
    assert payload["sarif_present"] is False
    assert payload["sarif_sha256"] is None

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert "status=scan_failed" in enforced.stdout


def test_frontend_container_gate_rejects_qualifying_findings(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif, findings=2, severity="CRITICAL")

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "findings"
    assert payload["finding_count"] == 2

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert "status=findings" in enforced.stdout


def test_frontend_container_gate_rejects_nonqualifying_result(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif, findings=1, severity="MEDIUM")

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "evidence_invalid"
    assert payload["reason"] == "sarif_nonqualifying_result"


def test_frontend_container_gate_rejects_malformed_rule_entries(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif, rules_override=[None])

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "evidence_invalid"
    assert payload["reason"] == "sarif_invalid_rules"


def test_frontend_container_gate_rejects_invalid_sarif_evidence(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    sarif.write_text("not-json", encoding="utf-8")

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "evidence_invalid"
    assert payload["reason"] == "sarif_invalid_json"

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0


def test_frontend_container_gate_rejects_sarif_without_trivy_tool(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    sarif.write_text(
        json.dumps(
            {
                "$schema": SARIF_SCHEMA,
                "version": "2.1.0",
                "runs": [{}],
            }
        ),
        encoding="utf-8",
    )

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "evidence_invalid"
    assert payload["reason"] == "sarif_invalid_tool"

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0


def test_frontend_container_gate_rejects_attacker_controlled_schema_uri(
    tmp_path: Path,
) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(
        sarif,
        schema_uri="https://attacker.invalid/sarif-2.1.0-schema.json",
    )

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "evidence_invalid"
    assert payload["reason"] == "sarif_invalid_schema"

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0


def test_frontend_container_gate_rejects_result_without_message(
    tmp_path: Path,
) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif, findings=1, include_messages=False)

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "evidence_invalid"
    assert payload["reason"] == "sarif_invalid_result_message"

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0


def test_frontend_container_gate_rejects_truncated_clean_status(tmp_path: Path) -> None:
    status = tmp_path / "frontend-status.json"
    status.write_text(
        json.dumps({"schema_version": 1, "status": "clean"}),
        encoding="utf-8",
    )

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert "missing required fields" in enforced.stderr


def test_frontend_container_gate_rejects_unknown_status_fields(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif)
    payload = _record_status(sarif=sarif, status=status)
    payload["attacker_controlled"] = True
    status.write_text(json.dumps(payload), encoding="utf-8")

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert "unknown fields" in enforced.stderr


def test_frontend_container_gate_rejects_tampered_clean_sarif(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif)
    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "clean"

    _write_sarif(sarif, findings=1)
    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert (
        "now contains findings" in enforced.stderr
        or "digest does not match" in enforced.stderr
    )


def test_contract_validator_rejects_expression_based_advisory_mode() -> None:
    module = _validator_module()
    errors: list[str] = []
    module._reject_continue_on_error(
        errors,
        "test gate",
        {"continue-on-error": "${{ true }}"},
    )
    assert any("continue-on-error" in error for error in errors)


def test_contract_validator_rejects_ignore_unfixed(tmp_path: Path) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8")
    workflow = workflow.replace(
        "          exit-code: '1'\n",
        "          exit-code: '1'\n          ignore-unfixed: true\n",
        1,
    )
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any("ignore-unfixed" in error for error in errors)


def test_contract_validator_requires_vulnerability_only_scanner(
    tmp_path: Path,
) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8")
    workflow = workflow.replace(
        "          scanners: 'vuln'\n",
        "          scanners: 'secret'\n",
        1,
    )
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any("scanners" in error and "vuln" in error for error in errors)


@pytest.mark.parametrize(
    ("option", "value"),
    [
        ("secret", "${{ github.token }}"),
        ("trivyignores", ".trivyignore"),
        ("skip-files", "usr/lib/vulnerable.so"),
        ("ignore-policy", "policy.rego"),
        ("trivy-config", "trivy.yaml"),
        ("skip-dirs", "usr/lib"),
        ("unknown-scan-option", "enabled"),
    ],
)
def test_contract_validator_rejects_extra_frontend_scan_inputs(
    tmp_path: Path,
    option: str,
    value: str,
) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8")
    anchor = "          scanners: 'vuln'\n"
    if anchor not in workflow:
        anchor = "          exit-code: '1'\n"
    workflow = workflow.replace(anchor, f"{anchor}          {option}: {value}\n", 1)
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any(option in error for error in errors)


@pytest.mark.parametrize(
    ("anchor", "injected"),
    [
        (
            "permissions:\n  contents: read\n  security-events: write\n",
            "permissions:\n  contents: read\n  security-events: write\n\nenv:\n  TRIVY_SKIP_FILES: usr/lib/vulnerable.so\n",
        ),
        (
            "  container-security:\n    name: Container Scan (Trivy + SBOM Correlation)\n    runs-on: ubuntu-latest\n",
            "  container-security:\n    name: Container Scan (Trivy + SBOM Correlation)\n    runs-on: ubuntu-latest\n    env:\n      TRIVY_IGNORE_POLICY: policy.rego\n",
        ),
        (
            "        continue-on-error: true\n        uses: aquasecurity/trivy-action@",
            "        continue-on-error: true\n        env:\n          TRIVY_SCANNERS: secret\n        uses: aquasecurity/trivy-action@",
        ),
    ],
)
def test_contract_validator_rejects_trivy_environment_overrides(
    tmp_path: Path,
    anchor: str,
    injected: str,
) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8")
    workflow = workflow.replace(anchor, injected, 1)
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any("TRIVY_" in error for error in errors)


def test_contract_validator_requires_pull_request_trigger(tmp_path: Path) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8").replace(
        "  pull_request:\n    branches: [main, develop]\n",
        "",
        1,
    )
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any("pull_request" in error for error in errors)


def test_contract_validator_requires_push_to_main(tmp_path: Path) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8").replace(
        "  push:\n    branches: [main, develop]\n",
        "  push:\n    branches: [develop]\n",
        1,
    )
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any("push" in error and "main" in error for error in errors)


def test_contract_validator_requires_scheduled_runs(tmp_path: Path) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8").replace(
        "  schedule:\n"
        "    # Run nightly at 02:00 UTC for resilience smoke checks\n"
        "    - cron: '0 2 * * *'\n"
        "    # Run weekly on Sunday at 00:00 UTC\n"
        "    - cron: '0 0 * * 0'\n",
        "",
        1,
    )
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any("schedule" in error for error in errors)


def test_contract_validator_rejects_conditional_container_job(tmp_path: Path) -> None:
    workflow = SECURITY_WORKFLOW.read_text(encoding="utf-8").replace(
        "  container-security:\n    name: Container Scan (Trivy + SBOM Correlation)\n",
        "  container-security:\n    name: Container Scan (Trivy + SBOM Correlation)\n    if: false\n",
        1,
    )
    errors = _validate_workflow_text(tmp_path, workflow)
    assert any("container-security job" in error and "conditional" in error for error in errors)
