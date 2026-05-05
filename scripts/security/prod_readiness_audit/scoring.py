from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from prod_readiness_audit.artifacts import build_run_status, write_json, write_text
from prod_readiness_audit.run_state import ProdReadinessRunState


@dataclass(frozen=True)
class ProdReadinessScore:
    blocking_failures: int = 0
    warnings: int = 0


def _read_json(path: Path) -> object | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def parse_first_http_code(path: Path) -> int | None:
    text = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
    match = re.search(r"\b([1-5][0-9][0-9])\b", text)
    return int(match.group(1)) if match else None


def parse_frontend_uid(path: Path) -> int | None:
    text = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.isdigit():
            return int(stripped)
    return None


def find_protocol_probe_results_path(state: ProdReadinessRunState) -> Path | None:
    probe_log = state.log_dir / "p2_security_contract_probe.log"
    if probe_log.exists():
        text = probe_log.read_text(encoding="utf-8", errors="replace")
        matches = re.findall(r"(/[^\s'\"]*probe-results\.json)", text)
        if matches:
            return Path(matches[-1])

    candidates = sorted(
        state.root_dir.glob("tests/results/security/contract-drift-remediation-*/protocol/probe-results.json"),
        key=lambda path: path.stat().st_mtime,
    )
    return candidates[-1] if candidates else None


def _failed_protocol_probe_counts() -> dict[str, int]:
    return {"unresolved_contract_drift_count": 999, "security_defect_count": 999}


def _protocol_probe_count(summary: dict[str, object], key: str) -> int:
    try:
        return int(summary.get(key, 999))
    except (TypeError, ValueError):
        return 999


def read_protocol_probe_counts(path: Path | None) -> dict[str, int]:
    if path is None or not path.exists():
        return _failed_protocol_probe_counts()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return _failed_protocol_probe_counts()
    if not isinstance(payload, dict):
        return _failed_protocol_probe_counts()
    summary = payload.get("summary", {})
    if not isinstance(summary, dict):
        return _failed_protocol_probe_counts()
    return {
        "unresolved_contract_drift_count": _protocol_probe_count(summary, "unresolved_contract_drift_count"),
        "security_defect_count": _protocol_probe_count(summary, "security_defect_count"),
    }


def trivy_high_critical_count(path: Path) -> int:
    payload = _read_json(path)
    if not isinstance(payload, dict):
        return 999
    total = 0
    for result in payload.get("Results", []):
        if not isinstance(result, dict):
            continue
        for vulnerability in result.get("Vulnerabilities") or []:
            if str(vulnerability.get("Severity", "")).upper() in {"HIGH", "CRITICAL"}:
                total += 1
    return total


def grype_high_critical_count(path: Path) -> int:
    payload = _read_json(path)
    if not isinstance(payload, dict):
        return 999
    total = 0
    for match in payload.get("matches", []):
        if not isinstance(match, dict):
            continue
        vulnerability = match.get("vulnerability", {})
        if isinstance(vulnerability, dict) and str(vulnerability.get("severity", "")).upper() in {"HIGH", "CRITICAL"}:
            total += 1
    return total


def gitleaks_count(path: Path) -> int:
    payload = _read_json(path)
    if isinstance(payload, list):
        return len(payload)
    return 999


def build_supply_chain_counts(reports_dir: Path) -> dict[str, int]:
    return {
        "trivy_backend_high_critical": trivy_high_critical_count(reports_dir / "trivy-backend.json"),
        "trivy_frontend_high_critical": trivy_high_critical_count(reports_dir / "trivy-frontend.json"),
        "grype_backend_high_critical": grype_high_critical_count(reports_dir / "grype-backend.json"),
        "gitleaks_findings": gitleaks_count(reports_dir / "gitleaks-report.json"),
    }


def _rc_by_id(state: ProdReadinessRunState) -> dict[str, int]:
    return {str(row["id"]): int(row.get("rc", 127)) for row in state.command_results}


