from __future__ import annotations

import csv
import importlib.util
import json
import sys
from pathlib import Path


def _load_probe_module():
    repo_root = Path(__file__).resolve().parents[3]
    module_path = repo_root / "scripts" / "security" / "protocol_contract_probe.py"
    spec = importlib.util.spec_from_file_location("protocol_contract_probe", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_protocol_contract_probe_classification_rules() -> None:
    probe = _load_probe_module()
    case = probe.ProbeCase(
        case_id="case",
        method="GET",
        path="/api/v1/reports/controls/excel",
        expected_statuses=(410,),
        classification_hint=probe.CLASSIFICATION_CONTRACT_DRIFT,
        description="doc parity",
    )

    classification, drift_detected, _ = probe.classify_probe_result(
        case=case,
        status_code=410,
        documented_statuses=["200"],
        auth_error=None,
    )
    assert classification == probe.CLASSIFICATION_CONTRACT_DRIFT
    assert drift_detected is True

    classification, drift_detected, _ = probe.classify_probe_result(
        case=case,
        status_code=410,
        documented_statuses=["200", "410"],
        auth_error=None,
    )
    assert classification == probe.CLASSIFICATION_CONTRACT_DRIFT
    assert drift_detected is False

    classification, drift_detected, _ = probe.classify_probe_result(
        case=case,
        status_code=500,
        documented_statuses=["200", "410"],
        auth_error=None,
    )
    assert classification == probe.CLASSIFICATION_SECURITY_DEFECT
    assert drift_detected is False

    classification, drift_detected, _ = probe.classify_probe_result(
        case=case,
        status_code=0,
        documented_statuses=[],
        auth_error="demo_login_failed",
    )
    assert classification == probe.CLASSIFICATION_AUTH_PRECONDITION
    assert drift_detected is False


def test_protocol_contract_probe_output_schema(tmp_path: Path) -> None:
    probe = _load_probe_module()
    results = [
        {
            "target": "local",
            "base_url": "http://127.0.0.1:8000",
            "case_id": "xlsx-rejected-risks-export",
            "description": "xlsx rejection is documented",
            "method": "GET",
            "path": "/api/v1/reports/risks/export?format=xlsx",
            "status_code": 410,
            "expected_statuses": [410],
            "documented_statuses": ["200", "410", "422"],
            "openapi_operation_path": "/api/v1/reports/risks/export",
            "classification": probe.CLASSIFICATION_CONTRACT_DRIFT,
            "drift_detected": False,
            "classification_reason": "status documented in OpenAPI responses",
            "auth_mode": "fresh_bearer",
            "auth_refreshed": True,
            "auth_login_status_code": 200,
            "auth_error": None,
            "response_excerpt": "{\"detail\":{\"code\":\"excel_export_removed\"}}",
        }
    ]

    payload = {
        "generated_at_utc": "2026-02-21T00:00:00+00:00",
        "targets": [{"label": "local", "base_url": "http://127.0.0.1:8000"}],
        "summary": probe.build_summary(results),
        "results": results,
    }

    output_json = tmp_path / "probe-results.json"
    output_csv = tmp_path / "probe-triage.csv"
    probe.write_outputs(output_json=output_json, output_csv=output_csv, payload=payload)

    loaded_payload = json.loads(output_json.read_text(encoding="utf-8"))
    assert loaded_payload["summary"]["unresolved_contract_drift_count"] == 0
    assert loaded_payload["summary"]["security_defect_count"] == 0
    assert loaded_payload["results"][0]["classification"] == probe.CLASSIFICATION_CONTRACT_DRIFT

    with output_csv.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 1
    assert rows[0]["case_id"] == "xlsx-rejected-risks-export"
    assert rows[0]["classification"] == probe.CLASSIFICATION_CONTRACT_DRIFT
