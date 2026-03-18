#!/usr/bin/env python3
"""Release parity audit harness.

Generates evidence artifacts under:
  tests/results/release-parity-audit-<timestamp>/
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


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


@dataclass
class CommandResult:
    command_id: str
    command: str
    cwd: str
    required: bool
    rc: int
    start_utc: str
    end_utc: str
    duration_sec: float
    log_path: str
    timeout_sec: int | None

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.command_id,
            "command": self.command,
            "cwd": self.cwd,
            "required": self.required,
            "rc": self.rc,
            "start_utc": self.start_utc,
            "end_utc": self.end_utc,
            "duration_sec": self.duration_sec,
            "log": self.log_path,
            "timeout_sec": self.timeout_sec,
        }


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

        self.command_results: list[CommandResult] = []
        self.required_failures = 0

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

    def _write_json(self, path: Path, payload: Any) -> None:
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    def _write_text(self, path: Path, text: str) -> None:
        path.write_text(text, encoding="utf-8")

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
        cwd = cwd or ROOT_DIR
        start = self._utc_now()
        start_epoch = time.time()
        log_path = self.logs_dir / f"{command_id}.log"
        run_env = os.environ.copy()
        if env:
            run_env.update(env)

        rc = 124
        output = ""
        timed_out = False
        try:
            completed = subprocess.run(
                ["bash", "-c", command],
                cwd=str(cwd),
                env=run_env,
                text=True,
                capture_output=True,
                timeout=timeout_sec,
                check=False,
            )
            rc = completed.returncode
            output = (completed.stdout or "") + (completed.stderr or "")
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            rc = 124
            output = (exc.stdout or "") + (exc.stderr or "")

        end = self._utc_now()
        end_epoch = time.time()
        duration = round(end_epoch - start_epoch, 3)
        log_body = f"$ {command}\n\n{output}"
        if timed_out:
            log_body += f"\n\n[TIMEOUT] command exceeded {timeout_sec}s\n"
        self._write_text(log_path, log_body)

        result = CommandResult(
            command_id=command_id,
            command=command,
            cwd=str(cwd),
            required=required,
            rc=rc,
            start_utc=self._iso(start),
            end_utc=self._iso(end),
            duration_sec=duration,
            log_path=str(log_path),
            timeout_sec=timeout_sec,
        )
        self.command_results.append(result)
        if required and rc != 0:
            self.required_failures += 1
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
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(65536), b""):
                digest.update(chunk)
        return digest.hexdigest()

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
        if "unsupported node.js major" in log_lower or "node.js is required but was not found" in log_lower or "npm is required but was not found" in log_lower:
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
            + "  await page.addStyleTag({ content: '* , *::before, *::after { animation: none !important; transition: none !important; }' });\n"
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
        self.startup_paths = [
            {
                "id": "dev_sh_full",
                "entrypoint": "scripts/dev.sh",
                "mode": "full",
                "command": "./scripts/dev.sh --daemon",
                "type": "runtime",
            },
            {
                "id": "dev_sh_backend",
                "entrypoint": "scripts/dev.sh",
                "mode": "backend",
                "command": "./scripts/dev.sh --backend",
                "type": "runtime",
            },
            {
                "id": "compose_sh_up_full",
                "entrypoint": "scripts/compose.sh",
                "mode": "full",
                "command": "./scripts/compose.sh up",
                "type": "runtime",
            },
            {
                "id": "compose_sh_up_db_only",
                "entrypoint": "scripts/compose.sh",
                "mode": "db_only",
                "command": "./scripts/compose.sh up --profile db-only",
                "type": "runtime",
            },
            {
                "id": "compose_sh_reset_test",
                "entrypoint": "scripts/compose.sh",
                "mode": "test",
                "command": "./scripts/compose.sh reset --dataset test",
                "type": "runtime",
            },
            {
                "id": "deploy_cli_prod_docker",
                "entrypoint": "scripts/deploy.sh",
                "mode": "prod_docker",
                "command": "./scripts/deploy.sh deploy --target docker --config /etc/riskhub/riskhub.env --secret-dir /etc/riskhub/secrets --version <version>",
                "type": "runtime",
            },
            {
                "id": "backend_runtime_dev",
                "entrypoint": "backend/scripts/runtime/dev.sh",
                "mode": "dev",
                "command": "backend/scripts/runtime/dev.sh",
                "type": "runtime",
            },
            {
                "id": "backend_runtime_test",
                "entrypoint": "backend/scripts/runtime/test.sh",
                "mode": "test",
                "command": "backend/scripts/runtime/test.sh",
                "type": "runtime",
            },
            {
                "id": "backend_runtime_prod",
                "entrypoint": "backend/scripts/runtime/prod.sh",
                "mode": "prod",
                "command": "backend/scripts/runtime/prod.sh --tag <tag>",
                "type": "runtime",
            },
            {
                "id": "backend_db_runtime_dev",
                "entrypoint": "backend/scripts/runtime/db/dev.sh",
                "mode": "dev",
                "command": "backend/scripts/runtime/db/dev.sh",
                "type": "runtime",
            },
            {
                "id": "backend_db_runtime_test",
                "entrypoint": "backend/scripts/runtime/db/test.sh",
                "mode": "test",
                "command": "backend/scripts/runtime/db/test.sh --yes",
                "type": "runtime",
            },
            {
                "id": "backend_db_runtime_prod",
                "entrypoint": "backend/scripts/runtime/db/prod.sh",
                "mode": "prod",
                "command": "backend/scripts/runtime/db/prod.sh --tag <tag>",
                "type": "runtime",
            },
            {
                "id": "frontend_runtime_dev",
                "entrypoint": "frontend/scripts/runtime/dev.sh",
                "mode": "dev",
                "command": "frontend/scripts/runtime/dev.sh",
                "type": "runtime",
            },
            {
                "id": "frontend_runtime_test",
                "entrypoint": "frontend/scripts/runtime/test.sh",
                "mode": "test",
                "command": "frontend/scripts/runtime/test.sh",
                "type": "runtime",
            },
            {
                "id": "frontend_runtime_prod",
                "entrypoint": "frontend/scripts/runtime/prod.sh",
                "mode": "prod",
                "command": "frontend/scripts/runtime/prod.sh --tag <tag>",
                "type": "runtime",
            },
            {
                "id": "ci_e2e",
                "entrypoint": ".github/workflows/e2e.yml",
                "mode": "ci",
                "command": "workflow",
                "type": "ci",
            },
            {
                "id": "ci_lint",
                "entrypoint": ".github/workflows/lint.yml",
                "mode": "ci",
                "command": "workflow",
                "type": "ci",
            },
            {
                "id": "ci_security",
                "entrypoint": ".github/workflows/security.yml",
                "mode": "ci",
                "command": "workflow",
                "type": "ci",
            },
            {
                "id": "prod_readiness",
                "entrypoint": "scripts/security/run_prod_readiness_audit_local.sh",
                "mode": "prod-sim",
                "command": "scripts/security/run_prod_readiness_audit_local.sh",
                "type": "runtime",
            },
        ]
        self._write_json(self.artifact_root / "startup-paths.json", self.startup_paths)

    def _extract_static_resolution(self) -> None:
        dev_sh = (ROOT_DIR / "scripts" / "dev.sh").read_text(encoding="utf-8")
        req_text = (ROOT_DIR / "backend" / "requirements.txt").read_text(encoding="utf-8")
        backend_docker = (ROOT_DIR / "backend" / "Dockerfile").read_text(encoding="utf-8")
        frontend_docker = (ROOT_DIR / "frontend" / "Dockerfile").read_text(encoding="utf-8")
        e2e = (ROOT_DIR / ".github" / "workflows" / "e2e.yml").read_text(encoding="utf-8")
        lint = (ROOT_DIR / ".github" / "workflows" / "lint.yml").read_text(encoding="utf-8")
        security = (ROOT_DIR / ".github" / "workflows" / "security.yml").read_text(encoding="utf-8")

        ci_node_versions = re.findall(r"node-version:\s*'([^']+)'", "\n".join([e2e, lint, security]))
        ci_python_versions = re.findall(r"python-version:\s*'([^']+)'", "\n".join([e2e, lint, security]))

        floating_lines = [line.strip() for line in req_text.splitlines() if ">=" in line and not line.strip().startswith("#")]
        pinned_lines = [
            line.strip()
            for line in req_text.splitlines()
            if "==" in line and not line.strip().startswith("#")
        ]

        self.static_resolution = {
            "dev_startup": {
                "backend_venv_conditional_install": "requirements.txt\" -nt \"venv/.deps_installed" in dev_sh,
                "backend_uses_pip_install_requirements": "pip install -q -r requirements.txt" in dev_sh,
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
                "backend_ci_uses_pip_install_requirements": "pip install -r requirements.txt" in e2e or "pip install -r requirements.txt" in lint,
            },
            "evidence": [
                "scripts/dev.sh:231",
                "scripts/dev.sh:233",
                "scripts/dev.sh:295",
                "scripts/dev.sh:313",
                "backend/requirements.txt:1",
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
        git_sha = (
            subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT_DIR, text=True).strip()
        )
        git_branch = (
            subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT_DIR, text=True).strip()
        )
        git_status = subprocess.check_output(
            ["git", "status", "--short", "--branch"], cwd=ROOT_DIR, text=True
        )
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
        self._run(
            "deps_backend_local_freeze",
            "cd backend && ./venv/bin/pip freeze > "
            + shlex.quote(str(self.deps_dir / "backend-local.txt")),
            required=False,
            timeout_sec=180,
        )

        image_tag = f"riskhub-backend:release-parity-{self.run_id}"
        self._run(
            "deps_build_backend_image",
            f"docker build -t {shlex.quote(image_tag)} backend",
            required=False,
            timeout_sec=3600,
        )
        self._run(
            "deps_backend_image_versions",
            "docker run --rm "
            + shlex.quote(image_tag)
            + " sh -lc "
            + shlex.quote(
                "python - <<'PY'\n"
                "import importlib.metadata as m\n"
                f"pkgs={CRITICAL_BACKEND_PACKAGES!r}\n"
                "for p in pkgs:\n"
                "  try:\n"
                "    print(f'{p}=={m.version(p)}')\n"
                "  except Exception:\n"
                "    print(f'{p}=missing')\n"
                "PY"
            )
            + " > "
            + shlex.quote(str(self.deps_dir / "backend-image.txt")),
            required=False,
            timeout_sec=180,
        )

        self._run(
            "deps_frontend_installed",
            "cd frontend && npm ls --depth=0 --json > "
            + shlex.quote(str(self.deps_dir / "frontend-installed.json")),
            required=False,
            timeout_sec=180,
        )
        self._run(
            "deps_frontend_lock_extract",
            "cd frontend && node - <<'NODE' > "
            + shlex.quote(str(self.deps_dir / "frontend-lock.json"))
            + "\n"
            + "const fs = require('fs');\n"
            + "const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));\n"
            + f"const keys = {CORE_FRONTEND_PACKAGES!r};\n"
            + "const out = {};\n"
            + "for (const key of keys) {\n"
            + "  const pkgKey = `node_modules/${key}`;\n"
            + "  out[key] = lock.packages && lock.packages[pkgKey] ? lock.packages[pkgKey].version : null;\n"
            + "}\n"
            + "console.log(JSON.stringify(out, null, 2));\n"
            + "NODE",
            required=False,
            timeout_sec=120,
        )

        backend_local_versions: dict[str, str | None] = {}
        local_file = self.deps_dir / "backend-local.txt"
        if local_file.exists():
            text = local_file.read_text(encoding="utf-8", errors="replace")
            parsed_versions = self._parse_package_versions(text)
            for package in CRITICAL_BACKEND_PACKAGES:
                backend_local_versions[package] = parsed_versions.get(
                    self._canonical_package_name(package)
                )

        backend_image_versions: dict[str, str | None] = {}
        image_file = self.deps_dir / "backend-image.txt"
        if image_file.exists():
            text = image_file.read_text(encoding="utf-8", errors="replace")
            parsed_versions = self._parse_package_versions(text)
            for package in CRITICAL_BACKEND_PACKAGES:
                backend_image_versions[package] = parsed_versions.get(
                    self._canonical_package_name(package)
                )

        frontend_installed_versions: dict[str, str | None] = {}
        installed_file = self.deps_dir / "frontend-installed.json"
        if installed_file.exists():
            try:
                installed_payload = json.loads(installed_file.read_text(encoding="utf-8"))
                deps = installed_payload.get("dependencies", {})
                for package in CORE_FRONTEND_PACKAGES:
                    value = deps.get(package, {})
                    frontend_installed_versions[package] = value.get("version") if isinstance(value, dict) else None
            except json.JSONDecodeError:
                pass

        frontend_lock_versions: dict[str, str | None] = {}
        lock_file = self.deps_dir / "frontend-lock.json"
        if lock_file.exists():
            try:
                frontend_lock_versions = json.loads(lock_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                frontend_lock_versions = {}

        backend_drift = []
        for package in CRITICAL_BACKEND_PACKAGES:
            if backend_local_versions.get(package) != backend_image_versions.get(package):
                backend_drift.append(
                    {
                        "package": package,
                        "local": backend_local_versions.get(package),
                        "image": backend_image_versions.get(package),
                    }
                )

        frontend_drift = []
        for package in CORE_FRONTEND_PACKAGES:
            if frontend_installed_versions.get(package) != frontend_lock_versions.get(package):
                frontend_drift.append(
                    {
                        "package": package,
                        "installed": frontend_installed_versions.get(package),
                        "lock": frontend_lock_versions.get(package),
                    }
                )

        self.dep_diffs = {
            "backend_local_versions": backend_local_versions,
            "backend_image_versions": backend_image_versions,
            "backend_drift": backend_drift,
            "frontend_installed_versions": frontend_installed_versions,
            "frontend_lock_versions": frontend_lock_versions,
            "frontend_drift": frontend_drift,
            "backend_image_tag": image_tag,
        }
        self._write_json(self.deps_dir / "diffs.json", self.dep_diffs)

    def _run_dynamic_paths(self) -> None:
        backend_env, frontend_env = self._prepare_prod_env_files()
        deploy_config, deploy_secret_dir, deploy_runtime_dir = self._prepare_deploy_cli_prod_layout()

        self._stop_local_dev_processes()
        self._compose_down("cleanup_compose_down_pre")

        dev_full_result = self._run("path_dev_sh_full", "./scripts/dev.sh --daemon", timeout_sec=900)
        if dev_full_result.rc == 0:
            backend_ready = self._wait_http("http://localhost:8000/api/v1/health", timeout_sec=90)
            frontend_ready = self._wait_http("http://localhost:5173/", timeout_sec=90)
            fp = self._capture_backend_fingerprint("dev_sh_full", "http://localhost:8000")
            shot_file = self.ui_dir / "dev_sh_full_login.png"
            ok, shot_hash, ui_state = self._capture_screenshot(
                "path_dev_sh_full_screenshot", "http://localhost:5173/login", shot_file
            )
            fp["screenshot"] = str(shot_file) if ok else None
            fp["screenshot_sha256"] = shot_hash
            fp["ui_state"] = ui_state
            fp["backend_ready"] = backend_ready
            fp["frontend_ready"] = frontend_ready
            fp["frontend_runtime_kind"] = "vite_dev"
            fp["startup_path_id"] = "dev_sh_full"
            self.runtime_fingerprints.append(fp)
        else:
            self.runtime_fingerprints.append(
                self._launch_failure_fingerprint("dev_sh_full", "dev_sh_full", dev_full_result)
            )
        self._stop_local_dev_processes()

        docker_containers = ["riskhub-db", "riskhub-redis", "riskhub-backend", "riskhub-frontend"]
        compose_up_result = self._run("path_compose_sh_up_full", "./scripts/compose.sh up", timeout_sec=2400)
        if compose_up_result.rc == 0:
            backend_ready = self._wait_http("http://localhost:8000/api/v1/health", timeout_sec=90)
            frontend_ready = self._wait_http("http://localhost/", timeout_sec=90)
            fp = self._capture_backend_fingerprint("compose_sh_up_full", "http://localhost:8000")
            shot_file = self.ui_dir / "compose_sh_up_full_login.png"
            ok, shot_hash, ui_state = self._capture_screenshot(
                "path_compose_sh_up_full_screenshot", "http://localhost/login", shot_file
            )
            fp["screenshot"] = str(shot_file) if ok else None
            fp["screenshot_sha256"] = shot_hash
            fp["ui_state"] = ui_state
            fp["backend_ready"] = backend_ready
            fp["frontend_ready"] = frontend_ready
            fp["frontend_runtime_kind"] = "container_prod_build"
            fp["docker_state"] = self._docker_container_state(docker_containers)
            fp["startup_path_id"] = "compose_sh_up_full"
            self.runtime_fingerprints.append(fp)
        else:
            self.runtime_fingerprints.append(
                self._launch_failure_fingerprint(
                    "compose_sh_up_full",
                    "compose_sh_up_full",
                    compose_up_result,
                    docker_containers=docker_containers,
                )
            )

        self._run(
            "path_compose_sh_reset_test_dryrun",
            "./scripts/compose.sh reset --dataset test --dry-run --no-build",
            required=False,
            timeout_sec=900,
        )
        self.runtime_fingerprints.append(
            {
                "startup_path_id": "compose_sh_reset_test",
                "context_id": "compose_sh_reset_test_dryrun",
                "captured_at_utc": self._iso(self._utc_now()),
                "git_sha_expected": self.baseline.get("git_sha"),
                "git_sha_observed": self.baseline.get("git_sha"),
                "dry_run_only": True,
            }
        )

        prod_deploy_cmd = (
            f"RISKHUB_RUNTIME_DIR={shlex.quote(str(deploy_runtime_dir))} "
            "./scripts/deploy.sh deploy --target docker "
            f"--config {shlex.quote(str(deploy_config))} "
            f"--secret-dir {shlex.quote(str(deploy_secret_dir))} "
            "--backend-image ghcr.io/example/riskhub-backend:release-parity "
            "--frontend-image ghcr.io/example/riskhub-frontend:release-parity "
            "--redis-image ghcr.io/example/riskhub-redis:release-parity "
            "--dry-run --yes"
        )
        self._run("path_deploy_cli_prod_docker_dryrun", prod_deploy_cmd, required=False, timeout_sec=1200)
        self.runtime_fingerprints.append(
            {
                "startup_path_id": "deploy_cli_prod_docker",
                "context_id": "deploy_cli_prod_docker_dryrun",
                "captured_at_utc": self._iso(self._utc_now()),
                "git_sha_expected": self.baseline.get("git_sha"),
                "git_sha_observed": self.baseline.get("git_sha"),
                "dry_run_only": True,
            }
        )

        db_dev_result = self._run(
            "path_backend_db_runtime_dev", "backend/scripts/runtime/db/dev.sh", required=False, timeout_sec=240
        )
        self.runtime_fingerprints.append(
            {
                "startup_path_id": "backend_db_runtime_dev",
                "context_id": "path_backend_db_runtime_dev",
                "captured_at_utc": self._iso(self._utc_now()),
                "git_sha_expected": self.baseline.get("git_sha"),
                "git_sha_observed": self.baseline.get("git_sha"),
                "command_rc": db_dev_result.rc,
                "command_log": db_dev_result.log_path,
            }
        )
        db_test_result = self._run(
            "path_backend_db_runtime_test_dryrun",
            "backend/scripts/runtime/db/test.sh --yes --dry-run",
            required=False,
            timeout_sec=240,
        )
        self.runtime_fingerprints.append(
            {
                "startup_path_id": "backend_db_runtime_test",
                "context_id": "path_backend_db_runtime_test_dryrun",
                "captured_at_utc": self._iso(self._utc_now()),
                "git_sha_expected": self.baseline.get("git_sha"),
                "git_sha_observed": self.baseline.get("git_sha"),
                "command_rc": db_test_result.rc,
                "command_log": db_test_result.log_path,
                "dry_run_only": True,
            }
        )
        db_prod_result = self._run(
            "path_backend_db_runtime_prod_dryrun",
            f"backend/scripts/runtime/db/prod.sh --backend-env {shlex.quote(str(backend_env))} "
            f"--tag release-parity-{self.run_id} --dry-run --yes",
            required=False,
            timeout_sec=1200,
        )
        self.runtime_fingerprints.append(
            {
                "startup_path_id": "backend_db_runtime_prod",
                "context_id": "path_backend_db_runtime_prod_dryrun",
                "captured_at_utc": self._iso(self._utc_now()),
                "git_sha_expected": self.baseline.get("git_sha"),
                "git_sha_observed": self.baseline.get("git_sha"),
                "command_rc": db_prod_result.rc,
                "command_log": db_prod_result.log_path,
                "dry_run_only": True,
            }
        )

        backend_dev_fp = self._start_background_service(
            "path_backend_runtime_dev",
            "backend/scripts/runtime/dev.sh --port 8010 --no-reload",
            readiness_url="http://localhost:8010/api/v1/health",
            endpoint_base_url="http://localhost:8010",
        )
        backend_dev_fp["startup_path_id"] = "backend_runtime_dev"
        self.runtime_fingerprints.append(backend_dev_fp)

        backend_test_fp = self._start_background_service(
            "path_backend_runtime_test",
            "backend/scripts/runtime/test.sh --port 8011",
            readiness_url="http://localhost:8011/api/v1/health",
            endpoint_base_url="http://localhost:8011",
        )
        backend_test_fp["startup_path_id"] = "backend_runtime_test"
        self.runtime_fingerprints.append(backend_test_fp)

        frontend_dev_fp = self._start_background_service(
            "path_frontend_runtime_dev",
            "frontend/scripts/runtime/dev.sh -- --port 5174",
            readiness_url="http://localhost:5174",
            screenshot_url="http://localhost:5174/login",
            screenshot_file=self.ui_dir / "frontend_runtime_dev_login.png",
        )
        frontend_dev_fp["startup_path_id"] = "frontend_runtime_dev"
        frontend_dev_fp["frontend_runtime_kind"] = "vite_dev_component"
        frontend_dev_fp["auth_mode_reference"] = self._capture_backend_fingerprint(
            "frontend_runtime_dev_reference", "http://localhost:8000"
        ).get("auth_mode")
        self.runtime_fingerprints.append(frontend_dev_fp)

        frontend_test_fp = self._start_background_service(
            "path_frontend_runtime_test",
            "frontend/scripts/runtime/test.sh -- --port 5175",
            readiness_url="http://localhost:5175",
            screenshot_url="http://localhost:5175/login",
            screenshot_file=self.ui_dir / "frontend_runtime_test_login.png",
        )
        frontend_test_fp["startup_path_id"] = "frontend_runtime_test"
        frontend_test_fp["frontend_runtime_kind"] = "vite_test_component"
        frontend_test_fp["auth_mode_reference"] = self._capture_backend_fingerprint(
            "frontend_runtime_test_reference", "http://localhost:8000"
        ).get("auth_mode")
        self.runtime_fingerprints.append(frontend_test_fp)

        self._run(
            "path_backend_runtime_prod_dryrun",
            f"backend/scripts/runtime/prod.sh --backend-env {shlex.quote(str(backend_env))} "
            f"--tag release-parity-{self.run_id} --dry-run --yes",
            required=False,
            timeout_sec=1800,
        )
        self._run(
            "path_frontend_runtime_prod_dryrun",
            f"frontend/scripts/runtime/prod.sh --frontend-env {shlex.quote(str(frontend_env))} "
            f"--tag release-parity-{self.run_id} --dry-run --yes",
            required=False,
            timeout_sec=1800,
        )
        self.runtime_fingerprints.append(
            {
                "startup_path_id": "backend_runtime_prod",
                "context_id": "backend_runtime_prod_dryrun",
                "captured_at_utc": self._iso(self._utc_now()),
                "git_sha_expected": self.baseline.get("git_sha"),
                "git_sha_observed": self.baseline.get("git_sha"),
                "dry_run_only": True,
            }
        )
        self.runtime_fingerprints.append(
            {
                "startup_path_id": "frontend_runtime_prod",
                "context_id": "frontend_runtime_prod_dryrun",
                "captured_at_utc": self._iso(self._utc_now()),
                "git_sha_expected": self.baseline.get("git_sha"),
                "git_sha_observed": self.baseline.get("git_sha"),
                "dry_run_only": True,
            }
        )

        self._run("path_prod_verify_runtime", "./scripts/prod/verify_runtime.sh", required=False, timeout_sec=180)

        if self.run_prod_readiness:
            self._ingest_prod_readiness_by_running_worktree()
        else:
            self._ingest_latest_existing_prod_readiness()

        self._append_ci_runtime_fingerprints()
        self._ensure_startup_path_runtime_coverage()
        self._write_json(self.fingerprints_dir / "runtime.json", self.runtime_fingerprints)

        self._compose_down("cleanup_compose_down_final")
        self._stop_local_dev_processes()

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
        existing_ids = {
            str(fp.get("startup_path_id"))
            for fp in self.runtime_fingerprints
            if fp.get("startup_path_id")
        }
        coverage_notes = {
            "dev_sh_backend": "Covered functionally by backend_runtime_dev; direct blocking invocation omitted.",
            "compose_sh_up_db_only": "Covered functionally by backend_db_runtime_dev; direct infra-only invocation omitted.",
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
        contexts = []
        for fp in self.runtime_fingerprints:
            shot = fp.get("screenshot")
            shot_hash = fp.get("screenshot_sha256")
            auth_mode = fp.get("auth_mode") or fp.get("auth_mode_reference")
            if shot and shot_hash:
                contexts.append(
                    {
                        "context_id": fp.get("context_id"),
                        "startup_path_id": fp.get("startup_path_id"),
                        "auth_mode": auth_mode,
                        "app_version": fp.get("app_version"),
                        "git_sha_observed": fp.get("git_sha_observed"),
                        "frontend_runtime_kind": fp.get("frontend_runtime_kind"),
                        "screenshot": shot,
                        "screenshot_sha256": shot_hash,
                        "ui_state": fp.get("ui_state"),
                    }
                )

        groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = {}
        for item in contexts:
            key = (
                str(item.get("auth_mode")),
                str(item.get("app_version")),
                str(item.get("git_sha_observed")),
                str(item.get("frontend_runtime_kind")),
            )
            groups.setdefault(key, []).append(item)

        mismatches = []
        visual_variance_same_state = []
        for key, items in groups.items():
            hashes = {entry["screenshot_sha256"] for entry in items}
            if len(items) > 1 and len(hashes) > 1:
                state_signatures = {
                    json.dumps(entry.get("ui_state"), sort_keys=True) for entry in items
                }
                item_payload = {
                    "group_key": {
                        "auth_mode": key[0],
                        "app_version": key[1],
                        "git_sha_observed": key[2],
                        "frontend_runtime_kind": key[3],
                    },
                    "contexts": items,
                }
                if len(state_signatures) > 1:
                    mismatches.append(item_payload)
                else:
                    visual_variance_same_state.append(item_payload)

        self.ui_parity = {
            "captured_contexts": contexts,
            "mismatches_same_auth_mode_same_commit": mismatches,
            "visual_variance_same_state": visual_variance_same_state,
        }
        self._write_json(self.ui_dir / "parity.json", self.ui_parity)

    def _evaluate_findings_and_decision(self) -> None:
        findings: list[dict[str, Any]] = []

        baseline_sha = self.baseline.get("git_sha")
        for fp in self.runtime_fingerprints:
            observed = fp.get("git_sha_observed")
            context_id = fp.get("context_id")
            if observed is not None and baseline_sha is not None and observed != baseline_sha:
                findings.append(
                    {
                        "id": f"P0-git-sha-mismatch-{context_id}",
                        "severity": "P0",
                        "classification": "unexpected",
                        "summary": "Runtime git SHA differs from selected baseline main HEAD.",
                        "context_id": context_id,
                        "expected": baseline_sha,
                        "observed": observed,
                    }
                )

        for fp in self.runtime_fingerprints:
            if not fp.get("launch_failed"):
                continue
            startup_path_id = fp.get("startup_path_id", "unknown")
            failure = fp.get("launch_failure", {})
            if failure.get("classification") == "environment_contamination":
                findings.append(
                    {
                        "id": f"ENV-startup-path-{startup_path_id}-{failure.get('code', 'unknown')}",
                        "severity": "ENV",
                        "classification": "environment_contamination",
                        "summary": failure.get(
                            "summary",
                            "The audit host was not valid evidence for this startup path.",
                        ),
                        "startup_path_id": startup_path_id,
                        "context_id": fp.get("context_id"),
                        "launch_rc": fp.get("launch_rc"),
                        "launch_log": fp.get("launch_log"),
                    }
                )
            else:
                findings.append(
                    {
                        "id": f"P1-startup-path-failed-{startup_path_id}",
                        "severity": "P1",
                        "classification": "unexpected",
                        "summary": failure.get(
                            "summary",
                            "Startup command failed for this path before parity fingerprints could be captured.",
                        ),
                        "startup_path_id": startup_path_id,
                        "context_id": fp.get("context_id"),
                        "launch_rc": fp.get("launch_rc"),
                        "launch_log": fp.get("launch_log"),
                    }
                )

        for diff in self.dep_diffs.get("backend_drift", []):
            findings.append(
                {
                    "id": f"P1-backend-dep-drift-{diff['package']}",
                    "severity": "P1",
                    "classification": "unexpected",
                    "summary": "Critical backend dependency differs between local venv and backend image.",
                    "package": diff["package"],
                    "local": diff["local"],
                    "image": diff["image"],
                    "evidence": [str(self.deps_dir / "backend-local.txt"), str(self.deps_dir / "backend-image.txt")],
                }
            )

        if self.ui_parity.get("mismatches_same_auth_mode_same_commit"):
            findings.append(
                {
                    "id": "P1-ui-parity-mismatch",
                    "severity": "P1",
                    "classification": "unexpected",
                    "summary": "UI screenshots differ across contexts with same auth mode, app version, and git SHA.",
                    "groups": self.ui_parity.get("mismatches_same_auth_mode_same_commit"),
                    "evidence": [str(self.ui_dir / "parity.json")],
                }
            )

        expected_node_major = None
        node_versions = self.static_resolution.get("ci_runtime_policy", {}).get("node_versions", [])
        if node_versions:
            expected_node_major = int(str(node_versions[0]).split(".")[0])

        effective_node = self.toolchain_fingerprint.get("dev_sh_effective_node", {})
        effective_node_major = effective_node.get("major")
        if expected_node_major and effective_node_major and effective_node_major != expected_node_major:
            findings.append(
                {
                    "id": "P2-node-major-mismatch",
                    "severity": "P2",
                    "classification": "unexpected",
                    "summary": "Effective Node runtime for scripts/dev.sh differs from the CI/Docker baseline.",
                    "expected_node_major": expected_node_major,
                    "observed_node_major": effective_node_major,
                    "evidence": [str(self.fingerprints_dir / "toolchain.json"), str(self.artifact_root / "static-resolution.json")],
                }
            )
        elif expected_node_major and not effective_node.get("selected"):
            findings.append(
                {
                    "id": "ENV-dev-sh-node-runtime-unavailable",
                    "severity": "ENV",
                    "classification": "environment_contamination",
                    "summary": "scripts/dev.sh could not resolve a Node runtime matching the CI/Docker baseline on this host.",
                    "expected_node_major": expected_node_major,
                    "observed_node_major": effective_node_major,
                    "evidence": [str(self.fingerprints_dir / "toolchain.json"), str(self.fingerprints_dir / "startup-preflight.json")],
                }
            )

        dev_startup = self.static_resolution.get("dev_startup", {})
        if dev_startup.get("frontend_has_npm_install_fallback") and not dev_startup.get(
            "frontend_prefers_npm_ci_with_lockfile"
        ):
            findings.append(
                {
                    "id": "P2-dev-frontend-nonreproducible-install",
                    "severity": "P2",
                    "classification": "unexpected",
                    "summary": "scripts/dev.sh uses npm install (not npm ci), which is non-lockfile-reproducible.",
                    "evidence": ["scripts/dev.sh:231", "scripts/dev.sh:233"],
                }
            )

        for diff in self.dep_diffs.get("frontend_drift", []):
            findings.append(
                {
                    "id": f"P2-frontend-lock-drift-{diff['package']}",
                    "severity": "P2",
                    "classification": "unexpected",
                    "summary": "Installed frontend dependency differs from lockfile resolution.",
                    "package": diff["package"],
                    "installed": diff["installed"],
                    "lock": diff["lock"],
                    "evidence": [str(self.deps_dir / "frontend-installed.json"), str(self.deps_dir / "frontend-lock.json")],
                }
            )

        env_only_launch_failures = any(
            item["classification"] == "environment_contamination" for item in findings
        )
        product_launch_failures = any(str(item["id"]).startswith("P1-startup-path-failed-") for item in findings)
        if self.required_failures > 0 and not product_launch_failures:
            findings.append(
                {
                    "id": "ENV-required-command-failures" if env_only_launch_failures else "P1-required-command-failures",
                    "severity": "ENV" if env_only_launch_failures else "P1",
                    "classification": "environment_contamination" if env_only_launch_failures else "unexpected",
                    "summary": (
                        "One or more required audit commands failed because the host environment was not valid release evidence."
                        if env_only_launch_failures
                        else "One or more required audit commands failed."
                    ),
                    "required_failures": self.required_failures,
                    "evidence": [str(self.artifact_root / "matrix.json")],
                }
            )

        self.findings = findings
        self._write_json(self.artifact_root / "findings.json", findings)
        self._write_json(
            self.fingerprints_dir / "launch-failure-analysis.json",
            self.launch_failure_analysis,
        )

        has_p0_p1 = any(item["severity"] in {"P0", "P1"} for item in findings)
        has_p2 = any(item["severity"] == "P2" for item in findings)
        has_environment_contamination = any(
            item["classification"] == "environment_contamination" for item in findings
        )

        if has_p0_p1:
            decision = "NO-GO"
        elif has_environment_contamination:
            decision = "INVALID_ENVIRONMENT"
        elif has_p2:
            decision = "CONDITIONAL"
        else:
            decision = "GO"

        self.decision = {
            "run_id": self.run_id,
            "generated_at_utc": self._iso(self._utc_now()),
            "decision": decision,
            "required_failures": self.required_failures,
            "finding_counts": {
                "P0": sum(1 for item in findings if item["severity"] == "P0"),
                "P1": sum(1 for item in findings if item["severity"] == "P1"),
                "P2": sum(1 for item in findings if item["severity"] == "P2"),
                "ENV": sum(1 for item in findings if item["severity"] == "ENV"),
            },
            "go_criteria": "No unresolved P0/P1 findings",
        }
        self._write_json(self.artifact_root / "decision.json", self.decision)

    def _write_report(self) -> None:
        matrix_path = self.artifact_root / "matrix.json"
        self._write_json(matrix_path, [entry.to_json() for entry in self.command_results])
        self.run_status = {
            "run_id": self.run_id,
            "generated_at_utc": self._iso(self._utc_now()),
            "status": "complete",
            "decision": self.decision.get("decision", "UNKNOWN"),
            "required_failures": self.required_failures,
            "artifact_root": str(self.artifact_root),
            "matrix": str(matrix_path),
        }
        self._write_json(self.artifact_root / "run_status.json", self.run_status)

        report_lines = [
            f"# Release Parity Audit ({self.run_id})",
            "",
            "## Result",
            f"- Decision: **{self.decision.get('decision', 'UNKNOWN')}**",
            f"- Required command failures: `{self.required_failures}`",
            f"- Baseline branch: `{self.baseline.get('git_branch')}`",
            f"- Baseline git SHA: `{self.baseline.get('git_sha')}`",
            "",
            "## Parity Matrix",
            f"- Startup inventory: `{self.artifact_root / 'startup-paths.json'}`",
            f"- Runtime fingerprints: `{self.fingerprints_dir / 'runtime.json'}`",
            f"- Toolchain fingerprint: `{self.fingerprints_dir / 'toolchain.json'}`",
            f"- Startup preflight: `{self.fingerprints_dir / 'startup-preflight.json'}`",
            f"- Launch-failure analysis: `{self.fingerprints_dir / 'launch-failure-analysis.json'}`",
            f"- Dependency diffs: `{self.deps_dir / 'diffs.json'}`",
            f"- UI parity: `{self.ui_dir / 'parity.json'}`",
            f"- Command matrix: `{self.artifact_root / 'matrix.json'}`",
            f"- Run status: `{self.artifact_root / 'run_status.json'}`",
            "",
            "## Findings",
        ]
        if not self.findings:
            report_lines.append("- No unexpected parity mismatches were detected.")
        else:
            for finding in self.findings:
                report_lines.append(
                    f"- `{finding['id']}` [{finding['severity']}] {finding['summary']}"
                )
                if finding["severity"] in {"P0", "P1"}:
                    report_lines.append("  - Release impact: blocks GO.")
                elif finding["severity"] == "ENV":
                    report_lines.append("  - Release impact: invalidates this host as release evidence until rerun on a clean environment.")

        report_lines.extend(
            [
                "",
                "## Remediation Queue",
            ]
        )
        remediation = [
            finding for finding in self.findings if finding["severity"] in {"P1", "P2", "P0"}
        ]
        if not remediation:
            report_lines.append("- None.")
        else:
            for idx, finding in enumerate(remediation, start=1):
                report_lines.append(f"{idx}. `{finding['id']}` ({finding['severity']})")
                if finding["id"] == "P2-dev-frontend-nonreproducible-install":
                    report_lines.append("   - Fix: switch `scripts/dev.sh` frontend bootstrap from `npm install` to `npm ci` when lockfile is present.")
                    report_lines.append("   - Guard: add a script-contract test asserting lockfile-respecting install path.")
                elif finding["id"] == "P2-node-major-mismatch":
                    expected_major = finding.get("expected_node_major")
                    if expected_major is None:
                        report_lines.append("   - Fix: align host Node to CI/Docker baseline major from workflow config for release-critical validation runs.")
                    else:
                        report_lines.append(
                            f"   - Fix: align host Node to CI/Docker baseline major ({expected_major}) for release-critical validation runs."
                        )
                    report_lines.append("   - Guard: enforce `.nvmrc`/`.node-version` + preflight version check in startup scripts.")
                elif finding["id"] == "P1-ui-parity-mismatch":
                    report_lines.append("   - Fix: align auth/profile inputs and frontend build/runtime mode before comparing screenshots.")
                    report_lines.append("   - Guard: add a deterministic UI parity smoke scenario with fixed auth mode and seed data.")
                elif str(finding["id"]).startswith("P1-startup-path-failed-"):
                    report_lines.append("   - Fix: repair startup path command and ensure it reaches healthy backend/frontend state.")
                    report_lines.append("   - Guard: add script-level smoke checks for each startup entrypoint before release cut.")
                elif finding["severity"] == "ENV":
                    report_lines.append("   - Fix: clean the host environment or provide the missing prerequisite, then rerun parity on a valid evidence host.")
                    report_lines.append("   - Guard: preserve the startup preflight gate and launch-failure classification to prevent false product blockers.")
                elif finding["severity"] == "P1":
                    report_lines.append("   - Fix: pin backend runtime dependencies for release reproducibility and rebuild release image.")
                    report_lines.append("   - Guard: add backend dependency parity gate comparing local lock set vs image lock set.")
                elif finding["severity"] == "P0":
                    report_lines.append("   - Fix: ensure runtime and artifact baselines resolve to selected release commit.")
                    report_lines.append("   - Guard: embed and verify git SHA in runtime health metadata.")
                else:
                    report_lines.append("   - Fix: resolve mismatch and rerun parity audit.")

        report_lines.extend(
            [
                "",
                "## Evidence Map",
                f"- `scripts/dev.sh:295`, `scripts/dev.sh:313`",
                f"- `scripts/dev.sh:231`, `scripts/dev.sh:233`",
                f"- `backend/requirements.txt:1`",
                f"- `backend/Dockerfile:7`, `backend/Dockerfile:25`",
                f"- `frontend/Dockerfile:7`, `frontend/Dockerfile:16`",
                f"- `.github/workflows/e2e.yml:39`, `.github/workflows/e2e.yml:45`, `.github/workflows/e2e.yml:55`",
                f"- `backend/app/api/v1/endpoints/auth/config.py:13`, `frontend/src/pages/LoginPage.tsx:327`",
                f"- `backend/app/core/config.py:15`, `backend/app/api/v1/endpoints/health.py:61`",
                f"- `scripts/security/run_prod_readiness_audit_local.sh:246`, `docs/security/reports/prod-readiness-deep-audit-2026-02-22.md:17`",
            ]
        )

        self._write_text(self.artifact_root / "report.md", "\n".join(report_lines) + "\n")

    def run(self) -> None:
        self._capture_baseline()
        self._build_startup_inventory()
        self._extract_static_resolution()
        self._capture_toolchain()
        self._capture_startup_preflight()
        self._run_dynamic_paths()
        self._capture_dependencies()
        self._evaluate_ui_parity()
        self._evaluate_findings_and_decision()
        self._write_report()


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
        help="Skip executing run_prod_readiness_audit_local.sh in isolated worktree and ingest latest existing artifact instead.",
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
