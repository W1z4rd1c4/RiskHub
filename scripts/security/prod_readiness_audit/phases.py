from __future__ import annotations

import shlex
from dataclasses import dataclass

from prod_readiness_audit.commands import ProdReadinessCommand
from prod_readiness_audit.run_state import ProdReadinessRunState

TRIVY_IMAGE = "aquasec/trivy:0.57.1@sha256:5c59e08f980b5d4d503329773480fcea2c9bdad7e381d846fbf9f2ecb8050f6b"
SYFT_IMAGE = "anchore/syft:v1.42.3@sha256:5999d209a342e55e9edf70bf8930fb5b86d8f2a783fa401178372c50e21b1d36"
GRYPE_IMAGE = "anchore/grype:v0.110.0@sha256:af65fbc0c664691067788fe95ff88760b435543e45595eb2ca6f102fc476fbe1"
GITLEAKS_IMAGE = "zricethezav/gitleaks:v8.18.2@sha256:eadfe256fa18d6a78a717abc9ed454c8e03865d1c46d627bca83977f4424901a"


@dataclass(frozen=True)
class ProdReadinessPhase:
    name: str
    commands: tuple[ProdReadinessCommand, ...]


def _graceful_container_cleanup(container: str) -> str:
    return (
        f"docker stop --time 30 {container} >/dev/null 2>&1 || true; "
        f"docker rm {container}"
    )


def _repo_digest_resolution_command(images: tuple[tuple[str, str], ...]) -> str:
    resolver = (
        "set -euo pipefail; "
        "resolve_repo_digest() { "
        'tag="$1"; output="$2"; repo="${tag%:*}"; '
        'docker pull "$tag" >/dev/null; '
        "digest=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' \"$tag\" "
        "| awk -v prefix=\"${repo}@sha256:\" 'index($0, prefix) == 1 && length($0) == length(prefix) + 64 {print}' "
        "| sort -u); "
        "test \"$(printf '%s\\n' \"$digest\" | sed '/^$/d' | wc -l | tr -d ' ')\" = 1; "
        'printf \'%s\\n\' "$digest" > "$output"; '
        "}; "
    )
    calls = " ".join(
        f"resolve_repo_digest {shlex.quote(image)} {shlex.quote(output)};"
        for image, output in images
    )
    return resolver + calls


def _backend_http_code_command(path: str) -> str:
    probe = (
        "import sys,urllib.request;"
        "no_raise=type('NoRaise',(urllib.request.HTTPErrorProcessor,),"
        "{'http_response':lambda self,request,response:response,"
        "'https_response':lambda self,request,response:response})();"
        "opener=urllib.request.build_opener(no_raise);"
        "request=urllib.request.Request(f'http://localhost:8000{sys.argv[1]}',"
        "headers={'Host':sys.argv[2]});"
        "print(opener.open(request,timeout=10).status)"
    )
    return (
        "docker exec riskhub-backend python -c "
        f"{shlex.quote(probe)} {shlex.quote(path)} riskhub.example.com"
    )


