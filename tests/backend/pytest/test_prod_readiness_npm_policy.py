from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
POLICY_PATH = (
    REPO_ROOT
    / "scripts"
    / "security"
    / "prod_readiness_audit"
    / "npm-audit-policy.json"
)
SECURITY_SCRIPTS_DIR = REPO_ROOT / "scripts" / "security"
if str(SECURITY_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SECURITY_SCRIPTS_DIR))


def _audit_payload(advisory_id: str = "GHSA-qwww-vcr4-c8h2") -> dict[str, object]:
    return {
        "auditReportVersion": 2,
        "metadata": {
            "vulnerabilities": {
                "info": 0,
                "low": 0,
                "moderate": 0,
                "high": 2,
                "critical": 0,
                "total": 2,
            }
        },
        "vulnerabilities": {
            "react-router": {
                "name": "react-router",
                "severity": "high",
                "via": [
                    {
                        "url": f"https://github.com/advisories/{advisory_id}",
                        "severity": "high",
                        "range": ">=7.12.0 <8.3.0",
                    }
                ],
            },
            "react-router-dom": {
                "name": "react-router-dom",
                "severity": "high",
                "via": ["react-router"],
            },
        },
    }


def _accepted_policy(advisory_id: str = "GHSA-qwww-vcr4-c8h2") -> dict[str, object]:
    return {
        "schema_version": 1,
        "accepted_advisory": {
            "id": advisory_id,
            "severity": "high",
            "packages": ["react-router", "react-router-dom"],
            "owner": "Frontend Platform",
            "reason": "Temporary test acceptance.",
            "reachability_evidence": "Test reachability evidence.",
            "no_fixed_version_proof": "Test no-fix evidence.",
            "exit_criterion": "Remove this test acceptance.",
            "expires_on": "2099-12-31",
        },
    }


def test_removed_react_router_acceptance_fails_closed_without_mutating_raw_report(
    tmp_path: Path,
) -> None:
    from prod_readiness_audit.npm_audit_policy import evaluate_npm_audit

    raw_report = tmp_path / "npm-audit.json"
    raw_payload = _audit_payload()
    raw_report.write_text(json.dumps(raw_payload), encoding="utf-8")
    before = raw_report.read_bytes()

    result = evaluate_npm_audit(raw_report=raw_report, policy_path=POLICY_PATH)

    assert raw_report.read_bytes() == before
    assert result["raw_high_critical_packages"] == 2
    assert result["accepted_high_critical_packages"] == 0
    assert result["open_high_critical_packages"] == 2
    assert result["accepted_advisories"] == []
    assert result["open_packages"] == ["react-router", "react-router-dom"]


def test_empty_policy_accepts_a_clean_audit_report(tmp_path: Path) -> None:
    from prod_readiness_audit.npm_audit_policy import evaluate_npm_audit

    raw_report = tmp_path / "npm-audit.json"
    raw_report.write_text(
        json.dumps(
            {
                "auditReportVersion": 2,
                "metadata": {
                    "vulnerabilities": {
                        "info": 0,
                        "low": 0,
                        "moderate": 0,
                        "high": 0,
                        "critical": 0,
                        "total": 0,
                    }
                },
                "vulnerabilities": {},
            }
        ),
        encoding="utf-8",
    )

    result = evaluate_npm_audit(raw_report=raw_report, policy_path=POLICY_PATH)

    assert result["raw_high_critical_packages"] == 0
    assert result["accepted_high_critical_packages"] == 0
    assert result["open_high_critical_packages"] == 0
    assert result["accepted_advisories"] == []


def test_policy_without_accepted_advisory_key_fails_closed(tmp_path: Path) -> None:
    from prod_readiness_audit.npm_audit_policy import (
        NpmAuditPolicyError,
        evaluate_npm_audit,
    )

    raw_report = tmp_path / "npm-audit.json"
    raw_report.write_text(json.dumps(_audit_payload()), encoding="utf-8")
    policy_path = tmp_path / "policy.json"
    policy_path.write_text(json.dumps({"schema_version": 1}), encoding="utf-8")

    with pytest.raises(NpmAuditPolicyError, match="accepted_advisory"):
        evaluate_npm_audit(raw_report=raw_report, policy_path=policy_path)


def test_expired_policy_fails_closed(tmp_path: Path) -> None:
    from prod_readiness_audit.npm_audit_policy import (
        NpmAuditPolicyError,
        evaluate_npm_audit,
    )

    raw_report = tmp_path / "npm-audit.json"
    raw_report.write_text(json.dumps(_audit_payload()), encoding="utf-8")
    policy_path = tmp_path / "policy.json"
    policy_path.write_text(json.dumps(_accepted_policy()), encoding="utf-8")

    with pytest.raises(NpmAuditPolicyError, match="expired"):
        evaluate_npm_audit(
            raw_report=raw_report, policy_path=policy_path, today=date(2100, 1, 1)
        )


