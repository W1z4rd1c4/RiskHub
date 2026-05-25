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


def build_prod_readiness_phases(state: ProdReadinessRunState) -> list[ProdReadinessPhase]:
    meta_dir = shlex.quote(str(state.meta_dir))
    runtime_dir = shlex.quote(str(state.runtime_dir))
    config_path = shlex.quote(str(state.config_path))
    secret_dir = shlex.quote(str(state.secret_dir))
    backend_valid_env = shlex.quote(str(state.tmp_dir / "backend_valid.env"))
    frontend_invalid_host_env = shlex.quote(str(state.tmp_dir / "frontend_invalid_host.env"))
    frontend_invalid_container_env = shlex.quote(str(state.tmp_dir / "frontend_invalid_container.env"))
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
    backend_tests = (
        "cd backend && ./venv/bin/pytest "
        "../tests/backend/pytest/test_production_hardening.py "
        "../tests/backend/pytest/test_security_headers.py "
        "../tests/backend/pytest/test_phase500_script_contracts.py "
        "../tests/backend/pytest/test_phase500_script_runtime_contracts.py -q"
    )
    populate_audit_config = (
        "python3 -m prod_readiness_audit.audit_inputs "
        f"--config-path {config_path} "
        f"--secret-dir {secret_dir} "
        f"--runtime-dir {runtime_dir} "
        f"--postgres-port {state.postgres_port} "
        f"--frontend-host-port {state.frontend_host_port}"
    )
    deploy_images = (
        ProdReadinessCommand(
            "p3_build_push_backend_deploy",
            f"docker build --target runtime -t {backend_image_deploy} backend && docker push {backend_image_deploy}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_backend_db_deploy",
            f"docker build --target dbtasks -t {backend_db_image_deploy} backend && docker push {backend_db_image_deploy}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_frontend_deploy",
            f"docker build -t {frontend_image_deploy} frontend && docker push {frontend_image_deploy}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_redis_deploy",
            f"docker build -t {redis_image_deploy} -f docker/redis/Dockerfile docker/redis && docker push {redis_image_deploy}",
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
            f"docker build --target dbtasks -t {backend_db_image_upgrade} backend && docker push {backend_db_image_upgrade}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_frontend_upgrade",
            f"docker build -t {frontend_image_upgrade} frontend && docker push {frontend_image_upgrade}",
            timeout_sec=3600,
        ),
        ProdReadinessCommand(
            "p3_build_push_redis_upgrade",
            f"docker build -t {redis_image_upgrade} -f docker/redis/Dockerfile docker/redis && docker push {redis_image_upgrade}",
            timeout_sec=3600,
        ),
    )
    return [
        ProdReadinessPhase(
            "metadata",
            (
                ProdReadinessCommand("meta_git_head", f"git rev-parse HEAD > {meta_dir}/git_head.txt"),
                ProdReadinessCommand(
                    "meta_git_status_short",
                    f"git status --short --branch > {meta_dir}/git_status_short.txt",
                ),
                ProdReadinessCommand("meta_python_version", f"python3 --version > {meta_dir}/python_version.txt"),
                ProdReadinessCommand("meta_node_version", f"node --version > {meta_dir}/node_version.txt"),
                ProdReadinessCommand("meta_npm_version", f"npm --version > {meta_dir}/npm_version.txt"),
            ),
        ),
        ProdReadinessPhase(
            "script_contracts",
            (
                ProdReadinessCommand(
                    "p2_verify_prod_install_scripts",
                    "make -f scripts/Makefile verify-prod-install-scripts",
                    timeout_sec=3600,
                ),
                ProdReadinessCommand(
                    "p2_security_contract_probe",
                    "make -f scripts/Makefile security-contract-probe",
                    timeout_sec=1200,
                ),
                ProdReadinessCommand(
                    "p2_security_gap_round5",
                    "make -f scripts/Makefile security-gap-round5",
                    timeout_sec=1800,
                ),
                ProdReadinessCommand("p2_prod_guard_pytests", backend_tests, timeout_sec=1200),
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
                ProdReadinessCommand("p2_populate_audit_config", populate_audit_config, timeout_sec=120),
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
                    "docker rm -f riskhub-frontend",
                    required=False,
                ),
                ProdReadinessCommand(
                    "p3_cleanup_riskhub-backend",
                    "docker rm -f riskhub-backend",
                    required=False,
                ),
                ProdReadinessCommand(
                    "p3_cleanup_riskhub-backend-scheduler",
                    "docker rm -f riskhub-backend-scheduler",
                    required=False,
                ),
                ProdReadinessCommand(
                    "p3_cleanup_riskhub-redis",
                    "docker rm -f riskhub-redis",
                    required=False,
                ),
                ProdReadinessCommand(
                    f"p3_cleanup_{state.postgres_container}",
                    f"docker rm -f {postgres_container}",
                    required=False,
                ),
                ProdReadinessCommand(
                    f"p3_cleanup_{state.registry_container}",
                    f"docker rm -f {registry_container}",
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
                    "p3_cli_preflight",
                    f"{runtime_env} ./scripts/deploy.sh preflight --target docker {deploy_common}",
                    timeout_sec=600,
                ),
                ProdReadinessCommand(
                    "p3_cli_deploy",
                    (
                        f"{runtime_env} ./scripts/deploy.sh deploy --target docker {deploy_common} "
                        f"--backend-image {backend_image_deploy} --backend-db-image {backend_db_image_deploy} "
                        f"--frontend-image {frontend_image_deploy} --redis-image {redis_image_deploy}"
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
                    "p3_cli_upgrade",
                    (
                        f"{runtime_env} ./scripts/deploy.sh upgrade --target docker {deploy_common} "
                        f"--backend-image {backend_image_upgrade} --backend-db-image {backend_db_image_upgrade} "
                        f"--frontend-image {frontend_image_upgrade} --redis-image {redis_image_upgrade}"
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
                    "docker exec riskhub-backend curl -sS -H 'Host: riskhub.example.com' "
                    '-o /dev/null -w "%{http_code}" http://localhost:8000/docs',
                ),
                ProdReadinessCommand(
                    "p3_backend_openapi_code",
                    "docker exec riskhub-backend curl -sS -H 'Host: riskhub.example.com' "
                    '-o /dev/null -w "%{http_code}" http://localhost:8000/openapi.json',
                ),
                ProdReadinessCommand(
                    "p3_scheduler_ps",
                    "docker exec riskhub-backend-scheduler sh -lc "
                    + shlex.quote("ps -eo pid,comm,args | grep uvicorn | grep -v grep"),
                ),
                ProdReadinessCommand("p3_frontend_uid", "docker exec riskhub-frontend id -u"),
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
                    f"cd backend && ./venv/bin/bandit --ini .bandit -r app -f json -o {reports_dir}/bandit.json --severity-level high",
                    timeout_sec=1200,
                ),
                ProdReadinessCommand(
                    "p4_pip_audit",
                    f"cd backend && ./venv/bin/python -m pip_audit -r requirements.txt --format json --output {reports_dir}/pip-audit.json",
                    timeout_sec=1200,
                ),
                ProdReadinessCommand(
                    "p4_npm_audit_high",
                    f"cd frontend && npm audit --audit-level=high --json > {reports_dir}/npm-audit.json",
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
                            "gitleaks detect --source /repo --config .gitleaks.toml "
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
                ProdReadinessCommand("cleanup_final_riskhub-frontend", "docker rm -f riskhub-frontend", required=False),
                ProdReadinessCommand("cleanup_final_riskhub-backend", "docker rm -f riskhub-backend", required=False),
                ProdReadinessCommand(
                    "cleanup_final_riskhub-backend-scheduler",
                    "docker rm -f riskhub-backend-scheduler",
                    required=False,
                ),
                ProdReadinessCommand("cleanup_final_riskhub-redis", "docker rm -f riskhub-redis", required=False),
                ProdReadinessCommand(
                    f"cleanup_final_{state.postgres_container}",
                    f"docker rm -f {postgres_container}",
                    required=False,
                ),
                ProdReadinessCommand(
                    f"cleanup_final_{state.registry_container}",
                    f"docker rm -f {registry_container}",
                    required=False,
                ),
            ),
        ),
        ProdReadinessPhase(
            "non_blocking_environment_probes",
            (
                ProdReadinessCommand("meta_docker_version", "docker version", required=False),
                ProdReadinessCommand("meta_docker_info", "docker info", required=False),
            ),
        ),
    ]
