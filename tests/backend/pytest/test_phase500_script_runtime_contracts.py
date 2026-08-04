"""Runtime contracts for retained and retired production scripts."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
PROD_SCRIPTS_DIR = REPO_ROOT / "scripts" / "prod"
RETIRED_LEGACY_SCRIPTS = ("setup.sh", "deploy.sh", "upgrade.sh", "stop.sh")
DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy.sh"


def _smoke_backend_http_code_probe() -> str:
    script = (PROD_SCRIPTS_DIR / "smoke_test.sh").read_text(encoding="utf-8")
    marker = "backend_http_code_python() {\n  cat <<'PY'\n"
    return script.split(marker, 1)[1].split("\nPY\n}", 1)[0]


def _docker_available() -> bool:
    try:
        result = subprocess.run(
            ["docker", "ps"],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return False
    return result.returncode == 0


def _run_script(
    name: str, args: list[str], env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(PROD_SCRIPTS_DIR / name), *args],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def test_managed_container_replacement_stops_gracefully_before_removal(
    tmp_path: Path,
) -> None:
    fake_bin = tmp_path / "bin"
    docker_log = tmp_path / "docker.log"
    fake_bin.mkdir()
    docker = fake_bin / "docker"
    docker.write_text(
        "#!/usr/bin/env bash\n"
        'printf \'%s\\t\' "$@" >> "$FAKE_DOCKER_LOG"\n'
        "printf '\\n' >> \"$FAKE_DOCKER_LOG\"\n"
        'if [[ "${1:-}" == inspect ]]; then exit 0; fi\n'
        'if [[ "${1:-}" == stop && -n "${FAKE_DOCKER_STOP_RC:-}" ]]; then '
        'exit "$FAKE_DOCKER_STOP_RC"; fi\n'
        'if [[ "${1:-}" == rm && -n "${FAKE_DOCKER_RM_RC:-}" ]]; then '
        'exit "$FAKE_DOCKER_RM_RC"; fi\n'
        "exit 0\n",
        encoding="utf-8",
    )
    docker.chmod(0o755)
    harness = f"""
