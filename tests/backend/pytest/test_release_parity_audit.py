from __future__ import annotations

import argparse
import importlib.util
import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

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
ARTIFACT_WRITER_MODULE = importlib.import_module("release_parity_audit.artifact_writer")
LAUNCH_CLASSIFIER_MODULE = importlib.import_module(
    "release_parity_audit.launch_classifier"
)
HTTP_PROBE_MODULE = importlib.import_module("release_parity_audit.http_probe")
AUDIT_MODULE = importlib.import_module("release_parity_audit.audit")
CLI_MODULE = importlib.import_module("release_parity_audit.cli")
RUNTIME_COMMANDS_MODULE = importlib.import_module(
    "release_parity_audit.runtime_commands"
)
ENV_PREPARATION_MODULE = importlib.import_module("release_parity_audit.env_preparation")
FINGERPRINTS_MODULE = importlib.import_module("release_parity_audit.fingerprints")
evaluate_findings_and_decision = DECISION_MODULE.evaluate_findings_and_decision
build_report = REPORTING_MODULE.build_report
build_run_status = REPORTING_MODULE.build_run_status
matrix_payload = REPORTING_MODULE.matrix_payload

BASELINE_GIT_SHA = "a" * 40
OTHER_GIT_SHA = "b" * 40


def _valid_dependency_diffs() -> dict[str, object]:
    return {
        "backend_drift": [],
        "frontend_drift": [],
        "evidence_status": {
            name: {"available": True, "error": None}
            for name in (
                "backend_image_build",
                "backend_local",
                "backend_image",
                "frontend_installed",
                "frontend_lock",
            )
        },
    }


def _canonical_prod_readiness_commands(
    artifact_root: Path, *, security_probe_port: int = 29000
):
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_plan_state

    state = build_plan_state(
        root_dir=REPO_ROOT,
        run_id="fresh",
        report_date="2026-08-03",
        artifact_root=artifact_root,
        report_path=REPO_ROOT
        / "docs"
        / "security"
        / "reports"
        / "prod-readiness-deep-audit-2026-08-03.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
        security_probe_port=security_probe_port,
    )
    return state, [
        command
        for phase in build_prod_readiness_phases(state)
        for command in phase.commands
    ]


def _canonical_prod_readiness_command_ids() -> list[str]:
    _, commands = _canonical_prod_readiness_commands(
        REPO_ROOT / "tests" / "results" / "prod" / "prod-readiness-audit-fresh"
    )
    return [command.command_id for command in commands]


def _evaluate_prod_readiness(
    runtime_fingerprints: list[dict[str, object]],
    tmp_path: Path,
    *,
    required_failures: int = 0,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    return evaluate_findings_and_decision(
        run_id="test-prod-readiness",
        baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"},
        runtime_fingerprints=runtime_fingerprints,
        static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
        toolchain_fingerprint={},
        dep_diffs=_valid_dependency_diffs(),
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=required_failures,
        artifact_root=tmp_path,
        deps_dir=tmp_path / "deps",
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-03T00:00:00+00:00",
    )


def _scalar_only_prod_readiness_fingerprint() -> dict[str, object]:
    return {
        "context_id": "prod_readiness_ingest",
        "startup_path_id": "prod_readiness",
        "run_rc": 0,
        "summary": {
            "status": "complete",
            "required_failures": 0,
            "open_high_critical_count": 0,
        },
    }


def _write_prod_readiness_artifact(
    artifact_root: Path,
    *,
    required_failures: int = 0,
    finding_count: int = 0,
    git_sha: str | None = BASELINE_GIT_SHA,
    git_status_short: str | None = "",
    exit_code: int = 0,
    command_ids: list[str] | None = None,
    security_probe_port: int = 29000,
) -> dict[str, object]:
    reports_dir = artifact_root / "reports"
    reports_dir.mkdir(parents=True)
    logs_dir = artifact_root / "logs"
    logs_dir.mkdir()
    meta_dir = artifact_root / "meta"
    meta_dir.mkdir()
    if git_sha is not None:
        (meta_dir / "git_head.txt").write_text(f"{git_sha}\n", encoding="utf-8")
    if git_status_short is not None:
        (meta_dir / "git_status_short.txt").write_text(
            git_status_short, encoding="utf-8"
        )
    matrix_path = reports_dir / "command-matrix.json"
    findings_path = reports_dir / "findings.json"
    scorecard_path = reports_dir / "scorecard.json"
    report_path = reports_dir / "report.md"
    run_status_path = reports_dir / "run_status.json"
    state, canonical_commands = _canonical_prod_readiness_commands(
        artifact_root, security_probe_port=security_probe_port
    )
    canonical_by_id = {command.command_id: command for command in canonical_commands}
    effective_command_ids = (
        command_ids
        if command_ids is not None
        else [command.command_id for command in canonical_commands]
    )
    matrix = []
    for index, command_id in enumerate(effective_command_ids):
        command = canonical_by_id.get(command_id)
        command_text = command.command if command is not None else "true"
        required = command.required if command is not None else True
        timeout_sec = command.timeout_sec if command is not None else 120
        cwd = (
            command.cwd
            if command is not None and command.cwd is not None
            else state.root_dir
        )
        log_path = logs_dir / f"{command_id}.log"
        log_path.write_text(f"$ {command_text}\n\n", encoding="utf-8")
        result_path = logs_dir / f"{command_id}.result.json"
        command_rc = 1 if index < required_failures else 0
        result_path.write_text(
            json.dumps(
                {
                    "id": command_id,
                    "command": command_text,
                    "rc": command_rc,
                    "timed_out": False,
                }
            ),
            encoding="utf-8",
        )
        matrix.append(
            {
                "id": command_id,
                "command": command_text,
                "cwd": str(cwd),
                "required": required,
                "timeout_sec": timeout_sec,
                "rc": command_rc,
                "log": str(log_path),
                "result": str(result_path),
                "timed_out": False,
            }
        )
    matrix_path.write_text(
        json.dumps(matrix),
        encoding="utf-8",
    )
    finding_items = [
        {"id": f"finding-{index}", "severity": "High"} for index in range(finding_count)
    ]
    findings_path.write_text(
        json.dumps(
            {
                "run_id": "fresh",
                "open_high_critical_count": finding_count,
                "findings": finding_items,
                "evidence": [str(matrix_path)],
                "log": str(logs_dir / f"{effective_command_ids[0]}.log"),
            }
        ),
        encoding="utf-8",
    )
    scorecard_path.write_text(
        json.dumps(
            [
                {
                    "domain": "production readiness",
                    "status": "pass" if finding_count == 0 else "needs-attention",
                    "score_0_to_5": 5
                    if finding_count == 0
                    else max(0, 3 - finding_count),
                    "evidence": [str(matrix_path), str(findings_path)],
                }
            ]
        ),
        encoding="utf-8",
    )
    report_path.write_text(
        "\n".join(
            [
                "# Production Readiness Audit",
                f"- Command matrix: `{matrix_path}`",
                f"- Findings: `{findings_path}`",
                f"- Scorecard: `{scorecard_path}`",
                f"- Run status: `{run_status_path}`",
            ]
        ),
        encoding="utf-8",
    )
    command_ids = [str(row["id"]) for row in matrix]
    run_status_path.write_text(
        json.dumps(
            {
                "run_id": "fresh",
                "status": "complete",
                "artifact_root": str(artifact_root),
                "report": str(report_path),
                "report_artifact": str(report_path),
                "matrix": str(matrix_path),
                "exit_code": exit_code,
                "required_failures": required_failures,
                "completed_command_count": len(matrix),
                "planned_command_count": len(command_ids),
                "planned_command_ids": command_ids,
                "plan_inputs": {
                    "root_dir": str(state.root_dir),
                    "artifact_root": str(state.artifact_root),
                    "report_path": str(state.report_path),
                    "report_date": state.report_date,
                    "postgres_port": state.postgres_port,
                    "frontend_host_port": state.frontend_host_port,
                    "registry_port": state.registry_port,
                    "security_probe_port": state.security_probe_port,
                },
                "planned_run_complete": True,
            }
        ),
        encoding="utf-8",
    )
    summary: dict[str, object] = {
        "run_id": "fresh",
        "status": "complete",
        "artifact_root": str(artifact_root),
        "required_failures": required_failures,
        "open_high_critical_count": finding_count,
        "matrix": str(matrix_path),
        "findings": str(findings_path),
        "scorecard": str(scorecard_path),
        "report": str(report_path),
        "run_status": str(run_status_path),
    }
    (artifact_root / "SUMMARY.json").write_text(
        json.dumps(summary),
        encoding="utf-8",
    )
    return summary


def _valid_prod_readiness_fingerprint(
    artifact_root: Path,
    *,
    run_rc: int = 0,
    required_failures: int = 0,
    finding_count: int = 0,
    command_ids: list[str] | None = None,
) -> dict[str, object]:
    summary = _write_prod_readiness_artifact(
        artifact_root,
        required_failures=required_failures,
        finding_count=finding_count,
        exit_code=run_rc,
        command_ids=command_ids,
    )
    return {
        "context_id": "prod_readiness_ingest",
        "startup_path_id": "prod_readiness",
        "copied_to": str(artifact_root),
        "run_rc": run_rc,
        "prod_readiness_git_sha": BASELINE_GIT_SHA,
        "prod_readiness_git_sha_error": None,
        "prod_readiness_git_status_short": "",
        "prod_readiness_git_status_short_error": None,
        "summary": summary,
    }


def _score_prod_readiness_scanner_report(
    artifact_root: Path, scanner: str, payload: object
) -> tuple[int, dict[str, object]]:
    from prod_readiness_audit.npm_audit_policy import main as npm_policy_main
    from prod_readiness_audit.run_state import build_plan_state
    from prod_readiness_audit.scoring import write_final_artifacts

    _write_prod_readiness_artifact(artifact_root)
    state = build_plan_state(
        root_dir=REPO_ROOT,
        run_id="fresh",
        report_date="2026-08-03",
        artifact_root=artifact_root,
        report_path=artifact_root / "formal-report.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )
    state.command_results = json.loads(state.matrix_json.read_text(encoding="utf-8"))
    state.planned_command_ids = [str(row["id"]) for row in state.command_results]

    for command_id in (
        "p2_preflight_invalid_host_range",
        "p2_preflight_invalid_container_port",
    ):
        row = next(item for item in state.command_results if item["id"] == command_id)
        row["rc"] = 1
        Path(str(row["result"])).write_text(
            json.dumps(
                {
                    "id": command_id,
                    "command": row["command"],
                    "rc": 1,
                    "timed_out": False,
                }
            ),
            encoding="utf-8",
        )

    protocol_results = state.tmp_dir / "protocol" / "probe-results.json"
    protocol_results.parent.mkdir(parents=True, exist_ok=True)
    protocol_results.write_text(
        json.dumps(
            {
                "summary": {
                    "unresolved_contract_drift_count": 0,
                    "security_defect_count": 0,
                }
            }
        ),
        encoding="utf-8",
    )
    (state.log_dir / "p2_security_contract_probe.log").write_text(
        f"{protocol_results}\n", encoding="utf-8"
    )
    (state.log_dir / "p3_frontend_uid.log").write_text("101\n", encoding="utf-8")
    (state.log_dir / "p3_backend_docs_code.log").write_text("404\n", encoding="utf-8")
    (state.log_dir / "p3_backend_openapi_code.log").write_text(
        "404\n", encoding="utf-8"
    )

    reports = {
        "trivy-backend.json": {"Results": []},
        "trivy-frontend.json": {"Results": []},
        "grype-backend.json": {"matches": []},
        "gitleaks-report.json": [],
        "npm-audit-filtered.json": {
            "raw_high_critical_packages": 0,
            "accepted_high_critical_packages": 0,
            "open_high_critical_packages": 0,
        },
    }
    if scanner == "npm":
        raw_report = state.reports_dir / "npm-audit.json"
        raw_report.write_text(json.dumps(payload), encoding="utf-8")
        npm_rc = npm_policy_main(
            [
                "--raw-report",
                str(raw_report),
                "--policy",
                str(
                    REPO_ROOT
                    / "scripts"
                    / "security"
                    / "prod_readiness_audit"
                    / "npm-audit-policy.json"
                ),
                "--filtered-report",
                str(state.reports_dir / "npm-audit-filtered.json"),
            ]
        )
        npm_row = next(
            item for item in state.command_results if item["id"] == "p4_npm_audit_high"
        )
        npm_row["rc"] = npm_rc
        state.required_failures = int(npm_rc != 0)
        Path(str(npm_row["result"])).write_text(
            json.dumps(
                {
                    "id": npm_row["id"],
                    "command": npm_row["command"],
                    "rc": npm_rc,
                    "timed_out": False,
                }
            ),
            encoding="utf-8",
        )
        reports.pop("npm-audit-filtered.json")
    else:
        reports[scanner] = payload
    for filename, report in reports.items():
        (state.reports_dir / filename).write_text(json.dumps(report), encoding="utf-8")

    child_rc = write_final_artifacts(state)
    summary = json.loads((artifact_root / "SUMMARY.json").read_text(encoding="utf-8"))
    return child_rc, summary


@pytest.mark.parametrize(
    ("scanner", "payload"),
    [
        ("trivy-backend.json", {"Results": ["not-an-object"]}),
        ("trivy-backend.json", {"Results": [{"Vulnerabilities": {}}]}),
        (
            "trivy-backend.json",
            {"Results": [{"Vulnerabilities": ["not-an-object"]}]},
        ),
        ("grype-backend.json", {"matches": ["not-an-object"]}),
        ("grype-backend.json", {"matches": [{"vulnerability": []}]}),
        (
            "npm",
            {
                "auditReportVersion": 2,
                "metadata": {"vulnerabilities": {"high": 0, "critical": 0}},
                "vulnerabilities": {"malformed-package": []},
            },
        ),
    ],
)
def test_malformed_successful_scanner_reports_fail_child_and_top_level_decision(
    tmp_path: Path, scanner: str, payload: object
) -> None:
    artifact_root = tmp_path / scanner.replace(".json", "")
    child_rc, summary = _score_prod_readiness_scanner_report(
        artifact_root, scanner, payload
    )
    findings_payload = json.loads(
        Path(str(summary["findings"])).read_text(encoding="utf-8")
    )

    fingerprint = {
        "context_id": "prod_readiness_ingest",
        "startup_path_id": "prod_readiness",
        "copied_to": str(artifact_root),
        "run_rc": child_rc,
        "prod_readiness_git_sha": BASELINE_GIT_SHA,
        "prod_readiness_git_sha_error": None,
        "prod_readiness_git_status_short": "",
        "prod_readiness_git_status_short_error": None,
        "summary": summary,
    }
    _findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert child_rc != 0
    assert any(item["id"] == "MC-12" for item in findings_payload["findings"])
    assert decision["decision"] == "NO-GO"


def test_prod_readiness_ingest_rebases_evidence_after_fresh_worktree_cleanup(
    monkeypatch, tmp_path: Path
) -> None:
    detached_worktree = tmp_path / "detached"
    detached_worktree.mkdir()
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)

    def run_command(command_id: str, _command: str, **_kwargs):
        if command_id == "prod_readiness_run":
            _write_prod_readiness_artifact(
                detached_worktree
                / "tests"
                / "results"
                / "prod"
                / "prod-readiness-audit-fresh"
            )
        return SimpleNamespace(rc=0)

    monkeypatch.setattr(
        FINGERPRINTS_MODULE.tempfile,
        "mkdtemp",
        lambda **_kwargs: str(detached_worktree),
    )
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_prod_readiness_by_running_worktree(
        root_dir=REPO_ROOT,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        run_command=run_command,
        captured_at_utc=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert not detached_worktree.exists()
    fingerprint = runtime_fingerprints[0]
    copied_to = Path(str(fingerprint["copied_to"]))
    assert str(detached_worktree) not in json.dumps(fingerprint)
    copied_summary = json.loads(
        (copied_to / "SUMMARY.json").read_text(encoding="utf-8")
    )
    assert fingerprint["summary"] == copied_summary
    assert fingerprint["prod_readiness_git_sha"] == BASELINE_GIT_SHA
    assert fingerprint["prod_readiness_git_status_short"] == ""
    for key in ("matrix", "findings", "scorecard", "report", "run_status"):
        evidence_path = Path(copied_summary[key])
        assert evidence_path.is_relative_to(copied_to)
        assert evidence_path.exists()
    copied_run_status = json.loads(
        (copied_to / "reports" / "run_status.json").read_text(encoding="utf-8")
    )
    assert copied_run_status["artifact_root"] == str(copied_to)
    for key in ("matrix", "report", "report_artifact"):
        assert Path(copied_run_status[key]).is_relative_to(copied_to)
    assert copied_run_status["plan_inputs"]["root_dir"] == str(REPO_ROOT)
    assert copied_run_status["plan_inputs"]["artifact_root"] == str(copied_to)
    assert copied_run_status["plan_inputs"]["report_path"] == str(
        copied_to / "reports" / "report.md"
    )
    copied_matrix = json.loads(
        (copied_to / "reports" / "command-matrix.json").read_text(encoding="utf-8")
    )
    for row in copied_matrix:
        assert Path(row["log"]).is_relative_to(copied_to)
        assert Path(row["result"]).is_relative_to(copied_to)
    for formal_path in (
        copied_to / "SUMMARY.json",
        copied_to / "reports" / "command-matrix.json",
        copied_to / "reports" / "findings.json",
        copied_to / "reports" / "scorecard.json",
        copied_to / "reports" / "run_status.json",
        copied_to / "reports" / "report.md",
    ):
        assert str(detached_worktree) not in formal_path.read_text(encoding="utf-8")
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "GO"
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)


def test_prod_readiness_worktree_removal_failure_is_required_and_cannot_claim_go(
    monkeypatch, tmp_path: Path
) -> None:
    detached_worktree = tmp_path / "detached-remove-failure"
    detached_worktree.mkdir()
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    removal_required: list[bool] = []

    def run_command(command_id: str, _command: str, **kwargs):
        if command_id == "prod_readiness_run":
            _write_prod_readiness_artifact(
                detached_worktree
                / "tests"
                / "results"
                / "prod"
                / "prod-readiness-audit-fresh"
            )
        if command_id == "prod_readiness_worktree_remove":
            removal_required.append(kwargs.get("required", True))
            return SimpleNamespace(rc=17, log_path=str(tmp_path / "remove.log"))
        return SimpleNamespace(rc=0, log_path=str(tmp_path / f"{command_id}.log"))

    monkeypatch.setattr(
        FINGERPRINTS_MODULE.tempfile,
        "mkdtemp",
        lambda **_kwargs: str(detached_worktree),
    )
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_prod_readiness_by_running_worktree(
        root_dir=REPO_ROOT,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        run_command=run_command,
        captured_at_utc=lambda: "2026-08-04T00:00:00+00:00",
    )

    fingerprint = runtime_fingerprints[0]
    assert removal_required == [True]
    assert detached_worktree.exists()
    assert fingerprint["source_worktree_removed"] is False
    assert fingerprint["source_worktree_remove_rc"] == 17
    assert fingerprint["source_worktree_remove_log"] == str(tmp_path / "remove.log")
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "NO-GO"
    invalid = next(
        item for item in findings if item["id"] == "P1-prod-readiness-evidence-invalid"
    )
    assert invalid["evidence_error"] == "production-readiness source worktree cleanup failed"


def test_prod_readiness_ingest_reconstructs_recorded_dynamic_security_probe_port(
    monkeypatch, tmp_path: Path
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root
        / "tests"
        / "results"
        / "prod"
        / "prod-readiness-audit-dynamic-security-port"
    )
    _write_prod_readiness_artifact(source_artifact, security_probe_port=29001)
    observed_ports: list[object] = []
    real_build_plan_state = FINGERPRINTS_MODULE.build_plan_state

    def recording_build_plan_state(**kwargs):
        observed_ports.append(kwargs.get("security_probe_port"))
        return real_build_plan_state(**kwargs)

    monkeypatch.setattr(
        FINGERPRINTS_MODULE, "build_plan_state", recording_build_plan_state
    )
    runtime_fingerprints: list[dict[str, object]] = []
    ingest_dir = tmp_path / "release-artifacts" / "prod-readiness-ingest"
    ingest_dir.mkdir(parents=True)

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-04T00:00:00+00:00",
    )

    assert runtime_fingerprints[0]["summary_error"] is None
    assert observed_ports == [29001]


