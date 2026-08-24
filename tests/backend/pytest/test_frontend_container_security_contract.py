from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = REPO_ROOT / "scripts/security/validate_frontend_container_gate.py"
STATUS_HELPER = REPO_ROOT / "scripts/security/frontend_trivy_status.py"
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


def _write_sarif(
    path: Path,
    *,
    findings: int = 0,
    schema_uri: str = SARIF_SCHEMA,
    include_messages: bool = True,
) -> None:
    results: list[dict[str, object]] = []
    for index in range(findings):
        result: dict[str, object] = {"ruleId": f"CVE-TEST-{index}"}
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
                                "rules": [],
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


def test_frontend_container_gate_rejects_retained_findings(tmp_path: Path) -> None:
    sarif = tmp_path / "trivy-frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif, findings=2)

    payload = _record_status(sarif=sarif, status=status)
    assert payload["status"] == "findings"
    assert payload["finding_count"] == 2

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert "status=findings" in enforced.stdout


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