def _mandatory_control_finding(
    *,
    control_id: str,
    summary: str,
    evidence: list[Path],
    details: dict[str, object],
) -> dict[str, object]:
    return {
        "id": control_id,
        "severity": "High",
        "surface": "prod-readiness",
        "classification": "mandatory control failure",
        "summary": summary,
        "evidence": [str(path) for path in evidence],
        "details": details,
    }


def evaluate_mandatory_controls(state: ProdReadinessRunState) -> list[dict[str, object]]:
    rc_by_id = _rc_by_id(state)
    findings: list[dict[str, object]] = []

    invalid_host_rc = rc_by_id.get("p2_preflight_invalid_host_range", 127)
    invalid_container_rc = rc_by_id.get("p2_preflight_invalid_container_port", 127)
    if invalid_host_rc == 0 or invalid_container_rc == 0:
        findings.append(
            _mandatory_control_finding(
                control_id="MC-06",
                summary="Invalid frontend preflight probes must be rejected.",
                evidence=[
                    state.log_dir / "p2_preflight_invalid_host_range.log",
                    state.log_dir / "p2_preflight_invalid_container_port.log",
                ],
                details={"host_rc": invalid_host_rc, "container_rc": invalid_container_rc},
            )
        )

    unsupported_artifacts_rc = rc_by_id.get("p2_unsupported_prod_artifacts_absent", 127)
    if unsupported_artifacts_rc != 0:
        findings.append(
            _mandatory_control_finding(
                control_id="MC-07",
                summary="Unsupported retired production artifacts must remain absent.",
                evidence=[state.log_dir / "p2_unsupported_prod_artifacts_absent.log"],
                details={"rc": unsupported_artifacts_rc},
            )
        )

    frontend_uid = parse_frontend_uid(state.log_dir / "p3_frontend_uid.log")
    if frontend_uid is None or frontend_uid == 0:
        findings.append(
            _mandatory_control_finding(
                control_id="MC-08",
                summary="Frontend runtime must execute as a non-root UID.",
                evidence=[state.log_dir / "p3_frontend_uid.log"],
                details={"uid": frontend_uid},
            )
        )

    lifecycle_commands = {
        "p3_cli_preflight": rc_by_id.get("p3_cli_preflight", 127),
        "p3_cli_deploy": rc_by_id.get("p3_cli_deploy", 127),
        "p3_status_after_deploy": rc_by_id.get("p3_status_after_deploy", 127),
        "p3_verify_runtime": rc_by_id.get("p3_verify_runtime", 127),
        "p3_cli_smoke_after_deploy": rc_by_id.get("p3_cli_smoke_after_deploy", 127),
        "p3_cli_upgrade": rc_by_id.get("p3_cli_upgrade", 127),
        "p3_cli_rollback": rc_by_id.get("p3_cli_rollback", 127),
        "p3_cli_smoke_after_rollback": rc_by_id.get("p3_cli_smoke_after_rollback", 127),
    }
    if any(rc != 0 for rc in lifecycle_commands.values()):
        findings.append(
            _mandatory_control_finding(
                control_id="MC-09",
                summary="Deploy lifecycle preflight/deploy/status/runtime/smoke/upgrade/rollback must pass.",
                evidence=[state.log_dir / f"{command_id}.log" for command_id in lifecycle_commands],
                details=lifecycle_commands,
            )
        )

    docs_code = parse_first_http_code(state.log_dir / "p3_backend_docs_code.log")
    openapi_code = parse_first_http_code(state.log_dir / "p3_backend_openapi_code.log")
    if docs_code != 404 or openapi_code != 404:
        findings.append(
            _mandatory_control_finding(
                control_id="MC-10",
                summary="Production runtime must not expose /docs or /openapi.json.",
                evidence=[
                    state.log_dir / "p3_backend_docs_code.log",
                    state.log_dir / "p3_backend_openapi_code.log",
                ],
                details={"docs_code": docs_code, "openapi_code": openapi_code},
            )
        )

    protocol_probe_path = find_protocol_probe_results_path(state)
    protocol_counts = read_protocol_probe_counts(protocol_probe_path)
    if any(count != 0 for count in protocol_counts.values()):
        evidence = [state.log_dir / "p2_security_contract_probe.log"]
        if protocol_probe_path is not None:
            evidence.append(protocol_probe_path)
        findings.append(
            _mandatory_control_finding(
                control_id="MC-11",
                summary="Protocol contract probe must report zero unresolved drift and security defects.",
                evidence=evidence,
                details=protocol_counts,
            )
        )

    return findings