@pytest.mark.parametrize("invalid_port", (None, "29001", True, 0, 65536))
def test_prod_readiness_ingest_rejects_invalid_security_probe_port(
    tmp_path: Path, invalid_port: object
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root
        / "tests"
        / "results"
        / "prod"
        / "prod-readiness-audit-invalid-security-port"
    )
    _write_prod_readiness_artifact(source_artifact, security_probe_port=29001)
    run_status_path = source_artifact / "reports" / "run_status.json"
    run_status = json.loads(run_status_path.read_text(encoding="utf-8"))
    if invalid_port is None:
        del run_status["plan_inputs"]["security_probe_port"]
    else:
        run_status["plan_inputs"]["security_probe_port"] = invalid_port
    run_status_path.write_text(json.dumps(run_status), encoding="utf-8")
    runtime_fingerprints: list[dict[str, object]] = []
    ingest_dir = tmp_path / "release-artifacts" / "prod-readiness-ingest"
    ingest_dir.mkdir(parents=True)

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-04T00:00:00+00:00",
    )

    assert (
        runtime_fingerprints[0]["summary_error"]
        == "Invalid production-readiness command plan"
    )


def test_full_prod_readiness_worktree_failure_cannot_reuse_valid_existing_evidence(
    monkeypatch, tmp_path: Path
) -> None:
    worktree_dir = tmp_path / "failed-worktree"
    worktree_dir.mkdir()
    existing_artifact = tmp_path / "existing-artifact"
    _valid_prod_readiness_fingerprint(existing_artifact)
    assert existing_artifact.is_dir()
    runtime_fingerprints: list[dict[str, object]] = []

    monkeypatch.setattr(
        FINGERPRINTS_MODULE.tempfile,
        "mkdtemp",
        lambda **_kwargs: str(worktree_dir),
    )

    FINGERPRINTS_MODULE.ingest_prod_readiness_by_running_worktree(
        root_dir=REPO_ROOT,
        prod_ingest_dir=tmp_path / "ingest",
        runtime_fingerprints=runtime_fingerprints,
        run_command=lambda *_args, **_kwargs: SimpleNamespace(rc=1),
        captured_at_utc=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert runtime_fingerprints == [
        {
            "context_id": "prod_readiness_ingest",
            "startup_path_id": "prod_readiness",
            "error": "Could not create isolated worktree for production-readiness audit",
            "run_rc": 1,
            "summary": None,
        }
    ]
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_prod_readiness_ingest_rejects_command_id_before_writing_derived_paths(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-unsafe"
    )
    _write_prod_readiness_artifact(source_artifact)
    matrix_path = source_artifact / "reports" / "command-matrix.json"
    matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
    matrix[0]["id"] = "../../escaped"
    matrix_path.write_text(json.dumps(matrix), encoding="utf-8")

    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    escaped_log = ingest_dir / "escaped.log"
    escaped_result = ingest_dir / "escaped.result.json"
    log_marker = f"do not rewrite {source_artifact}"
    result_marker = {"path": str(source_artifact), "untouched": True}
    escaped_log.write_text(log_marker, encoding="utf-8")
    escaped_result.write_text(json.dumps(result_marker), encoding="utf-8")
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    assert escaped_log.read_text(encoding="utf-8") == log_marker
    assert json.loads(escaped_result.read_text(encoding="utf-8")) == result_marker
    assert runtime_fingerprints[0]["summary"] is None
    assert "command ID" in str(runtime_fingerprints[0]["summary_error"])


def test_prod_readiness_ingest_copies_formally_referenced_external_evidence(
    monkeypatch, tmp_path: Path
) -> None:
    detached_worktree = tmp_path / "detached"
    detached_worktree.mkdir()
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)

    def run_command(command_id: str, _command: str, **_kwargs):
        if command_id == "prod_readiness_run":
            artifact = (
                detached_worktree
                / "tests"
                / "results"
                / "prod"
                / "prod-readiness-audit-external"
            )
            _write_prod_readiness_artifact(artifact, finding_count=1)
            protocol_evidence = (
                detached_worktree
                / "tests"
                / "results"
                / "security"
                / "contract-drift-remediation-fresh"
                / "protocol"
                / "probe-results.json"
            )
            protocol_evidence.parent.mkdir(parents=True)
            protocol_evidence.write_text(
                json.dumps({"summary": {"security_defect_count": 1}}),
                encoding="utf-8",
            )
            findings_path = artifact / "reports" / "findings.json"
            findings = json.loads(findings_path.read_text(encoding="utf-8"))
            findings["findings"][0]["evidence"] = [str(protocol_evidence)]
            findings_path.write_text(json.dumps(findings), encoding="utf-8")
            scorecard_path = artifact / "reports" / "scorecard.json"
            scorecard = json.loads(scorecard_path.read_text(encoding="utf-8"))
            scorecard[0]["evidence"].append(str(protocol_evidence))
            scorecard_path.write_text(json.dumps(scorecard), encoding="utf-8")
            report_path = artifact / "reports" / "report.md"
            report_path.write_text(
                report_path.read_text(encoding="utf-8")
                + f"\n- Protocol evidence: `{protocol_evidence}`\n",
                encoding="utf-8",
            )
            matrix = json.loads(
                (artifact / "reports" / "command-matrix.json").read_text(
                    encoding="utf-8"
                )
            )
            result_path = Path(matrix[0]["result"])
            result = json.loads(result_path.read_text(encoding="utf-8"))
            result["evidence"] = str(protocol_evidence)
            result_path.write_text(json.dumps(result), encoding="utf-8")
        return SimpleNamespace(rc=0)

    monkeypatch.setattr(
        FINGERPRINTS_MODULE.tempfile,
        "mkdtemp",
        lambda **_kwargs: str(detached_worktree),
    )
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_prod_readiness_by_running_worktree(
        root_dir=REPO_ROOT,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        run_command=run_command,
        captured_at_utc=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert not detached_worktree.exists()
    fingerprint = runtime_fingerprints[0]
    assert fingerprint["summary_error"] is None
    copied_to = Path(str(fingerprint["copied_to"]))
    copied_external = (
        copied_to
        / "external_evidence"
        / "security"
        / "contract-drift-remediation-fresh"
        / "protocol"
        / "probe-results.json"
    )
    assert json.loads(copied_external.read_text(encoding="utf-8")) == {
        "summary": {"security_defect_count": 1}
    }
    copied_result = (
        copied_to / "logs" / f"{_canonical_prod_readiness_command_ids()[0]}.result.json"
    )
    for formal_path in (
        copied_to / "reports" / "findings.json",
        copied_to / "reports" / "scorecard.json",
        copied_to / "reports" / "report.md",
        copied_result,
    ):
        text = formal_path.read_text(encoding="utf-8")
        assert str(detached_worktree) not in text
        assert str(copied_external) in text


@pytest.mark.parametrize("case", ["missing", "outside"])
def test_prod_readiness_ingest_rejects_invalid_external_evidence_reference(
    tmp_path: Path, case: str
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-invalid"
    )
    _write_prod_readiness_artifact(source_artifact, finding_count=1)
    if case == "missing":
        invalid_evidence = source_root / "tests" / "results" / "missing.json"
    else:
        invalid_evidence = source_root / "private.txt"
        invalid_evidence.write_text("must not be ingested", encoding="utf-8")
    findings_path = source_artifact / "reports" / "findings.json"
    findings = json.loads(findings_path.read_text(encoding="utf-8"))
    findings["findings"][0]["evidence"] = [str(invalid_evidence)]
    findings_path.write_text(json.dumps(findings), encoding="utf-8")
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    fingerprint = runtime_fingerprints[0]
    assert fingerprint["summary"] is None
    assert "evidence reference" in str(fingerprint["summary_error"])


def test_prod_readiness_ingest_rejects_unlisted_report_evidence(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-unlisted"
    )
    _write_prod_readiness_artifact(source_artifact)
    unlisted_evidence = source_root / "tests" / "results" / "unlisted.json"
    unlisted_evidence.parent.mkdir(parents=True, exist_ok=True)
    unlisted_evidence.write_text("{}", encoding="utf-8")
    report_path = source_artifact / "reports" / "report.md"
    report_path.write_text(
        report_path.read_text(encoding="utf-8")
        + f"\n- Unlisted evidence: `{unlisted_evidence}`\n",
        encoding="utf-8",
    )
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    fingerprint = runtime_fingerprints[0]
    assert fingerprint["summary"] is None
    assert "unlisted" in str(fingerprint["summary_error"])


def test_release_parity_rejects_header_only_logs_without_command_result_records(
    tmp_path: Path,
) -> None:
    fingerprint = _valid_prod_readiness_fingerprint(tmp_path / "header-only")
    artifact_root = Path(str(fingerprint["copied_to"]))
    matrix_path = artifact_root / "reports" / "command-matrix.json"
    matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
    for row in matrix:
        Path(str(row.pop("result"))).unlink()
        row["rc"] = 0
    matrix_path.write_text(json.dumps(matrix), encoding="utf-8")

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_missing_malformed_or_unbound_command_results(
    tmp_path: Path,
) -> None:
    variants: dict[str, object] = {
        "missing": None,
        "malformed": "{",
        "truncated": {"id": "meta_git_head"},
        "fabricated-rc": {
            "id": "meta_git_head",
            "command": "placeholder",
            "rc": 7,
            "timed_out": False,
        },
    }
    for name, replacement in variants.items():
        fingerprint = _valid_prod_readiness_fingerprint(tmp_path / name)
        artifact_root = Path(str(fingerprint["copied_to"]))
        matrix = json.loads(
            (artifact_root / "reports" / "command-matrix.json").read_text(
                encoding="utf-8"
            )
        )
        result_path = Path(matrix[0]["result"])
        if replacement is None:
            result_path.unlink()
        elif isinstance(replacement, str):
            result_path.write_text(replacement, encoding="utf-8")
        else:
            result_path.write_text(json.dumps(replacement), encoding="utf-8")

        findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

        assert decision["decision"] == "NO-GO", name
        assert any(
            item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings
        ), name


def test_skip_prod_readiness_reuses_valid_exact_baseline_evidence(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-existing"
    )
    _write_prod_readiness_artifact(source_artifact, git_status_short=" \n\t")
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    fingerprint = runtime_fingerprints[0]
    assert fingerprint["run_rc"] == 0
    assert fingerprint["prod_readiness_git_sha"] == BASELINE_GIT_SHA
    assert fingerprint["prod_readiness_git_status_short"] == " \n\t"
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "GO"
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)


def _prepare_release_decision_audit(audit: ReleaseParityAudit) -> None:
    audit.baseline = {
        "git_sha": BASELINE_GIT_SHA,
        "git_branch": "main",
        "is_clean": True,
    }
    audit.static_resolution = {"ci_runtime_policy": {}, "dev_startup": {}}
    audit.toolchain_fingerprint = {}
    audit.dep_diffs = _valid_dependency_diffs()
    audit.ui_parity = {"mismatches_same_auth_mode_same_commit": []}


def test_skip_prod_readiness_without_existing_evidence_can_go(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(AUDIT_MODULE, "ROOT_DIR", tmp_path)
    audit = ReleaseParityAudit("skip-without-existing", run_prod_readiness=False)
    _prepare_release_decision_audit(audit)

    audit._ingest_latest_existing_prod_readiness()

    audit._evaluate_findings_and_decision()

    assert audit.decision["decision"] == "GO"
    assert not any(
        item["id"] == "P1-prod-readiness-evidence-invalid"
        for item in audit.findings
    )


def test_full_prod_readiness_without_evidence_remains_no_go(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(AUDIT_MODULE, "ROOT_DIR", tmp_path)
    audit = ReleaseParityAudit("full-without-evidence", run_prod_readiness=True)
    _prepare_release_decision_audit(audit)

    audit._evaluate_findings_and_decision()

    assert audit.decision["decision"] == "NO-GO"
    assert any(
        item["id"] == "P1-prod-readiness-evidence-invalid"
        for item in audit.findings
    )


def test_skip_prod_readiness_with_present_invalid_evidence_remains_no_go(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(AUDIT_MODULE, "ROOT_DIR", tmp_path)
    audit = ReleaseParityAudit("skip-invalid-existing", run_prod_readiness=False)
    _prepare_release_decision_audit(audit)
    audit.runtime_fingerprints = [_scalar_only_prod_readiness_fingerprint()]

    audit._evaluate_findings_and_decision()

    assert audit.decision["decision"] == "NO-GO"
    assert any(
        item["id"] == "P1-prod-readiness-evidence-invalid"
        for item in audit.findings
    )


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    (("report_date", "2026-02-30"), ("run_id", "../invalid")),
)
def test_skip_prod_readiness_cli_rejects_invalid_nested_plan_identity_with_artifacts(
    monkeypatch,
    tmp_path: Path,
    capsys,
    field: str,
    invalid_value: str,
) -> None:
    source_root = tmp_path / field / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-existing"
    )
    _write_prod_readiness_artifact(source_artifact)
    run_status_path = source_artifact / "reports" / "run_status.json"
    run_status = json.loads(run_status_path.read_text(encoding="utf-8"))
    if field == "run_id":
        run_status["run_id"] = invalid_value
        summary_path = source_artifact / "SUMMARY.json"
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        summary["run_id"] = invalid_value
        summary_path.write_text(json.dumps(summary), encoding="utf-8")
    else:
        run_status["plan_inputs"][field] = invalid_value
    run_status_path.write_text(json.dumps(run_status), encoding="utf-8")

    def cli_phases(audit):
        def prepare() -> None:
            audit.baseline = {"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"}
            audit.static_resolution = {"ci_runtime_policy": {}, "dev_startup": {}}
            audit.toolchain_fingerprint = {}
            audit.dep_diffs = _valid_dependency_diffs()
            audit.ui_parity = {"mismatches_same_auth_mode_same_commit": []}

        return [
            PHASE_RUNNER_MODULE.ReleaseParityPhase("prepare", prepare),
            PHASE_RUNNER_MODULE.ReleaseParityPhase(
                "ingest", audit._ingest_latest_existing_prod_readiness
            ),
            PHASE_RUNNER_MODULE.ReleaseParityPhase(
                "decision", audit.evaluate_findings_and_decision
            ),
            PHASE_RUNNER_MODULE.ReleaseParityPhase("report", audit.write_report),
        ]

    run_id = f"candidate16-invalid-{field}"
    monkeypatch.setattr(AUDIT_MODULE, "ROOT_DIR", source_root)
    monkeypatch.setattr(AUDIT_MODULE, "release_parity_phases", cli_phases)
    monkeypatch.setattr(
        CLI_MODULE,
        "parse_args",
        lambda: argparse.Namespace(run_id=run_id, skip_prod_readiness=True),
    )

    assert CLI_MODULE.main() != 0
    stdout = capsys.readouterr().out
    assert "Traceback" not in stdout
    artifact_root = source_root / "tests" / "results" / f"release-parity-audit-{run_id}"
    findings = json.loads((artifact_root / "findings.json").read_text(encoding="utf-8"))
    decision = json.loads((artifact_root / "decision.json").read_text(encoding="utf-8"))
    run_status = json.loads(
        (artifact_root / "run_status.json").read_text(encoding="utf-8")
    )
    report = (artifact_root / "report.md").read_text(encoding="utf-8")
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)
    assert decision["decision"] == "NO-GO"
    assert run_status["decision"] == "NO-GO"
    assert "P1-prod-readiness-evidence-invalid" in report


def test_direct_decision_rejects_invalid_nested_plan_identity_without_traceback(
    tmp_path: Path,
) -> None:
    fingerprint = _valid_prod_readiness_fingerprint(tmp_path / "invalid-nested-run-id")
    artifact_root = Path(str(fingerprint["copied_to"]))
    run_status_path = artifact_root / "reports" / "run_status.json"
    run_status = json.loads(run_status_path.read_text(encoding="utf-8"))
    run_status["run_id"] = "../invalid"
    run_status_path.write_text(json.dumps(run_status), encoding="utf-8")
    fingerprint["summary"]["run_id"] = "../invalid"

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_skip_prod_readiness_rejects_dirty_exact_baseline_evidence(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-existing"
    )
    _write_prod_readiness_artifact(
        source_artifact,
        git_status_short=" M frontend/src/App.tsx\n",
    )
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


@pytest.mark.parametrize("case", ["missing", "malformed"])
def test_skip_prod_readiness_rejects_missing_or_malformed_git_status(
    tmp_path: Path,
    case: str,
) -> None:
    source_root = tmp_path / case / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-existing"
    )
    _write_prod_readiness_artifact(
        source_artifact,
        git_status_short=None if case == "missing" else "",
    )
    if case == "malformed":
        (source_artifact / "meta" / "git_status_short.txt").write_bytes(b"\xff")
    ingest_dir = tmp_path / case / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_existing_prod_readiness_ingest_requires_exact_baseline_commit(
    tmp_path: Path,
) -> None:
    cases = {
        "missing": None,
        "malformed": "not-a-git-sha",
        "multiple": f"{BASELINE_GIT_SHA}\n{OTHER_GIT_SHA}",
        "mismatch": OTHER_GIT_SHA,
    }

    for name, git_head in cases.items():
        source_root = tmp_path / name / "source"
        source_artifact = (
            source_root / "tests" / "results" / "prod" / "prod-readiness-audit-existing"
        )
        _write_prod_readiness_artifact(source_artifact, git_sha=git_head)
        ingest_dir = tmp_path / name / "release-artifacts" / "prod_readiness_ingest"
        ingest_dir.mkdir(parents=True)
        runtime_fingerprints: list[dict[str, object]] = []

        FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
            root_dir=source_root,
            prod_ingest_dir=ingest_dir,
            runtime_fingerprints=runtime_fingerprints,
            captured_at_utc="2026-08-03T00:00:00+00:00",
        )

        findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
        assert decision["decision"] == "NO-GO", name
        assert any(
            item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings
        ), name