set -euo pipefail
source {str(PROD_SCRIPTS_DIR / 'lib/common.sh')!r}
rm_container_if_exists riskhub-backend-scheduler
"""

    def invoke(**failures: str) -> tuple[subprocess.CompletedProcess[str], list[list[str]]]:
        docker_log.write_text("", encoding="utf-8")
        result = subprocess.run(
            ["bash", "-c", harness],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
            env={
                **os.environ,
                "PATH": f"{fake_bin}:{os.environ['PATH']}",
                "FAKE_DOCKER_LOG": str(docker_log),
                **failures,
            },
        )
        calls = [
            line.rstrip("\t").split("\t")
            for line in docker_log.read_text(encoding="utf-8").splitlines()
        ]
        return result, calls

    result, calls = invoke()
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert calls == [
        ["inspect", "riskhub-backend-scheduler"],
        ["stop", "--time", "30", "riskhub-backend-scheduler"],
        ["rm", "riskhub-backend-scheduler"],
    ]

    failed_stop, failed_stop_calls = invoke(FAKE_DOCKER_STOP_RC="23")
    assert failed_stop.returncode == 23
    assert failed_stop_calls == [
        ["inspect", "riskhub-backend-scheduler"],
        ["stop", "--time", "30", "riskhub-backend-scheduler"],
    ]

    failed_rm, failed_rm_calls = invoke(FAKE_DOCKER_RM_RC="24")
    assert failed_rm.returncode == 24
    assert failed_rm_calls == calls
    assert "Removed existing container" not in failed_rm.stdout


def _write_backend_env(
    path: Path,
    runtime_dir: Path,
    secret_dir: Path,
    *,
    credential_mode: str = "secret",
    include_both: bool = False,
) -> None:
    values = [
        "DEBUG=false",
        "MOCK_AUTH_ENABLED=false",
        "AUTH_MODE=microsoft_sso",
        "DIRECTORY_PROVIDER=graph",
        "ENTRA_JIT_PROVISIONING_ENABLED=false",
        "AUTH_SSO_ALLOW_EMAIL_LINK=false",
        f"SECRET_KEY_FILE={secret_dir / 'secret_key'}",
        f"DATABASE_URL_FILE={secret_dir / 'database_url'}",
        'CORS_ORIGINS=["https://riskhub.example.com"]',
        'ALLOWED_HOSTS=["riskhub.example.com"]',
        f"REDIS_URL_FILE={runtime_dir / 'redis_url'}",
        "ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000",
        "ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111",
    ]
    if credential_mode == "secret" or include_both:
        values.append(f"ENTRA_CLIENT_SECRET_FILE={secret_dir / 'entra_client_secret'}")
    if credential_mode == "certificate" or include_both:
        values.extend(
            [
                "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT=ABCDEF1234567890ABCDEF1234567890ABCDEF12",
                f"ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE={secret_dir / 'entra_client_certificate_private_key'}",
            ]
        )
    values.extend(
        [
            "BOOTSTRAP_ADMIN_EMAIL=admin@example.com",
            "BOOTSTRAP_ADMIN_ROLE=admin",
            "BOOTSTRAP_ADMIN_ACCESS_SCOPE=global",
            "BOOTSTRAP_CRO_EMAIL=cro@example.com",
            "BOOTSTRAP_CRO_ACCESS_SCOPE=global",
        ]
    )
    path.write_text("\n".join(values) + "\n", encoding="utf-8")


def _write_secret_runtime(
    secret_dir: Path,
    runtime_dir: Path,
    *,
    include_client_secret: bool = True,
    include_certificate: bool = False,
) -> None:
    secret_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (secret_dir / "secret_key").write_text(
        "phase500-local-test-key-phase500-local-test\n", encoding="utf-8"
    )
    (secret_dir / "database_url").write_text(
        "postgresql+asyncpg://riskhub:riskhub@postgres.example.com:5432/riskhub\n",
        encoding="utf-8",
    )
    if include_client_secret:
        (secret_dir / "entra_client_secret").write_text(
            "phase500-test-entra-client-secret\n", encoding="utf-8"
        )
    if include_certificate:
        (secret_dir / "entra_client_certificate_private_key").write_text(
            "-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----\n",
            encoding="utf-8",
        )
    (runtime_dir / "redis_url").write_text(
        "redis://:riskhub_test_password@redis:6379/0\n", encoding="utf-8"
    )


def _write_frontend_env(path: Path, *, host_port: str, container_port: str) -> None:
    path.write_text(
        f"FRONTEND_HOST_PORT={host_port}\n"
        f"FRONTEND_CONTAINER_PORT={container_port}\n"
        "SERVER_NAME=riskhub.example.com\n",
        encoding="utf-8",
    )


@pytest.mark.parametrize(
    ("script_name", "extra_args", "expected_run_count"),
    (
        ("preflight.sh", ("--frontend-env", "{frontend_env}", "--check-db"), 1),
        ("run_migrations.sh", (), 1),
        ("bootstrap_db.sh", (), 4),
        ("install_backend.sh", (), 1),
    ),
)
def test_host_database_docker_runs_map_host_docker_internal(
    tmp_path: Path,
    script_name: str,
    extra_args: tuple[str, ...],
    expected_run_count: int,
) -> None:
    backend_env = tmp_path / "backend.env"
    frontend_env = tmp_path / "frontend.env"
    secret_dir = tmp_path / "secrets"
    runtime_dir = tmp_path / "runtime"
    fake_bin = tmp_path / "bin"
    docker_log = tmp_path / "docker.log"
    _write_secret_runtime(secret_dir, runtime_dir)
    (secret_dir / "database_url").write_text(
        "postgresql+asyncpg://riskhub:riskhub@host.docker.internal:55432/riskhub\n",
        encoding="utf-8",
    )
    _write_backend_env(backend_env, runtime_dir, secret_dir)
    _write_frontend_env(frontend_env, host_port="60123", container_port="80")
    fake_bin.mkdir()
    docker = fake_bin / "docker"
    docker.write_text(
        "#!/usr/bin/env bash\n"
        'printf \'%s\\t\' "$@" >> "$FAKE_DOCKER_LOG"\n'
        "printf '\\n' >> \"$FAKE_DOCKER_LOG\"\n"
        'if [[ "${1:-}" == ps ]]; then exit 0; fi\n'
        'if [[ "${1:-}" == inspect ]]; then exit 1; fi\n'
        'if [[ "${1:-}" == network && "${2:-}" == inspect ]]; then exit 1; fi\n'
        'if [[ "${1:-}" == volume && "${2:-}" == inspect ]]; then exit 1; fi\n'
        "exit 0\n",
        encoding="utf-8",
    )
    docker.chmod(0o755)
    formatted_extra_args = [value.format(frontend_env=frontend_env) for value in extra_args]
    image_flag = "--backend-image" if script_name == "install_backend.sh" else "--backend-db-image"

    result = _run_script(
        script_name,
        [
            "--backend-env",
            str(backend_env),
            image_flag,
            "riskhub-backend:test",
            *formatted_extra_args,
            "--yes",
        ],
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "FAKE_DOCKER_LOG": str(docker_log),
            "RISKHUB_DEFAULT_SECRET_DIR": str(secret_dir),
            "RISKHUB_RUNTIME_DIR": str(runtime_dir),
        },
    )
    output = f"{result.stdout}\n{result.stderr}"
    docker_calls = [line.rstrip("\t").split("\t") for line in docker_log.read_text(encoding="utf-8").splitlines()]
    docker_runs = [args for args in docker_calls if args[0] == "run"]

    assert result.returncode == 0, output
    assert len(docker_runs) == expected_run_count
    for args in docker_runs:
        add_host_index = args.index("--add-host")
        assert args[add_host_index + 1] == "host.docker.internal:host-gateway"
        assert add_host_index < args.index("--env-file")


@pytest.mark.parametrize("identity_source", ("flags", "environment"))
def test_bootstrap_db_rejects_duplicate_privileged_external_ids_before_bootstrap(
    tmp_path: Path, identity_source: str
) -> None:
    backend_env = tmp_path / "backend.env"
    secret_dir = tmp_path / "secrets"
    runtime_dir = tmp_path / "runtime"
    fake_bin = tmp_path / "bin"
    duplicate_external_id = "11111111-2222-4333-8444-555555555555"
    _write_secret_runtime(secret_dir, runtime_dir)
    _write_backend_env(backend_env, runtime_dir, secret_dir)
    if identity_source == "environment":
        with backend_env.open("a", encoding="utf-8") as env_file:
            env_file.write(
                f"BOOTSTRAP_ADMIN_EXTERNAL_ID={duplicate_external_id}\n"
                f"BOOTSTRAP_CRO_EXTERNAL_ID={duplicate_external_id}\n"
            )
    fake_bin.mkdir()
    docker = fake_bin / "docker"
    docker.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    docker.chmod(0o755)
    args = [
        "--backend-env",
        str(backend_env),
        "--backend-db-image",
        "riskhub-backend-db:test",
        "--dry-run",
        "--yes",
    ]
    if identity_source == "flags":
        args.extend(
            [
                "--external-id",
                duplicate_external_id,
                "--cro-external-id",
                duplicate_external_id,
            ]
        )

    result = _run_script(
        "bootstrap_db.sh",
        args,
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "RISKHUB_DEFAULT_SECRET_DIR": str(secret_dir),
            "RISKHUB_RUNTIME_DIR": str(runtime_dir),
        },
    )
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode != 0
    assert (
        "BOOTSTRAP_ADMIN_EXTERNAL_ID and BOOTSTRAP_CRO_EXTERNAL_ID must be different"
        in output
    )
    assert "scripts.seed_roles_permissions" not in output
    assert "scripts.bootstrap_sso_user" not in output


@pytest.mark.parametrize("script_name", RETIRED_LEGACY_SCRIPTS)
def test_retired_legacy_scripts_are_absent(script_name: str) -> None:
    assert not (PROD_SCRIPTS_DIR / script_name).exists()


def test_deploy_cli_help_is_the_supported_operator_entrypoint() -> None:
    result = subprocess.run(
        [str(DEPLOY_SCRIPT), "--help"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    output = f"{result.stdout}\n{result.stderr}"

    assert result.returncode == 0, output
    assert "Usage: ./scripts/deploy.sh" in output


def test_smoke_backend_http_code_probe_does_not_follow_redirects() -> None:
    requested_paths: list[str] = []

    class RedirectToMissingHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            requested_paths.append(self.path)
            if self.path == "/docs":
                self.send_response(302)
                self.send_header("Location", "/missing")
            else:
                self.send_response(404)
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), RedirectToMissingHandler)
    server_thread = threading.Thread(target=server.serve_forever)
    server_thread.start()
    try:
        result = subprocess.run(
            [
                sys.executable,
                "-",
                f"http://127.0.0.1:{server.server_port}/docs",
                "riskhub.example.com",
            ],
            input=_smoke_backend_http_code_probe(),
            check=False,
            capture_output=True,
            text=True,
        )
        direct_404_result = subprocess.run(
            [
                sys.executable,
                "-",
                f"http://127.0.0.1:{server.server_port}/missing",
                "riskhub.example.com",
            ],
            input=_smoke_backend_http_code_probe(),
            check=False,
            capture_output=True,
            text=True,
        )
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join()

    assert result.returncode == 0, result.stderr
    assert result.stdout == "302\n"
    assert direct_404_result.returncode == 0, direct_404_result.stderr
    assert direct_404_result.stdout == "404\n"
    assert requested_paths == ["/docs", "/missing"]


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_rejects_invalid_host_port_range() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-preflight-host-range-") as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(secret_dir, runtime_dir)
        _write_backend_env(backend_env, runtime_dir, secret_dir)
        _write_frontend_env(frontend_env, host_port="70000", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode != 0
        assert "FRONTEND_HOST_PORT must be between 1 and 65535" in output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_rejects_invalid_container_port_format() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-preflight-container-port-") as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(secret_dir, runtime_dir)
        _write_backend_env(backend_env, runtime_dir, secret_dir)
        _write_frontend_env(frontend_env, host_port="18081", container_port="abc")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode != 0
        assert "FRONTEND_CONTAINER_PORT must be numeric" in output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_accepts_certificate_credential_mode() -> None:
    with tempfile.TemporaryDirectory(prefix="riskhub-preflight-cert-mode-") as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(
            secret_dir,
            runtime_dir,
            include_client_secret=False,
            include_certificate=True,
        )
        _write_backend_env(
            backend_env, runtime_dir, secret_dir, credential_mode="certificate"
        )
        _write_frontend_env(frontend_env, host_port="18081", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_accepts_secret_mode_with_explicit_unused_certificate_placeholder() -> (
    None
):
    with tempfile.TemporaryDirectory(
        prefix="riskhub-preflight-secret-unused-cert-placeholder-"
    ) as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(secret_dir, runtime_dir)
        (secret_dir / "entra_client_certificate_private_key").write_text(
            "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY\n",
            encoding="utf-8",
        )
        _write_backend_env(
            backend_env, runtime_dir, secret_dir, credential_mode="secret"
        )
        _write_frontend_env(frontend_env, host_port="18081", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_rejects_client_secret_placeholder() -> None:
    with tempfile.TemporaryDirectory(
        prefix="riskhub-preflight-secret-placeholder-"
    ) as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(secret_dir, runtime_dir)
        (secret_dir / "entra_client_secret").write_text(
            "CHANGE_ME_ENTRA_CLIENT_SECRET\n", encoding="utf-8"
        )
        _write_backend_env(backend_env, runtime_dir, secret_dir)
        _write_frontend_env(frontend_env, host_port="18081", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode != 0
        assert "ENTRA_CLIENT_SECRET_FILE still contains the placeholder value" in output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_rejects_certificate_placeholder_private_key() -> None:
    with tempfile.TemporaryDirectory(
        prefix="riskhub-preflight-cert-placeholder-"
    ) as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(
            secret_dir,
            runtime_dir,
            include_client_secret=False,
            include_certificate=True,
        )
        (secret_dir / "entra_client_certificate_private_key").write_text(
            "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY\n",
            encoding="utf-8",
        )
        _write_backend_env(
            backend_env, runtime_dir, secret_dir, credential_mode="certificate"
        )
        _write_frontend_env(frontend_env, host_port="18081", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode != 0
        assert (
            "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE still contains the placeholder value"
            in output
        )


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_accepts_secret_mode_with_unused_certificate_placeholder() -> None:
    with tempfile.TemporaryDirectory(
        prefix="riskhub-preflight-secret-unused-cert-placeholder-"
    ) as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(
            secret_dir,
            runtime_dir,
            include_client_secret=True,
            include_certificate=True,
        )
        (secret_dir / "entra_client_certificate_private_key").write_text(
            "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY\n",
            encoding="utf-8",
        )
        _write_backend_env(
            backend_env, runtime_dir, secret_dir, credential_mode="secret"
        )
        _write_frontend_env(frontend_env, host_port="18081", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_accepts_certificate_mode_with_unused_client_secret_placeholder() -> (
    None
):
    with tempfile.TemporaryDirectory(
        prefix="riskhub-preflight-cert-unused-secret-placeholder-"
    ) as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(
            secret_dir,
            runtime_dir,
            include_client_secret=True,
            include_certificate=True,
        )
        (secret_dir / "entra_client_secret").write_text(
            "CHANGE_ME_ENTRA_CLIENT_SECRET\n", encoding="utf-8"
        )
        _write_backend_env(
            backend_env, runtime_dir, secret_dir, credential_mode="certificate"
        )
        _write_frontend_env(frontend_env, host_port="18081", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for preflight script runtime checks",
)
def test_preflight_warns_when_secret_and_certificate_credentials_are_both_configured() -> (
    None
):
    with tempfile.TemporaryDirectory(
        prefix="riskhub-preflight-both-credentials-"
    ) as td:
        tmp = Path(td)
        backend_env = tmp / "backend.env"
        frontend_env = tmp / "frontend.env"
        secret_dir = tmp / "secrets"
        runtime_dir = tmp / "runtime"
        _write_secret_runtime(
            secret_dir,
            runtime_dir,
            include_client_secret=True,
            include_certificate=True,
        )
        _write_backend_env(
            backend_env,
            runtime_dir,
            secret_dir,
            credential_mode="certificate",
            include_both=True,
        )
        _write_frontend_env(frontend_env, host_port="18081", container_port="80")
        env = os.environ.copy()
        env["RISKHUB_DEFAULT_SECRET_DIR"] = str(secret_dir)
        env["RISKHUB_RUNTIME_DIR"] = str(runtime_dir)

        result = _run_script(
            "preflight.sh",
            [
                "--backend-env",
                str(backend_env),
                "--frontend-env",
                str(frontend_env),
                "--yes",
            ],
            env=env,
        )
        output = f"{result.stdout}\n{result.stderr}"

        assert result.returncode == 0, output
        assert "certificate mode is active" in output


@pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon is required for redis wrapper runtime checks",
)
def test_redis_wrapper_honors_non_default_secret_dir_override() -> None:
    image_tag = f"riskhub-redis:runtime-test-{uuid.uuid4().hex[:12]}"
    container_name = f"riskhub-redis-runtime-test-{uuid.uuid4().hex[:12]}"
    with tempfile.TemporaryDirectory(prefix="riskhub-redis-runtime-") as td:
        tmp = Path(td)
        secret_dir = tmp / "custom-secrets"
        secret_dir.mkdir(parents=True)
        (secret_dir / "redis_password").write_text(
            "runtime-test-password\n", encoding="utf-8"
        )

        build = subprocess.run(
            [
                "docker",
                "build",
                "-t",
                image_tag,
                "-f",
                str(REPO_ROOT / "docker" / "redis" / "Dockerfile"),
                str(REPO_ROOT / "docker" / "redis"),
            ],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        assert build.returncode == 0, f"{build.stdout}\n{build.stderr}"

        try:
            run = subprocess.run(
                [
                    "docker",
                    "run",
                    "-d",
                    "--name",
                    container_name,
                    "-e",
                    f"RISKHUB_REDIS_PASSWORD_FILE={secret_dir / 'redis_password'}",
                    "-v",
                    f"{secret_dir}:{secret_dir}:ro",
                    image_tag,
                ],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            assert run.returncode == 0, f"{run.stdout}\n{run.stderr}"

            time.sleep(2)

            state = subprocess.run(
                ["docker", "inspect", "--format", "{{.State.Status}}", container_name],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            assert state.returncode == 0, f"{state.stdout}\n{state.stderr}"
            assert state.stdout.strip() == "running"
        finally:
            subprocess.run(
                ["docker", "rm", "-f", container_name],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            subprocess.run(
                ["docker", "image", "rm", "-f", image_tag],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
