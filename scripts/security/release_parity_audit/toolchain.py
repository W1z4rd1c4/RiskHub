from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from release_parity_audit.startup_preflight import detect_dev_sh_effective_node


@dataclass(frozen=True)
class ToolchainSnapshot:
    data: dict[str, Any]


def build_toolchain_snapshot(data: dict[str, Any]) -> ToolchainSnapshot:
    return ToolchainSnapshot(data=dict(data))


def capture_toolchain(*, run_command, root_dir: Path, toolchain_log_reader=None) -> dict[str, Any]:
    commands = {
        "host_python": "python3 --version",
        "host_node": "node --version",
        "host_npm": "npm --version",
        "backend_venv_python": "cd backend && ./venv/bin/python --version",
        "backend_venv_pip": "cd backend && ./venv/bin/pip --version",
        "docker_version": "docker version --format '{{.Server.Version}}'",
    }
    toolchain: dict[str, Any] = {}
    for key, command in commands.items():
        result = run_command(f"toolchain_{key}", command, required=False, timeout_sec=120)
        log_path = Path(result.log_path)
        log_text = toolchain_log_reader(log_path) if toolchain_log_reader else log_path.read_text(
            encoding="utf-8", errors="replace"
        )
        last = ""
        for line in log_text.splitlines():
            if line and not line.startswith("$ "):
                last = line.strip()
        toolchain[key] = {"rc": result.rc, "value": last}
    toolchain["dev_sh_effective_node"] = detect_dev_sh_effective_node(toolchain)
    _ = root_dir
    return toolchain