def test_existing_prod_readiness_ingest_rejects_git_head_symlink_outside_artifact(
    tmp_path: Path,
) -> None:
    source_root = tmp_path / "source"
    source_artifact = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-existing"
    )
    _write_prod_readiness_artifact(source_artifact, git_sha=None)
    outside_git_head = tmp_path / "outside-git-head.txt"
    outside_git_head.write_text(f"{BASELINE_GIT_SHA}\n", encoding="utf-8")
    meta_dir = source_artifact / "meta"
    (meta_dir / "git_head.txt").symlink_to(outside_git_head)
    ingest_dir = tmp_path / "release-artifacts" / "prod_readiness_ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []

    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_scalar_only_prod_readiness_summary(
    tmp_path: Path,
) -> None:
    findings, decision = _evaluate_prod_readiness(
        [_scalar_only_prod_readiness_fingerprint()], tmp_path
    )

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_empty_prod_readiness_command_matrix(
    tmp_path: Path,
) -> None:
    artifact_root = tmp_path / "empty-matrix"
    fingerprint = _valid_prod_readiness_fingerprint(artifact_root)
    (artifact_root / "reports" / "command-matrix.json").write_text(
        "[]", encoding="utf-8"
    )

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_truncated_prod_readiness_command_matrix(
    tmp_path: Path,
) -> None:
    artifact_root = tmp_path / "truncated-matrix"
    fingerprint = _valid_prod_readiness_fingerprint(artifact_root)
    reports_dir = artifact_root / "reports"
    run_status_path = reports_dir / "run_status.json"
    run_status_path.write_text(
        json.dumps(
            {
                "run_id": "fresh",
                "status": "complete",
                "artifact_root": str(artifact_root),
                "report": str(reports_dir / "report.md"),
                "report_artifact": str(reports_dir / "report.md"),
                "matrix": str(reports_dir / "command-matrix.json"),
                "exit_code": 0,
                "required_failures": 0,
                "completed_command_count": 1,
                "planned_command_count": 2,
                "planned_command_ids": ["required-pass", "required-pass-2"],
                "planned_run_complete": True,
            }
        ),
        encoding="utf-8",
    )
    fingerprint["summary"] = {
        **fingerprint["summary"],
        "run_status": str(run_status_path),
    }

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_self_consistent_truncated_prod_readiness_plan(
    tmp_path: Path,
) -> None:
    fingerprint = _valid_prod_readiness_fingerprint(
        tmp_path / "self-consistent-truncated-plan",
        command_ids=["required-pass"],
    )

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_noncanonical_prod_readiness_command_ids(
    tmp_path: Path,
) -> None:
    canonical_ids = _canonical_prod_readiness_command_ids()
    variants = {
        "missing": canonical_ids[:-1],
        "extra": [*canonical_ids, "not-in-canonical-plan"],
        "reordered": [canonical_ids[1], canonical_ids[0], *canonical_ids[2:]],
        "duplicate": [canonical_ids[0], canonical_ids[0], *canonical_ids[2:]],
    }

    for name, command_ids in variants.items():
        fingerprint = _valid_prod_readiness_fingerprint(
            tmp_path / name,
            command_ids=command_ids,
        )

        findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

        assert decision["decision"] == "NO-GO", name
        assert any(
            item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings
        ), name


def test_release_parity_rejects_canonical_ids_without_canonical_command_metadata(
    tmp_path: Path,
) -> None:
    fingerprint = _valid_prod_readiness_fingerprint(
        tmp_path / "canonical-ids-skeletal-results"
    )
    artifact_root = Path(str(fingerprint["copied_to"]))
    matrix_path = artifact_root / "reports" / "command-matrix.json"
    matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
    matrix_path.write_text(
        json.dumps(
            [
                {"id": row["id"], "required": row["required"], "rc": row["rc"]}
                for row in matrix
            ]
        ),
        encoding="utf-8",
    )

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_replaced_canonical_command_metadata(
    tmp_path: Path,
) -> None:
    for field in ("command", "cwd", "required", "timeout_sec", "log"):
        fingerprint = _valid_prod_readiness_fingerprint(tmp_path / f"replaced-{field}")
        artifact_root = Path(str(fingerprint["copied_to"]))
        matrix_path = artifact_root / "reports" / "command-matrix.json"
        matrix = json.loads(matrix_path.read_text(encoding="utf-8"))
        replacement = {
            "command": "true",
            "cwd": str(tmp_path),
            "required": not matrix[0]["required"],
            "timeout_sec": matrix[0]["timeout_sec"] + 1,
            "log": str(tmp_path / "unrelated.log"),
        }[field]
        matrix[0][field] = replacement
        matrix_path.write_text(json.dumps(matrix), encoding="utf-8")

        findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

        assert decision["decision"] == "NO-GO", field
        assert any(
            item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings
        ), field


def test_release_parity_prod_readiness_validation_does_not_probe_host_ports(
    monkeypatch, tmp_path: Path
) -> None:
    fingerprint = _valid_prod_readiness_fingerprint(tmp_path / "valid-plan")

    def fail_on_probe(_start: int, _end: int) -> int:
        raise AssertionError("artifact validation must not probe host sockets")

    run_state_module = importlib.import_module("prod_readiness_audit.run_state")
    monkeypatch.setattr(run_state_module, "pick_free_port", fail_on_probe)

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "GO"
    assert not any(
        item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings
    )


def test_release_parity_rejects_unreadable_prod_readiness_report(
    tmp_path: Path,
) -> None:
    artifact_root = tmp_path / "unreadable-report"
    fingerprint = _valid_prod_readiness_fingerprint(artifact_root)
    (artifact_root / "reports" / "report.md").write_bytes(b"\xff")

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)


def test_release_parity_rejects_incomplete_or_inconsistent_prod_readiness_artifacts(
    tmp_path: Path,
) -> None:
    missing_file = _valid_prod_readiness_fingerprint(tmp_path / "missing-file")
    Path(str(missing_file["copied_to"]), "reports", "scorecard.json").unlink()

    outside_pointer = _valid_prod_readiness_fingerprint(tmp_path / "outside-pointer")
    outside_pointer["summary"] = {
        **outside_pointer["summary"],
        "matrix": str(tmp_path / "matrix.json"),
    }

    malformed_json = _valid_prod_readiness_fingerprint(tmp_path / "malformed-json")
    Path(str(malformed_json["copied_to"]), "reports", "findings.json").write_text(
        "{", encoding="utf-8"
    )

    inconsistent_count = _valid_prod_readiness_fingerprint(
        tmp_path / "inconsistent-count"
    )
    inconsistent_count["summary"] = {
        **inconsistent_count["summary"],
        "open_high_critical_count": 1,
    }

    invalid_run_rc = _valid_prod_readiness_fingerprint(tmp_path / "invalid-run-rc")
    invalid_run_rc["run_rc"] = True

    missing_run_status = _valid_prod_readiness_fingerprint(
        tmp_path / "missing-run-status"
    )
    Path(str(missing_run_status["copied_to"]), "reports", "run_status.json").unlink()

    malformed_run_status = _valid_prod_readiness_fingerprint(
        tmp_path / "malformed-run-status"
    )
    Path(
        str(malformed_run_status["copied_to"]), "reports", "run_status.json"
    ).write_text("{", encoding="utf-8")

    inconsistent_run_status = _valid_prod_readiness_fingerprint(
        tmp_path / "inconsistent-run-status"
    )
    inconsistent_status_path = Path(
        str(inconsistent_run_status["copied_to"]), "reports", "run_status.json"
    )
    inconsistent_status = json.loads(
        inconsistent_status_path.read_text(encoding="utf-8")
    )
    inconsistent_status["run_id"] = "other-run"
    inconsistent_status_path.write_text(
        json.dumps(inconsistent_status), encoding="utf-8"
    )

    duplicate_commands = _valid_prod_readiness_fingerprint(
        tmp_path / "duplicate-commands"
    )
    duplicate_reports = Path(str(duplicate_commands["copied_to"]), "reports")
    duplicate_matrix = [
        {"id": "duplicate", "required": True, "rc": 0},
        {"id": "duplicate", "required": True, "rc": 0},
    ]
    (duplicate_reports / "command-matrix.json").write_text(
        json.dumps(duplicate_matrix), encoding="utf-8"
    )
    duplicate_status_path = duplicate_reports / "run_status.json"
    duplicate_status = json.loads(duplicate_status_path.read_text(encoding="utf-8"))
    duplicate_status.update(
        {
            "completed_command_count": 2,
            "planned_command_count": 2,
            "planned_command_ids": ["duplicate", "duplicate"],
        }
    )
    duplicate_status_path.write_text(json.dumps(duplicate_status), encoding="utf-8")

    for fingerprint in (
        missing_file,
        outside_pointer,
        malformed_json,
        inconsistent_count,
        invalid_run_rc,
        missing_run_status,
        malformed_run_status,
        inconsistent_run_status,
        duplicate_commands,
    ):
        findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

        assert decision["decision"] == "NO-GO"
        assert any(
            item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings
        )


def test_release_parity_fails_closed_on_prod_readiness_failures(tmp_path: Path) -> None:
    nonzero_run = _valid_prod_readiness_fingerprint(tmp_path / "nonzero-run", run_rc=7)
    findings, decision = _evaluate_prod_readiness([nonzero_run], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)

    gate_failures = (
        _valid_prod_readiness_fingerprint(
            tmp_path / "required-failure", required_failures=1
        ),
        _valid_prod_readiness_fingerprint(tmp_path / "open-findings", finding_count=2),
    )

    for fingerprint in gate_failures:
        findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

        assert decision["decision"] == "NO-GO"
        assert any(item["id"] == "P1-prod-readiness-gate-failed" for item in findings)


def test_release_parity_fails_closed_on_missing_or_invalid_prod_readiness_evidence(
    tmp_path: Path,
) -> None:
    malformed = _valid_prod_readiness_fingerprint(tmp_path / "malformed")
    malformed["summary"] = "not-json-object"
    incomplete = _valid_prod_readiness_fingerprint(tmp_path / "incomplete")
    incomplete["summary"] = {"status": "complete", "required_failures": 0}
    cases = (
        [],
        [{"context_id": "prod_readiness_ingest", "startup_path_id": "prod_readiness"}],
        [malformed],
        [incomplete],
    )

    for runtime_fingerprints in cases:
        findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)

        assert decision["decision"] == "NO-GO"
        assert any(
            item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings
        )


def test_release_parity_accepts_complete_green_prod_readiness_evidence(
    tmp_path: Path,
) -> None:
    fingerprint = _valid_prod_readiness_fingerprint(tmp_path / "green")
    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "GO"
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)


def test_release_parity_accepts_complete_current_prod_readiness_command_plan(
    tmp_path: Path,
) -> None:
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_run_state

    state = build_run_state(root_dir=REPO_ROOT, run_id="fresh")
    command_ids = [
        command.command_id
        for phase in build_prod_readiness_phases(state)
        for command in phase.commands
    ]
    fingerprint = _valid_prod_readiness_fingerprint(
        tmp_path / "full-current-plan", command_ids=command_ids
    )

    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "GO"
    assert len(command_ids) > 1
    assert len(command_ids) == len(set(command_ids))
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)


def test_release_parity_clis_return_nonzero_for_no_go(
    monkeypatch, tmp_path: Path
) -> None:
    class NoGoAudit:
        def __init__(self, run_id: str, run_prod_readiness: bool = True) -> None:
            self.artifact_root = tmp_path / run_id
            self.decision = {"decision": "NO-GO"}

        def run(self) -> None:
            return None

    args = argparse.Namespace(run_id="test-cli-no-go", skip_prod_readiness=False)
    monkeypatch.setattr(CLI_MODULE, "parse_args", lambda: args)
    monkeypatch.setattr(CLI_MODULE, "ReleaseParityAudit", NoGoAudit)
    monkeypatch.setattr(AUDIT_MODULE, "parse_args", lambda: args)
    monkeypatch.setattr(AUDIT_MODULE, "ReleaseParityAudit", NoGoAudit)

    assert CLI_MODULE.main() != 0
    assert AUDIT_MODULE.main() != 0