def _security_contract_probe_command(state: ProdReadinessRunState) -> str:
    audit_python = shlex.quote(str(state.audit_python))
    database_path = state.tmp_dir / "security-probe.sqlite3"
    database_url = f"sqlite+aiosqlite:///{database_path}"
    schema_setup = (
        "from alembic.config import Config;"
        "from alembic.script import ScriptDirectory;"
        "from sqlalchemy import create_engine,text;"
        "from app.db.base import Base;"
        "import app.models;"
        f"engine=create_engine({str('sqlite:///' + str(database_path))!r});"
        "Base.metadata.create_all(engine);"
        "head=ScriptDirectory.from_config(Config('alembic.ini')).get_current_head();"
        "conn=engine.connect();tx=conn.begin();"
        "conn.execute(text('CREATE TABLE IF NOT EXISTS alembic_version "
        "(version_num VARCHAR(32) NOT NULL)'));"
        "conn.execute(text('DELETE FROM alembic_version'));"
        "conn.execute(text('INSERT INTO alembic_version (version_num) VALUES (:head)'),"
        "{'head':head});tx.commit();conn.close();engine.dispose()"
    )
    base_url = f"http://127.0.0.1:{state.security_probe_port}"
    runtime_log = shlex.quote(str(state.log_dir / "p2_security_probe_runtime.log"))
    runtime_env = (
        "DEBUG=true MOCK_AUTH_ENABLED=true AUTH_MODE=hybrid_dev "
        "DIRECTORY_PROVIDER=ad_emulator "
        "ENTRA_JIT_PROVISIONING_ENABLED=true AUTH_SSO_ALLOW_EMAIL_LINK=true "
        f"SECRET_KEY={shlex.quote('prod-readiness-security-probe-key')} "
        f"DATABASE_URL={shlex.quote(database_url)} "
        f"TEST_DATABASE_URL={shlex.quote(database_url)}"
    )
    return (
        "set -euo pipefail; runtime_pid=''; watchdog_pid=''; parent_pid=$$; "
        "cleanup() { "
        "if [[ -n \"$watchdog_pid\" ]] && kill -0 \"$watchdog_pid\" 2>/dev/null; then "
        "kill \"$watchdog_pid\"; wait \"$watchdog_pid\" 2>/dev/null || :; fi; "
        "if [[ -n \"$runtime_pid\" ]] && kill -0 \"$runtime_pid\" 2>/dev/null; then "
        "kill \"$runtime_pid\"; wait \"$runtime_pid\" 2>/dev/null || :; fi; "
        "}; trap cleanup EXIT INT TERM; "
        f"cd backend; env {runtime_env} {audit_python} -c {shlex.quote(schema_setup)}; "
        f"env {runtime_env} {audit_python} -m app.db.seed; "
        f"env {runtime_env} {audit_python} -m uvicorn app.main:app "
        f"--host 127.0.0.1 --port {state.security_probe_port} > {runtime_log} 2>&1 & "
        "runtime_pid=$!; "
        "( while kill -0 \"$parent_pid\" 2>/dev/null; do sleep 1; done; "
        "if kill -0 \"$runtime_pid\" 2>/dev/null; then kill \"$runtime_pid\"; fi ) & "
        "watchdog_pid=$!; cd ..; ready=false; "
        "for attempt in {1..60}; do "
        f"if curl -fsS {shlex.quote(base_url + '/api/v1/health')} >/dev/null 2>&1; "
        "then ready=true; break; fi; "
        "kill -0 \"$runtime_pid\" 2>/dev/null; sleep 1; done; "
        "[[ \"$ready\" == true ]]; "
        f"LOCAL_BASE_URL={shlex.quote(base_url)} INCLUDE_STAGING_SIM=false "
        f"PYTHON_BIN={audit_python} make -f scripts/Makefile security-contract-probe"
    )


