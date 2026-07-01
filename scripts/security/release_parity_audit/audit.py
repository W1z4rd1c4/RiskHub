#!/usr/bin/env python3
"""Release parity audit harness.

Generates evidence artifacts under:
  tests/results/release-parity-audit-<timestamp>/
"""

from __future__ import annotations

import os
import sys

if __package__ in {None, ""}:
    _PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
    _PACKAGE_PARENT = os.path.dirname(_PACKAGE_DIR)
    if sys.path and os.path.abspath(sys.path[0]) == _PACKAGE_DIR:
        sys.path.pop(0)
    if _PACKAGE_PARENT not in sys.path:
        sys.path.insert(0, _PACKAGE_PARENT)

import argparse
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from release_parity_audit.artifact_writer import sha256_audit_file, write_audit_json, write_audit_text
from release_parity_audit.baseline import capture_release_baseline
from release_parity_audit.cleanup import CleanupCommand, compose_down, stop_local_dev_processes
from release_parity_audit.command_runner import run_command
from release_parity_audit.decision import evaluate_findings_and_decision
from release_parity_audit.dependencies import capture_dependencies
from release_parity_audit.env_preparation import prepare_deploy_cli_prod_layout, prepare_prod_env_files
from release_parity_audit.facade import ReleaseParityFacadePlan, release_parity_phases
from release_parity_audit.fingerprints import (
    RuntimeFingerprint,
    capture_backend_fingerprint,
    ingest_latest_existing_prod_readiness,
    ingest_prod_readiness_by_running_worktree,
    start_background_service,
)
from release_parity_audit.http_probe import http_json, wait_http
from release_parity_audit.launch_classifier import build_launch_failure_fingerprint, classify_launch_failure
from release_parity_audit.phase_runner import ReleaseParityPhaseRunner
from release_parity_audit.reporting import build_report, build_run_status, matrix_payload
from release_parity_audit.run_state import ReleaseParityRunState
from release_parity_audit.runtime import run_dynamic_paths
from release_parity_audit.screenshots import ScreenshotCapturePlan, capture_login_screenshot
from release_parity_audit.startup import build_startup_inventory
from release_parity_audit.startup_preflight import (
    capture_startup_preflight,
    detect_dev_sh_effective_node,
    docker_container_state,
    node_major_from_binary,
    port_listeners,
)
from release_parity_audit.static_resolution import extract_static_resolution
from release_parity_audit.toolchain import ToolchainSnapshot, capture_toolchain
from release_parity_audit.types import CommandResult
from release_parity_audit.ui_parity import evaluate_ui_parity

ROOT_DIR = Path(__file__).resolve().parents[3]

CRITICAL_BACKEND_PACKAGES = [
    "fastapi",
    "uvicorn",
    "sqlalchemy",
    "asyncpg",
    "alembic",
    "pydantic",
    "redis",
    "cryptography",
    "bcrypt",
    "passlib",
]

CORE_FRONTEND_PACKAGES = [
    "react",
    "react-dom",
    "vite",
    "@vitejs/plugin-react",
    "typescript",
]