def test_release_parity_constructor_rejects_hostile_run_ids_before_artifact_creation(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(AUDIT_MODULE, "ROOT_DIR", tmp_path)
    hostile_run_ids = (
        "",
        " ",
        ".",
        "..",
        "a..b",
        "../escape",
        "nested/run",
        "line\nbreak",
        "rún",
        "run; touch marker",
        "run$(touch marker)",
        "a" * 129,
    )

    for run_id in hostile_run_ids:
        with pytest.raises(ValueError, match="run ID"):
            AUDIT_MODULE.ReleaseParityAudit(run_id=run_id)

    assert not (tmp_path / "tests").exists()


def test_release_parity_constructor_accepts_practical_run_ids_under_results(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(AUDIT_MODULE, "ROOT_DIR", tmp_path)
    results_root = (tmp_path / "tests" / "results").resolve()

    for run_id in ("20260803-142501", "test-prod-readiness", "wave_5.1"):
        audit = AUDIT_MODULE.ReleaseParityAudit(run_id=run_id)

        assert audit.run_id == run_id
        assert audit.artifact_root.is_relative_to(results_root)
        assert (
            audit.artifact_root
            == (results_root / f"release-parity-audit-{run_id}").resolve()
        )


def test_release_parity_cli_entrypoints_reject_hostile_run_ids(monkeypatch) -> None:
    for cli_module in (CLI_MODULE, AUDIT_MODULE):
        monkeypatch.setattr(sys, "argv", ["release-parity", "--run-id", "../escape"])
        with pytest.raises(SystemExit) as exc_info:
            cli_module.parse_args()
        assert exc_info.value.code == 2


def test_release_parity_main_entrypoints_reject_bypassed_hostile_run_id_without_writes(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(AUDIT_MODULE, "ROOT_DIR", tmp_path)
    args = argparse.Namespace(run_id="../escape", skip_prod_readiness=False)

    for cli_module in (CLI_MODULE, AUDIT_MODULE):
        monkeypatch.setattr(cli_module, "parse_args", lambda: args)
        with pytest.raises(ValueError, match="run ID"):
            cli_module.main()

    assert not (tmp_path / "tests").exists()


def test_release_parity_prod_dry_run_uses_digest_pinned_dummy_images() -> None:
    command = RUNTIME_COMMANDS_MODULE.deploy_cli_prod_docker_dry_run_command(
        runtime_dir="/tmp/runtime",
        config="/tmp/config.env",
        secret_dir="/tmp/secrets",
    )

    image_args = [
        token for token in command.split() if token.startswith("ghcr.io/example/")
    ]
    assert len(image_args) == 4
    assert all("@sha256:" in image for image in image_args)
    assert all(len(image.rsplit("@sha256:", 1)[1]) == 64 for image in image_args)


def test_release_parity_prod_env_uses_only_production_file_references(
    tmp_path: Path,
) -> None:
    secret_dir = tmp_path / "secret dir"
    runtime_dir = tmp_path / "runtime dir"
    backend_env, _frontend_env = ENV_PREPARATION_MODULE.prepare_prod_env_files(
        tmp_path, secret_dir=secret_dir, runtime_dir=runtime_dir
    )

    values = dict(
        line.split("=", 1)
        for line in backend_env.read_text(encoding="utf-8").splitlines()
    )
    assert values["DEBUG"] == "false"
    assert values["MOCK_AUTH_ENABLED"] == "false"
    assert values["AUTH_MODE"] == "microsoft_sso"
    assert values["DIRECTORY_PROVIDER"] == "graph"
    assert values["ENTRA_JIT_PROVISIONING_ENABLED"] == "false"
    assert values["AUTH_SSO_ALLOW_EMAIL_LINK"] == "false"
    assert values["REFRESH_TOKEN_MIGRATION_GRACE"] == "false"
    assert values["ACCESS_TOKEN_EXPIRE_MINUTES"] == "30"
    assert values["PLATFORM_ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES"] == "15"
    assert values["SECRET_KEY_FILE"] == str(secret_dir / "secret_key")
    assert values["DATABASE_URL_FILE"] == str(secret_dir / "database_url")
    assert values["ENTRA_CLIENT_SECRET_FILE"] == str(secret_dir / "entra_client_secret")
    assert values["REDIS_URL_FILE"] == str(runtime_dir / "redis_url")
    for raw_secret_key in (
        "SECRET_KEY",
        "DATABASE_URL",
        "ENTRA_CLIENT_SECRET",
        "REDIS_PASSWORD",
        "REDIS_URL",
    ):
        assert raw_secret_key not in values


def test_release_parity_prod_commands_quote_audit_secret_and_runtime_dirs() -> None:
    common = {
        "secret_dir": "/tmp/secret dir",
        "runtime_dir": "/tmp/runtime dir",
    }
    commands = (
        RUNTIME_COMMANDS_MODULE.deploy_cli_prod_docker_dry_run_command(
            config="/tmp/config.env", **common
        ),
        RUNTIME_COMMANDS_MODULE.backend_db_runtime_prod_dry_run_command(
            backend_env="/tmp/backend.env", run_id="audit", **common
        ),
        RUNTIME_COMMANDS_MODULE.backend_runtime_prod_dry_run_command(
            backend_env="/tmp/backend.env", run_id="audit", **common
        ),
        RUNTIME_COMMANDS_MODULE.frontend_runtime_prod_dry_run_command(
            frontend_env="/tmp/frontend.env", run_id="audit", **common
        ),
    )

    for command in commands:
        assert "RISKHUB_DEFAULT_SECRET_DIR='/tmp/secret dir'" in command
        assert "RISKHUB_RUNTIME_DIR='/tmp/runtime dir'" in command


def test_release_parity_runtime_dry_runs_pass_hostile_run_id_as_one_literal_argument(
    tmp_path: Path,
) -> None:
    script_paths = (
        tmp_path / "backend" / "scripts" / "runtime" / "db" / "prod.sh",
        tmp_path / "backend" / "scripts" / "runtime" / "prod.sh",
        tmp_path / "frontend" / "scripts" / "runtime" / "prod.sh",
    )
    for script_path in script_paths:
        script_path.parent.mkdir(parents=True, exist_ok=True)
        script_path.write_text(
            '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARG_LOG"\n', encoding="utf-8"
        )
        script_path.chmod(0o755)

    marker = tmp_path / "injected"
    run_id = f"safe; touch {marker}; #"
    cases = (
        (
            RUNTIME_COMMANDS_MODULE.backend_db_runtime_prod_dry_run_command,
            {
                "backend_env": tmp_path / "backend.env",
                "run_id": run_id,
                "secret_dir": tmp_path / "secrets",
                "runtime_dir": tmp_path / "runtime",
            },
        ),
        (
            RUNTIME_COMMANDS_MODULE.backend_runtime_prod_dry_run_command,
            {
                "backend_env": tmp_path / "backend.env",
                "run_id": run_id,
                "secret_dir": tmp_path / "secrets",
                "runtime_dir": tmp_path / "runtime",
            },
        ),
        (
            RUNTIME_COMMANDS_MODULE.frontend_runtime_prod_dry_run_command,
            {
                "frontend_env": tmp_path / "frontend.env",
                "run_id": run_id,
                "secret_dir": tmp_path / "secrets",
                "runtime_dir": tmp_path / "runtime",
            },
        ),
    )

    for index, (builder, kwargs) in enumerate(cases):
        marker.unlink(missing_ok=True)
        arg_log = tmp_path / f"args-{index}.txt"
        command = builder(**kwargs)
        result = subprocess.run(
            ["bash", "-c", command],
            cwd=tmp_path,
            env={**os.environ, "ARG_LOG": str(arg_log)},
            check=False,
            text=True,
            capture_output=True,
        )

        assert result.returncode == 0, result.stderr
        assert not marker.exists()
        assert (
            f"release-parity-{run_id}"
            in arg_log.read_text(encoding="utf-8").splitlines()
        )


def test_release_parity_prod_dry_run_failures_are_required_and_recorded(
    monkeypatch, tmp_path: Path
) -> None:
    class AuditStub:
        def __init__(self) -> None:
            self.run_id = "test-prod-dry-run"
            self.run_prod_readiness = False
            self.baseline = {"git_sha": "abc123"}
            self.fingerprints_dir = tmp_path
            self.runtime_fingerprints: list[dict[str, object]] = []
            self.ui_dir = tmp_path
            self.calls: list[tuple[str, bool]] = []
            self.cleanup_calls: list[tuple[str, bool]] = []

        def _prepare_prod_env_files(self, *, secret_dir, runtime_dir):
            return tmp_path / "backend.env", tmp_path / "frontend.env"

        def _prepare_deploy_cli_prod_layout(self):
            return tmp_path / "config", tmp_path / "secrets", tmp_path / "runtime"

        def _run(self, command_id: str, command: str, **kwargs):
            self.calls.append((command_id, kwargs.get("required", True)))
            rc = 9 if command_id == "path_deploy_cli_prod_docker_dryrun" else 0
            return SimpleNamespace(rc=rc, log_path=str(tmp_path / f"{command_id}.log"))

        def _iso(self, value):
            return "2026-08-03T00:00:00+00:00"

        def _utc_now(self):
            return None

        def _stop_local_dev_processes(self):
            return None

        def _compose_down(self, command_id: str, **kwargs):
            self.cleanup_calls.append((command_id, kwargs.get("required", False)))
            return SimpleNamespace(
                rc=13 if command_id == "cleanup_compose_down_final" else 0,
                log_path=str(tmp_path / f"{command_id}.log"),
            )

        def _ingest_latest_existing_prod_readiness(self):
            self.runtime_fingerprints.append(
                _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness")
            )

        def _append_ci_runtime_fingerprints(self):
            return None

        def _ensure_startup_path_runtime_coverage(self):
            return None

        def _write_json(self, path: Path, payload: object):
            return None

    monkeypatch.setattr(RUNTIME_MODULE, "_append_dev_full_runtime", lambda audit: None)
    monkeypatch.setattr(
        RUNTIME_MODULE, "_append_compose_runtime", lambda audit, containers: None
    )
    monkeypatch.setattr(
        RUNTIME_MODULE, "_append_component_runtime_paths", lambda audit: None
    )
    audit = AuditStub()

    RUNTIME_MODULE.run_dynamic_paths(audit)

    required_by_id = dict(audit.calls)
    for command_id in (
        "path_deploy_cli_prod_docker_dryrun",
        "path_backend_db_runtime_prod_dryrun",
        "path_backend_runtime_prod_dryrun",
        "path_frontend_runtime_prod_dryrun",
    ):
        assert required_by_id[command_id] is True
    deploy_fingerprint = next(
        item
        for item in audit.runtime_fingerprints
        if item.get("startup_path_id") == "deploy_cli_prod_docker"
    )
    assert deploy_fingerprint["command_rc"] == 9
    assert audit.cleanup_calls[-1] == ("cleanup_compose_down_final", True)
    final_cleanup_fingerprint = next(
        item
        for item in audit.runtime_fingerprints
        if item.get("context_id") == "cleanup_compose_down_final"
    )
    assert final_cleanup_fingerprint["command_rc"] == 13

    findings, decision = _evaluate_prod_readiness(
        [
            final_cleanup_fingerprint,
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness-final-cleanup"),
        ],
        tmp_path,
        required_failures=1,
    )

    assert decision["decision"] == "NO-GO"
    assert any(
        item["id"] == "P1-required-command-failed-cleanup_compose_down_final"
        for item in findings
    )


def test_release_parity_separates_compose_from_prod_dry_runs_before_component_runtime(
    monkeypatch, tmp_path: Path
) -> None:
    events: list[str] = []

    class AuditStub:
        run_id = "lifecycle-boundary"
        run_prod_readiness = False
        baseline = {"git_sha": BASELINE_GIT_SHA}
        fingerprints_dir = tmp_path
        runtime_fingerprints: list[dict[str, object]] = []
        ui_dir = tmp_path

        @staticmethod
        def _prepare_prod_env_files(*, secret_dir, runtime_dir):
            return tmp_path / "backend.env", tmp_path / "frontend.env"

        @staticmethod
        def _prepare_deploy_cli_prod_layout():
            return tmp_path / "config", tmp_path / "secrets", tmp_path / "runtime"

        @staticmethod
        def _run(command_id: str, _command: str, **_kwargs):
            events.append(command_id)
            return SimpleNamespace(
                rc=0,
                log_path=str(tmp_path / f"{command_id}.log"),
            )

        @staticmethod
        def _iso(_value):
            return "2026-08-03T00:00:00+00:00"

        @staticmethod
        def _utc_now():
            return None

        @staticmethod
        def _stop_local_dev_processes():
            events.append("stop_local")

        @staticmethod
        def _compose_down(command_id: str, **_kwargs):
            events.append(command_id)
            return SimpleNamespace(rc=0, log_path=str(tmp_path / f"{command_id}.log"))

        @staticmethod
        def _ingest_latest_existing_prod_readiness():
            return None

        @staticmethod
        def _append_ci_runtime_fingerprints():
            return None

        @staticmethod
        def _ensure_startup_path_runtime_coverage():
            return None

        @staticmethod
        def _write_json(_path: Path, _payload: object):
            return None

    monkeypatch.setattr(
        RUNTIME_MODULE,
        "_append_dev_full_runtime",
        lambda _audit: events.append("dev_full"),
    )
    monkeypatch.setattr(
        RUNTIME_MODULE,
        "_append_compose_runtime",
        lambda _audit, _containers: events.append("compose_capture"),
    )
    monkeypatch.setattr(
        RUNTIME_MODULE,
        "_append_component_runtime_paths",
        lambda _audit: events.append("component_paths"),
    )

    RUNTIME_MODULE.run_dynamic_paths(AuditStub())

    boundary = events.index("cleanup_compose_down_before_prod_dryruns")
    assert events.index("compose_capture") < boundary
    prod_dry_runs = (
        "path_deploy_cli_prod_docker_dryrun",
        "path_backend_db_runtime_prod_dryrun",
        "path_backend_runtime_prod_dryrun",
        "path_frontend_runtime_prod_dryrun",
    )
    assert all(boundary < events.index(command_id) for command_id in prod_dry_runs)
    db_support = events.index("path_backend_db_runtime_dev")
    assert all(events.index(command_id) < db_support for command_id in prod_dry_runs)
    assert db_support < events.index("component_paths")


def test_release_parity_failed_compose_boundary_blocks_prod_dry_runs_and_cleans_up(
    monkeypatch, tmp_path: Path
) -> None:
    events: list[str] = []
    required_by_cleanup: dict[str, bool] = {}

    class AuditStub:
        run_id = "failed-lifecycle-boundary"
        run_prod_readiness = False
        baseline = {"git_sha": BASELINE_GIT_SHA}
        fingerprints_dir = tmp_path
        runtime_fingerprints: list[dict[str, object]] = []
        ui_dir = tmp_path

        @staticmethod
        def _prepare_prod_env_files(*, secret_dir, runtime_dir):
            return tmp_path / "backend.env", tmp_path / "frontend.env"

        @staticmethod
        def _prepare_deploy_cli_prod_layout():
            return tmp_path / "config", tmp_path / "secrets", tmp_path / "runtime"

        @staticmethod
        def _run(command_id: str, _command: str, **kwargs):
            events.append(command_id)
            if command_id == "cleanup_compose_down_before_prod_dryruns":
                required_by_cleanup[command_id] = kwargs.get("required", True)
            return SimpleNamespace(
                rc=7 if command_id == "cleanup_compose_down_before_prod_dryruns" else 0,
                log_path=str(tmp_path / f"{command_id}.log"),
            )

        @staticmethod
        def _iso(_value):
            return "2026-08-03T00:00:00+00:00"

        @staticmethod
        def _utc_now():
            return None

        @staticmethod
        def _stop_local_dev_processes():
            events.append("stop_local")

        @staticmethod
        def _compose_down(command_id: str, **kwargs):
            events.append(command_id)
            if command_id == "cleanup_compose_down_final":
                required_by_cleanup[command_id] = kwargs.get("required", False)
            return SimpleNamespace(
                rc=0,
                log_path=str(tmp_path / f"{command_id}.log"),
            )

        @staticmethod
        def _ingest_latest_existing_prod_readiness():
            raise AssertionError("prod readiness must not run after failed teardown")

        @staticmethod
        def _append_ci_runtime_fingerprints():
            raise AssertionError("CI evidence must not run after failed teardown")

        @staticmethod
        def _ensure_startup_path_runtime_coverage():
            events.append("ensure_coverage")

        @staticmethod
        def _write_json(_path: Path, _payload: object):
            events.append("write_runtime")

    monkeypatch.setattr(RUNTIME_MODULE, "_append_dev_full_runtime", lambda _audit: None)
    monkeypatch.setattr(
        RUNTIME_MODULE, "_append_compose_runtime", lambda _audit, _containers: None
    )
    monkeypatch.setattr(
        RUNTIME_MODULE,
        "_append_component_runtime_paths",
        lambda _audit: events.append("component_paths"),
    )
    audit = AuditStub()

    RUNTIME_MODULE.run_dynamic_paths(audit)

    assert required_by_cleanup["cleanup_compose_down_before_prod_dryruns"] is True
    assert "path_deploy_cli_prod_docker_dryrun" not in events
    assert "path_backend_db_runtime_dev" not in events
    assert "component_paths" not in events
    assert required_by_cleanup["cleanup_compose_down_final"] is True
    assert events[-3:] == ["cleanup_compose_down_final", "write_runtime", "stop_local"]
    boundary_fingerprint = next(
        item
        for item in audit.runtime_fingerprints
        if item.get("startup_path_id") == "compose_to_prod_lifecycle_boundary"
    )
    assert boundary_fingerprint["command_rc"] == 7


@pytest.mark.parametrize(
    ("failure_stage", "error"),
    (
        ("local", RuntimeError("local startup harness failure")),
        ("compose", KeyboardInterrupt("compose startup interrupted")),
    ),
)
def test_release_parity_dynamic_startup_exceptions_attempt_both_cleanups_and_preserve_original(
    monkeypatch, tmp_path: Path, failure_stage: str, error: BaseException
) -> None:
    events: list[str] = []

    class AuditStub:
        run_id = "dynamic-startup-interruption"
        run_prod_readiness = False
        baseline = {"git_sha": BASELINE_GIT_SHA}
        fingerprints_dir = tmp_path
        runtime_fingerprints: list[dict[str, object]] = []
        ui_dir = tmp_path

        @staticmethod
        def _prepare_prod_env_files(*, secret_dir, runtime_dir):
            return tmp_path / "backend.env", tmp_path / "frontend.env"

        @staticmethod
        def _prepare_deploy_cli_prod_layout():
            return tmp_path / "config", tmp_path / "secrets", tmp_path / "runtime"

        @staticmethod
        def _stop_local_dev_processes():
            events.append("stop_local")

        @staticmethod
        def _compose_down(command_id: str):
            events.append(command_id)

    def append_local(_audit):
        events.append("local_startup")
        if failure_stage == "local":
            raise error

    def append_compose(_audit, _containers):
        events.append("compose_startup")
        if failure_stage == "compose":
            raise error

    monkeypatch.setattr(RUNTIME_MODULE, "_append_dev_full_runtime", append_local)
    monkeypatch.setattr(RUNTIME_MODULE, "_append_compose_runtime", append_compose)

    with pytest.raises(type(error), match=str(error)) as raised:
        RUNTIME_MODULE.run_dynamic_paths(AuditStub())

    assert raised.value is error
    assert events[-2:] == ["cleanup_compose_down_final", "stop_local"]


def test_release_parity_audit_facade_imports_second_pass_modules() -> None:
    source = (
        REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "audit.py"
    ).read_text()
    for module_name in (
        "cleanup",
        "facade",
        "fingerprints",
        "screenshots",
        "startup_preflight",
        "toolchain",
    ):
        importlib.import_module(f"release_parity_audit.{module_name}")
        assert f"release_parity_audit.{module_name}" in source


def test_prod_readiness_shell_delegates_to_python_package() -> None:
    script_source = (
        REPO_ROOT / "scripts" / "security" / "run_prod_readiness_audit_local.sh"
    ).read_text()
    for module_name in (
        "artifacts",
        "audit_inputs",
        "cli",
        "commands",
        "phases",
        "run_state",
        "scoring",
    ):
        importlib.import_module(f"prod_readiness_audit.{module_name}")
    assert "prod_readiness_audit.cli" in script_source


def test_release_parity_audit_py_direct_help_executes() -> None:
    python_executable = str(Path(sys.executable).resolve())
    result = subprocess.run(
        [
            python_executable,
            str(
                REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "audit.py"
            ),
            "--help",
        ],
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


def test_release_parity_run_state_and_phase_runner_are_deep_modules(
    tmp_path: Path,
) -> None:
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
            PHASE_RUNNER_MODULE.ReleaseParityPhase(
                "capture", lambda: calls.append("capture")
            ),
            PHASE_RUNNER_MODULE.ReleaseParityPhase(
                "report", lambda: calls.append("report")
            ),
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


def test_dependency_capture_failures_are_required_and_block_release(
    tmp_path: Path,
) -> None:
    class AuditStub:
        def __init__(self) -> None:
            self.run_id = "missing-dependencies"
            self.deps_dir = tmp_path / "deps"
            self.deps_dir.mkdir()
            self.dep_diffs: dict[str, object] = {}
            self.calls: list[tuple[str, bool]] = []

        def _run(self, command_id: str, _command: str, **kwargs):
            self.calls.append((command_id, kwargs.get("required", True)))
            return SimpleNamespace(rc=1)

        @staticmethod
        def _canonical_package_name(name: str) -> str:
            return name.lower()

        @staticmethod
        def _parse_package_versions(_text: str) -> dict[str, str | None]:
            return {}

        @staticmethod
        def _write_json(_path: Path, _payload: object) -> None:
            return None

    audit = AuditStub()
    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=["fastapi"],
        core_frontend_packages=["react"],
    )

    assert audit.calls
    assert all(required for _command_id, required in audit.calls)
    evidence_status = audit.dep_diffs["evidence_status"]
    assert isinstance(evidence_status, dict)
    assert all(
        item["available"] is False and item["error"]
        for item in evidence_status.values()
    )

    findings, decision = evaluate_findings_and_decision(
        run_id="missing-dependencies",
        baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"},
        runtime_fingerprints=[
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness")
        ],
        static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
        toolchain_fingerprint={},
        dep_diffs=audit.dep_diffs,
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=len(audit.calls),
        artifact_root=tmp_path,
        deps_dir=audit.deps_dir,
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert decision["decision"] == "NO-GO"
    assert any(item["id"].startswith("P1-dependency-evidence-") for item in findings)


def test_backend_image_dependency_probes_share_verified_docker_environment_failure(
    tmp_path: Path,
) -> None:
    class AuditStub:
        def __init__(self) -> None:
            self.run_id = "docker-host-unavailable"
            self.deps_dir = tmp_path / "deps"
            self.deps_dir.mkdir()
            self.logs_dir = tmp_path / "logs"
            self.logs_dir.mkdir()
            self.dep_diffs: dict[str, object] = {}

        def _run(self, command_id: str, command: str, **_kwargs):
            log_path = self.logs_dir / f"{command_id}.log"
            docker_failure = command_id in {
                "deps_build_backend_image",
                "deps_backend_image_versions",
            }
            log_path.write_text(
                f"$ {command}\n\n"
                + (
                    "Cannot connect to the Docker daemon at unix:///var/run/docker.sock\n"
                    if docker_failure
                    else ""
                ),
                encoding="utf-8",
            )
            if command_id == "deps_backend_local_freeze":
                (self.deps_dir / "backend-local.txt").write_text(
                    "fastapi==1.0\n", encoding="utf-8"
                )
            elif command_id == "deps_frontend_installed":
                (self.deps_dir / "frontend-installed.json").write_text(
                    json.dumps({"dependencies": {"react": {"version": "19.2.4"}}}),
                    encoding="utf-8",
                )
            elif command_id == "deps_frontend_lock_extract":
                (self.deps_dir / "frontend-lock.json").write_text(
                    json.dumps({"react": "19.2.4"}), encoding="utf-8"
                )
            return SimpleNamespace(
                rc=1 if docker_failure else 0, log_path=str(log_path)
            )

        _canonical_package_name = staticmethod(
            ReleaseParityAudit._canonical_package_name
        )

        def _parse_package_versions(self, text: str) -> dict[str, str | None]:
            return ReleaseParityAudit._parse_package_versions(self, text)

        @staticmethod
        def _write_json(_path: Path, _payload: object) -> None:
            return None

    audit = AuditStub()
    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=["fastapi"],
        core_frontend_packages=["react"],
    )

    docker_environment_fingerprint = {
        "startup_path_id": "compose_sh_up_full",
        "context_id": "compose_sh_up_full",
        "git_sha_expected": BASELINE_GIT_SHA,
        "git_sha_observed": BASELINE_GIT_SHA,
        "launch_failed": True,
        "launch_rc": 1,
        "launch_log": str(tmp_path / "logs" / "path_compose_sh_up_full.log"),
        "launch_failure": {
            "classification": "environment_contamination",
            "code": "docker_daemon_unavailable",
            "summary": "Docker was unavailable on the audit host.",
        },
    }
    prod_readiness_fingerprint = _valid_prod_readiness_fingerprint(
        tmp_path / "prod-readiness"
    )

    def evaluate(runtime_fingerprints: list[dict[str, object]], required_failures: int):
        return evaluate_findings_and_decision(
            run_id=audit.run_id,
            baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"},
            runtime_fingerprints=[
                *runtime_fingerprints,
                prod_readiness_fingerprint,
            ],
            static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
            toolchain_fingerprint={},
            dep_diffs=audit.dep_diffs,
            ui_parity={"mismatches_same_auth_mode_same_commit": []},
            required_failures=required_failures,
            artifact_root=tmp_path,
            deps_dir=audit.deps_dir,
            fingerprints_dir=tmp_path / "fingerprints",
            ui_dir=tmp_path / "ui",
            iso_now=lambda: "2026-08-03T00:00:00+00:00",
        )

    findings, decision = evaluate([docker_environment_fingerprint], 3)

    assert decision["decision"] == "INVALID_ENVIRONMENT"
    assert decision["finding_counts"]["P1"] == 0
    assert {
        item["id"]
        for item in findings
        if str(item["id"]).startswith("ENV-dependency-evidence-")
    } == {
        "ENV-dependency-evidence-backend_image_build",
        "ENV-dependency-evidence-backend_image",
    }
    assert any(item["id"] == "ENV-required-command-failures" for item in findings)

    unrelated_log = tmp_path / "deploy-prod-dry-run.log"
    unrelated_log.write_text("product dry-run failure\n", encoding="utf-8")
    unrelated_failure = {
        "startup_path_id": "deploy_cli_prod_docker",
        "context_id": "deploy_cli_prod_docker_dryrun",
        "git_sha_expected": BASELINE_GIT_SHA,
        "git_sha_observed": BASELINE_GIT_SHA,
        "dry_run_only": True,
        "command_rc": 9,
        "command_log": str(unrelated_log),
    }
    unrelated_findings, unrelated_decision = evaluate(
        [docker_environment_fingerprint, unrelated_failure], 4
    )

    assert unrelated_decision["decision"] == "NO-GO"
    assert any(
        item["id"] == "P1-required-command-failed-deploy_cli_prod_docker_dryrun"
        for item in unrelated_findings
    )


@pytest.mark.parametrize(
    ("has_docker_context", "dependency_log"),
    (
        (False, "Cannot connect to the Docker daemon\n"),
        (True, "backend image build failed\n"),
    ),
)
def test_backend_image_dependency_failure_requires_both_docker_context_and_marker(
    tmp_path: Path, has_docker_context: bool, dependency_log: str
) -> None:
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    command_id = "deps_build_backend_image"
    command_log = logs_dir / f"{command_id}.log"
    command_log.write_text(dependency_log, encoding="utf-8")
    dep_diffs = _valid_dependency_diffs()
    dep_diffs["evidence_status"]["backend_image_build"] = {
        "available": False,
        "error": "command failed with exit code 1",
        "command_id": command_id,
        "command_log": str(command_log),
    }
    runtime_fingerprints = []
    if has_docker_context:
        runtime_fingerprints.append(
            {
                "startup_path_id": "compose_sh_up_full",
                "context_id": "compose_sh_up_full",
                "launch_failed": True,
                "launch_failure": {
                    "classification": "environment_contamination",
                    "code": "docker_daemon_unavailable",
                },
            }
        )
    runtime_fingerprints.append(
        _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness")
    )

    findings, decision = evaluate_findings_and_decision(
        run_id="unverified-docker-dependency-failure",
        baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"},
        runtime_fingerprints=runtime_fingerprints,
        static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
        toolchain_fingerprint={},
        dep_diffs=dep_diffs,
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=2 if has_docker_context else 1,
        artifact_root=tmp_path,
        deps_dir=tmp_path / "deps",
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert decision["decision"] == "NO-GO"
    assert any(
        item["id"] == "P1-dependency-evidence-backend_image_build" for item in findings
    )
    assert not any(
        item["id"] == "ENV-dependency-evidence-backend_image_build" for item in findings
    )


def test_dependency_capture_rejects_unparseable_evidence(tmp_path: Path) -> None:
    class AuditStub:
        def __init__(self) -> None:
            self.run_id = "invalid-dependencies"
            self.deps_dir = tmp_path / "deps"
            self.deps_dir.mkdir()
            self.dep_diffs: dict[str, object] = {}

        @staticmethod
        def _run(_command_id: str, _command: str, **_kwargs):
            return SimpleNamespace(rc=0)

        @staticmethod
        def _canonical_package_name(name: str) -> str:
            return name.lower()

        @staticmethod
        def _parse_package_versions(_text: str) -> dict[str, str | None]:
            return {}

        @staticmethod
        def _write_json(_path: Path, _payload: object) -> None:
            return None

    audit = AuditStub()
    (audit.deps_dir / "backend-local.txt").write_text("not freeze output\n")
    (audit.deps_dir / "backend-image.txt").write_text("not image output\n")
    (audit.deps_dir / "frontend-installed.json").write_text("[]\n")
    (audit.deps_dir / "frontend-lock.json").write_text("not json\n")

    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=["fastapi"],
        core_frontend_packages=["react"],
    )

    evidence_status = audit.dep_diffs["evidence_status"]
    assert isinstance(evidence_status, dict)
    assert evidence_status["backend_image_build"] == {
        "available": True,
        "error": None,
    }
    for evidence_name in (
        "backend_local",
        "backend_image",
        "frontend_installed",
        "frontend_lock",
    ):
        assert evidence_status[evidence_name]["available"] is False
        assert evidence_status[evidence_name]["error"]


def test_dependency_capture_fails_closed_without_core_frontend_records(
    tmp_path: Path,
) -> None:
    class AuditStub:
        def __init__(self) -> None:
            self.run_id = "missing-frontend-dependencies"
            self.deps_dir = tmp_path / "deps"
            self.deps_dir.mkdir()
            self.dep_diffs: dict[str, object] = {}

        @staticmethod
        def _run(_command_id: str, _command: str, **_kwargs):
            return SimpleNamespace(rc=0)

        _canonical_package_name = staticmethod(
            ReleaseParityAudit._canonical_package_name
        )

        def _parse_package_versions(self, text: str) -> dict[str, str | None]:
            return ReleaseParityAudit._parse_package_versions(self, text)

        @staticmethod
        def _write_json(_path: Path, _payload: object) -> None:
            return None

    audit = AuditStub()
    (audit.deps_dir / "backend-local.txt").write_text(
        "fastapi==0.135.4\n", encoding="utf-8"
    )
    (audit.deps_dir / "backend-image.txt").write_text(
        "fastapi==0.135.4\n", encoding="utf-8"
    )
    (audit.deps_dir / "frontend-installed.json").write_text(
        json.dumps({"dependencies": {}}), encoding="utf-8"
    )
    (audit.deps_dir / "frontend-lock.json").write_text("{}\n", encoding="utf-8")

    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=["fastapi"],
        core_frontend_packages=["react", "vite"],
    )

    evidence_status = audit.dep_diffs["evidence_status"]
    assert isinstance(evidence_status, dict)
    for evidence_name in ("frontend_installed", "frontend_lock"):
        assert evidence_status[evidence_name] == {
            "available": False,
            "error": "missing package records: react, vite",
        }
    assert audit.dep_diffs["frontend_drift"] == []

    findings, decision = evaluate_findings_and_decision(
        run_id="missing-frontend-dependencies",
        baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"},
        runtime_fingerprints=[
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness")
        ],
        static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
        toolchain_fingerprint={},
        dep_diffs=audit.dep_diffs,
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=0,
        artifact_root=tmp_path,
        deps_dir=audit.deps_dir,
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert decision["decision"] == "NO-GO"
    assert {
        item["id"]
        for item in findings
        if str(item["id"]).startswith("P1-dependency-evidence-frontend_")
    } == {
        "P1-dependency-evidence-frontend_installed",
        "P1-dependency-evidence-frontend_lock",
    }


def test_dependency_capture_requires_versioned_frontend_records_and_preserves_drift(
    tmp_path: Path,
) -> None:
    class AuditStub:
        def __init__(self) -> None:
            self.run_id = "frontend-dependency-records"
            self.deps_dir = tmp_path / "deps"
            self.deps_dir.mkdir()
            self.dep_diffs: dict[str, object] = {}

        @staticmethod
        def _run(_command_id: str, _command: str, **_kwargs):
            return SimpleNamespace(rc=0)

        _canonical_package_name = staticmethod(
            ReleaseParityAudit._canonical_package_name
        )

        def _parse_package_versions(self, text: str) -> dict[str, str | None]:
            return ReleaseParityAudit._parse_package_versions(self, text)

        @staticmethod
        def _write_json(_path: Path, _payload: object) -> None:
            return None

    audit = AuditStub()
    (audit.deps_dir / "backend-local.txt").write_text(
        "fastapi==0.135.4\n", encoding="utf-8"
    )
    (audit.deps_dir / "backend-image.txt").write_text(
        "fastapi==0.135.4\n", encoding="utf-8"
    )
    installed_file = audit.deps_dir / "frontend-installed.json"
    lock_file = audit.deps_dir / "frontend-lock.json"

    installed_file.write_text(
        json.dumps(
            {
                "dependencies": {
                    "react": {"version": ""},
                    "vite": "6.1.0",
                }
            }
        ),
        encoding="utf-8",
    )
    lock_file.write_text(json.dumps({"react": "", "vite": None}), encoding="utf-8")
    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=["fastapi"],
        core_frontend_packages=["react", "vite"],
    )

    evidence_status = audit.dep_diffs["evidence_status"]
    assert isinstance(evidence_status, dict)
    for evidence_name in ("frontend_installed", "frontend_lock"):
        assert evidence_status[evidence_name] == {
            "available": False,
            "error": "invalid package version records: react, vite",
        }

    installed_file.write_text(
        json.dumps(
            {
                "dependencies": {
                    "react": {"version": "19.2.4"},
                    "vite": {"version": "6.1.0"},
                    "unrelated": {},
                }
            }
        ),
        encoding="utf-8",
    )
    lock_file.write_text(
        json.dumps({"react": "19.2.4", "vite": "6.1.0", "unrelated": None}),
        encoding="utf-8",
    )
    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=["fastapi"],
        core_frontend_packages=["react", "vite"],
    )

    evidence_status = audit.dep_diffs["evidence_status"]
    assert isinstance(evidence_status, dict)
    for evidence_name in ("frontend_installed", "frontend_lock"):
        assert evidence_status[evidence_name] == {"available": True, "error": None}
    assert audit.dep_diffs["frontend_drift"] == []

    lock_file.write_text(
        json.dumps({"react": "19.2.5", "vite": "6.1.0"}), encoding="utf-8"
    )
    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=["fastapi"],
        core_frontend_packages=["react", "vite"],
    )

    assert audit.dep_diffs["frontend_drift"] == [
        {
            "package": "react",
            "installed": "19.2.4",
            "lock": "19.2.5",
        }
    ]


