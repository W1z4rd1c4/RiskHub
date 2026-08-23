from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = REPO_ROOT / "scripts/security/validate_frontend_container_gate.py"
STATUS_HELPER = REPO_ROOT / "scripts/security/frontend_trivy_status.py"


def _run_status(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(STATUS_HELPER), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def _write_sarif(path: Path, *, findings: int = 0) -> None:
    path.write_text(
        json.dumps(
            {
                "version": "2.1.0",
                "runs": [
                    {
                        "tool": {"driver": {"name": "Trivy", "rules": []}},
                        "results": [
                            {"ruleId": f"CVE-TEST-{index}"}
                            for index in range(findings)
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


def test_frontend_container_vulnerability_gate_contract() -> None:
    subprocess.run(
        [sys.executable, str(VALIDATOR)],
        cwd=REPO_ROOT,
        check=True,
    )


def test_frontend_container_gate_accepts_clean_retained_status(tmp_path: Path) -> None:
    sarif = tmp_path / "frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif)

    recorded = _run_status(
        "record",
        "--outcome",
        "success",
        "--sarif",
        str(sarif),
        "--output",
        str(status),
    )
    assert recorded.returncode == 0, recorded.stderr
    assert json.loads(status.read_text(encoding="utf-8"))["status"] == "clean"

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode == 0, enforced.stderr
    assert "status=clean" in enforced.stdout


def test_frontend_container_gate_retains_missing_sarif_failure(tmp_path: Path) -> None:
    status = tmp_path / "frontend-status.json"

    recorded = _run_status(
        "record",
        "--outcome",
        "failure",
        "--sarif",
        str(tmp_path / "missing.sarif"),
        "--output",
        str(status),
    )
    assert recorded.returncode == 0, recorded.stderr
    payload = json.loads(status.read_text(encoding="utf-8"))
    assert payload["status"] == "scan_failed"
    assert payload["reason"] == "sarif_missing"
    assert payload["sarif_present"] is False

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert "status=scan_failed" in enforced.stdout


def test_frontend_container_gate_rejects_retained_findings(tmp_path: Path) -> None:
    sarif = tmp_path / "frontend.sarif"
    status = tmp_path / "frontend-status.json"
    _write_sarif(sarif, findings=2)

    recorded = _run_status(
        "record",
        "--outcome",
        "success",
        "--sarif",
        str(sarif),
        "--output",
        str(status),
    )
    assert recorded.returncode == 0, recorded.stderr
    payload = json.loads(status.read_text(encoding="utf-8"))
    assert payload["status"] == "findings"
    assert payload["finding_count"] == 2

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
    assert "status=findings" in enforced.stdout


def test_frontend_container_gate_rejects_invalid_sarif_evidence(tmp_path: Path) -> None:
    sarif = tmp_path / "frontend.sarif"
    status = tmp_path / "frontend-status.json"
    sarif.write_text("not-json", encoding="utf-8")

    recorded = _run_status(
        "record",
        "--outcome",
        "success",
        "--sarif",
        str(sarif),
        "--output",
        str(status),
    )
    assert recorded.returncode == 0, recorded.stderr
    payload = json.loads(status.read_text(encoding="utf-8"))
    assert payload["status"] == "evidence_invalid"
    assert payload["reason"] == "sarif_invalid_json"

    enforced = _run_status("enforce", "--status-file", str(status))
    assert enforced.returncode != 0
