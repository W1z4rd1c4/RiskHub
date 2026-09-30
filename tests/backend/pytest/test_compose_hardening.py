import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
PORT_MAPPING_RE = re.compile(
    r"^(?:(?P<host>\[[^\]]+\]|[^:]+):)?(?P<host_port>\d+):(?P<container_port>\d+)(?:/(?:tcp|udp))?$"
)


def _extract_service_block(compose_text: str, service_name: str) -> list[str]:
    lines = compose_text.splitlines()
    marker = f"  {service_name}:"
    service_header = re.compile(r"^  [A-Za-z0-9_-]+:\s*$")

    start_index = next((index for index, line in enumerate(lines) if line == marker), None)
    if start_index is None:
        return []

    block: list[str] = []
    for line in lines[start_index + 1 :]:
        if service_header.match(line):
            break
        if line and not line.startswith("    "):
            break
        block.append(line)
    return block


def _extract_ports_for_service(compose_path: Path, service_name: str) -> list[str]:
    block = _extract_service_block(compose_path.read_text(encoding="utf-8"), service_name)
    if not block:
        return []

    ports: list[str] = []
    in_ports = False
    field_header = re.compile(r"^    [A-Za-z0-9_-]+:\s*$")

    for line in block:
        if line == "    ports:":
            in_ports = True
            continue
        if not in_ports:
            continue
        if field_header.match(line):
            break

        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("- "):
            ports.append(stripped[2:].strip().strip('"').strip("'"))

    return ports


def _is_public_publish_for_backend_8000(mapping: str) -> bool:
    match = PORT_MAPPING_RE.fullmatch(mapping)
    if not match:
        return False
    if match.group("container_port") != "8000":
        return False

    host = match.group("host")
    if host is None:
        return True

    return host not in {"127.0.0.1", "localhost", "::1", "[::1]"}


def test_base_compose_backend_publish_is_loopback_bound():
    compose_path = REPO_ROOT / "docker-compose.yml"
    backend_ports = _extract_ports_for_service(compose_path, "backend")

    assert "127.0.0.1:8000:8000" in backend_ports
    assert not any(_is_public_publish_for_backend_8000(port) for port in backend_ports)


def test_base_compose_passwordless_frontend_publish_defaults_to_loopback():
    frontend_ports = _extract_ports_for_service(REPO_ROOT / "docker-compose.yml", "frontend")

    assert frontend_ports == ["${RISKHUB_DEMO_BIND_HOST:-127.0.0.1}:80:80"]


@pytest.mark.parametrize("bind_host", [None, "0.0.0.0"])
def test_rendered_demo_compose_bind_requires_explicit_opt_in(bind_host):
    """Render with the real Compose parser; no Docker daemon/containers needed."""
    docker = shutil.which("docker")
    if not docker:
        pytest.skip("Docker Compose CLI is not installed")
    version = subprocess.run([docker, "compose", "version"], capture_output=True, timeout=10, check=False)
    if version.returncode:
        pytest.skip("Docker Compose plugin is not installed")
    env = {**os.environ, "RISKHUB_DEMO_BIND_HOST": bind_host or "", "LAN_HOST": bind_host or "localhost"}
    result = subprocess.run(
        [
            docker, "compose", "-f", str(REPO_ROOT / "docker-compose.yml"),
            "--profile", "full", "config", "--format", "json",
        ],
        cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=30, check=True,
    )
    services = json.loads(result.stdout)["services"]
    assert services["frontend"]["ports"][0]["host_ip"] == (bind_host or "127.0.0.1")
    for service in ("db", "redis", "backend"):
        assert all(port["host_ip"] == "127.0.0.1" for port in services[service]["ports"])
    assert not services["scheduler"].get("ports")


def test_base_compose_pins_network_subnet_and_backend_trusted_proxies():
    compose_text = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    expected_trusted_proxies = (
        'TRUSTED_PROXIES: "[\\"127.0.0.1\\",\\"::1\\",\\"${RISKHUB_DOCKER_SUBNET:-172.31.254.0/24}\\"]"'
    )

    assert expected_trusted_proxies in compose_text
    assert "ipam:" in compose_text
    assert "- subnet: ${RISKHUB_DOCKER_SUBNET:-172.31.254.0/24}" in compose_text


def test_base_compose_runs_outbox_scheduler_for_demo_e2e_parity():
    compose_text = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    scheduler_block = "\n".join(_extract_service_block(compose_text, "scheduler"))

    assert 'container_name: riskhub-backend-scheduler-dev' in scheduler_block
    assert 'ENABLE_SCHEDULER: "true"' in scheduler_block
    assert "SCHEDULER_JOB_PROFILE: outbox_only" in scheduler_block
    assert '"--workers", "1"' in scheduler_block
    assert "ports:" not in scheduler_block


def test_compose_full_stack_starts_outbox_scheduler_service():
    compose_script = (REPO_ROOT / "scripts" / "compose.sh").read_text(encoding="utf-8")

    assert "up_args+=(backend scheduler frontend)" in compose_script


def test_frontend_nginx_does_not_upgrade_docker_demo_http_assets():
    nginx_config = (REPO_ROOT / "frontend" / "nginx.conf").read_text(encoding="utf-8")

    assert "Content-Security-Policy" in nginx_config
    assert "upgrade-insecure-requests" not in nginx_config


def test_prod_compose_artifact_is_absent():
    compose_path = REPO_ROOT / "docker-compose.prod.yml"
    assert not compose_path.exists()