def test_dependency_capture_tracks_supported_runtime_and_fails_closed_without_pwdlib(
    tmp_path: Path,
) -> None:
    class AuditStub:
        def __init__(self) -> None:
            self.run_id = "supported-dependencies"
            self.deps_dir = tmp_path / "deps"
            self.deps_dir.mkdir()
            self.dep_diffs: dict[str, object] = {}

        @staticmethod
        def _run(_command_id: str, _command: str, **_kwargs):
            return SimpleNamespace(rc=0)

        _canonical_package_name = staticmethod(
            ReleaseParityAudit._canonical_package_name
        )

        def _parse_package_versions(self, text: str) -> dict[str, str | None]:
            return ReleaseParityAudit._parse_package_versions(self, text)

        @staticmethod
        def _write_json(_path: Path, _payload: object) -> None:
            return None

    backend_versions = "\n".join(
        (
            "fastapi==0.135.4",
            "uvicorn==0.41.0",
            "sqlalchemy==2.0.46",
            "asyncpg==0.31.0",
            "alembic==1.18.4",
            "pydantic==2.12.5",
            "redis==7.2.0",
            "cryptography==48.0.1",
            "pwdlib==0.3.0",
            "bcrypt==4.1.3",
        )
    )
    audit = AuditStub()
    (audit.deps_dir / "backend-local.txt").write_text(
        f"{backend_versions}\n", encoding="utf-8"
    )
    (audit.deps_dir / "backend-image.txt").write_text(
        f"{backend_versions}\n", encoding="utf-8"
    )
    (audit.deps_dir / "frontend-installed.json").write_text(
        json.dumps({"dependencies": {"react": {"version": "19.2.4"}}}),
        encoding="utf-8",
    )
    (audit.deps_dir / "frontend-lock.json").write_text(
        json.dumps({"react": "19.2.4"}), encoding="utf-8"
    )

    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=AUDIT_MODULE.CRITICAL_BACKEND_PACKAGES,
        core_frontend_packages=["react"],
    )

    evidence_status = audit.dep_diffs["evidence_status"]
    assert isinstance(evidence_status, dict)
    assert all(
        item == {"available": True, "error": None} for item in evidence_status.values()
    )
    assert audit.dep_diffs["backend_drift"] == []
    assert "pwdlib" in audit.dep_diffs["backend_local_versions"]
    assert "passlib" not in audit.dep_diffs["backend_local_versions"]

    prod_readiness_fingerprint = _valid_prod_readiness_fingerprint(
        tmp_path / "prod-readiness"
    )

    def evaluate_dependencies():
        return evaluate_findings_and_decision(
            run_id="supported-dependency-inventory",
            baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"},
            runtime_fingerprints=[prod_readiness_fingerprint],
            static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
            toolchain_fingerprint={},
            dep_diffs=audit.dep_diffs,
            ui_parity={"mismatches_same_auth_mode_same_commit": []},
            required_failures=0,
            artifact_root=tmp_path,
            deps_dir=audit.deps_dir,
            fingerprints_dir=tmp_path / "fingerprints",
            ui_dir=tmp_path / "ui",
            iso_now=lambda: "2026-08-03T00:00:00+00:00",
        )

    clean_findings, clean_decision = evaluate_dependencies()
    assert clean_decision["decision"] == "GO"
    assert not any(
        str(item["id"]).startswith("P1-dependency-evidence-") for item in clean_findings
    )

    without_pwdlib = "\n".join(
        line
        for line in backend_versions.splitlines()
        if not line.startswith("pwdlib==")
    )
    (audit.deps_dir / "backend-local.txt").write_text(
        f"{without_pwdlib}\n", encoding="utf-8"
    )
    (audit.deps_dir / "backend-image.txt").write_text(
        f"{without_pwdlib}\n", encoding="utf-8"
    )
    DEPENDENCIES_MODULE.capture_dependencies(
        audit,
        critical_backend_packages=AUDIT_MODULE.CRITICAL_BACKEND_PACKAGES,
        core_frontend_packages=["react"],
    )

    evidence_status = audit.dep_diffs["evidence_status"]
    assert isinstance(evidence_status, dict)
    for evidence_name in ("backend_local", "backend_image"):
        assert evidence_status[evidence_name] == {
            "available": False,
            "error": "missing package records: pwdlib",
        }

    findings, decision = evaluate_dependencies()

    assert decision["decision"] == "NO-GO"
    assert {
        item["id"]
        for item in findings
        if str(item["id"]).startswith("P1-dependency-evidence-")
    } == {
        "P1-dependency-evidence-backend_local",
        "P1-dependency-evidence-backend_image",
    }


def test_release_parity_audit_delegates_io_classification_and_http_boundaries() -> None:
    audit_source = (
        REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "audit.py"
    ).read_text(encoding="utf-8")

    assert callable(ARTIFACT_WRITER_MODULE.write_audit_json)
    assert callable(LAUNCH_CLASSIFIER_MODULE.classify_launch_failure)
    assert callable(HTTP_PROBE_MODULE.http_json)
    assert "from release_parity_audit.artifact_writer import" in audit_source
    assert "from release_parity_audit.http_probe import" in audit_source
    assert "from release_parity_audit.launch_classifier import" in audit_source


def test_release_parity_runtime_orchestration_is_not_pass_through() -> None:
    audit_source = (
        REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "audit.py"
    ).read_text(encoding="utf-8")
    runtime_source = (
        REPO_ROOT / "scripts" / "security" / "release_parity_audit" / "runtime.py"
    ).read_text(encoding="utf-8")

    assert "def _run_dynamic_paths_impl" not in audit_source
    assert "_run_dynamic_paths_impl" not in runtime_source


def test_release_parity_reporting_module_preserves_report_sections(
    tmp_path: Path,
) -> None:
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


def test_release_parity_report_status_and_matrix_modules_keep_json_shape(
    tmp_path: Path,
) -> None:
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


def test_release_parity_rejects_dirty_release_baseline(tmp_path: Path) -> None:
    findings, decision = evaluate_findings_and_decision(
        run_id="test-dirty-baseline",
        baseline={
            "git_sha": BASELINE_GIT_SHA,
            "git_branch": "dora",
            "is_clean": False,
        },
        runtime_fingerprints=[
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness")
        ],
        static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
        toolchain_fingerprint={},
        dep_diffs=_valid_dependency_diffs(),
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=0,
        artifact_root=tmp_path,
        deps_dir=tmp_path / "deps",
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-03T00:00:00+00:00",
    )

    finding = next(
        item for item in findings if item["id"] == "P1-dirty-release-baseline"
    )
    assert finding["severity"] == "P1"
    assert decision["decision"] == "NO-GO"


