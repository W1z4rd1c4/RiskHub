from __future__ import annotations

import importlib
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.error import HTTPError

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SECURITY_SCRIPTS = REPO_ROOT / "scripts" / "security"
if str(SECURITY_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SECURITY_SCRIPTS))

HTTP_PROBE = importlib.import_module("release_parity_audit.http_probe")
CLEANUP = importlib.import_module("release_parity_audit.cleanup")


@pytest.mark.parametrize(
    ("script_name", "extra_args"),
    [
        ("dev.sh", []),
        ("test.sh", ["--yes"]),
    ],
)
def test_db_runtime_prefers_docker_compose_v2_when_both_commands_exist(
    tmp_path: Path, script_name: str, extra_args: list[str]
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()

    docker = bin_dir / "docker"
    docker.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    docker.chmod(0o755)

    standalone_compose = bin_dir / "docker-compose"
    standalone_compose.write_text(
        "#!/usr/bin/env bash\nexit 0\n", encoding="utf-8"
    )
    standalone_compose.chmod(0o755)

    script = REPO_ROOT / "backend" / "scripts" / "runtime" / "db" / script_name
    result = subprocess.run(
        ["bash", str(script), "--dry-run", *extra_args],
        env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"},
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "+ docker compose -f " in result.stdout
    assert "+ docker-compose -f " not in result.stdout


@pytest.mark.parametrize(
    ("script_name", "extra_args"),
    [
        ("dev.sh", []),
        ("test.sh", ["--yes"]),
    ],
)
def test_db_runtime_falls_back_to_standalone_compose_when_v2_is_unavailable(
    tmp_path: Path, script_name: str, extra_args: list[str]
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()

    docker = bin_dir / "docker"
    docker.write_text(
        "#!/usr/bin/env bash\n"
        'if [[ "$*" == "compose version" ]]; then exit 1; fi\n'
        "exit 0\n",
        encoding="utf-8",
    )
    docker.chmod(0o755)

    standalone_compose = bin_dir / "docker-compose"
    standalone_compose.write_text(
        "#!/usr/bin/env bash\nexit 0\n", encoding="utf-8"
    )
    standalone_compose.chmod(0o755)

    script = REPO_ROOT / "backend" / "scripts" / "runtime" / "db" / script_name
    result = subprocess.run(
        ["bash", str(script), "--dry-run", *extra_args],
        env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"},
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "+ docker-compose -f " in result.stdout
    assert "+ docker compose -f " not in result.stdout


def test_readiness_uses_generic_http_accept_without_changing_json_retrieval() -> None:
    accepts: list[str | None] = []

    class ViteLikeHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            accept = self.headers.get("Accept")
            accepts.append(accept)
            if accept == "application/json":
                self.send_response(404)
                self.end_headers()
                return
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<html>ready</html>")

        def log_message(self, format: str, *args: object) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), ViteLikeHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()
    url = f"http://127.0.0.1:{server.server_port}/"
    try:
        assert HTTP_PROBE.wait_http(url, timeout_sec=1)
        try:
            HTTP_PROBE.http_json(url)
        except HTTPError as error:
            assert error.code == 404
        else:
            raise AssertionError(
                "JSON retrieval must retain application/json negotiation"
            )
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

    assert accepts[-1] == "application/json"
    assert "*/*" in accepts[:-1]


def test_release_parity_cleanup_uses_profile_aware_public_lifecycle(
    tmp_path: Path,
) -> None:
    scripts_dir = tmp_path / "scripts"
    bin_dir = tmp_path / "bin"
    scripts_dir.mkdir()
    bin_dir.mkdir()
    marker = tmp_path / "profiled-service.running"
    marker.touch()
    invocation = tmp_path / "compose-sh.args"

    compose_script = scripts_dir / "compose.sh"
    compose_script.write_text(
        "#!/usr/bin/env bash\n"
        'printf \'%s\\n\' "$*" > "$COMPOSE_SH_ARGS"\n'
        'rm "$PROFILED_SERVICE_MARKER"\n',
        encoding="utf-8",
    )
    compose_script.chmod(0o755)

    raw_compose = bin_dir / "docker-compose"
    raw_compose.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    raw_compose.chmod(0o755)

    command = CLEANUP.compose_down_command("cleanup_test")
    result = subprocess.run(
        ["bash", "-c", command.command],
        cwd=tmp_path,
        env={
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "COMPOSE_SH_ARGS": str(invocation),
            "PROFILED_SERVICE_MARKER": str(marker),
        },
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert not marker.exists()
    assert invocation.read_text(encoding="utf-8").strip() == "down"


def test_preflight_db_probe_attaches_stdin_and_propagates_probe_failure(
    tmp_path: Path,
) -> None:
    bin_dir = tmp_path / "bin"
    secret_dir = tmp_path / "secrets"
    runtime_dir = tmp_path / "runtime"
    bin_dir.mkdir()
    secret_dir.mkdir()
    runtime_dir.mkdir()
    backend_env = tmp_path / "backend.env"
    backend_env.write_text("DATABASE_URL=postgresql://unreachable\n", encoding="utf-8")
    captured_stdin = tmp_path / "docker.stdin"

    docker = bin_dir / "docker"
    docker.write_text(
        "#!/usr/bin/env bash\n"
        'case " $* " in\n'
        '  *" -i "*) cat > "$DOCKER_STDIN"; exit 23 ;;\n'
        '  *) : > "$DOCKER_STDIN"; exit 0 ;;\n'
        "esac\n",
        encoding="utf-8",
    )
    docker.chmod(0o755)

    result = subprocess.run(
        [
            "bash",
            "-c",
            """
set -euo pipefail
run() { "$@"; }
log() { :; }
die() { printf '%s\n' "$*" >&2; return 1; }
require_file() { test -f "$1"; }
source "$PREFLIGHT_LIB"
preflight_check_db_connectivity "$BACKEND_ENV" fake-backend-image
""",
        ],
        cwd=tmp_path,
        env={
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "PREFLIGHT_LIB": str(
                REPO_ROOT / "scripts" / "prod" / "lib" / "preflight.sh"
            ),
            "BACKEND_ENV": str(backend_env),
            "SECRET_DIR": str(secret_dir),
            "RUNTIME_DIR": str(runtime_dir),
            "DOCKER_STDIN": str(captured_stdin),
        },
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 23
    assert "asyncio.run(main())" in captured_stdin.read_text(encoding="utf-8")