def build_prod_readiness_phases(
    state: ProdReadinessRunState,
) -> list[ProdReadinessPhase]:
    meta_dir = shlex.quote(str(state.meta_dir))
    runtime_dir = shlex.quote(str(state.runtime_dir))
    config_path = shlex.quote(str(state.config_path))
    secret_dir = shlex.quote(str(state.secret_dir))
    backend_valid_env = shlex.quote(str(state.tmp_dir / "backend_valid.env"))
    frontend_invalid_host_env = shlex.quote(
        str(state.tmp_dir / "frontend_invalid_host.env")
    )
    frontend_invalid_container_env = shlex.quote(
        str(state.tmp_dir / "frontend_invalid_container.env")
    )
    reports_dir = shlex.quote(str(state.reports_dir))
    root_dir = shlex.quote(str(state.root_dir))
    postgres_container = shlex.quote(state.postgres_container)
    registry_container = shlex.quote(state.registry_container)
    runtime_env = f"RISKHUB_RUNTIME_DIR={runtime_dir}"
    deploy_common = f"--config {config_path} --secret-dir {secret_dir} --yes"
    backend_image_deploy = shlex.quote(state.backend_image_deploy)
    backend_db_image_deploy = shlex.quote(state.backend_db_image_deploy)
    frontend_image_deploy = shlex.quote(state.frontend_image_deploy)
    redis_image_deploy = shlex.quote(state.redis_image_deploy)
    backend_image_upgrade = shlex.quote(state.backend_image_upgrade)
    backend_db_image_upgrade = shlex.quote(state.backend_db_image_upgrade)
    frontend_image_upgrade = shlex.quote(state.frontend_image_upgrade)
    redis_image_upgrade = shlex.quote(state.redis_image_upgrade)
    deploy_ref_paths = {
        "backend": state.tmp_dir / "backend-image-deploy.ref",
        "backend_db": state.tmp_dir / "backend-db-image-deploy.ref",
        "frontend": state.tmp_dir / "frontend-image-deploy.ref",
        "redis": state.tmp_dir / "redis-image-deploy.ref",
    }
    upgrade_ref_paths = {
        "backend": state.tmp_dir / "backend-image-upgrade.ref",
        "backend_db": state.tmp_dir / "backend-db-image-upgrade.ref",
        "frontend": state.tmp_dir / "frontend-image-upgrade.ref",
        "redis": state.tmp_dir / "redis-image-upgrade.ref",
    }
    deploy_refs = {
        name: f'"$(cat {shlex.quote(str(path))})"'
        for name, path in deploy_ref_paths.items()
    }
    upgrade_refs = {
        name: f'"$(cat {shlex.quote(str(path))})"'
        for name, path in upgrade_ref_paths.items()
    }
    audit_venv = shlex.quote(str(state.audit_venv))
    audit_python = shlex.quote(str(state.audit_python))
    source_python = '"$RISKHUB_AUDIT_PYTHON"'
    backend_tests = (
        f"cd backend && {audit_python} -m pytest "
        "../tests/backend/pytest/test_production_hardening.py "
        "../tests/backend/pytest/test_security_headers.py "
        "../tests/backend/pytest/test_phase500_script_contracts.py "
        "../tests/backend/pytest/test_phase500_script_runtime_contracts.py "
        "../tests/backend/pytest/test_prod_readiness_grype_policy.py -q"
    )
    populate_audit_config = (
        f"{source_python} -m prod_readiness_audit.audit_inputs "
        f"--config-path {config_path} "
        f"--secret-dir {secret_dir} "
        f"--runtime-dir {runtime_dir} "
        f"--postgres-port {state.postgres_port} "
        f"--frontend-host-port {state.frontend_host_port}"
    )
    normalize_audit_permissions = (
        "if ! docker info --format '{{.OperatingSystem}}' | grep -Fq 'Docker Desktop'; then "
        "docker run --rm --entrypoint /bin/sh --user 0:0 "
        f"-v {secret_dir}:/audit-secrets "
        f"-v {runtime_dir}:/audit-runtime "
        "riskhub-backend-db:verify-prod-install-scripts -euc "
        + shlex.quote("chgrp -R 10001 /audit-secrets /audit-runtime")
        + "; fi && docker run --rm --entrypoint /bin/sh --user 0:0 "
        f"-v {secret_dir}:/audit-secrets:ro "
        f"-v {runtime_dir}:/audit-runtime:ro "
        "riskhub-backend-db:verify-prod-install-scripts -euc "
        + shlex.quote(
            'test -z "$(find /audit-secrets /audit-runtime -type d ! -perm 0750 -print -quit)"; '
            'test -z "$(find /audit-secrets /audit-runtime -type f ! -perm 0440 -print -quit)"; '
            'test -z "$(find /audit-secrets /audit-runtime -perm -0007 -print -quit)"'
        )
        + " && docker run --rm "
        f"-v {secret_dir}:/audit-secrets:ro "
        f"-v {runtime_dir}:/audit-runtime:ro "
        "riskhub-backend-db:verify-prod-install-scripts sh -euc "
        + shlex.quote(
            'for path in /audit-secrets/* /audit-runtime/*; do test -r "$path"; done'
        )
    )
    deploy_images = (
        ProdReadinessCommand(
            "p3_build_push_backend_deploy",
            f"docker build --target runtime -t {backend_image_deploy} backend && docker push {backend_image_deploy}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_backend_db_deploy",
            (
                f"docker build --target dbtasks -t {backend_db_image_deploy} backend "
                f"&& docker push {backend_db_image_deploy}"
            ),
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_frontend_deploy",
            f"docker build -t {frontend_image_deploy} frontend && docker push {frontend_image_deploy}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_redis_deploy",
            (
                f"docker build -t {redis_image_deploy} -f docker/redis/Dockerfile docker/redis "
                f"&& docker push {redis_image_deploy}"
            ),
            timeout_sec=3600,
        ),
    )
    upgrade_images = (
        ProdReadinessCommand(
            "p3_build_push_backend_upgrade",
            f"docker build --target runtime -t {backend_image_upgrade} backend && docker push {backend_image_upgrade}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_backend_db_upgrade",
            (
                f"docker build --target dbtasks -t {backend_db_image_upgrade} backend "
                f"&& docker push {backend_db_image_upgrade}"
            ),
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_frontend_upgrade",
            f"docker build -t {frontend_image_upgrade} frontend && docker push {frontend_image_upgrade}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_redis_upgrade",
            (
                f"docker build -t {redis_image_upgrade} -f docker/redis/Dockerfile docker/redis "
                f"&& docker push {redis_image_upgrade}"
            ),
            timeout_sec=3600,
        ),
    )
    return [
        ProdReadinessPhase(
            "metadata",
            (
                ProdReadinessCommand(
                    "meta_git_head", f"git rev-parse HEAD > {meta_dir}/git_head.txt"
                ),
                ProdReadinessCommand(
                    "meta_git_status_short",
                    f"git status --short > {meta_dir}/git_status_short.txt",
                ),
                ProdReadinessCommand(
                    "meta_python_version",
                    (
                        'if [ ! -x "$RISKHUB_AUDIT_PYTHON" ]; then '
                        "echo 'RISKHUB_PYTHON313_UNAVAILABLE' >&2; exit 1; fi; "
                        f"if ! {source_python} -c "
                        + shlex.quote(
                            "import sys; print(sys.executable); print(sys.version); "
                            "raise SystemExit(0 if sys.version_info[:2] == (3, 13) else 1)"
                        )
                        + f" > {meta_dir}/python_version.txt; then "
                        f"{source_python} --version >&2 || true; "
                        "echo 'RISKHUB_PYTHON313_VERSION_UNSUPPORTED' >&2; exit 1; fi"
                    ),
                ),
                ProdReadinessCommand(
                    "meta_node_version", f"node --version > {meta_dir}/node_version.txt"
                ),
                ProdReadinessCommand(
                    "meta_npm_version", f"npm --version > {meta_dir}/npm_version.txt"
                ),
            ),
        ),
        ProdReadinessPhase(
            "dependencies",
            (
                ProdReadinessCommand(
                    "bootstrap_backend_audit_venv",
                    (
                        f"{source_python} -m venv {audit_venv} && "
                        f"{audit_python} -m pip install "
                        "-c backend/requirements-prod-readiness-audit-constraints.txt "
                        "-r backend/requirements-dev.txt "
                        "'pip-audit==2.10.0'"
                    ),
                    timeout_sec=1800,
                ),
                ProdReadinessCommand(
                    "bootstrap_frontend_dependencies",
                    "cd frontend && npm ci --include=dev --legacy-peer-deps",
                    timeout_sec=1800,
                ),
            ),
        ),
        ProdReadinessPhase(
            "script_contracts",
            (
                ProdReadinessCommand(
                    "p2_verify_prod_install_scripts",
                    f"BACKEND_PYTHON={audit_python} make -f scripts/Makefile verify-prod-install-scripts",
                    timeout_sec=3600,
                ),
                ProdReadinessCommand(
                    "p2_security_contract_probe",
                    _security_contract_probe_command(state),
                    timeout_sec=1200,
                ),
                ProdReadinessCommand(
                    "p2_security_gap_round5",
                    f"BACKEND_PYTHON={audit_python} make -f scripts/Makefile security-gap-round5",
                    timeout_sec=1800,
                ),
                ProdReadinessCommand(
                    "p2_prod_guard_pytests", backend_tests, timeout_sec=1200
                ),
            ),
        ),
        ProdReadinessPhase(
            "operator_lifecycle",
            (
                ProdReadinessCommand(
                    "p2_deploy_cli_init",
                    f"{runtime_env} ./scripts/deploy.sh init --target docker {deploy_common}",
                    timeout_sec=600,
                ),
                ProdReadinessCommand(
                    "p2_populate_audit_config", populate_audit_config, timeout_sec=120
                ),
                ProdReadinessCommand(
                    "p2_normalize_audit_runtime_permissions",
                    normalize_audit_permissions,
                    timeout_sec=300,
                ),
                ProdReadinessCommand(
                    "p2_unsupported_prod_artifacts_absent",
                    (
                        "test ! -e 'docs/deployment/docker-compose-prod.md' "
                        "&& test ! -e 'docs/deployment/kubernetes.md' "
                        "&& test ! -e 'docs/deployment/installation-manual.md' "
                        "&& test ! -e 'docs/deployment/external-postgres-install-scripts.md' "
                        "&& test ! -e 'docs/deployment/component-runtime-entrypoints.md' "
                        "&& test ! -e 'scripts/prod/setup.sh' "
                        "&& test ! -e 'scripts/prod/deploy.sh' "
                        "&& test ! -e 'scripts/prod/upgrade.sh' "
                        "&& test ! -e 'scripts/prod/stop.sh' "
                        "&& test ! -e 'docker-compose.prod.yml'"
                    ),
                    required=False,
                ),
                ProdReadinessCommand(
                    "p2_preflight_invalid_host_range",
                    (
                        f"scripts/prod/preflight.sh --backend-env {backend_valid_env} "
                        f"--frontend-env {frontend_invalid_host_env} --yes"
                    ),
                    required=False,
                    timeout_sec=300,
                ),
                ProdReadinessCommand(
                    "p2_preflight_invalid_container_port",
                    (
                        f"scripts/prod/preflight.sh --backend-env {backend_valid_env} "
                        f"--frontend-env {frontend_invalid_container_env} --yes"
                    ),
                    required=False,
                    timeout_sec=300,
                ),
                ProdReadinessCommand(
                    "p3_cleanup_riskhub-frontend",
                    _graceful_container_cleanup("riskhub-frontend"),
                    required=False,
                ),
                ProdReadinessCommand(
                    "p3_cleanup_riskhub-backend",
                    _graceful_container_cleanup("riskhub-backend"),
                    required=False,
                ),
                ProdReadinessCommand(
                    "p3_cleanup_riskhub-backend-scheduler",
                    _graceful_container_cleanup("riskhub-backend-scheduler"),
                    required=False,
                ),
                ProdReadinessCommand(
                    "p3_cleanup_riskhub-redis",
                    _graceful_container_cleanup("riskhub-redis"),
                    required=False,
                ),
                ProdReadinessCommand(
                    f"p3_cleanup_{state.postgres_container}",
                    _graceful_container_cleanup(postgres_container),
                    required=False,
                ),
                ProdReadinessCommand(
                    f"p3_cleanup_{state.registry_container}",
                    _graceful_container_cleanup(registry_container),
                    required=False,
                ),
                ProdReadinessCommand(
                    "p3_start_postgres",
                    (
                        f"docker run -d --name {postgres_container} "
                        "-e POSTGRES_USER=riskhub -e POSTGRES_PASSWORD=riskhub_audit "
                        f"-e POSTGRES_DB=riskhub -p {state.postgres_port}:5432 postgres:16"
                    ),
                    timeout_sec=300,
                ),
                ProdReadinessCommand(
                    "p3_wait_postgres",
                    (
                        "bash -lc "
                        + shlex.quote(
                            (
                                "for i in {1..60}; do "
                                f"docker exec {state.postgres_container} pg_isready -U riskhub >/dev/null 2>&1 "
                                "&& exit 0; sleep 1; done; exit 1"
                            )
                        )
                    ),
                ),
                ProdReadinessCommand(
                    "p3_start_registry",
                    f"docker run -d --name {registry_container} -p {state.registry_port}:5000 registry:2",
                    timeout_sec=300,
                ),
                ProdReadinessCommand(
                    "p3_wait_registry",
                    (
                        "bash -lc "
                        + shlex.quote(
                            (
                                "for i in {1..30}; do "
                                f"curl -fsS http://{state.local_registry}/v2/ >/dev/null 2>&1 "
                                "&& exit 0; sleep 1; done; exit 1"
                            )
                        )
                    ),
                ),
                *deploy_images,
                ProdReadinessCommand(
                    "p3_resolve_deploy_image_digests",
                    _repo_digest_resolution_command(
                        (
                            (
                                state.backend_image_deploy,
                                str(deploy_ref_paths["backend"]),
                            ),
                            (
                                state.backend_db_image_deploy,
                                str(deploy_ref_paths["backend_db"]),
                            ),
                            (
                                state.frontend_image_deploy,
                                str(deploy_ref_paths["frontend"]),
                            ),
                            (state.redis_image_deploy, str(deploy_ref_paths["redis"])),
                        )
                    ),
                    timeout_sec=600,
                ),
                ProdReadinessCommand(
                    "p3_cli_preflight",
                    f"{runtime_env} ./scripts/deploy.sh preflight --target docker {deploy_common}",
                    timeout_sec=600,
                ),
                ProdReadinessCommand(
                    "p3_cli_deploy",
                    (
                        f"{runtime_env} ./scripts/deploy.sh deploy --target docker {deploy_common} "
                        f"--backend-image {deploy_refs['backend']} --backend-db-image {deploy_refs['backend_db']} "
                        f"--frontend-image {deploy_refs['frontend']} --redis-image {deploy_refs['redis']}"
                    ),
                    timeout_sec=3600,
                ),
                ProdReadinessCommand(
                    "p3_status_after_deploy",
                    "./scripts/deploy.sh status --target docker",
                    timeout_sec=300,
                ),
                ProdReadinessCommand(
                    "p3_verify_runtime",
                    "scripts/prod/verify_runtime.sh",
                    timeout_sec=300,
                ),
                ProdReadinessCommand(
                    "p3_cli_smoke_after_deploy",
                    f"{runtime_env} ./scripts/deploy.sh smoke --target docker {deploy_common}",
                    timeout_sec=600,
                ),
                *upgrade_images,
                ProdReadinessCommand(
                    "p3_resolve_upgrade_image_digests",
                    _repo_digest_resolution_command(
                        (
                            (
                                state.backend_image_upgrade,
                                str(upgrade_ref_paths["backend"]),
                            ),
                            (
                                state.backend_db_image_upgrade,
                                str(upgrade_ref_paths["backend_db"]),
                            ),
                            (
                                state.frontend_image_upgrade,
                                str(upgrade_ref_paths["frontend"]),
                            ),
                            (
                                state.redis_image_upgrade,
                                str(upgrade_ref_paths["redis"]),
                            ),
                        )
                    ),
                    timeout_sec=600,
                ),
                ProdReadinessCommand(
                    "p3_cli_upgrade",
                    (
                        f"{runtime_env} ./scripts/deploy.sh upgrade --target docker {deploy_common} "
                        f"--backend-image {upgrade_refs['backend']} --backend-db-image {upgrade_refs['backend_db']} "
                        f"--frontend-image {upgrade_refs['frontend']} --redis-image {upgrade_refs['redis']}"
                    ),
                    timeout_sec=3600,
                ),
                ProdReadinessCommand(
                    "p3_cli_rollback",
                    f"{runtime_env} ./scripts/deploy.sh rollback --target docker {deploy_common} --service all",
                    timeout_sec=1800,
                ),
                ProdReadinessCommand(
                    "p3_cli_smoke_after_rollback",
                    f"{runtime_env} ./scripts/deploy.sh smoke --target docker {deploy_common}",
                    timeout_sec=600,
                ),
                ProdReadinessCommand(
                    "p3_backend_docs_code",
                    _backend_http_code_command("/docs"),
                ),
                ProdReadinessCommand(
                    "p3_backend_openapi_code",
                    _backend_http_code_command("/openapi.json"),
                ),
                ProdReadinessCommand(
                    "p3_scheduler_ps",
                    "docker exec riskhub-backend-scheduler sh -lc "
                    + shlex.quote("ps -eo pid,comm,args | grep uvicorn | grep -v grep"),
                ),
                ProdReadinessCommand(
                    "p3_frontend_uid", "docker exec riskhub-frontend id -u"
                ),
                ProdReadinessCommand(
                    "p3_postgres_logs",
                    f"docker logs {postgres_container}",
                    required=False,
                ),
            ),
        ),
        ProdReadinessPhase(
            "supply_chain",
            (
                ProdReadinessCommand(
                    "p4_bandit_high_gate",
                    (
                        f"cd backend && {audit_python} -m bandit --ini .bandit -r app -f json "
                        f"-o {reports_dir}/bandit.json --severity-level high"
                    ),
                    timeout_sec=1200,
                ),
                ProdReadinessCommand(
                    "p4_pip_audit",
                    (
                        f"cd backend && {audit_python} -m pip_audit -r requirements.txt --format json "
                        f"--output {reports_dir}/pip-audit.json"
                    ),
                    timeout_sec=1200,
                ),
                ProdReadinessCommand(
                    "p4_npm_audit_high",
                    (
                        f"set +e; (cd frontend && npm audit --audit-level=high --json "
                        f"> {reports_dir}/npm-audit.json); audit_rc=$?; set -e; "
                        'test "$audit_rc" -le 1; '
                        f"{audit_python} scripts/security/prod_readiness_audit/npm_audit_policy.py "
                        f"--raw-report {reports_dir}/npm-audit.json "
                        "--policy scripts/security/prod_readiness_audit/npm-audit-policy.json "
                        f"--filtered-report {reports_dir}/npm-audit-filtered.json"
                    ),
                    timeout_sec=1200,
                ),
                ProdReadinessCommand(
                    "p4_trivy_backend",
                    (
                        "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "
                        f"-v {reports_dir}:/out {TRIVY_IMAGE} image --severity HIGH,CRITICAL "
                        f"--format json -o /out/trivy-backend.json {backend_image_upgrade}"
                    ),
                    timeout_sec=1800,
                ),
                ProdReadinessCommand(
                    "p4_trivy_frontend",
                    (
                        "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "
                        f"-v {reports_dir}:/out {TRIVY_IMAGE} image --severity HIGH,CRITICAL "
                        f"--format json -o /out/trivy-frontend.json {frontend_image_upgrade}"
                    ),
                    timeout_sec=1800,
                ),
                ProdReadinessCommand(
                    "p4_syft_backend",
                    (
                        "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "
                        f"-v {reports_dir}:/out {SYFT_IMAGE} {backend_image_upgrade} "
                        "-o json=/out/sbom-backend.json"
                    ),
                    timeout_sec=1800,
                ),
                ProdReadinessCommand(
                    "p4_validate_grype_policy",
                    (
                        f"{audit_python} -m prod_readiness_audit.grype_policy "
                        "--policy backend/security/grype-ignore.yaml"
                    ),
                ),
                ProdReadinessCommand(
                    "p4_grype_backend",
                    (
                        f"docker run --rm -v {root_dir}:/repo -v {reports_dir}:/out -w /repo "
                        f"{GRYPE_IMAGE} sbom:/out/sbom-backend.json "
                        "--config /repo/backend/security/grype-ignore.yaml "
                        "-o json=/out/grype-backend.json"
                    ),
                    timeout_sec=1800,
                ),
                ProdReadinessCommand(
                    "p4_gitleaks_parse_gate",
                    (
                        f"docker run --rm -v {root_dir}:/repo -w /repo --entrypoint /bin/sh "
                        f"{GITLEAKS_IMAGE} -lc "
                        + shlex.quote(
                            "mkdir -p /tmp/gitleaks-empty && "
                            "gitleaks detect --source /tmp/gitleaks-empty --no-git --config .gitleaks.toml "
                            "--report-format json --report-path /tmp/gitleaks-parse.json --exit-code 0"
                        )
                    ),
                    timeout_sec=600,
                ),
                ProdReadinessCommand(
                    "p4_gitleaks_scan",
                    (
                        f"docker run --rm -v {root_dir}:/repo -v {reports_dir}:/out -w /repo --entrypoint /bin/sh "
                        f"{GITLEAKS_IMAGE} -lc "
                        + shlex.quote(
                            "gitleaks detect --source /repo --no-git --config .gitleaks.toml "
                            "--report-format json --report-path /out/gitleaks-report.json --exit-code 1"
                        )
                    ),
                    timeout_sec=1200,
                ),
            ),
        ),
        ProdReadinessPhase(
            "cleanup",
            (
                ProdReadinessCommand(
                    "cleanup_final_riskhub-frontend",
                    _graceful_container_cleanup("riskhub-frontend"),
                ),
                ProdReadinessCommand(
                    "cleanup_final_riskhub-backend",
                    _graceful_container_cleanup("riskhub-backend"),
                ),
                ProdReadinessCommand(
                    "cleanup_final_riskhub-backend-scheduler",
                    _graceful_container_cleanup("riskhub-backend-scheduler"),
                ),
                ProdReadinessCommand(
                    "cleanup_final_riskhub-redis",
                    _graceful_container_cleanup("riskhub-redis"),
                ),
                ProdReadinessCommand(
                    f"cleanup_final_{state.postgres_container}",
                    _graceful_container_cleanup(postgres_container),
                ),
                ProdReadinessCommand(
                    f"cleanup_final_{state.registry_container}",
                    _graceful_container_cleanup(registry_container),
                ),
            ),
        ),
        ProdReadinessPhase(
            "non_blocking_environment_probes",
            (
                ProdReadinessCommand(
                    "meta_docker_version", "docker version", required=False
                ),
                ProdReadinessCommand("meta_docker_info", "docker info", required=False),
            ),
        ),
    ]