def test_policy_without_required_risk_evidence_fails_closed(tmp_path: Path) -> None:
    from prod_readiness_audit.npm_audit_policy import (
        NpmAuditPolicyError,
        evaluate_npm_audit,
    )

    raw_report = tmp_path / "npm-audit.json"
    raw_report.write_text(json.dumps(_audit_payload()), encoding="utf-8")
    malformed_policy = _accepted_policy()
    del malformed_policy["accepted_advisory"]["reachability_evidence"]
    policy_path = tmp_path / "policy.json"
    policy_path.write_text(json.dumps(malformed_policy), encoding="utf-8")

    with pytest.raises(NpmAuditPolicyError, match="reachability_evidence"):
        evaluate_npm_audit(raw_report=raw_report, policy_path=policy_path)


def test_candidate_router_lock_uses_the_fixed_patch_release() -> None:
    package_lock = json.loads(
        (REPO_ROOT / "frontend" / "package-lock.json").read_text(encoding="utf-8")
    )
    packages = package_lock["packages"]
    router_dom = packages["node_modules/react-router-dom"]
    router = packages["node_modules/react-router"]
    assert router_dom["version"] == "7.18.2"
    assert router_dom["dependencies"]["react-router"] == router["version"]
    assert router["version"] == "7.18.2"


def test_wrong_advisory_id_remains_open_and_cli_fails(tmp_path: Path) -> None:
    from prod_readiness_audit.npm_audit_policy import main

    raw_report = tmp_path / "npm-audit.json"
    raw_report.write_text(json.dumps(_audit_payload()), encoding="utf-8")
    wrong_policy = _accepted_policy("GHSA-1111-2222-3333")
    policy_path = tmp_path / "policy.json"
    policy_path.write_text(json.dumps(wrong_policy), encoding="utf-8")
    filtered_report = tmp_path / "npm-audit-filtered.json"

    exit_code = main(
        [
            "--raw-report",
            str(raw_report),
            "--policy",
            str(policy_path),
            "--filtered-report",
            str(filtered_report),
        ]
    )

    result = json.loads(filtered_report.read_text(encoding="utf-8"))
    assert exit_code == 1
    assert result["raw_high_critical_packages"] == 2
    assert result["accepted_high_critical_packages"] == 0
    assert result["open_high_critical_packages"] == 2
    assert result["open_packages"] == ["react-router", "react-router-dom"]


def test_prod_readiness_phase_preserves_raw_npm_audit_and_gates_on_filtered_report() -> (
    None
):
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_run_state

    state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
    supply_chain = next(
        phase
        for phase in build_prod_readiness_phases(state)
        if phase.name == "supply_chain"
    )
    command = next(
        item.command
        for item in supply_chain.commands
        if item.command_id == "p4_npm_audit_high"
    )

    assert "npm audit --audit-level=high --json" in command
    assert "npm-audit.json" in command
    assert "npm_audit_policy.py" in command
    assert "npm-audit-policy.json" in command
    assert "npm-audit-filtered.json" in command
    assert "audit_rc" in command
    assert 'test "$audit_rc" -le 1' in command


def test_supply_chain_score_reports_raw_and_accepted_npm_counts_but_blocks_only_open(
    tmp_path: Path,
) -> None:
    from prod_readiness_audit.run_state import build_run_state
    from prod_readiness_audit.scoring import (
        build_supply_chain_counts,
        score_command_results,
    )

    state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
    state.artifact_root = tmp_path
    state.ensure_directories()
    for filename, payload in {
        "trivy-backend.json": {"Results": []},
        "trivy-frontend.json": {"Results": []},
        "grype-backend.json": {"matches": []},
        "gitleaks-report.json": [],
        "npm-audit-filtered.json": {
            "raw_high_critical_packages": 2,
            "accepted_high_critical_packages": 2,
            "open_high_critical_packages": 0,
        },
    }.items():
        (state.reports_dir / filename).write_text(json.dumps(payload), encoding="utf-8")

    counts = build_supply_chain_counts(state.reports_dir)
    findings, _ = score_command_results(state)

    assert counts["npm_raw_high_critical"] == 2
    assert counts["npm_accepted_high_critical"] == 2
    assert counts["npm_open_high_critical"] == 0
    assert not any(finding["id"] == "MC-12" for finding in findings)

    (state.reports_dir / "npm-audit-filtered.json").write_text(
        json.dumps(
            {
                "raw_high_critical_packages": 2,
                "accepted_high_critical_packages": 1,
                "open_high_critical_packages": 1,
            }
        ),
        encoding="utf-8",
    )

    findings, _ = score_command_results(state)

    assert any(finding["id"] == "MC-12" for finding in findings)