class ReleaseParityAudit:
    def __init__(self, run_id: str, run_prod_readiness: bool = True) -> None:
        self.run_id = run_id
        self.run_prod_readiness = run_prod_readiness
        self.artifact_root = ROOT_DIR / "tests" / "results" / f"release-parity-audit-{run_id}"
        self.logs_dir = self.artifact_root / "logs"
        self.meta_dir = self.artifact_root / "meta"
        self.fingerprints_dir = self.artifact_root / "fingerprints"
        self.deps_dir = self.artifact_root / "deps"
        self.ui_dir = self.artifact_root / "ui"
        self.tmp_dir = self.artifact_root / "tmp"
        self.prod_ingest_dir = self.artifact_root / "prod_readiness_ingest"

        self.run_state = ReleaseParityRunState()
        self.phase_runner = ReleaseParityPhaseRunner()

        self.baseline: dict[str, Any] = {}
        self.startup_paths: list[dict[str, Any]] = []
        self.static_resolution: dict[str, Any] = {}
        self.runtime_fingerprints: list[dict[str, Any]] = []
        self.toolchain_fingerprint: dict[str, Any] = {}
        self.startup_preflight: dict[str, Any] = {}
        self.launch_failure_analysis: list[dict[str, Any]] = []
        self.dep_diffs: dict[str, Any] = {}
        self.ui_parity: dict[str, Any] = {}
        self.findings: list[dict[str, Any]] = []
        self.decision: dict[str, Any] = {}
        self.run_status: dict[str, Any] = {}

        for path in [
            self.artifact_root,
            self.logs_dir,
            self.meta_dir,
            self.fingerprints_dir,
            self.deps_dir,
            self.ui_dir,
            self.tmp_dir,
            self.prod_ingest_dir,
        ]:
            path.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(UTC)

    @staticmethod
    def _iso(ts: datetime) -> str:
        return ts.isoformat()

    @property
    def command_results(self) -> list[CommandResult]:
        return self.run_state.command_results

    @command_results.setter
    def command_results(self, value: list[CommandResult]) -> None:
        self.run_state.command_results = value

    @property
    def required_failures(self) -> int:
        return self.run_state.required_failures

    @required_failures.setter
    def required_failures(self, value: int) -> None:
        self.run_state.required_failures = value

    def _write_json(self, path: Path, payload: Any) -> None:
        write_audit_json(path, payload)

    def _write_text(self, path: Path, text: str) -> None:
        write_audit_text(path, text)

    def _run(
        self,
        command_id: str,
        command: str,
        *,
        cwd: Path | None = None,
        required: bool = True,
        timeout_sec: int | None = None,
        env: dict[str, str] | None = None,
    ) -> CommandResult:
        result = run_command(
            command_id,
            command,
            cwd=cwd or ROOT_DIR,
            logs_dir=self.logs_dir,
            required=required,
            timeout_sec=timeout_sec,
            env=env,
            utc_now=self._utc_now,
            iso=self._iso,
        )
        self.run_state.record_command_result(result)
        return result

    def _http_json(self, url: str, timeout: float = 8.0) -> tuple[int, Any]:
        return http_json(url, timeout=timeout)

    def _wait_http(self, url: str, timeout_sec: int = 90, expect_status: int | None = None) -> bool:
        return wait_http(url, timeout_sec, expect_status, http_json_func=self._http_json)

    def _sha256_file(self, path: Path) -> str:
        return sha256_audit_file(path)

    @staticmethod
    def _canonical_package_name(name: str) -> str:
        return re.sub(r"[-_.]+", "-", name).lower()

    def _parse_package_versions(self, text: str) -> dict[str, str | None]:
        versions: dict[str, str | None] = {}
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            match = re.match(r"^([A-Za-z0-9_.-]+)==([^\s]+)$", line)
            if match:
                versions[self._canonical_package_name(match.group(1))] = match.group(2)
                continue
            missing_match = re.match(r"^([A-Za-z0-9_.-]+)=missing$", line)
            if missing_match:
                versions[self._canonical_package_name(missing_match.group(1))] = None
        return versions

    @staticmethod
    def _node_major_from_binary(binary: str) -> int | None:
        return node_major_from_binary(binary)

    def _detect_dev_sh_effective_node(self) -> dict[str, Any]:
        return detect_dev_sh_effective_node(self.toolchain_fingerprint)

    @staticmethod
    def _port_listeners(port: int) -> list[dict[str, Any]]:
        return port_listeners(port)

    def _capture_startup_preflight(self) -> None:
        preflight = capture_startup_preflight(
            root_dir=ROOT_DIR,
            toolchain_fingerprint=self.toolchain_fingerprint,
            captured_at_utc=self._iso(self._utc_now()),
        )
        self.startup_preflight = preflight
        self._write_json(self.fingerprints_dir / "startup-preflight.json", preflight)

    @staticmethod
    def _classify_launch_failure(startup_path_id: str, log_text: str, launch_rc: int) -> dict[str, Any]:
        return classify_launch_failure(startup_path_id, log_text, launch_rc)

    def _stop_local_dev_processes(self) -> None:
        stop_local_dev_processes(self._run)

    def _compose_down(self, command_id: str) -> None:
        compose_down(self._run, command_id)

    def _capture_backend_fingerprint(self, context_id: str, base_url: str) -> dict[str, Any]:
        return capture_backend_fingerprint(
            context_id=context_id,
            base_url=base_url,
            baseline=self.baseline,
            captured_at_utc=self._iso(self._utc_now()),
            http_json=self._http_json,
        )

    def _capture_screenshot(
        self, command_id: str, url: str, output_path: Path
    ) -> tuple[bool, str | None, dict[str, Any] | None]:
        return capture_login_screenshot(
            command_id=command_id,
            url=url,
            output_path=output_path,
            run_command=self._run,
            sha256_file=self._sha256_file,
        )

    def _start_background_service(
        self,
        context_id: str,
        command: str,
        *,
        readiness_url: str,
        endpoint_base_url: str | None = None,
        screenshot_url: str | None = None,
        screenshot_file: Path | None = None,
        max_wait_sec: int = 90,
    ) -> dict[str, Any]:
        return start_background_service(
            context_id=context_id,
            command=command,
            logs_dir=self.logs_dir,
            root_dir=ROOT_DIR,
            baseline=self.baseline,
            readiness_url=readiness_url,
            wait_http=self._wait_http,
            http_json=self._http_json,
            capture_screenshot=self._capture_screenshot,
            captured_at_utc=lambda: self._iso(self._utc_now()),
            endpoint_base_url=endpoint_base_url,
            screenshot_url=screenshot_url,
            screenshot_file=screenshot_file,
            max_wait_sec=max_wait_sec,
        )

    def _build_startup_inventory(self) -> None:
        self.startup_paths = build_startup_inventory()
        self._write_json(self.artifact_root / "startup-paths.json", self.startup_paths)

    def _extract_static_resolution(self) -> None:
        self.static_resolution = extract_static_resolution(root_dir=ROOT_DIR)
        self._write_json(self.artifact_root / "static-resolution.json", self.static_resolution)

    def _capture_baseline(self) -> None:
        self.baseline = capture_release_baseline(root_dir=ROOT_DIR, captured_at_utc=self._iso(self._utc_now()))
        self._write_json(self.meta_dir / "baseline.json", self.baseline)

    def _capture_toolchain(self) -> None:
        toolchain = capture_toolchain(run_command=self._run, root_dir=ROOT_DIR)
        self.toolchain_fingerprint = toolchain
        self._write_json(self.fingerprints_dir / "toolchain.json", toolchain)

    def _docker_container_state(self, names: list[str]) -> dict[str, Any]:
        return docker_container_state(names, run_command=self._run)

    def _prepare_prod_env_files(self) -> tuple[Path, Path]:
        return prepare_prod_env_files(self.tmp_dir)

    def _prepare_deploy_cli_prod_layout(self) -> tuple[Path, Path, Path]:
        return prepare_deploy_cli_prod_layout(self.tmp_dir)

    def _launch_failure_fingerprint(
        self,
        startup_path_id: str,
        context_id: str,
        launch_result: CommandResult,
        *,
        docker_containers: list[str] | None = None,
    ) -> dict[str, Any]:
        fp, analysis = build_launch_failure_fingerprint(
            startup_path_id=startup_path_id,
            context_id=context_id,
            launch_result=launch_result,
            baseline=self.baseline,
            captured_at_utc=self._iso(self._utc_now()),
            docker_state=self._docker_container_state(docker_containers) if docker_containers else None,
        )
        self.launch_failure_analysis.append(analysis)
        return fp

    def _capture_dependencies(self) -> None:
        capture_dependencies(
            self,
            critical_backend_packages=CRITICAL_BACKEND_PACKAGES,
            core_frontend_packages=CORE_FRONTEND_PACKAGES,
        )

    def _run_dynamic_paths(self) -> None:
        run_dynamic_paths(self)

    def _append_ci_runtime_fingerprints(self) -> None:
        ci_policy = self.static_resolution.get("ci_runtime_policy", {})
        for startup_id in ["ci_e2e", "ci_lint", "ci_security"]:
            self.runtime_fingerprints.append(
                {
                    "startup_path_id": startup_id,
                    "context_id": startup_id,
                    "captured_at_utc": self._iso(self._utc_now()),
                    "git_sha_expected": self.baseline.get("git_sha"),
                    "git_sha_observed": self.baseline.get("git_sha"),
                    "source": "workflow-static",
                    "node_versions": ci_policy.get("node_versions", []),
                    "python_versions": ci_policy.get("python_versions", []),
                    "frontend_ci_lockfile_install": ci_policy.get("frontend_ci_lockfile_install"),
                    "backend_ci_uses_pip_install_requirements": ci_policy.get(
                        "backend_ci_uses_pip_install_requirements"
                    ),
                }
            )

    def _ensure_startup_path_runtime_coverage(self) -> None:
        existing_ids = {str(fp.get("startup_path_id")) for fp in self.runtime_fingerprints if fp.get("startup_path_id")}
        coverage_notes = {
            "dev_sh_backend": "Covered functionally by backend_runtime_dev; direct blocking invocation omitted.",
            "compose_sh_up_db_only": (
                "Covered functionally by backend_db_runtime_dev; direct infra-only invocation omitted."
            ),
        }
        for path in self.startup_paths:
            startup_id = path["id"]
            if startup_id in existing_ids:
                continue
            self.runtime_fingerprints.append(
                {
                    "startup_path_id": startup_id,
                    "context_id": startup_id,
                    "captured_at_utc": self._iso(self._utc_now()),
                    "git_sha_expected": self.baseline.get("git_sha"),
                    "git_sha_observed": self.baseline.get("git_sha"),
                    "not_executed": True,
                    "reason": coverage_notes.get(
                        startup_id,
                        "No dynamic execution path configured in this audit run; static inventory captured.",
                    ),
                }
            )

    def _ingest_latest_existing_prod_readiness(self) -> None:
        ingest_latest_existing_prod_readiness(
            root_dir=ROOT_DIR,
            prod_ingest_dir=self.prod_ingest_dir,
            runtime_fingerprints=self.runtime_fingerprints,
            captured_at_utc=self._iso(self._utc_now()),
        )

    def _ingest_prod_readiness_by_running_worktree(self) -> None:
        ingest_prod_readiness_by_running_worktree(
            root_dir=ROOT_DIR,
            prod_ingest_dir=self.prod_ingest_dir,
            runtime_fingerprints=self.runtime_fingerprints,
            run_command=self._run,
            captured_at_utc=lambda: self._iso(self._utc_now()),
            fallback_ingest=self._ingest_latest_existing_prod_readiness,
        )

    def _evaluate_ui_parity(self) -> None:
        self.ui_parity = evaluate_ui_parity(self.runtime_fingerprints)
        self._write_json(self.ui_dir / "parity.json", self.ui_parity)

    def _evaluate_findings_and_decision(self) -> None:
        self.findings, self.decision = evaluate_findings_and_decision(
            run_id=self.run_id,
            baseline=self.baseline,
            runtime_fingerprints=self.runtime_fingerprints,
            static_resolution=self.static_resolution,
            toolchain_fingerprint=self.toolchain_fingerprint,
            dep_diffs=self.dep_diffs,
            ui_parity=self.ui_parity,
            required_failures=self.required_failures,
            artifact_root=self.artifact_root,
            deps_dir=self.deps_dir,
            fingerprints_dir=self.fingerprints_dir,
            ui_dir=self.ui_dir,
            iso_now=lambda: self._iso(self._utc_now()),
        )
        self._write_json(self.artifact_root / "findings.json", self.findings)
        self._write_json(
            self.fingerprints_dir / "launch-failure-analysis.json",
            self.launch_failure_analysis,
        )
        self._write_json(self.artifact_root / "decision.json", self.decision)

    def _write_report(self) -> None:
        matrix_path = self.artifact_root / "matrix.json"
        self._write_json(matrix_path, matrix_payload(self.command_results))
        self.run_status = build_run_status(
            run_id=self.run_id,
            generated_at_utc=self._iso(self._utc_now()),
            decision=self.decision,
            required_failures=self.required_failures,
            artifact_root=self.artifact_root,
            matrix_path=matrix_path,
        )
        self._write_json(self.artifact_root / "run_status.json", self.run_status)
        report = build_report(
            run_id=self.run_id,
            decision=self.decision,
            required_failures=self.required_failures,
            baseline=self.baseline,
            findings=self.findings,
            artifact_root=self.artifact_root,
            fingerprints_dir=self.fingerprints_dir,
            deps_dir=self.deps_dir,
            ui_dir=self.ui_dir,
        )
        self._write_text(self.artifact_root / "report.md", report)

    def capture_baseline(self) -> None:
        self._capture_baseline()

    def build_startup_inventory(self) -> None:
        self._build_startup_inventory()

    def extract_static_resolution(self) -> None:
        self._extract_static_resolution()

    def capture_toolchain(self) -> None:
        self._capture_toolchain()

    def capture_startup_preflight(self) -> None:
        self._capture_startup_preflight()

    def run_dynamic_paths(self) -> None:
        self._run_dynamic_paths()

    def capture_dependencies(self) -> None:
        self._capture_dependencies()

    def evaluate_ui_parity(self) -> None:
        self._evaluate_ui_parity()

    def evaluate_findings_and_decision(self) -> None:
        self._evaluate_findings_and_decision()

    def write_report(self) -> None:
        self._write_report()

    def run(self) -> None:
        self.phase_runner.run(release_parity_phases(self))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run release parity audit")
    parser.add_argument(
        "--run-id",
        default=datetime.now(UTC).strftime("%Y%m%d-%H%M%S"),
        help="Run identifier suffix (default: UTC timestamp)",
    )
    parser.add_argument(
        "--skip-prod-readiness",
        action="store_true",
        help=(
            "Skip executing run_prod_readiness_audit_local.sh in isolated worktree and ingest latest existing "
            "artifact instead."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audit = ReleaseParityAudit(run_id=args.run_id, run_prod_readiness=not args.skip_prod_readiness)
    audit.run()
    print(str(audit.artifact_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
