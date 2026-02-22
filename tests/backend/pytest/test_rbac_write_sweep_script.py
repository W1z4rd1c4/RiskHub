from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


def _load_sweep_module():
    repo_root = Path(__file__).resolve().parents[3]
    module_path = repo_root / "scripts" / "security" / "rbac_idor_write_sweep.py"
    spec = importlib.util.spec_from_file_location("rbac_idor_write_sweep", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _run_main(module, tmp_path: Path, monkeypatch) -> tuple[int, dict]:
    output_json = tmp_path / "rbac-sweep.json"
    output_csv = tmp_path / "rbac-sweep.csv"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "rbac_idor_write_sweep.py",
            "--target",
            "test=http://example.test",
            "--output-json",
            str(output_json),
            "--output-csv",
            str(output_csv),
        ],
    )
    rc = module.main()
    payload = json.loads(output_json.read_text(encoding="utf-8"))
    return rc, payload


def _openapi_with_write_path() -> str:
    return json.dumps(
        {
            "paths": {
                "/api/v1/vendors/{vendor_id}": {
                    "patch": {},
                }
            }
        }
    )


def test_openapi_unavailable_blocks(monkeypatch, tmp_path: Path) -> None:
    module = _load_sweep_module()

    def fake_request(**_kwargs):
        return 0, "transport_error"

    monkeypatch.setattr(module, "_request", fake_request)

    rc, payload = _run_main(module, tmp_path, monkeypatch)
    assert rc == 1
    assert payload["decision"] == "BLOCK"
    assert payload["precondition_failure_count"] == 1
    assert payload["coverage_complete"] is False
    assert "precondition_failures_detected" in payload["blocking_reasons"]
    assert payload["rows"][0]["result"] == "openapi_unavailable"


def test_login_failures_block(monkeypatch, tmp_path: Path) -> None:
    module = _load_sweep_module()

    def fake_request(*, method: str, url: str, **_kwargs):
        if method == "GET" and url.endswith("/openapi.json"):
            return 200, _openapi_with_write_path()
        raise AssertionError(f"Unexpected request: method={method} url={url}")

    monkeypatch.setattr(module, "_request", fake_request)
    monkeypatch.setattr(module, "_demo_login", lambda *_args, **_kwargs: None)

    rc, payload = _run_main(module, tmp_path, monkeypatch)
    assert rc == 1
    assert payload["decision"] == "BLOCK"
    assert payload["precondition_failure_count"] == len(module.ROLE_USER_IDS)
    assert payload["coverage_complete"] is False
    assert payload["potential_write_count"] == 0
    assert "precondition_failures_detected" in payload["blocking_reasons"]
    assert len(payload["rows"]) == len(module.ROLE_USER_IDS)
    assert all(row["result"] == "login_failed" for row in payload["rows"])


def test_deny_only_results_pass(monkeypatch, tmp_path: Path) -> None:
    module = _load_sweep_module()

    def fake_request(*, method: str, url: str, **_kwargs):
        if method == "GET" and url.endswith("/openapi.json"):
            return 200, _openapi_with_write_path()
        return 403, '{"detail":"forbidden"}'

    monkeypatch.setattr(module, "_request", fake_request)
    monkeypatch.setattr(module, "_demo_login", lambda *_args, **_kwargs: "token")

    rc, payload = _run_main(module, tmp_path, monkeypatch)
    assert rc == 0
    assert payload["decision"] == "PASS"
    assert payload["precondition_failure_count"] == 0
    assert payload["coverage_complete"] is True
    assert payload["potential_write_count"] == 0
    assert payload["blocking_reasons"] == []


def test_potential_write_blocks(monkeypatch, tmp_path: Path) -> None:
    module = _load_sweep_module()

    def fake_request(*, method: str, url: str, **_kwargs):
        if method == "GET" and url.endswith("/openapi.json"):
            return 200, _openapi_with_write_path()
        return 200, '{"ok":true}'

    monkeypatch.setattr(module, "_request", fake_request)
    monkeypatch.setattr(module, "_demo_login", lambda *_args, **_kwargs: "token")

    rc, payload = _run_main(module, tmp_path, monkeypatch)
    assert rc == 1
    assert payload["decision"] == "BLOCK"
    assert payload["potential_write_count"] > 0
    assert payload["precondition_failure_count"] == 0
    assert payload["coverage_complete"] is True
    assert "potential_write_detected" in payload["blocking_reasons"]
