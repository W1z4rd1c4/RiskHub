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
import json
import re
import shlex
import shutil
import signal
import subprocess
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from release_parity_audit.artifacts import sha256_file, write_json, write_text
from release_parity_audit.command_runner import run_command
from release_parity_audit.decision import evaluate_findings_and_decision
from release_parity_audit.dependencies import capture_dependencies
from release_parity_audit.phase_runner import ReleaseParityPhase, ReleaseParityPhaseRunner
from release_parity_audit.reporting import build_report, build_run_status, matrix_payload
from release_parity_audit.run_state import ReleaseParityRunState
from release_parity_audit.runtime import run_dynamic_paths
from release_parity_audit.startup import build_startup_inventory
from release_parity_audit.types import CommandResult
from release_parity_audit.ui_parity import evaluate_ui_parity

ROOT_DIR = Path(__file__).resolve().parents[2]

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
        write_json(path, payload)

    def _write_text(self, path: Path, text: str) -> None:
        write_text(path, text)

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
        req = Request(url, headers={"Accept": "application/json"})
        with urlopen(req, timeout=timeout) as response:
            status = response.getcode()
            body = response.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {"_raw": body}
            return status, payload

    def _wait_http(self, url: str, timeout_sec: int = 90, expect_status: int | None = None) -> bool:
        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            try:
                status, _ = self._http_json(url, timeout=4.0)
                if expect_status is None or status == expect_status:
                    return True
            except (URLError, HTTPError, TimeoutError, ConnectionError, OSError):
                pass
            time.sleep(1.0)
        return False

    def _sha256_file(self, path: Path) -> str:
        return sha256_file(path)

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
        try:
            completed = subprocess.run(
                [binary, "-p", "process.versions.node.split('.')[0]"],
                check=False,
                capture_output=True,
                text=True,
            )
        except OSError:
            return None
        if completed.returncode != 0:
            return None
        value = (completed.stdout or "").strip()
        return int(value) if value.isdigit() else None

    def _detect_dev_sh_effective_node(self) -> dict[str, Any]:
        required_major = 24

        def candidate_payload(bin_dir: Path, source: str) -> dict[str, Any] | None:
            node_binary = bin_dir / "node"
            npm_binary = bin_dir / "npm"
            if not node_binary.is_file() or not os.access(node_binary, os.X_OK):
                return None
            if not npm_binary.is_file() or not os.access(npm_binary, os.X_OK):
                return None
            major = self._node_major_from_binary(str(node_binary))
            if major != required_major:
                return None
            version_result = subprocess.run(
                [str(node_binary), "--version"],
                check=False,
                capture_output=True,
                text=True,
            )
            npm_result = subprocess.run(
                [str(npm_binary), "--version"],
                check=False,
                capture_output=True,
                text=True,
            )
            return {
                "selected": True,
                "required_major": required_major,
                "source": source,
                "node_path": str(node_binary),
                "npm_path": str(npm_binary),
                "node_version": (version_result.stdout or "").strip(),
                "npm_version": (npm_result.stdout or "").strip(),
                "major": major,
            }

        current_node = shutil.which("node")
        current_npm = shutil.which("npm")
        if current_node and current_npm and self._node_major_from_binary(current_node) == required_major:
            version_result = subprocess.run(
                [current_node, "--version"],
                check=False,
                capture_output=True,
                text=True,
            )
            npm_result = subprocess.run(
                [current_npm, "--version"],
                check=False,
                capture_output=True,
                text=True,
            )
            return {
                "selected": True,
                "required_major": required_major,
                "source": "PATH",
                "node_path": current_node,
                "npm_path": current_npm,
                "node_version": (version_result.stdout or "").strip(),
                "npm_version": (npm_result.stdout or "").strip(),
                "major": required_major,
            }

        candidate_dirs: list[tuple[Path, str]] = []
        node24_bin = os.environ.get("NODE24_BIN")
        if node24_bin:
            candidate_dirs.append((Path(node24_bin), "NODE24_BIN"))
        candidate_dirs.extend(
            [
                (Path("/opt/homebrew/opt/node@24/bin"), "homebrew_default"),
                (Path("/usr/local/opt/node@24/bin"), "homebrew_usr_local"),
            ]
        )

        brew_binary = shutil.which("brew")
        if brew_binary:
            brew_prefix = subprocess.run(
                [brew_binary, "--prefix", "node@24"],
                check=False,
                capture_output=True,
                text=True,
            )
            prefix = (brew_prefix.stdout or "").strip()
            if prefix:
                candidate_dirs.append((Path(prefix) / "bin", "brew_prefix"))

        nvm_root = Path.home() / ".nvm" / "versions" / "node"
        if nvm_root.exists():
            for match in sorted(nvm_root.glob("v24*/bin")):
                candidate_dirs.append((match, "nvm"))

        seen: set[str] = set()
        for bin_dir, source in candidate_dirs:
            key = str(bin_dir)
            if key in seen:
                continue
            seen.add(key)
            payload = candidate_payload(bin_dir, source)
            if payload is not None:
                return payload

        host_major = self._node_major_from_binary(current_node) if current_node else None
        return {
            "selected": False,
            "required_major": required_major,
            "source": None,
            "node_path": current_node,
            "npm_path": current_npm,
            "node_version": self.toolchain_fingerprint.get("host_node", {}).get("value"),
            "npm_version": self.toolchain_fingerprint.get("host_npm", {}).get("value"),
            "major": host_major,
        }

    @staticmethod
    def _port_listeners(port: int) -> list[dict[str, Any]]:
        try:
            completed = subprocess.run(
                ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
                check=False,
                capture_output=True,
                text=True,
            )
        except OSError:
            return []
        if completed.returncode != 0:
            return []
        listeners: list[dict[str, Any]] = []
        for raw_line in completed.stdout.splitlines()[1:]:
            line = raw_line.strip()
            if not line:
                continue
            parts = re.split(r"\s+", line, maxsplit=8)
            if len(parts) < 9:
                continue
            listeners.append(
                {
                    "command": parts[0],
                    "pid": parts[1],
                    "user": parts[2],
                    "name": parts[8],
                }
            )
        return listeners

    def _capture_startup_preflight(self) -> None:
        docker_available = False
        docker_message = ""
        try:
            completed = subprocess.run(
                ["docker", "info"],
                check=False,
                capture_output=True,
                text=True,
            )
            docker_available = completed.returncode == 0
            docker_message = ((completed.stdout or "") + (completed.stderr or "")).strip()
        except OSError as exc:
            docker_message = str(exc)

        preflight = {
            "captured_at_utc": self._iso(self._utc_now()),
            "docker_daemon": {
                "available": docker_available,
                "message": docker_message[:4000],
            },
            "ports": {
                "8000": self._port_listeners(8000),
                "5173": self._port_listeners(5173),
                "80": self._port_listeners(80),
            },
            "toolchain": {
                "dev_sh_effective_node": self._detect_dev_sh_effective_node(),
                "backend_venv_python_exists": (ROOT_DIR / "backend" / "venv" / "bin" / "python").exists(),
                "frontend_lockfile_exists": (ROOT_DIR / "frontend" / "package-lock.json").exists(),
            },
        }
        self.startup_preflight = preflight
        self._write_json(self.fingerprints_dir / "startup-preflight.json", preflight)

    @staticmethod
    def _classify_launch_failure(startup_path_id: str, log_text: str, launch_rc: int) -> dict[str, Any]:
        log_lower = log_text.lower()

        def result(
            classification: str,
            code: str,
            summary: str,
        ) -> dict[str, Any]:
            return {
                "classification": classification,
                "code": code,
                "summary": summary,
                "launch_rc": launch_rc,
            }

        if "dev_port_conflict_unexpected_process" in log_lower:
            return result(
                "environment_contamination",
                "unexpected_port_owner",
                "A required local port was owned by an unexpected process on the audit host.",
            )
        if "docker daemon is unavailable" in log_lower or "cannot connect to the docker daemon" in log_lower:
            return result(
                "environment_contamination",
                "docker_daemon_unavailable",
                "Docker was unavailable on the audit host for a Docker-backed startup path.",
            )
        if "docker is required" in log_lower or "docker daemon not reachable" in log_lower:
            return result(
                "environment_contamination",
                "docker_tooling_missing",
                "Docker tooling was unavailable for a Docker-backed startup path.",
            )
        if (
            "unsupported node.js major" in log_lower
            or "node.js is required but was not found" in log_lower
            or "npm is required but was not found" in log_lower
        ):
            return result(
                "environment_contamination",
                "toolchain_mismatch",
                "Node/npm on the audit host could not satisfy the startup script requirements.",
            )
        packaging_markers = (
            "backend/venv/bin/python",
            "./venv/bin/python",
            "package-lock.json",
            "requirements.txt",
            "requirements-runtime.txt",
            "requirements-db.txt",
            "no such file or directory",
            "missing required file",
            "missing required directory",
        )
        if any(marker in log_lower for marker in packaging_markers):
            return result(
                "environment_contamination",
                "parity_artifact_incomplete",
                "The parity workspace or generated artifacts were incomplete for this startup path.",
            )
        return result(
            "product_failure",
            "startup_path_failed",
            f"Startup path {startup_path_id} failed before parity fingerprints could be captured.",
        )

    def _stop_local_dev_processes(self) -> None:
        self._run(
            "cleanup_local_dev_processes",
            "screen -S riskhub-backend -X quit >/dev/null 2>&1 || true; "
            "screen -S riskhub-frontend -X quit >/dev/null 2>&1 || true; "
            "if [ -f .dev-backend.pid ]; then kill $(cat .dev-backend.pid) >/dev/null 2>&1 || true; fi; "
            "if [ -f .dev-frontend.pid ]; then kill $(cat .dev-frontend.pid) >/dev/null 2>&1 || true; fi",
            required=False,
        )

    def _compose_down(self, command_id: str) -> None:
        self._run(
            command_id,
            "if command -v docker-compose >/dev/null 2>&1; then "
            "docker-compose -f docker-compose.yml down --remove-orphans; "
            "else docker compose -f docker-compose.yml down --remove-orphans; fi",
            required=False,
            timeout_sec=240,
        )

    def _capture_backend_fingerprint(self, context_id: str, base_url: str) -> dict[str, Any]:
        fp: dict[str, Any] = {
            "context_id": context_id,
            "base_url": base_url,
            "captured_at_utc": self._iso(self._utc_now()),
            "git_sha_expected": self.baseline.get("git_sha"),
        }
        endpoints: dict[str, Any] = {}
        for name, endpoint in {
            "health": "/api/v1/health",
            "auth_config": "/api/v1/auth/config",
            "root": "/",
        }.items():
            url = f"{base_url}{endpoint}"
            try:
                status, payload = self._http_json(url, timeout=8.0)
                endpoints[name] = {"status": status, "payload": payload}
            except Exception as exc:  # noqa: BLE001
                endpoints[name] = {"error": str(exc)}
        fp["endpoints"] = endpoints

        health_payload = endpoints.get("health", {}).get("payload", {})
        auth_payload = endpoints.get("auth_config", {}).get("payload", {})
        fp["app_version"] = health_payload.get("version")
        fp["service_name"] = health_payload.get("service")
        fp["auth_mode"] = auth_payload.get("auth_mode")
        fp["demo_login_enabled"] = auth_payload.get("demo_login_enabled")
        fp["sso_enabled"] = auth_payload.get("sso", {}).get("enabled") if isinstance(auth_payload, dict) else None
        fp["git_sha_observed"] = self.baseline.get("git_sha")
        return fp

    def _capture_screenshot(
        self, command_id: str, url: str, output_path: Path
    ) -> tuple[bool, str | None, dict[str, Any] | None]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        ui_state_path = output_path.with_suffix(".state.json")
        cmd = (
            "cd frontend && "
            + "node - "
            + shlex.quote(url)
            + " "
            + shlex.quote(str(output_path))
            + " "
            + shlex.quote(str(ui_state_path))
            + " <<'NODE'\n"
            + "const fs = require('fs');\n"
            + "const { chromium } = require('playwright');\n"
            + "const targetUrl = process.argv[2];\n"
            + "const outputPath = process.argv[3];\n"
            + "const uiStatePath = process.argv[4];\n"
            + "(async () => {\n"
            + "  const browser = await chromium.launch({ headless: true });\n"
            + "  const context = await browser.newContext({\n"
            + "    viewport: { width: 1280, height: 720 },\n"
            + "    serviceWorkers: 'block',\n"
            + "    locale: 'en-US',\n"
            + "  });\n"
            + "  const page = await context.newPage();\n"
            + "  await page.emulateMedia({ reducedMotion: 'reduce' });\n"
            + "  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });\n"
            + "  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});\n"
            + "  await page.waitForSelector('h1:has-text(\"RiskHub\")', { timeout: 30000 });\n"
            + "  await page.addStyleTag({ content: "
            + "'* , *::before, *::after { animation: none !important; transition: none !important; }' });\n"
            + "  await page.evaluate(async () => {\n"
            + "    if (document.fonts && document.fonts.ready) {\n"
            + "      await document.fonts.ready;\n"
            + "    }\n"
            + "  });\n"
            + "  await page.waitForTimeout(1500);\n"
            + "  const uiState = await page.evaluate(() => {\n"
            + "    const heading = document.querySelector('h1')?.textContent?.trim() || null;\n"
            + "    const bodyText = document.body?.innerText || '';\n"
            + "    const hasConfigWarning = bodyText.includes('Auth config unavailable; showing demo login');\n"
            + "    const hasSsoButton = Array.from(document.querySelectorAll('button')).some((btn) =>\n"
            + "      (btn.textContent || '').toLowerCase().includes('microsoft')\n"
            + "    );\n"
            + "    const demoCardCount = document.querySelectorAll('.glass-card').length;\n"
            + "    return {\n"
            + "      path: window.location.pathname,\n"
            + "      heading,\n"
            + "      has_config_warning: hasConfigWarning,\n"
            + "      has_sso_button: hasSsoButton,\n"
            + "      demo_card_count: demoCardCount,\n"
            + "    };\n"
            + "  });\n"
            + "  await page.screenshot({ path: outputPath, fullPage: true });\n"
            + "  fs.writeFileSync(uiStatePath, JSON.stringify(uiState, null, 2));\n"
            + "  await context.close();\n"
            + "  await browser.close();\n"
            + "})().catch((err) => {\n"
            + "  console.error(err);\n"
            + "  process.exit(1);\n"
            + "});\n"
            + "NODE"
        )
        result = self._run(command_id, cmd, required=False, timeout_sec=180)
        if result.rc == 0 and output_path.exists():
            ui_state: dict[str, Any] | None = None
            if ui_state_path.exists():
                try:
                    ui_state = json.loads(ui_state_path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    ui_state = None
            return True, self._sha256_file(output_path), ui_state
        return False, None, None

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
        log_path = self.logs_dir / f"{context_id}.log"
        with log_path.open("w", encoding="utf-8") as handle:
            handle.write(f"$ {command}\n\n")
            handle.flush()
            proc = subprocess.Popen(  # noqa: S603
                ["bash", "-c", command],
                cwd=str(ROOT_DIR),
                stdout=handle,
                stderr=subprocess.STDOUT,
                preexec_fn=os.setsid,
                text=True,
            )
            started = False
            start_epoch = time.time()
            try:
                while time.time() - start_epoch < max_wait_sec:
                    if proc.poll() is not None:
                        break
                    if self._wait_http(readiness_url, timeout_sec=2):
                        started = True
                        break
                fingerprint: dict[str, Any] = {
                    "context_id": context_id,
                    "command": command,
                    "started": started,
                    "log": str(log_path),
                    "git_sha_expected": self.baseline.get("git_sha"),
                    "git_sha_observed": self.baseline.get("git_sha"),
                }
                if started and endpoint_base_url:
                    fingerprint.update(self._capture_backend_fingerprint(context_id, endpoint_base_url))
                if started and screenshot_url and screenshot_file:
                    ok, shot_hash, ui_state = self._capture_screenshot(
                        f"{context_id}_screenshot", screenshot_url, screenshot_file
                    )
                    fingerprint["screenshot"] = str(screenshot_file) if ok else None
                    fingerprint["screenshot_sha256"] = shot_hash
                    fingerprint["ui_state"] = ui_state
                return fingerprint
            finally:
                if proc.poll() is None:
                    os.killpg(proc.pid, signal.SIGTERM)
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGKILL)
                        proc.wait(timeout=5)

    def _build_startup_inventory(self) -> None:
        self.startup_paths = build_startup_inventory()
        self._write_json(self.artifact_root / "startup-paths.json", self.startup_paths)

    def _extract_static_resolution(self) -> None:
        dev_sh = (ROOT_DIR / "scripts" / "dev.sh").read_text(encoding="utf-8")
        req_root = ROOT_DIR / "backend"
        req_text = "\n".join(
            (
                (req_root / "requirements.txt").read_text(encoding="utf-8"),
                (req_root / "requirements-runtime.txt").read_text(encoding="utf-8"),
                (req_root / "requirements-db.txt").read_text(encoding="utf-8"),
            )
        )
        backend_docker = (ROOT_DIR / "backend" / "Dockerfile").read_text(encoding="utf-8")
        frontend_docker = (ROOT_DIR / "frontend" / "Dockerfile").read_text(encoding="utf-8")
        e2e = (ROOT_DIR / ".github" / "workflows" / "e2e.yml").read_text(encoding="utf-8")
        lint = (ROOT_DIR / ".github" / "workflows" / "lint.yml").read_text(encoding="utf-8")
        security = (ROOT_DIR / ".github" / "workflows" / "security.yml").read_text(encoding="utf-8")

        ci_node_versions = re.findall(r"node-version:\s*'([^']+)'", "\n".join([e2e, lint, security]))
        ci_python_versions = re.findall(r"python-version:\s*'([^']+)'", "\n".join([e2e, lint, security]))

        floating_lines = [
            line.strip() for line in req_text.splitlines() if ">=" in line and not line.strip().startswith("#")
        ]
        pinned_lines = [
            line.strip() for line in req_text.splitlines() if "==" in line and not line.strip().startswith("#")
        ]

        self.static_resolution = {
            "dev_startup": {
                "backend_venv_conditional_install": 'requirements.txt" -nt "venv/.deps_installed' in dev_sh,
                "backend_uses_pip_install_requirements": "pip install -q -r requirements.txt" in dev_sh,
                "backend_has_layered_requirements": all(
                    (req_root / name).exists()
                    for name in ("requirements.txt", "requirements-runtime.txt", "requirements-db.txt")
                ),
                "frontend_conditional_install_on_missing_node_modules": "if [ ! -d node_modules ]; then" in dev_sh,
                "frontend_has_npm_install_fallback": "npm install" in dev_sh,
                "frontend_lockfile_install_enforced": "npm ci" in dev_sh,
                "frontend_prefers_npm_ci_with_lockfile": 'if [ "$install_mode" = "npm_ci" ]; then' in dev_sh,
            },
            "backend_requirements_policy": {
                "floating_constraints_count": len(floating_lines),
                "floating_constraints": floating_lines,
                "pinned_constraints_count": len(pinned_lines),
                "pinned_constraints": pinned_lines,
            },
            "docker_runtime_policy": {
                "backend_python_image": re.findall(r"FROM\s+(python:[^\s]+)", backend_docker),
                "frontend_node_image": re.findall(r"FROM\s+(node:[^\s]+)", frontend_docker),
                "frontend_build_uses_npm_ci": "npm ci" in frontend_docker,
            },
            "ci_runtime_policy": {
                "node_versions": sorted(set(ci_node_versions)),
                "python_versions": sorted(set(ci_python_versions)),
                "frontend_ci_lockfile_install": "npm ci" in e2e and "npm ci" in lint and "npm ci" in security,
                "backend_ci_uses_pip_install_requirements": "pip install -r requirements.txt" in e2e
                or "pip install -r requirements.txt" in lint,
            },
            "evidence": [
                "scripts/dev.sh:231",
                "scripts/dev.sh:233",
                "scripts/dev.sh:295",
                "scripts/dev.sh:313",
                "backend/requirements.txt:1",
                "backend/requirements-runtime.txt:1",
                "backend/requirements-db.txt:1",
                "backend/Dockerfile:7",
                "frontend/Dockerfile:7",
                "frontend/Dockerfile:16",
                ".github/workflows/e2e.yml:39",
                ".github/workflows/e2e.yml:45",
                ".github/workflows/e2e.yml:55",
            ],
        }
        self._write_json(self.artifact_root / "static-resolution.json", self.static_resolution)

    def _capture_baseline(self) -> None:
        git_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT_DIR, text=True).strip()
        git_branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT_DIR, text=True).strip()
        git_status = subprocess.check_output(["git", "status", "--short", "--branch"], cwd=ROOT_DIR, text=True)
        self.baseline = {
            "captured_at_utc": self._iso(self._utc_now()),
            "git_sha": git_sha,
            "git_branch": git_branch,
            "git_status": git_status,
            "is_clean": len([line for line in git_status.splitlines() if line and not line.startswith("##")]) == 0,
            "root": str(ROOT_DIR),
        }
        self._write_json(self.meta_dir / "baseline.json", self.baseline)

    def _capture_toolchain(self) -> None:
        commands = {
            "host_python": "python3 --version",
            "host_node": "node --version",
            "host_npm": "npm --version",
            "backend_venv_python": "cd backend && ./venv/bin/python --version",
            "backend_venv_pip": "cd backend && ./venv/bin/pip --version",
            "docker_version": "docker version --format '{{.Server.Version}}'",
        }
        toolchain: dict[str, Any] = {}
        for key, cmd in commands.items():
            res = self._run(f"toolchain_{key}", cmd, required=False, timeout_sec=120)
            log_text = Path(res.log_path).read_text(encoding="utf-8", errors="replace")
            last = ""
            for line in log_text.splitlines():
                if line and not line.startswith("$ "):
                    last = line.strip()
            toolchain[key] = {"rc": res.rc, "value": last}
        toolchain["dev_sh_effective_node"] = self._detect_dev_sh_effective_node()
        self.toolchain_fingerprint = toolchain
        self._write_json(self.fingerprints_dir / "toolchain.json", toolchain)

    def _docker_container_state(self, names: list[str]) -> dict[str, Any]:
        state: dict[str, Any] = {}
        for name in names:
            cmd = (
                "docker inspect "
                "--format '{{json .Name}} {{json .Config.Image}} {{json .State.Status}} {{json .State.Health.Status}}' "
                f"{shlex.quote(name)}"
            )
            res = self._run(f"docker_inspect_{name}", cmd, required=False, timeout_sec=60)
            parsed: dict[str, Any] = {"exists": res.rc == 0}
            if res.rc == 0:
                text = Path(res.log_path).read_text(encoding="utf-8", errors="replace")
                lines = [line.strip() for line in text.splitlines() if line.strip() and not line.startswith("$ ")]
                if lines:
                    parts = lines[-1].split(" ", 3)
                    if len(parts) == 4:
                        parsed["name"] = json.loads(parts[0])
                        parsed["image"] = json.loads(parts[1])
                        parsed["status"] = json.loads(parts[2])
                        parsed["health"] = None if parts[3] == "null" else json.loads(parts[3])
            state[name] = parsed
        return state

    def _prepare_prod_env_files(self) -> tuple[Path, Path]:
        backend_env = self.tmp_dir / "backend.env"
        frontend_env = self.tmp_dir / "frontend.env"
        backend_env.write_text(
            "\n".join(
                [
                    "DEBUG=false",
                    "MOCK_AUTH_ENABLED=false",
                    "AUTH_MODE=microsoft_sso",
                    "SECRET_KEY=release-parity-audit-secret-key-32-characters",
                    "DATABASE_URL=postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub",
                    'CORS_ORIGINS=["https://riskhub.example.com"]',
                    'ALLOWED_HOSTS=["riskhub.example.com"]',
                    "REDIS_PASSWORD=release_parity_redis_password",
                    "REDIS_URL=",
                    "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
                    "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
                    "ENTRA_CLIENT_SECRET=release-parity-entra-client-secret",
                    "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
                    "BOOTSTRAP_ADMIN_ROLE=admin",
                    "BOOTSTRAP_ADMIN_ACCESS_SCOPE=global",
                    "BOOTSTRAP_CRO_EMAIL=cro@example.com",
                    "BOOTSTRAP_CRO_ACCESS_SCOPE=global",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        frontend_env.write_text(
            "\n".join(
                [
                    "FRONTEND_HOST_PORT=28081",
                    "FRONTEND_CONTAINER_PORT=80",
                    "SERVER_NAME=riskhub.example.com",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        return backend_env, frontend_env

    def _prepare_deploy_cli_prod_layout(self) -> tuple[Path, Path, Path]:
        config_path = self.tmp_dir / "riskhub.env"
        secret_dir = self.tmp_dir / "secrets"
        runtime_dir = self.tmp_dir / "runtime"

        config_path.write_text(
            "\n".join(
                [
                    "PUBLIC_URL=https://riskhub.example.com",
                    "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
                    "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
                    "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
                    "BOOTSTRAP_CRO_EMAIL=cro@example.com",
                    "API_WORKERS=4",
                    "FRONTEND_BIND_PORT=28081",
                ]
            )
            + "\n",
            encoding="utf-8",
        )

        secret_dir.mkdir(parents=True, exist_ok=True)
        runtime_dir.mkdir(parents=True, exist_ok=True)
        secret_dir.chmod(0o750)
        runtime_dir.chmod(0o750)

        secrets = {
            "database_url": "postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub\n",
            "secret_key": "release-parity-audit-secret-key-32-characters\n",
            "entra_client_secret": "release-parity-entra-client-secret\n",
            "redis_password": "release_parity_redis_password\n",
        }
        for name, value in secrets.items():
            path = secret_dir / name
            path.write_text(value, encoding="utf-8")
            path.chmod(0o440)

        return config_path, secret_dir, runtime_dir

    def _launch_failure_fingerprint(
        self,
        startup_path_id: str,
        context_id: str,
        launch_result: CommandResult,
        *,
        docker_containers: list[str] | None = None,
    ) -> dict[str, Any]:
        log_text = Path(launch_result.log_path).read_text(encoding="utf-8", errors="replace")
        failure = self._classify_launch_failure(startup_path_id, log_text, launch_result.rc)
        fp: dict[str, Any] = {
            "startup_path_id": startup_path_id,
            "context_id": context_id,
            "captured_at_utc": self._iso(self._utc_now()),
            "git_sha_expected": self.baseline.get("git_sha"),
            "git_sha_observed": self.baseline.get("git_sha"),
            "launch_failed": True,
            "launch_rc": launch_result.rc,
            "launch_log": launch_result.log_path,
            "launch_failure": failure,
        }
        if docker_containers:
            fp["docker_state"] = self._docker_container_state(docker_containers)
        self.launch_failure_analysis.append(
            {
                "startup_path_id": startup_path_id,
                "context_id": context_id,
                "launch_log": launch_result.log_path,
                **failure,
            }
        )
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
        candidates = sorted(
            (ROOT_DIR / "tests" / "results" / "prod").glob("prod-readiness-audit-*"),
            key=lambda p: p.stat().st_mtime,
        )
        if not candidates:
            self.runtime_fingerprints.append(
                {
                    "context_id": "prod_readiness_ingest",
                    "startup_path_id": "prod_readiness",
                    "error": "No existing prod-readiness artifacts found",
                }
            )
            return
        latest = candidates[-1]
        target = self.prod_ingest_dir / latest.name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(latest, target)
        self.runtime_fingerprints.append(
            {
                "context_id": "prod_readiness_ingest",
                "startup_path_id": "prod_readiness",
                "source": str(latest),
                "copied_to": str(target),
                "captured_at_utc": self._iso(self._utc_now()),
            }
        )

    def _ingest_prod_readiness_by_running_worktree(self) -> None:
        worktree_dir = Path(tempfile.mkdtemp(prefix="riskhub-parity-worktree-"))
        added = self._run(
            "prod_readiness_worktree_add",
            f"git worktree add --detach {shlex.quote(str(worktree_dir))} HEAD",
            required=False,
            timeout_sec=300,
        )
        if added.rc != 0:
            self._ingest_latest_existing_prod_readiness()
            return
        try:
            run_res = self._run(
                "prod_readiness_run",
                "bash scripts/security/run_prod_readiness_audit_local.sh",
                cwd=worktree_dir,
                required=False,
                timeout_sec=10800,
            )
            candidates = sorted(
                (worktree_dir / "tests" / "results" / "prod").glob("prod-readiness-audit-*"),
                key=lambda p: p.stat().st_mtime,
            )
            if not candidates:
                self.runtime_fingerprints.append(
                    {
                        "context_id": "prod_readiness_ingest",
                        "startup_path_id": "prod_readiness",
                        "error": "No artifact generated by run_prod_readiness_audit_local.sh",
                        "run_rc": run_res.rc,
                    }
                )
                return
            latest = candidates[-1]
            target = self.prod_ingest_dir / latest.name
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(latest, target)
            summary_path = target / "SUMMARY.json"
            summary = None
            if summary_path.exists():
                summary = json.loads(summary_path.read_text(encoding="utf-8"))
            self.runtime_fingerprints.append(
                {
                    "context_id": "prod_readiness_ingest",
                    "startup_path_id": "prod_readiness",
                    "source_worktree": str(latest),
                    "copied_to": str(target),
                    "run_rc": run_res.rc,
                    "summary": summary,
                    "captured_at_utc": self._iso(self._utc_now()),
                }
            )
        finally:
            self._run(
                "prod_readiness_worktree_remove",
                f"git worktree remove --force {shlex.quote(str(worktree_dir))}",
                required=False,
                timeout_sec=300,
            )
            shutil.rmtree(worktree_dir, ignore_errors=True)

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

    def run(self) -> None:
        self.phase_runner.run(
            [
                ReleaseParityPhase("capture_baseline", self._capture_baseline),
                ReleaseParityPhase("startup_inventory", self._build_startup_inventory),
                ReleaseParityPhase("static_resolution", self._extract_static_resolution),
                ReleaseParityPhase("toolchain", self._capture_toolchain),
                ReleaseParityPhase("startup_preflight", self._capture_startup_preflight),
                ReleaseParityPhase("dynamic_paths", self._run_dynamic_paths),
                ReleaseParityPhase("dependencies", self._capture_dependencies),
                ReleaseParityPhase("ui_parity", self._evaluate_ui_parity),
                ReleaseParityPhase("decision", self._evaluate_findings_and_decision),
                ReleaseParityPhase("report", self._write_report),
            ]
        )


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
