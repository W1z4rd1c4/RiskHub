import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
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


def test_prod_override_does_not_introduce_public_backend_publish():
    compose_path = REPO_ROOT / "docker-compose.prod.yml"
    backend_ports = _extract_ports_for_service(compose_path, "backend")

    assert not any(_is_public_publish_for_backend_8000(port) for port in backend_ports)