def score_command_results(state: ProdReadinessRunState) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    findings: list[dict[str, object]] = []
    for row in state.command_results:
        if bool(row.get("required")) and int(row.get("rc", 0)) != 0:
            findings.append(
                {
                    "id": f"prod-readiness-command-failed-{row['id']}",
                    "severity": "High",
                    "surface": "prod-readiness",
                    "classification": "audit evidence failure",
                    "summary": f"Required prod-readiness command failed: {row['id']}",
                    "log": row.get("log"),
                }
            )
    findings.extend(evaluate_mandatory_controls(state))
    supply_counts = build_supply_chain_counts(state.reports_dir)
    if any(count != 0 for count in supply_counts.values()):
        findings.append(
            {
                "id": "MC-12",
                "severity": "High",
                "surface": "supply-chain",
                "classification": "supply-chain gate failure",
                "summary": "Supply-chain gates reported unresolved High/Critical findings or missing scan output.",
                "counts": supply_counts,
                "evidence": str(state.reports_dir / "supply-chain-counts.json"),
            }
        )
    blocking = len(findings)
    score = 5 if blocking == 0 else max(0, 3 - blocking)
    scorecard = [
        {
            "domain": "production readiness",
            "status": "pass" if blocking == 0 else "needs-attention",
            "score_0_to_5": score,
            "evidence": [str(state.matrix_json), str(state.reports_dir / "findings.json")],
        }
    ]
    return findings, scorecard


def write_final_artifacts(state: ProdReadinessRunState) -> int:
    findings, scorecard = score_command_results(state)
    open_high_critical_count = len(findings)
    status = "complete"
    exit_code = 1 if state.required_failures or open_high_critical_count else 0
    state.planned_run_complete = True

    write_json(state.reports_dir / "supply-chain-counts.json", build_supply_chain_counts(state.reports_dir))
    write_json(state.matrix_json, state.command_results)
    write_json(
        state.reports_dir / "findings.json",
        {
            "run_id": state.run_id,
            "generated_at_utc": datetime.now(UTC).isoformat(),
            "open_high_critical_count": open_high_critical_count,
            "findings": findings,
        },
    )
    write_json(state.reports_dir / "scorecard.json", scorecard)
    summary_payload = {
        "run_id": state.run_id,
        "status": status,
        "artifact_root": str(state.artifact_root),
        "required_failures": state.required_failures,
        "open_high_critical_count": open_high_critical_count,
        "matrix": str(state.matrix_json),
        "findings": str(state.reports_dir / "findings.json"),
        "scorecard": str(state.reports_dir / "scorecard.json"),
        "report": str(state.report_artifact_path),
    }
    write_json(state.artifact_root / "SUMMARY.json", summary_payload)
    write_json(state.run_status_json, build_run_status(state, status=status, exit_code=exit_code))
    report_lines = [
        f"# Production Readiness Audit ({state.run_id})",
        "",
        f"- Status: **{status}**",
        f"- Required failures: `{state.required_failures}`",
        f"- Open High/Critical findings: `{open_high_critical_count}`",
        "",
        "## Scorecard",
    ]
    for item in scorecard:
        report_lines.append(f"- {item['domain']}: **{item['status']}** ({item['score_0_to_5']}/5)")
    report_lines.extend(
        [
            "",
            "## Evidence",
            f"- Command matrix: `{state.matrix_json}`",
            f"- Findings: `{state.reports_dir / 'findings.json'}`",
            f"- Scorecard: `{state.reports_dir / 'scorecard.json'}`",
            "",
        ]
    )
    write_text(state.report_artifact_path, "\n".join(report_lines))
    write_text(state.report_path, "\n".join(report_lines))
    return exit_code
