from __future__ import annotations

import os
import json
import re
import shlex
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class StartupPreflightSnapshot:
    data: dict[str, Any]


def build_startup_preflight_snapshot(data: dict[str, Any]) -> StartupPreflightSnapshot:
    return StartupPreflightSnapshot(data=dict(data))


def node_major_from_binary(binary: str) -> int | None:
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


def _node_version(binary: str) -> str:
    completed = subprocess.run([binary, "--version"], check=False, capture_output=True, text=True)
    return (completed.stdout or "").strip()


def detect_dev_sh_effective_node(
    toolchain_fingerprint: dict[str, Any],
    *,
    required_major: int = 24,
) -> dict[str, Any]:
    def candidate_payload(bin_dir: Path, source: str) -> dict[str, Any] | None:
        node_binary = bin_dir / "node"
        npm_binary = bin_dir / "npm"
        if not node_binary.is_file() or not os.access(node_binary, os.X_OK):
            return None
        if not npm_binary.is_file() or not os.access(npm_binary, os.X_OK):
            return None
        major = node_major_from_binary(str(node_binary))
        if major != required_major:
            return None
        return {
            "selected": True,
            "required_major": required_major,
            "source": source,
            "node_path": str(node_binary),
            "npm_path": str(npm_binary),
            "node_version": _node_version(str(node_binary)),
            "npm_version": _node_version(str(npm_binary)),
            "major": major,
        }

    current_node = shutil.which("node")
    current_npm = shutil.which("npm")
    if current_node and current_npm and node_major_from_binary(current_node) == required_major:
        return {
            "selected": True,
            "required_major": required_major,
            "source": "PATH",
            "node_path": current_node,
            "npm_path": current_npm,
            "node_version": _node_version(current_node),
            "npm_version": _node_version(current_npm),
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

    host_major = node_major_from_binary(current_node) if current_node else None
    return {
        "selected": False,
        "required_major": required_major,
        "source": None,
        "node_path": current_node,
        "npm_path": current_npm,
        "node_version": toolchain_fingerprint.get("host_node", {}).get("value"),
        "npm_version": toolchain_fingerprint.get("host_npm", {}).get("value"),
        "major": host_major,
    }


def port_listeners(port: int) -> list[dict[str, Any]]:
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


def docker_daemon_status() -> dict[str, Any]:
    try:
        completed = subprocess.run(
            ["docker", "info"],
            check=False,
            capture_output=True,
            text=True,
        )
        return {
            "available": completed.returncode == 0,
            "message": ((completed.stdout or "") + (completed.stderr or "")).strip()[:4000],
        }
    except OSError as exc:
        return {"available": False, "message": str(exc)[:4000]}


def capture_startup_preflight(
    *,
    root_dir: Path,
    toolchain_fingerprint: dict[str, Any],
    captured_at_utc: str,
) -> dict[str, Any]:
    return {
        "captured_at_utc": captured_at_utc,
        "docker_daemon": docker_daemon_status(),
        "ports": {
            "8000": port_listeners(8000),
            "5173": port_listeners(5173),
            "80": port_listeners(80),
        },
        "toolchain": {
            "dev_sh_effective_node": detect_dev_sh_effective_node(toolchain_fingerprint),
            "backend_venv_python_exists": (root_dir / "backend" / "venv" / "bin" / "python").exists(),
            "frontend_lockfile_exists": (root_dir / "frontend" / "package-lock.json").exists(),
        },
    }


def docker_container_state(names: list[str], *, run_command) -> dict[str, Any]:
    state: dict[str, Any] = {}
    for name in names:
        cmd = (
            "docker inspect "
            "--format '{{json .Name}} {{json .Config.Image}} {{json .State.Status}} {{json .State.Health.Status}}' "
            f"{shlex.quote(name)}"
        )
        res = run_command(f"docker_inspect_{name}", cmd, required=False, timeout_sec=60)
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