def test_release_parity_allows_clean_detached_candidate(tmp_path: Path) -> None:
    findings, decision = evaluate_findings_and_decision(
        run_id="test-clean-detached-candidate",
        baseline={
            "git_sha": BASELINE_GIT_SHA,
            "git_branch": "",
            "is_clean": True,
        },
        runtime_fingerprints=[
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness")
        ],
        static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
        toolchain_fingerprint={},
        dep_diffs=_valid_dependency_diffs(),
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=0,
        artifact_root=tmp_path,
        deps_dir=tmp_path / "deps",
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert not any(item["id"] == "P1-dirty-release-baseline" for item in findings)
    assert decision["decision"] == "GO"


def test_controlled_runtime_observes_launched_source_head_and_rejects_mismatch(
    tmp_path: Path,
) -> None:
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    observed_sha = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    assert observed_sha != BASELINE_GIT_SHA

    def listener_ready(*_args, **_kwargs) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            return False

    fingerprint = FINGERPRINTS_MODULE.start_background_service(
        context_id="controlled-runtime",
        command=(
            'python3 -c "import subprocess,time; '
            f"subprocess.Popen(['python3','-m','http.server','{port}',"
            "'--bind','127.0.0.1']); time.sleep(30)\""
        ),
        logs_dir=logs_dir,
        root_dir=REPO_ROOT,
        baseline={"git_sha": BASELINE_GIT_SHA},
        readiness_url=f"http://127.0.0.1:{port}",
        listener_port=port,
        wait_http=listener_ready,
        http_json=lambda *_args, **_kwargs: (200, {}),
        capture_screenshot=lambda *_args, **_kwargs: (False, None, None),
        captured_at_utc=lambda: "2026-08-03T00:00:00+00:00",
    )

    assert fingerprint["started"] is True
    assert fingerprint["launch_pid"] > 0
    assert fingerprint["launch_cwd"] == str(REPO_ROOT)
    assert fingerprint["source_git_root"] == str(REPO_ROOT)
    assert fingerprint["git_sha_observed"] == observed_sha

    findings, decision = _evaluate_prod_readiness(
        [
            fingerprint,
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    assert any(
        item["id"] == "P0-git-sha-mismatch-controlled-runtime" for item in findings
    )


def test_controlled_runtime_rejects_ready_listener_outside_launched_lineage(
    tmp_path: Path,
) -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    stale_listener = subprocess.Popen(
        ["python3", "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _attempt in range(50):
            identity = FINGERPRINTS_MODULE.resolve_listener_source_identity(port)
            if identity.get("runtime_pid") == stale_listener.pid:
                break
            import time

            time.sleep(0.05)

        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        fingerprint = FINGERPRINTS_MODULE.start_background_service(
            context_id="stale-listener-runtime",
            command="python3 -c 'import time; time.sleep(30)'",
            logs_dir=logs_dir,
            root_dir=REPO_ROOT,
            baseline={"git_sha": BASELINE_GIT_SHA},
            readiness_url=f"http://127.0.0.1:{port}",
            listener_port=port,
            wait_http=lambda *_args, **_kwargs: True,
            http_json=lambda *_args, **_kwargs: (200, {}),
            capture_screenshot=lambda *_args, **_kwargs: (False, None, None),
            captured_at_utc=lambda: "2026-08-03T00:00:00+00:00",
        )

        assert fingerprint["started"] is True
        assert "git_sha_observed" not in fingerprint
        assert (
            "outside launched process lineage"
            in fingerprint["git_sha_observed_unavailable_reason"]
        )
    finally:
        stale_listener.terminate()
        stale_listener.wait(timeout=5)


def test_listener_runtime_resolves_actual_process_cwd_and_source_head() -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    process = subprocess.Popen(
        ["python3", "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _attempt in range(50):
            identity = FINGERPRINTS_MODULE.resolve_listener_source_identity(port)
            if identity.get("git_sha_observed"):
                break
            import time

            time.sleep(0.05)
        expected_sha = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        assert identity["runtime_pid"] == process.pid
        assert identity["runtime_cwd"] == str(REPO_ROOT)
        assert identity["source_git_root"] == str(REPO_ROOT)
        assert identity["git_sha_observed"] == expected_sha
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_nonexecuted_runtime_evidence_never_copies_baseline_as_observed_sha(
    tmp_path: Path,
) -> None:
    audit = ReleaseParityAudit("identity-unavailable", run_prod_readiness=False)
    audit.baseline = {"git_sha": BASELINE_GIT_SHA}
    audit.static_resolution = {"ci_runtime_policy": {}}
    audit.startup_paths = [{"id": "unexecuted-path"}]

    dry_run = RUNTIME_MODULE._dry_run_fingerprint(
        audit, "dry-run-path", "dry-run-context"
    )
    audit._append_ci_runtime_fingerprints()
    audit._ensure_startup_path_runtime_coverage()

    launch_log = tmp_path / "launch-failed.log"
    launch_log.write_text("startup failed\n", encoding="utf-8")
    launch_result = CommandResult(
        command_id="launch-failed",
        command="false",
        cwd=str(REPO_ROOT),
        required=False,
        rc=1,
        start_utc="2026-08-03T00:00:00+00:00",
        end_utc="2026-08-03T00:00:01+00:00",
        duration_sec=1.0,
        log_path=str(launch_log),
        timeout_sec=60,
    )
    launch_failed, _analysis = (
        LAUNCH_CLASSIFIER_MODULE.build_launch_failure_fingerprint(
            startup_path_id="dev_sh_full",
            context_id="launch-failed",
            launch_result=launch_result,
            baseline=audit.baseline,
            captured_at_utc="2026-08-03T00:00:01+00:00",
        )
    )

    fingerprints = [dry_run, *audit.runtime_fingerprints, launch_failed]
    assert {item["context_id"] for item in fingerprints} >= {
        "dry-run-context",
        "ci_e2e",
        "unexecuted-path",
        "launch-failed",
    }
    assert all("git_sha_observed" not in item for item in fingerprints)
    assert all(item["git_sha_observed_unavailable_reason"] for item in fingerprints)


def test_executed_runtime_with_unavailable_identity_is_invalid_evidence(
    tmp_path: Path,
) -> None:
    fingerprint = {
        "startup_path_id": "backend_runtime_dev",
        "context_id": "path_backend_runtime_dev",
        "git_sha_expected": BASELINE_GIT_SHA,
        "started": True,
        "git_sha_observed_unavailable_reason": "Git identity unavailable",
    }

    findings, decision = _evaluate_prod_readiness(
        [
            fingerprint,
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    finding = next(
        item
        for item in findings
        if item["id"] == "P1-runtime-identity-evidence-invalid-backend_runtime_dev"
    )
    assert finding["identity_error"] == "Git identity unavailable"


def test_compose_runtime_rejects_running_image_that_differs_from_tag_resolution(
    tmp_path: Path,
) -> None:
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()

    def run_command(command_id: str, command: str, **_kwargs):
        log_path = logs_dir / f"{command_id}.log"
        if command.startswith("docker inspect "):
            output = "\t".join(
                json.dumps(value)
                for value in (
                    "container-id",
                    "sha256:running-old-image",
                    "/riskhub-backend",
                    "riskhub-backend:latest",
                    "running",
                    {"Status": "healthy"},
                    [],
                )
            )
        else:
            assert command.startswith("docker image inspect ")
            output = json.dumps("sha256:expected-new-image")
        log_path.write_text(f"$ {command}\n\n{output}\n", encoding="utf-8")
        return SimpleNamespace(rc=0, log_path=str(log_path))

    docker_state = FINGERPRINTS_MODULE.docker_container_identity(
        ["riskhub-backend"], run_command=run_command
    )
    backend_state = docker_state["riskhub-backend"]
    assert backend_state["image_ref"] == "riskhub-backend:latest"
    assert backend_state["running_image_id"] == "sha256:running-old-image"
    assert backend_state["expected_image_id"] == "sha256:expected-new-image"

    findings, decision = _evaluate_prod_readiness(
        [
            {
                "startup_path_id": "compose_sh_up_full",
                "context_id": "compose_sh_up_full",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "backend_ready": True,
                "frontend_ready": True,
                "docker_state": docker_state,
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    finding = next(
        item
        for item in findings
        if item["id"] == "P0-container-image-mismatch-riskhub-backend"
    )
    assert finding["image_ref"] == "riskhub-backend:latest"


def test_compose_source_mount_resolves_host_git_identity(tmp_path: Path) -> None:
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    observed_sha = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    def run_command(command_id: str, command: str, **_kwargs):
        log_path = logs_dir / f"{command_id}.log"
        if command.startswith("docker inspect "):
            output = "\t".join(
                json.dumps(value)
                for value in (
                    "container-id",
                    "sha256:image",
                    "/riskhub-backend",
                    "riskhub-backend:latest",
                    "running",
                    {"Status": "healthy"},
                    [
                        {
                            "Source": str(REPO_ROOT / "backend"),
                            "Destination": "/app",
                        }
                    ],
                )
            )
        else:
            output = json.dumps("sha256:image")
        log_path.write_text(f"$ {command}\n\n{output}\n", encoding="utf-8")
        return SimpleNamespace(rc=0, log_path=str(log_path))

    state = FINGERPRINTS_MODULE.docker_container_identity(
        ["riskhub-backend"], run_command=run_command
    )["riskhub-backend"]

    assert state["source_mount"] == {
        "destination": "/app",
        "source": str(REPO_ROOT / "backend"),
        "source_git_root": str(REPO_ROOT),
        "git_sha_observed": observed_sha,
    }


def test_compose_runtime_with_unavailable_image_identity_is_invalid_evidence(
    tmp_path: Path,
) -> None:
    findings, decision = _evaluate_prod_readiness(
        [
            {
                "startup_path_id": "compose_sh_up_full",
                "context_id": "compose_sh_up_full",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "backend_ready": True,
                "frontend_ready": True,
                "docker_state": {
                    "riskhub-backend": {
                        "exists": True,
                        "container_id": "container-id",
                        "image_ref": "riskhub-backend:latest",
                        "running_image_id": "sha256:image",
                        "image_identity_error": "Local image identity unavailable",
                    }
                },
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    finding = next(
        item
        for item in findings
        if item["id"] == "P1-container-image-evidence-invalid-riskhub-backend"
    )
    assert finding["identity_error"] == "Local image identity unavailable"


def test_compose_runtime_rejects_missing_required_container_identity(
    tmp_path: Path,
) -> None:
    findings, decision = _evaluate_prod_readiness(
        [
            {
                "startup_path_id": "compose_sh_up_full",
                "context_id": "compose_sh_up_full",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "backend_ready": True,
                "frontend_ready": True,
                "docker_state": {
                    "riskhub-backend": {
                        "exists": True,
                        "container_id": "container-id",
                        "image_ref": "riskhub-backend:latest",
                        "running_image_id": "sha256:image",
                        "expected_image_id": "sha256:image",
                    },
                    "riskhub-frontend": {"exists": False},
                },
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    finding = next(
        item
        for item in findings
        if item["id"] == "P1-container-image-evidence-invalid-riskhub-frontend"
    )
    assert finding["identity_error"] == "Required container was not found."


def test_ready_compose_runtime_rejects_unavailable_required_source_identity(
    tmp_path: Path,
) -> None:
    complete_image_identity = {
        "exists": True,
        "container_id": "container-id",
        "image_ref": "riskhub-backend:latest",
        "running_image_id": "sha256:image",
        "expected_image_id": "sha256:image",
        "status": "running",
    }
    findings, decision = _evaluate_prod_readiness(
        [
            {
                "startup_path_id": "compose_sh_up_full",
                "context_id": "compose_sh_up_full",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "backend_ready": True,
                "frontend_ready": True,
                "docker_state": {
                    "riskhub-backend": {
                        **complete_image_identity,
                        "source_mount": {
                            "source": str(REPO_ROOT / "backend"),
                            "git_sha_observed": BASELINE_GIT_SHA,
                        },
                    },
                    "riskhub-backend-scheduler-dev": {
                        **complete_image_identity,
                        "source_mount": {
                            "source": str(REPO_ROOT / "backend"),
                            "git_sha_observed_unavailable_reason": (
                                "Mounted source Git identity unavailable"
                            ),
                        },
                    },
                },
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    finding = next(
        item
        for item in findings
        if item["id"] == "P1-runtime-identity-evidence-invalid-compose_sh_up_full"
    )
    assert "scheduler" in finding["identity_error"]


@pytest.mark.parametrize("scheduler_status", ("exited", None))
def test_ready_compose_runtime_rejects_required_container_not_running(
    tmp_path: Path, scheduler_status: str | None
) -> None:
    complete_container_evidence = {
        "exists": True,
        "container_id": "container-id",
        "image_ref": "riskhub-backend:latest",
        "running_image_id": "sha256:image",
        "expected_image_id": "sha256:image",
        "status": "running",
        "source_mount": {
            "source": str(REPO_ROOT / "backend"),
            "git_sha_observed": BASELINE_GIT_SHA,
        },
    }
    scheduler_evidence = dict(complete_container_evidence)
    if scheduler_status is None:
        scheduler_evidence.pop("status")
    else:
        scheduler_evidence["status"] = scheduler_status

    findings, decision = _evaluate_prod_readiness(
        [
            {
                "startup_path_id": "compose_sh_up_full",
                "context_id": "compose_sh_up_full",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "backend_ready": True,
                "frontend_ready": True,
                "docker_state": {
                    "riskhub-backend": complete_container_evidence,
                    "riskhub-backend-scheduler-dev": scheduler_evidence,
                },
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    finding = next(
        item
        for item in findings
        if item["id"] == "P1-runtime-identity-evidence-invalid-compose_sh_up_full"
    )
    assert "riskhub-backend-scheduler-dev" in finding["identity_error"]
    assert "running" in finding["identity_error"]


def test_malformed_docker_identity_capture_records_unavailable_reason(
    tmp_path: Path,
) -> None:
    log_path = tmp_path / "docker-inspect.log"
    log_path.write_text(
        "$ docker inspect\n\nbad\tbad\tbad\tbad\tbad\tbad\tbad\n",
        encoding="utf-8",
    )

    state = FINGERPRINTS_MODULE.docker_container_identity(
        ["riskhub-backend"],
        run_command=lambda *_args, **_kwargs: SimpleNamespace(
            rc=0, log_path=str(log_path)
        ),
    )["riskhub-backend"]

    assert state["exists"] is True
    assert state["image_identity_error"] == (
        "Docker container identity output was malformed."
    )


@pytest.mark.parametrize(
    "startup_path_id",
    (
        "backend_runtime_dev",
        "backend_runtime_test",
        "frontend_runtime_dev",
        "frontend_runtime_test",
    ),
)
@pytest.mark.parametrize("started", (False, None))
def test_release_parity_rejects_component_runtime_that_did_not_start(
    tmp_path: Path, startup_path_id: str, started: bool | None
) -> None:
    component_fingerprint: dict[str, object] = {
        "startup_path_id": startup_path_id,
        "context_id": f"path_{startup_path_id}",
        "git_sha_expected": BASELINE_GIT_SHA,
        "git_sha_observed": BASELINE_GIT_SHA,
    }
    if started is not None:
        component_fingerprint["started"] = started

    findings, decision = _evaluate_prod_readiness(
        [
            component_fingerprint,
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    assert any(
        item["id"] == f"P1-startup-path-not-ready-{startup_path_id}"
        for item in findings
    )


@pytest.mark.parametrize("startup_path_id", ("dev_sh_full", "compose_sh_up_full"))
@pytest.mark.parametrize("readiness_field", ("backend_ready", "frontend_ready"))
@pytest.mark.parametrize("readiness", (False, None))
def test_release_parity_rejects_full_runtime_without_both_ready_services(
    tmp_path: Path,
    startup_path_id: str,
    readiness_field: str,
    readiness: bool | None,
) -> None:
    fingerprint: dict[str, object] = {
        "startup_path_id": startup_path_id,
        "context_id": startup_path_id,
        "git_sha_expected": BASELINE_GIT_SHA,
        "git_sha_observed": BASELINE_GIT_SHA,
        "launch_failed": False,
        "backend_ready": True,
        "frontend_ready": True,
    }
    if readiness is None:
        fingerprint.pop(readiness_field)
    else:
        fingerprint[readiness_field] = readiness

    findings, decision = _evaluate_prod_readiness(
        [
            fingerprint,
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        tmp_path,
    )

    assert decision["decision"] == "NO-GO"
    assert any(
        item["id"] == f"P1-startup-path-not-ready-{startup_path_id}"
        for item in findings
    )


def test_release_parity_accepts_ready_full_and_component_runtimes(
    tmp_path: Path,
) -> None:
    runtime_fingerprints: list[dict[str, object]] = [
        {
            "startup_path_id": startup_path_id,
            "context_id": startup_path_id,
            "git_sha_expected": BASELINE_GIT_SHA,
            "git_sha_observed": BASELINE_GIT_SHA,
            "launch_failed": False,
            "backend_ready": True,
            "frontend_ready": True,
        }
        for startup_path_id in ("dev_sh_full", "compose_sh_up_full")
    ]
    runtime_fingerprints[1]["docker_state"] = {
        container_name: {
            "exists": True,
            "container_id": "container-id",
            "image_ref": "riskhub-backend:latest",
            "running_image_id": "sha256:image",
            "expected_image_id": "sha256:image",
            "status": "running",
            "source_mount": {
                "source": str(REPO_ROOT / "backend"),
                "git_sha_observed": BASELINE_GIT_SHA,
            },
        }
        for container_name in (
            "riskhub-backend",
            "riskhub-backend-scheduler-dev",
        )
    }
    runtime_fingerprints.extend(
        {
            "startup_path_id": startup_path_id,
            "context_id": f"path_{startup_path_id}",
            "git_sha_expected": BASELINE_GIT_SHA,
            "git_sha_observed": BASELINE_GIT_SHA,
            "started": True,
        }
        for startup_path_id in (
            "backend_runtime_dev",
            "backend_runtime_test",
            "frontend_runtime_dev",
            "frontend_runtime_test",
        )
    )
    runtime_fingerprints.append(
        _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness")
    )

    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)

    assert decision["decision"] == "GO"
    assert not any(
        str(item["id"]).startswith("P1-startup-path-not-ready-") for item in findings
    )


def test_release_parity_decision_module_preserves_invalid_environment_decision(
    tmp_path: Path,
) -> None:
    findings, decision = evaluate_findings_and_decision(
        run_id="test-invalid-env-module",
        baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "main"},
        runtime_fingerprints=[
            {
                "startup_path_id": "dev_sh_full",
                "context_id": "dev_sh_full",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "launch_failed": True,
                "launch_rc": 1,
                "launch_log": "/tmp/dev.log",
                "launch_failure": {
                    "classification": "environment_contamination",
                    "code": "unexpected_port_owner",
                    "summary": "A required local port was owned by an unexpected process on the audit host.",
                },
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        static_resolution={
            "ci_runtime_policy": {"node_versions": ["24"]},
            "dev_startup": {},
        },
        toolchain_fingerprint={
            "dev_sh_effective_node": {"selected": True, "major": 24}
        },
        dep_diffs=_valid_dependency_diffs(),
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


def test_required_prod_dry_run_failure_is_not_masked_by_unrelated_environment_finding(
    tmp_path: Path,
) -> None:
    dry_run_log = tmp_path / "deploy-prod-dry-run.log"
    findings, decision = evaluate_findings_and_decision(
        run_id="test-unrelated-env-does-not-mask-required-failure",
        baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "main"},
        runtime_fingerprints=[
            {
                "startup_path_id": "dev_sh_full",
                "context_id": "dev_sh_full",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "launch_failed": True,
                "launch_rc": 1,
                "launch_log": "/tmp/dev.log",
                "launch_failure": {
                    "classification": "environment_contamination",
                    "code": "unexpected_port_owner",
                    "summary": "A required local port was owned by an unexpected process on the audit host.",
                },
            },
            {
                "startup_path_id": "deploy_cli_prod_docker",
                "context_id": "deploy_cli_prod_docker_dryrun",
                "git_sha_expected": BASELINE_GIT_SHA,
                "git_sha_observed": BASELINE_GIT_SHA,
                "dry_run_only": True,
                "command_rc": 9,
                "command_log": str(dry_run_log),
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        static_resolution={
            "ci_runtime_policy": {"node_versions": ["24"]},
            "dev_startup": {},
        },
        toolchain_fingerprint={
            "dev_sh_effective_node": {"selected": True, "major": 24}
        },
        dep_diffs=_valid_dependency_diffs(),
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=2,
        artifact_root=tmp_path,
        deps_dir=tmp_path / "deps",
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-03T00:00:01+00:00",
    )

    required_failure = next(
        item
        for item in findings
        if item["id"] == "P1-required-command-failed-deploy_cli_prod_docker_dryrun"
    )
    assert required_failure["command_rc"] == 9
    assert required_failure["evidence"] == [str(dry_run_log)]
    assert decision["decision"] == "NO-GO"
    assert decision["finding_counts"]["P1"] == 1
    assert decision["finding_counts"]["ENV"] >= 1


@pytest.mark.parametrize(
    ("startup_path_id", "context_id"),
    (
        (
            "compose_to_prod_lifecycle_boundary",
            "cleanup_compose_down_before_prod_dryruns",
        ),
        ("compose_cleanup_final", "cleanup_compose_down_final"),
    ),
)
@pytest.mark.parametrize(
    ("cleanup_log_text", "expected_decision", "expected_prefix"),
    (
        (
            "Cannot connect to the Docker daemon at unix:///var/run/docker.sock\n",
            "INVALID_ENVIRONMENT",
            "ENV-required-command-failed-",
        ),
        (
            "Docker is required\n",
            "INVALID_ENVIRONMENT",
            "ENV-required-command-failed-",
        ),
        (
            "Error response from daemon: failed to stop audit container\n",
            "NO-GO",
            "P1-required-command-failed-",
        ),
    ),
)
def test_compose_cleanup_matches_docker_environment_only_with_exact_host_evidence(
    tmp_path: Path,
    startup_path_id: str,
    context_id: str,
    cleanup_log_text: str,
    expected_decision: str,
    expected_prefix: str,
) -> None:
    compose_log = tmp_path / "compose-up.log"
    compose_log.write_text(
        "Cannot connect to the Docker daemon at unix:///var/run/docker.sock\n",
        encoding="utf-8",
    )
    cleanup_log = tmp_path / "compose-cleanup.log"
    cleanup_log.write_text(cleanup_log_text, encoding="utf-8")
    findings, decision = evaluate_findings_and_decision(
        run_id="compose-cleanup-classification",
        baseline={"git_sha": BASELINE_GIT_SHA, "git_branch": "dora"},
        runtime_fingerprints=[
            {
                "startup_path_id": "compose_sh_up_full",
                "context_id": "compose_sh_up_full",
                "launch_failed": True,
                "launch_rc": 1,
                "launch_log": str(compose_log),
                "launch_failure": {
                    "classification": "environment_contamination",
                    "code": "docker_daemon_unavailable",
                    "summary": "Docker was unavailable on the audit host.",
                },
            },
            {
                "startup_path_id": startup_path_id,
                "context_id": context_id,
                "command_rc": 1,
                "command_log": str(cleanup_log),
            },
            _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
        ],
        static_resolution={"ci_runtime_policy": {}, "dev_startup": {}},
        toolchain_fingerprint={},
        dep_diffs=_valid_dependency_diffs(),
        ui_parity={"mismatches_same_auth_mode_same_commit": []},
        required_failures=2,
        artifact_root=tmp_path,
        deps_dir=tmp_path / "deps",
        fingerprints_dir=tmp_path / "fingerprints",
        ui_dir=tmp_path / "ui",
        iso_now=lambda: "2026-08-04T00:00:00+00:00",
    )

    assert decision["decision"] == expected_decision
    boundary = next(
        item for item in findings if str(item["id"]).startswith(expected_prefix + context_id)
    )
    assert boundary["command_log"] == str(cleanup_log)
    if expected_decision == "INVALID_ENVIRONMENT":
        assert decision["finding_counts"]["P1"] == 0


def test_launch_failure_fingerprint_classifies_unexpected_port_owner_as_environment_contamination(
    tmp_path: Path,
) -> None:
    audit = ReleaseParityAudit("test-port-conflict", run_prod_readiness=False)
    log_path = tmp_path / "port-conflict.log"
    log_path.write_text(
        "DEV_PORT_CONFLICT_UNEXPECTED_PROCESS: refusing to stop unexpected process\n",
        encoding="utf-8",
    )
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

    fingerprint = audit._launch_failure_fingerprint(
        "dev_sh_full", "dev_sh_full", result
    )

    assert (
        fingerprint["launch_failure"]["classification"] == "environment_contamination"
    )
    assert fingerprint["launch_failure"]["code"] == "unexpected_port_owner"


@pytest.mark.parametrize(
    "log_text",
    (
        "requirements.txt: No such file or directory",
        "package-lock.json is a missing required file",
        "./scripts/dev.sh: line 42: no such file or directory",
    ),
)
def test_launch_failure_classifier_keeps_missing_candidate_files_blocking(
    log_text: str,
) -> None:
    failure = LAUNCH_CLASSIFIER_MODULE.classify_launch_failure(
        "dev_sh_full", log_text, 1
    )

    assert failure["classification"] == "product_failure"
    assert failure["code"] == "startup_path_failed"


@pytest.mark.parametrize(
    ("startup_path_id", "log_text", "expected_classification"),
    (
        (
            "compose_sh_up_full",
            "Cannot connect to the Docker daemon",
            "environment_contamination",
        ),
        (
            "dev_sh_full",
            "Node.js is required but was not found",
            "environment_contamination",
        ),
        (
            "compose_sh_up_full",
            "Node.js is required but was not found",
            "product_failure",
        ),
    ),
)
def test_launch_failure_classifier_requires_matching_host_prerequisite_context(
    startup_path_id: str,
    log_text: str,
    expected_classification: str,
) -> None:
    failure = LAUNCH_CLASSIFIER_MODULE.classify_launch_failure(
        startup_path_id, log_text, 1
    )

    assert failure["classification"] == expected_classification


def test_release_parity_uses_invalid_environment_for_env_only_failures(
    tmp_path: Path,
) -> None:
    audit = ReleaseParityAudit("test-invalid-env", run_prod_readiness=False)
    audit.baseline = {"git_sha": BASELINE_GIT_SHA, "git_branch": "main"}
    audit.runtime_fingerprints = [
        {
            "startup_path_id": "dev_sh_full",
            "context_id": "dev_sh_full",
            "git_sha_expected": BASELINE_GIT_SHA,
            "git_sha_observed": BASELINE_GIT_SHA,
            "launch_failed": True,
            "launch_rc": 1,
            "launch_log": "/tmp/dev.log",
            "launch_failure": {
                "classification": "environment_contamination",
                "code": "unexpected_port_owner",
                "summary": "A required local port was owned by an unexpected process on the audit host.",
            },
        },
        _valid_prod_readiness_fingerprint(tmp_path / "prod-readiness"),
    ]
    audit.static_resolution = {
        "ci_runtime_policy": {"node_versions": ["24"]},
        "dev_startup": {},
    }
    audit.toolchain_fingerprint = {
        "dev_sh_effective_node": {"selected": True, "major": 24},
    }
    audit.dep_diffs = _valid_dependency_diffs()
    audit.ui_parity = {"mismatches_same_auth_mode_same_commit": []}
    audit.required_failures = 1

    audit._evaluate_findings_and_decision()

    assert audit.decision["decision"] == "INVALID_ENVIRONMENT"
    assert any(item["severity"] == "ENV" for item in audit.findings)
    assert not any(
        str(item["id"]).startswith("P1-startup-path-failed-") for item in audit.findings
    )


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
    audit.static_resolution = {
        "ci_runtime_policy": {"node_versions": ["24"]},
        "dev_startup": {},
    }
    audit.toolchain_fingerprint = {
        "dev_sh_effective_node": {"selected": True, "major": 24},
    }
    audit.dep_diffs = _valid_dependency_diffs()
    audit.ui_parity = {"mismatches_same_auth_mode_same_commit": []}

    audit._evaluate_findings_and_decision()

    assert audit.decision["decision"] == "NO-GO"
    assert any(
        str(item["id"]).startswith("P1-startup-path-failed-") for item in audit.findings
    )


def test_nested_cli_stops_at_verified_docker_host_failure(
    monkeypatch, tmp_path: Path
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.run_state import build_plan_state

    source_root = tmp_path / "source"
    artifact_root = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-partial"
    )
    state = build_plan_state(
        root_dir=source_root,
        run_id="partial-docker-host",
        report_date="2026-08-03",
        artifact_root=artifact_root,
        report_path=source_root
        / "docs"
        / "security"
        / "reports"
        / "prod-readiness-deep-audit-2026-08-03.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )

    executed_commands: list[str] = []

    def fake_subprocess_run(args, **_kwargs):
        command = args[-1]
        executed_commands.append(command)
        docker_start = command.startswith(
            f"docker run -d --name {state.postgres_container} "
        )
        return subprocess.CompletedProcess(
            args,
            1 if docker_start else 0,
            stdout="",
            stderr=(
                "Cannot connect to the Docker daemon at unix:///var/run/docker.sock\n"
                if docker_start
                else ""
            ),
        )

    monkeypatch.setattr(prod_cli, "build_run_state", lambda **_kwargs: state)
    monkeypatch.setattr(subprocess, "run", fake_subprocess_run)

    assert prod_cli.run_prod_readiness_audit(run_id=state.run_id) == 1
    assert not any("pg_isready" in command for command in executed_commands)

    child_summary = json.loads(
        (artifact_root / "SUMMARY.json").read_text(encoding="utf-8")
    )
    assert not state.report_path.exists()
    assert child_summary["status"] == "partial"
    assert child_summary["failure_classification"] == "environment_contamination"
    assert child_summary["failure_command_id"] == "p3_start_postgres"
    matrix = json.loads(state.matrix_json.read_text(encoding="utf-8"))
    failed_row = next(row for row in matrix if row["id"] == "p3_start_postgres")
    assert matrix[-1] == failed_row
    result = json.loads(Path(failed_row["result"]).read_text(encoding="utf-8"))
    assert result["id"] == "p3_start_postgres"
    assert result["rc"] == 1

    (artifact_root / "meta" / "git_head.txt").write_text(
        f"{BASELINE_GIT_SHA}\n", encoding="utf-8"
    )
    (artifact_root / "meta" / "git_status_short.txt").write_text("", encoding="utf-8")
    ingest_dir = tmp_path / "release-artifacts" / "prod-readiness-ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []
    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    assert runtime_fingerprints[0]["summary_error"] is None
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "INVALID_ENVIRONMENT"
    assert any(item["id"] == "ENV-prod-readiness-host" for item in findings)
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)


def test_prod_readiness_success_keeps_generated_report_in_artifact_root(
    monkeypatch, tmp_path: Path
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit import scoring

    source_root = tmp_path / "source"
    monkeypatch.setattr(prod_cli, "ROOT_DIR", source_root)
    monkeypatch.delenv("ARTIFACT_ROOT", raising=False)
    monkeypatch.setenv("REPORT_DATE", "2026-08-04")
    monkeypatch.setattr(prod_cli, "build_prod_readiness_phases", lambda _state: [])
    monkeypatch.setattr(
        scoring,
        "score_command_results",
        lambda _state: (
            [],
            [
                {
                    "domain": "production readiness",
                    "status": "pass",
                    "score_0_to_5": 5,
                    "evidence": [],
                }
            ],
        ),
    )

    assert prod_cli.run_prod_readiness_audit(run_id="report-location") == 0

    artifact_report = (
        source_root
        / "tests"
        / "results"
        / "prod"
        / "prod-readiness-audit-report-location"
        / "reports"
        / "report.md"
    )
    tracked_report = (
        source_root
        / "docs"
        / "security"
        / "reports"
        / "prod-readiness-deep-audit-2026-08-04.md"
    )
    assert artifact_report.is_file()
    assert not tracked_report.exists()


def test_prod_readiness_cleanup_failure_is_required_and_prevents_go(
    monkeypatch, tmp_path: Path
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.phases import (
        ProdReadinessPhase,
        build_prod_readiness_phases,
    )
    from prod_readiness_audit.run_state import build_plan_state

    source_root = tmp_path / "source"
    artifact_root = (
        source_root
        / "tests"
        / "results"
        / "prod"
        / "prod-readiness-audit-cleanup-failure"
    )
    state = build_plan_state(
        root_dir=source_root,
        run_id="cleanup-failure",
        report_date="2026-08-04",
        artifact_root=artifact_root,
        report_path=artifact_root / "reports" / "report.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )
    canonical_cleanup = next(
        command
        for phase in build_prod_readiness_phases(state)
        for command in phase.commands
        if command.command_id == "cleanup_final_riskhub-frontend"
    )
    phases = [
        ProdReadinessPhase(
            "cleanup",
            (canonical_cleanup,),
        ),
    ]

    monkeypatch.setattr(prod_cli, "build_run_state", lambda **_kwargs: state)
    monkeypatch.setattr(prod_cli, "build_prod_readiness_phases", lambda _state: phases)
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda args, **_kwargs: subprocess.CompletedProcess(
            args, 1, stdout="", stderr="cleanup failed\n"
        ),
    )

    assert prod_cli.run_prod_readiness_audit(run_id=state.run_id) == 1
    summary = json.loads((artifact_root / "SUMMARY.json").read_text(encoding="utf-8"))
    findings = json.loads(
        (artifact_root / "reports" / "findings.json").read_text(encoding="utf-8")
    )
    assert summary["required_failures"] == 1
    assert any(
        finding["id"]
        == "prod-readiness-command-failed-cleanup_final_riskhub-frontend"
        for finding in findings["findings"]
    )

    fingerprint = _valid_prod_readiness_fingerprint(
        tmp_path / "cleanup-failure-ingest", required_failures=1
    )
    _release_findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)
    assert decision["decision"] == "NO-GO"


def test_prod_readiness_fixed_container_cleanup_stops_gracefully_then_propagates_remove_failure(
    tmp_path: Path,
) -> None:
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_plan_state

    state = build_plan_state(
        root_dir=tmp_path,
        run_id="graceful-container-cleanup",
        report_date="2026-08-04",
        artifact_root=tmp_path / "artifact",
        report_path=tmp_path / "artifact" / "reports" / "report.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )
    phases = build_prod_readiness_phases(state)
    commands = [command for phase in phases for command in phase.commands]
    cleanup_commands = [
        command
        for command in commands
        if command.command_id.startswith(("p3_cleanup_", "cleanup_final_"))
    ]

    assert cleanup_commands
    for command in cleanup_commands:
        assert "docker rm -f" not in command.command
        assert command.command.startswith("docker stop --time 30 ")
        assert ">/dev/null 2>&1 || true; docker rm " in command.command
    assert max(
        index
        for index, command in enumerate(commands)
        if command.command_id.startswith("p3_cleanup_")
    ) < next(
        index
        for index, command in enumerate(commands)
        if command.command_id == "p3_start_postgres"
    )
    assert min(
        index
        for index, command in enumerate(commands)
        if command.command_id.startswith("cleanup_final_")
    ) > next(
        index
        for index, command in enumerate(commands)
        if command.command_id == "p4_gitleaks_scan"
    )

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    invocations = tmp_path / "docker-invocations.txt"
    docker = bin_dir / "docker"
    docker.write_text(
        "#!/usr/bin/env bash\n"
        'printf \'%s\\n\' "$*" >> "$DOCKER_INVOCATIONS"\n'
        'if [ "$1" = "rm" ]; then exit 23; fi\n',
        encoding="utf-8",
    )
    docker.chmod(0o755)
    cleanup = next(
        command
        for command in cleanup_commands
        if command.command_id == "cleanup_final_riskhub-frontend"
    )
    result = subprocess.run(
        ["bash", "-c", cleanup.command],
        cwd=tmp_path,
        env={
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "DOCKER_INVOCATIONS": str(invocations),
        },
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 23
    assert invocations.read_text(encoding="utf-8").splitlines() == [
        "stop --time 30 riskhub-frontend",
        "rm riskhub-frontend",
    ]


def test_prod_readiness_environment_block_runs_planned_cleanup_before_return(
    monkeypatch, tmp_path: Path
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.commands import ProdReadinessCommand
    from prod_readiness_audit.phases import ProdReadinessPhase
    from prod_readiness_audit.run_state import build_plan_state

    source_root = tmp_path / "source"
    artifact_root = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-cleanup"
    )
    state = build_plan_state(
        root_dir=source_root,
        run_id="cleanup-after-environment-block",
        report_date="2026-08-04",
        artifact_root=artifact_root,
        report_path=artifact_root / "reports" / "report.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )
    phases = [
        ProdReadinessPhase(
            "operator_lifecycle",
            (
                ProdReadinessCommand("p3_start_postgres", "start-postgres"),
                ProdReadinessCommand("p3_start_registry", "start-registry"),
            ),
        ),
        ProdReadinessPhase(
            "cleanup",
            (
                ProdReadinessCommand(
                    "cleanup_final_postgres", "cleanup-postgres", required=False
                ),
            ),
        ),
    ]
    executed_commands: list[str] = []

    def fake_subprocess_run(args, **_kwargs):
        command = args[-1]
        executed_commands.append(command)
        blocked = command == "start-registry"
        return subprocess.CompletedProcess(
            args,
            1 if blocked else 0,
            stdout="",
            stderr=(
                "Cannot connect to the Docker daemon at unix:///var/run/docker.sock\n"
                if blocked
                else ""
            ),
        )

    monkeypatch.setattr(prod_cli, "build_run_state", lambda **_kwargs: state)
    monkeypatch.setattr(prod_cli, "build_prod_readiness_phases", lambda _state: phases)
    monkeypatch.setattr(subprocess, "run", fake_subprocess_run)

    assert prod_cli.run_prod_readiness_audit(run_id=state.run_id) == 1
    assert executed_commands == ["start-postgres", "start-registry", "cleanup-postgres"]

    matrix = json.loads(state.matrix_json.read_text(encoding="utf-8"))
    assert matrix[-1]["id"] == "cleanup_final_postgres"
    assert matrix[-1]["rc"] == 0


@pytest.mark.parametrize(
    "cleanup_mutation",
    (None, "missing", "all-missing", "reordered", "extra"),
)
def test_prod_readiness_ingest_accepts_only_exact_environment_cleanup_suffix(
    monkeypatch, tmp_path: Path, cleanup_mutation: str | None
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.run_state import build_plan_state

    source_root = tmp_path / "source"
    artifact_root = (
        source_root
        / "tests"
        / "results"
        / "prod"
        / "prod-readiness-audit-cleanup-ingest"
    )
    state = build_plan_state(
        root_dir=source_root,
        run_id="cleanup-ingest",
        report_date="2026-08-04",
        artifact_root=artifact_root,
        report_path=artifact_root / "reports" / "report.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )

    def fake_subprocess_run(args, **_kwargs):
        command = args[-1]
        blocked = command.startswith(
            f"docker run -d --name {state.registry_container} "
        )
        return subprocess.CompletedProcess(
            args,
            1 if blocked else 0,
            stdout="",
            stderr=("Cannot connect to the Docker daemon\n" if blocked else ""),
        )

    monkeypatch.setattr(prod_cli, "build_run_state", lambda **_kwargs: state)
    monkeypatch.setattr(subprocess, "run", fake_subprocess_run)

    assert prod_cli.run_prod_readiness_audit(run_id=state.run_id) == 1
    (artifact_root / "meta" / "git_head.txt").write_text(
        f"{BASELINE_GIT_SHA}\n", encoding="utf-8"
    )
    (artifact_root / "meta" / "git_status_short.txt").write_text("", encoding="utf-8")

    matrix = json.loads(state.matrix_json.read_text(encoding="utf-8"))
    failure_index = next(
        index for index, row in enumerate(matrix) if row["id"] == "p3_start_registry"
    )
    cleanup_ids = [
        row["id"] for row in matrix if str(row["id"]).startswith("cleanup_final_")
    ]
    assert [row["id"] for row in matrix[failure_index + 1 :]] == cleanup_ids
    decision_fingerprints: list[dict[str, object]] = []
    if cleanup_mutation == "all-missing":
        decision_ingest_dir = tmp_path / "release-artifacts" / "decision-ingest"
        decision_ingest_dir.mkdir(parents=True)
        FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
            root_dir=source_root,
            prod_ingest_dir=decision_ingest_dir,
            runtime_fingerprints=decision_fingerprints,
            captured_at_utc="2026-08-04T00:00:00+00:00",
        )
        copied_root = Path(str(decision_fingerprints[0]["copied_to"]))
        copied_matrix_path = copied_root / "reports" / "command-matrix.json"
        copied_matrix = json.loads(copied_matrix_path.read_text(encoding="utf-8"))
        copied_matrix_path.write_text(
            json.dumps(copied_matrix[: failure_index + 1]), encoding="utf-8"
        )
        copied_run_status_path = copied_root / "reports" / "run_status.json"
        copied_run_status = json.loads(
            copied_run_status_path.read_text(encoding="utf-8")
        )
        copied_run_status["completed_command_count"] = failure_index + 1
        copied_run_status_path.write_text(
            json.dumps(copied_run_status), encoding="utf-8"
        )
    if cleanup_mutation == "missing":
        matrix.pop()
    elif cleanup_mutation == "all-missing":
        del matrix[failure_index + 1 :]
    elif cleanup_mutation == "reordered":
        matrix[-2:] = reversed(matrix[-2:])
    elif cleanup_mutation == "extra":
        matrix.append({**matrix[-1], "id": "cleanup_final_extra"})
    if cleanup_mutation is not None:
        state.matrix_json.write_text(json.dumps(matrix), encoding="utf-8")
        run_status = json.loads(state.run_status_json.read_text(encoding="utf-8"))
        run_status["completed_command_count"] = len(matrix)
        state.run_status_json.write_text(json.dumps(run_status), encoding="utf-8")

    runtime_fingerprints: list[dict[str, object]] = []
    ingest_dir = tmp_path / "release-artifacts" / "prod-readiness-ingest"
    ingest_dir.mkdir(parents=True)
    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-04T00:00:00+00:00",
    )

    if cleanup_mutation is not None:
        decision_result = None
        decision_evidence_error = None
        if cleanup_mutation == "all-missing":
            decision_findings, decision_result = _evaluate_prod_readiness(
                decision_fingerprints, tmp_path
            )
            decision_evidence_error = next(
                (
                    item["evidence_error"]
                    for item in decision_findings
                    if item["id"] == "P1-prod-readiness-evidence-invalid"
                ),
                None,
            )
        assert (
            runtime_fingerprints[0]["summary_error"],
            None if decision_result is None else decision_result["decision"],
            decision_evidence_error,
        ) == (
            "Invalid production-readiness canonical command inventory",
            None if cleanup_mutation != "all-missing" else "NO-GO",
            (
                None
                if cleanup_mutation != "all-missing"
                else "production-readiness environment command matrix is invalid"
            ),
        )
        return

    assert runtime_fingerprints[0]["summary_error"] is None
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "INVALID_ENVIRONMENT"
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)


@pytest.mark.parametrize(
    "tampered_row_index",
    (-1, 0),
    ids=("blocker-log", "earlier-success-log"),
)
def test_partial_docker_host_evidence_rejects_log_bound_to_another_command(
    monkeypatch, tmp_path: Path, tampered_row_index: int
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.run_state import build_plan_state

    source_root = tmp_path / "source"
    artifact_root = (
        source_root / "tests" / "results" / "prod" / "prod-readiness-audit-p2-partial"
    )
    state = build_plan_state(
        root_dir=source_root,
        run_id="partial-p2-docker-host",
        report_date="2026-08-03",
        artifact_root=artifact_root,
        report_path=source_root
        / "docs"
        / "security"
        / "reports"
        / "prod-readiness-deep-audit-2026-08-03.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )

    executed_commands: list[str] = []

    def fake_subprocess_run(args, **_kwargs):
        command = args[-1]
        executed_commands.append(command)
        failed = "verify-prod-install-scripts" in command
        return subprocess.CompletedProcess(
            args,
            1 if failed else 0,
            stdout="",
            stderr="Cannot connect to the Docker daemon\n" if failed else "",
        )

    monkeypatch.setattr(prod_cli, "build_run_state", lambda **_kwargs: state)
    monkeypatch.setattr(subprocess, "run", fake_subprocess_run)

    assert prod_cli.run_prod_readiness_audit(run_id=state.run_id) == 1
    assert not any(command.startswith("docker run") for command in executed_commands)
    child_summary = json.loads(
        (artifact_root / "SUMMARY.json").read_text(encoding="utf-8")
    )
    assert child_summary["status"] == "partial"
    assert child_summary["failure_classification"] == "environment_contamination"
    assert child_summary["failure_code"] == "docker_daemon_unavailable"
    assert child_summary["failure_command_id"] == "p2_verify_prod_install_scripts"
    matrix = json.loads(state.matrix_json.read_text(encoding="utf-8"))
    failed_row = next(
        row for row in matrix if row["id"] == "p2_verify_prod_install_scripts"
    )
    assert matrix[-1] == failed_row

    (artifact_root / "meta" / "git_head.txt").write_text(
        f"{BASELINE_GIT_SHA}\n", encoding="utf-8"
    )
    (artifact_root / "meta" / "git_status_short.txt").write_text("", encoding="utf-8")
    ingest_dir = tmp_path / "release-artifacts" / "prod-readiness-ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []
    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    assert runtime_fingerprints[0]["summary_error"] is None
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "INVALID_ENVIRONMENT"
    environment_finding = next(
        item for item in findings if item["id"] == "ENV-prod-readiness-host"
    )
    assert environment_finding["failure_code"] == "docker_daemon_unavailable"
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)

    copied_root = Path(str(runtime_fingerprints[0]["copied_to"]))
    copied_matrix = json.loads(
        (copied_root / "reports" / "command-matrix.json").read_text(encoding="utf-8")
    )
    tampered_row = (
        next(
            row
            for row in copied_matrix
            if row["id"] == "p2_verify_prod_install_scripts"
        )
        if tampered_row_index == -1
        else copied_matrix[0]
    )
    substitute_row = copied_matrix[0 if tampered_row_index == -1 else 1]
    tampered_log = Path(tampered_row["log"])
    original_lines = tampered_log.read_text(encoding="utf-8").splitlines()
    tampered_log.write_text(
        "\n".join([f"$ {substitute_row['command']}", *original_lines[1:]]) + "\n",
        encoding="utf-8",
    )

    tampered_findings, tampered_decision = _evaluate_prod_readiness(
        runtime_fingerprints, tmp_path
    )

    assert tampered_decision["decision"] == "NO-GO"
    assert tampered_decision["finding_counts"]["P1"] == 1
    invalid_finding = next(
        item
        for item in tampered_findings
        if item["id"] == "P1-prod-readiness-evidence-invalid"
    )
    assert (
        invalid_finding["evidence_error"]
        == "production-readiness environment command evidence is invalid"
    )


@pytest.mark.parametrize(
    ("marker", "failure_code"),
    (
        ("RISKHUB_PYTHON313_UNAVAILABLE", "python313_unavailable"),
        (
            "RISKHUB_PYTHON313_VERSION_UNSUPPORTED",
            "python_version_unsupported",
        ),
    ),
)
def test_nested_python313_host_failure_is_ingested_as_typed_environment_evidence(
    monkeypatch, tmp_path: Path, marker: str, failure_code: str
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.run_state import build_plan_state

    source_root = tmp_path / "source"
    artifact_root = (
        source_root
        / "tests"
        / "results"
        / "prod"
        / "prod-readiness-audit-python-partial"
    )
    state = build_plan_state(
        root_dir=source_root,
        run_id="partial-python-host",
        report_date="2026-08-03",
        artifact_root=artifact_root,
        report_path=source_root
        / "docs"
        / "security"
        / "reports"
        / "prod-readiness-deep-audit-2026-08-03.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )

    def fake_subprocess_run(args, **_kwargs):
        command = args[-1]
        python_check = "RISKHUB_PYTHON313_UNAVAILABLE" in command
        return subprocess.CompletedProcess(
            args,
            1 if python_check else 0,
            stdout="",
            stderr=f"{marker}\n" if python_check else "",
        )

    monkeypatch.setattr(prod_cli, "build_run_state", lambda **_kwargs: state)
    monkeypatch.setattr(subprocess, "run", fake_subprocess_run)

    assert (
        prod_cli.run_prod_readiness_audit(
            run_id=state.run_id, python_bin="/verified/bin/python3.13"
        )
        == 1
    )
    summary = json.loads((artifact_root / "SUMMARY.json").read_text(encoding="utf-8"))
    assert summary["failure_classification"] == "environment_contamination"
    assert summary["failure_code"] == failure_code
    assert summary["failure_command_id"] == "meta_python_version"

    (artifact_root / "meta" / "git_head.txt").write_text(
        f"{BASELINE_GIT_SHA}\n", encoding="utf-8"
    )
    (artifact_root / "meta" / "git_status_short.txt").write_text("", encoding="utf-8")
    ingest_dir = tmp_path / "release-artifacts" / "prod-readiness-ingest"
    ingest_dir.mkdir(parents=True)
    runtime_fingerprints: list[dict[str, object]] = []
    FINGERPRINTS_MODULE.ingest_latest_existing_prod_readiness(
        root_dir=source_root,
        prod_ingest_dir=ingest_dir,
        runtime_fingerprints=runtime_fingerprints,
        captured_at_utc="2026-08-03T00:00:00+00:00",
    )

    assert runtime_fingerprints[0]["summary_error"] is None
    findings, decision = _evaluate_prod_readiness(runtime_fingerprints, tmp_path)
    assert decision["decision"] == "INVALID_ENVIRONMENT"
    environment_finding = next(
        item for item in findings if item["id"] == "ENV-prod-readiness-host"
    )
    assert environment_finding["failure_code"] == failure_code
    assert not any(str(item["id"]).startswith("P1-prod-readiness") for item in findings)


def test_nested_generic_exception_after_docker_row_remains_audit_harness(
    monkeypatch, tmp_path: Path
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.commands import ProdReadinessCommand
    from prod_readiness_audit.phases import (
        ProdReadinessPhase,
        build_prod_readiness_phases,
    )
    from prod_readiness_audit.run_state import build_plan_state

    artifact_root = tmp_path / "prod-readiness-audit-generic-exception"
    state = build_plan_state(
        root_dir=REPO_ROOT,
        run_id="generic-exception",
        report_date="2026-08-03",
        artifact_root=artifact_root,
        report_path=artifact_root / "reports" / "report.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )
    canonical_cleanup = next(
        command
        for phase in build_prod_readiness_phases(state)
        for command in phase.commands
        if command.command_id == f"cleanup_final_{state.postgres_container}"
    )

    def fake_run_command(run_state, command):
        if command.command_id == "after_docker":
            raise RuntimeError("unrelated harness interruption")
        log_path = run_state.log_dir / f"{command.command_id}.log"
        log_path.write_text(
            f"$ {command.command}\n\n",
            encoding="utf-8",
        )
        result_path = run_state.log_dir / f"{command.command_id}.result.json"
        result_path.write_text(
            json.dumps(
                {
                    "id": command.command_id,
                    "command": command.command,
                    "rc": 0,
                    "timed_out": False,
                }
            ),
            encoding="utf-8",
        )
        row = {
            "id": command.command_id,
            "command": command.command,
            "cwd": str(run_state.root_dir),
            "rc": 0,
            "log": str(log_path),
            "result": str(result_path),
            "required": command.required,
            "timeout_sec": command.timeout_sec,
            "timed_out": False,
        }
        run_state.command_results.append(row)
        return row

    monkeypatch.setattr(prod_cli, "build_run_state", lambda **_kwargs: state)
    monkeypatch.setattr(
        prod_cli,
        "build_prod_readiness_phases",
        lambda _state: [
            ProdReadinessPhase(
                "docker",
                (
                    ProdReadinessCommand("p3_start_postgres", "docker run postgres:16"),
                    ProdReadinessCommand("after_docker", "true"),
                ),
            ),
            ProdReadinessPhase(
                "cleanup",
                (canonical_cleanup,),
            ),
        ],
    )
    monkeypatch.setattr(prod_cli, "run_command", fake_run_command)

    with pytest.raises(RuntimeError, match="unrelated harness interruption"):
        prod_cli.run_prod_readiness_audit(run_id=state.run_id)

    summary = json.loads((artifact_root / "SUMMARY.json").read_text(encoding="utf-8"))
    assert summary["status"] == "partial"
    assert summary["failure_classification"] == "audit_harness"
    assert summary["failure_command_id"] is None
    matrix = json.loads(state.matrix_json.read_text(encoding="utf-8"))
    assert [row["id"] for row in matrix] == [
        "p3_start_postgres",
        f"cleanup_final_{state.postgres_container}",
    ]
    assert matrix[-1]["command"] == (
        f"docker stop --time 30 {state.postgres_container} >/dev/null 2>&1 || true; "
        f"docker rm {state.postgres_container}"
    )


def test_prod_readiness_rejects_unsafe_direct_and_environment_paths(
    monkeypatch, tmp_path: Path
) -> None:
    from prod_readiness_audit import cli as prod_cli
    from prod_readiness_audit.run_state import build_plan_state, build_run_state

    with pytest.raises(SystemExit) as direct_error:
        prod_cli.main(["--run-id", "../../outside"])
    assert direct_error.value.code == 2

    monkeypatch.setenv("RUN_ID", "../../outside")
    with pytest.raises(ValueError, match="run ID"):
        build_run_state(root_dir=tmp_path)

    monkeypatch.setenv("RUN_ID", "safe-run")
    monkeypatch.setenv("REPORT_DATE", "../../outside")
    with pytest.raises(ValueError, match="report date"):
        build_run_state(root_dir=tmp_path)

    monkeypatch.setenv("REPORT_DATE", "2026-08-03")
    monkeypatch.setenv("ARTIFACT_ROOT", str(tmp_path.parent / "outside"))
    with pytest.raises(ValueError, match="artifact root"):
        build_run_state(root_dir=tmp_path)

    with pytest.raises(ValueError, match="run ID"):
        build_plan_state(
            root_dir=tmp_path,
            run_id="../outside",
            report_date="2026-08-03",
            artifact_root=tmp_path / "artifact",
            report_path=tmp_path / "report.md",
            postgres_port=55432,
            frontend_host_port=28081,
            registry_port=56000,
        )

    with pytest.raises(ValueError, match="report date"):
        build_plan_state(
            root_dir=tmp_path,
            run_id="safe-run",
            report_date="2026-02-30",
            artifact_root=tmp_path / "artifact",
            report_path=tmp_path / "report.md",
            postgres_port=55432,
            frontend_host_port=28081,
            registry_port=56000,
        )


def test_nested_partial_code_failure_remains_audit_harness_no_go(
    tmp_path: Path,
) -> None:
    from prod_readiness_audit.artifacts import write_incomplete_artifacts
    from prod_readiness_audit.run_state import build_plan_state

    artifact_root = tmp_path / "prod-readiness-audit-code-failure"
    state = build_plan_state(
        root_dir=REPO_ROOT,
        run_id="partial-code-failure",
        report_date="2026-08-03",
        artifact_root=artifact_root,
        report_path=artifact_root / "reports" / "report.md",
        postgres_port=55432,
        frontend_host_port=28081,
        registry_port=56000,
    )
    state.ensure_directories()
    state.planned_command_ids = _canonical_prod_readiness_command_ids()
    command_id = "p2_prod_guard_pytests"
    log_path = state.log_dir / f"{command_id}.log"
    result_path = state.log_dir / f"{command_id}.result.json"
    log_path.write_text("$ pytest\n\nAssertionError: product contract failed\n")
    result_path.write_text(
        json.dumps(
            {
                "id": command_id,
                "command": "pytest",
                "rc": 1,
                "timed_out": False,
            }
        ),
        encoding="utf-8",
    )
    docker_command_id = "p3_start_postgres"
    docker_log_path = state.log_dir / f"{docker_command_id}.log"
    docker_result_path = state.log_dir / f"{docker_command_id}.result.json"
    docker_log_path.write_text(
        "$ docker run postgres:16\n\nCannot connect to the Docker daemon\n",
        encoding="utf-8",
    )
    docker_result_path.write_text(
        json.dumps(
            {
                "id": docker_command_id,
                "command": "docker run postgres:16",
                "rc": 1,
                "timed_out": False,
            }
        ),
        encoding="utf-8",
    )
    state.command_results = [
        {
            "id": command_id,
            "command": "pytest",
            "cwd": str(REPO_ROOT),
            "rc": 1,
            "log": str(log_path),
            "result": str(result_path),
            "required": True,
            "timeout_sec": 1200,
            "timed_out": False,
        },
        {
            "id": docker_command_id,
            "command": "docker run postgres:16",
            "cwd": str(REPO_ROOT),
            "rc": 1,
            "log": str(docker_log_path),
            "result": str(docker_result_path),
            "required": True,
            "timeout_sec": 300,
            "timed_out": False,
        },
    ]
    state.required_failures = 2
    (state.meta_dir / "git_head.txt").write_text(
        f"{BASELINE_GIT_SHA}\n", encoding="utf-8"
    )

    write_incomplete_artifacts(state, exit_code=1, status="partial")

    summary = json.loads((artifact_root / "SUMMARY.json").read_text(encoding="utf-8"))
    assert summary["failure_classification"] == "audit_harness"
    fingerprint = {
        "context_id": "prod_readiness_ingest",
        "startup_path_id": "prod_readiness",
        "copied_to": str(artifact_root),
        "run_rc": 1,
        "prod_readiness_git_sha": BASELINE_GIT_SHA,
        "prod_readiness_git_sha_error": None,
        "summary": summary,
    }
    findings, decision = _evaluate_prod_readiness([fingerprint], tmp_path)

    assert decision["decision"] == "NO-GO"
    assert any(item["id"] == "P1-prod-readiness-evidence-invalid" for item in findings)
    assert not any(item["severity"] == "ENV" for item in findings)
