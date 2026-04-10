from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_ROOT = REPO_ROOT / "scripts"
if str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))

InstallPaths = importlib.import_module("install_lib.common").InstallPaths
status_module = importlib.import_module("install_lib.status")


def _paths(tmp_path: Path) -> InstallPaths:
    return InstallPaths(
        repo_root=REPO_ROOT,
        config_path=tmp_path / "riskhub.env",
        secret_dir=tmp_path / "secrets",
        runtime_dir=tmp_path / "runtime",
        linux_root=tmp_path / "linux-root",
        linux_current_link=tmp_path / "linux-root" / "current",
        compose_script=REPO_ROOT / "scripts" / "compose.sh",
        dev_script=REPO_ROOT / "scripts" / "dev.sh",
        deploy_script=REPO_ROOT / "scripts" / "deploy.sh",
    )


def test_dev_status_payload_preserves_health_key_as_readyz_alias(monkeypatch, tmp_path: Path) -> None:
    readiness_checks: list[str] = []

    def fake_curl_ok(url: str) -> bool:
        if url == "http://localhost:8000/api/v1/readyz":
            readiness_checks.append(url)
            return True
        return False

    monkeypatch.setattr(status_module, "curl_ok", fake_curl_ok)
    monkeypatch.setattr(status_module, "port_listening", lambda _port: True)
    monkeypatch.setattr(status_module, "docker_container_state", lambda _name: {"exists": True, "running": True})
    monkeypatch.setattr(status_module, "command_exists", lambda command: command == "node")
    monkeypatch.setattr(status_module, "run_capture", lambda _command: SimpleNamespace(returncode=0, stdout="24\n"))

    payload = status_module.dev_status_payload(_paths(tmp_path))

    assert payload["http"]["health"] is True
    assert payload["http"]["readyz"] is True
    assert payload["http"]["health"] == payload["http"]["readyz"]
    assert readiness_checks == ["http://localhost:8000/api/v1/readyz"]
