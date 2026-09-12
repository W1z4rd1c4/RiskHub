"""Both managed targets consume the same intended native identity profile."""

from __future__ import annotations

import base64
import json
import subprocess
import sys
from pathlib import Path

import pytest

from tests.backend.pytest.test_deploy_renderer_contracts import (
    RENDERER,
    REPO_ROOT,
    _parse_env,
    _source_shell_assignments,
    _write_config,
    _write_secrets,
)


def native_files(tmp_path: Path, **overrides: str) -> tuple[Path, Path]:
    config, secrets = tmp_path / "riskhub.env", tmp_path / "secrets"
    _write_config(
        config,
        AUTH_MODE="password",
        DIRECTORY_PROVIDER="none",
        ENTRA_TENANT_ID="",
        ENTRA_CLIENT_ID="",
        LOCAL_SMTP_HOST="smtp.example.com",
        LOCAL_SMTP_SENDER="riskhub@example.com",
        LOCAL_SMTP_USERNAME="riskhub",
        **overrides,
    )
    _write_secrets(secrets)
    (secrets / "entra_client_secret").unlink()
    for name, payload in {
        "local_auth_keyring": {
            "version": 1,
            "purposes": {
                purpose: {
                    "active": "v1",
                    "keys": {"v1": base64.b64encode(bytes([i]) * 32).decode()},
                }
                for i, purpose in enumerate(("delivery", "totp", "action"), 1)
            },
        },
        "local_recovery_approvers": {
            "version": 1,
            "approvers": [
                {
                    "id": str(i),
                    "name": f"Operator {i}",
                    "public_key": base64.b64encode(bytes([i]) * 32).decode(),
                }
                for i in (4, 5)
            ],
        },
    }.items():
        path = secrets / name
        path.write_text(json.dumps(payload))
        path.chmod(0o600)
    password = secrets / "local_smtp_password"
    password.write_text("test-mail-secret\n")
    password.chmod(0o600)
    return config, secrets


@pytest.mark.parametrize("target", ["docker", "linux"])
@pytest.mark.parametrize("policy", ["required", "optional"])
def test_native_renderer_without_entra_inputs(tmp_path, target, policy):
    config, secrets = native_files(tmp_path, LOCAL_MFA_POLICY=policy)
    out, runtime = tmp_path / "out", tmp_path / "runtime"
    result = subprocess.run(
        [
            sys.executable,
            str(RENDERER),
            "write-runtime",
            "--config",
            str(config),
            "--target",
            target,
            "--secret-dir",
            str(secrets),
            "--runtime-dir",
            str(runtime),
            "--out-dir",
            str(out),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    env = _parse_env(out / "backend.env")
    assert env["AUTH_MODE"] == "password" and env["DIRECTORY_PROVIDER"] == "none"
    assert env["LOCAL_MFA_POLICY"] == policy
    assert env["PUBLIC_URL"] == "https://riskhub.example.com"
    assert env["DEBUG"] == env["MOCK_AUTH_ENABLED"] == "false"
    assert env["REFRESH_TOKEN_MIGRATION_GRACE"] == "false"
    assert env["ACCESS_TOKEN_EXPIRE_MINUTES"] == "30"
    assert env["PLATFORM_ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES"] == "15"
    for key in (
        "ENTRA_TENANT_ID",
        "ENTRA_CLIENT_ID",
        "ENTRA_CLIENT_SECRET_FILE",
        "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE",
        "AD_EMULATOR_BASE_URL",
    ):
        assert key not in env
    assert env["LOCAL_AUTH_KEYRING_FILE"] == str(secrets / "local_auth_keyring")
    assert env["LOCAL_RECOVERY_APPROVERS_FILE"] == str(
        secrets / "local_recovery_approvers"
    )
    assert env["LOCAL_SMTP_PASSWORD_FILE"] == str(secrets / "local_smtp_password")
    assert (
        "test-mail-secret"
        not in result.stdout + result.stderr + (out / "backend.env").read_text()
    )
    meta = _source_shell_assignments(
        out / "metadata.env", "AUTH_MODE", "DIRECTORY_PROVIDER", "LOCAL_MFA_POLICY"
    )
    assert meta == {
        "AUTH_MODE": "password",
        "DIRECTORY_PROVIDER": "none",
        "LOCAL_MFA_POLICY": policy,
    }


def renderer(command, *args):
    return subprocess.run(
        [sys.executable, str(RENDERER), command, *map(str, args)],
        capture_output=True,
        text=True,
    )


@pytest.mark.parametrize(
    "setting",
    [
        "PUBLIC_URL=http://riskhub.example.com",
        "PUBLIC_URL=https://riskhub.example.com/a",
        "PUBLIC_URL=https://riskhub.example.com;bad",
        "PUBLIC_URL=https://riskhub.example.com\tbad",
        "ENTRA_CLIENT_SECRET_FILE=/unused/operator-secret",
        "ENTRA_TENANT_ID=another-tenant",
        "DIRECTORY_PROVIDER=graph",
        "DEBUG=true",
        "MOCK_AUTH_ENABLED=true",
        "ENTRA_JIT_PROVISIONING_ENABLED=true",
        "AUTH_SSO_ALLOW_EMAIL_LINK=true",
        "USER_MANAGEMENT_MODE=custom",
        "AUTH_PROVIDER=local",
        "LOCAL_MFA_POLICY=disabled",
        "LOCAL_KDF_MEMORY_BUDGET_MIB=128",
        "LOCAL_SMTP_SECURITY=plain",
        'TRUSTED_PROXIES=["*"]',
        "SECRET_KEY=must-stay-in-file",
        "LOCAL_SMTP_PASSWORD=must-stay-in-file",
    ],
)
def test_invalid_native_config_fails_before_output(tmp_path, setting):
    config, secrets = native_files(tmp_path)
    key, value = setting.split("=", 1)
    lines = [
        line
        for line in config.read_text().splitlines()
        if not line.startswith(key + "=")
    ]
    config.write_text("\n".join([*lines, setting]) + "\n")
    result = renderer(
        "show-json", "--config", config, "--target", "docker", "--secret-dir", secrets
    )
    assert result.returncode != 0
    assert not result.stdout and "test-mail-secret" not in result.stderr


def test_duplicate_profile_key_is_refused(tmp_path):
    config, _ = native_files(tmp_path)
    config.write_text(config.read_text() + "AUTH_MODE=microsoft_sso\n")
    result = renderer("identity-choice", "--config", config)
    assert result.returncode != 0 and "duplicate" in result.stderr


@pytest.mark.parametrize("setting", [
    'CORS_ORIGINS=["https://wrong.example.com"]', 'ALLOWED_HOSTS=["wrong.example.com"]',
    'LOCAL_AUTH_KEYRING_FILE=/different/keyring', 'ENTRA_CREDENTIAL_FINGERPRINT=unused-active-credential',
])
def test_explicit_runtime_config_cannot_be_silently_replaced(tmp_path, setting):
    config, secrets = native_files(tmp_path)
    config.write_text(config.read_text() + setting + "\n")
    result = renderer("show-json", "--config", config, "--target", "docker", "--secret-dir", secrets)
    assert result.returncode != 0 and not result.stdout


def test_weak_jwt_default_is_rejected_before_service_replacement(tmp_path):
    config, secrets = native_files(tmp_path)
    (secrets / "secret_key").chmod(0o600)
    (secrets / "secret_key").write_text("dev-secret-key-not-for-production-use")
    result = renderer("show-json", "--config", config, "--target", "docker", "--secret-dir", secrets)
    assert result.returncode != 0 and "blocked weak default" in result.stderr
    assert "dev-secret-key-not-for-production-use" not in result.stderr


def test_actual_native_scaffold_resume_never_replaces_keys(tmp_path):
    import os

    config, secret_dir = tmp_path / "riskhub.env", tmp_path / "secrets"
    env = {**os.environ, "RISKHUB_RUNTIME_DIR": str(tmp_path / "runtime")}
    common = ["--target", "docker", "--config", str(config), "--secret-dir", str(secret_dir)]
    first = subprocess.run([str(REPO_ROOT / "scripts/deploy.sh"), "init", *common,
                            "--user-management", "custom", "--mfa-policy", "optional"],
                           env=env, capture_output=True, text=True)
    assert first.returncode == 0, first.stderr
    before = {p.name: p.read_bytes() for p in secret_dir.iterdir()}
    second = subprocess.run([str(REPO_ROOT / "scripts/deploy.sh"), "secrets-init", *common],
                            env=env, capture_output=True, text=True)
    assert second.returncode == 0, second.stderr
    assert before == {p.name: p.read_bytes() for p in secret_dir.iterdir()}
    assert not any(name.startswith("entra") for name in before)
    assert "LOCAL_MFA_POLICY=optional" in config.read_text()


def test_fresh_and_recorded_identity_choices(tmp_path):
    import importlib

    sys.path.insert(0, str(REPO_ROOT / "scripts"))
    identity = importlib.import_module("install_lib.production_identity")
    common = importlib.import_module("install_lib.common")
    options = common.SharedOptions(yes=True)
    config = tmp_path / "riskhub.env"
    assert identity.select_identity(
        config, user_management=None, mfa_policy=None, options=options
    ) == ("entra", "required")
    assert identity.select_identity(
        config, user_management="custom", mfa_policy="optional", options=options
    ) == ("custom", "optional")
    config, _ = native_files(tmp_path, LOCAL_MFA_POLICY="optional")
    assert identity.select_identity(
        config, user_management=None, mfa_policy=None, options=options
    ) == ("custom", "optional")
    with pytest.raises(RuntimeError, match="conflicts"):
        identity.select_identity(
            config, user_management="entra", mfa_policy=None, options=options
        )
    with pytest.raises(RuntimeError, match="conflicts"):
        identity.select_identity(
            config, user_management=None, mfa_policy="required", options=options
        )


def test_empty_scaffold_is_not_an_installed_release(tmp_path):
    import importlib

    sys.path.insert(0, str(REPO_ROOT / "scripts"))
    common = importlib.import_module("install_lib.common")
    releases = importlib.import_module("install_lib.production_release")
    paths = common.get_paths()
    config, secrets = native_files(tmp_path)
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    assert not releases.production_existing_install_detected(
        config, secrets, runtime, paths
    )
    (runtime / "backend.env").write_text(config.read_text())
    assert releases.production_existing_install_detected(
        config, secrets, runtime, paths
    )


@pytest.mark.parametrize("failure", ["ownership", "candidate"])
def test_linux_candidate_failure_keeps_running_services_and_runtime_config(
    tmp_path, failure
):
    import shlex

    config, _ = native_files(tmp_path)
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    log = tmp_path / "calls"
    # Exercise the actual candidate/deploy control flow; privileged host operations
    # are captured, and the candidate checker deliberately refuses compatibility.
    script = f"""
set -euo pipefail
source {shlex.quote(str(REPO_ROOT / 'scripts/deploy/lib/common.sh'))}
source {shlex.quote(str(REPO_ROOT / 'scripts/deploy/lib/linux.sh'))}
LINUX_CURRENT_LINK={shlex.quote(str(tmp_path / 'current'))}
LINUX_RELEASES_DIR={shlex.quote(str(tmp_path / 'releases'))}
require_file() {{ :; }}
linux_preflight() {{ :; }}
confirm_or_die() {{ :; }}
bundle_version() {{ echo test; }}
linux_install_release() {{ :; }}
linux_install_venvs() {{ :; }}
make_runtime_dir() {{ echo {shlex.quote(str(candidate))}; }}
cleanup_runtime_dir() {{ echo cleanup >> {shlex.quote(str(log))}; }}
run_privileged() {{
  echo "$*" >> {shlex.quote(str(log))}
  if [[ "$1" == chown ]]; then return {83 if failure == 'ownership' else 0}; fi
}}
linux_run_release_command() {{ echo candidate >> {shlex.quote(str(log))}; return 74; }}
linux_render_runtime_files() {{ echo REPLACED >> {shlex.quote(str(log))}; }}
linux_deploy_or_upgrade deploy {shlex.quote(str(config))} unused.tar.gz
"""
    result = subprocess.run(["bash", "-c", script], capture_output=True, text=True)
    assert result.returncode == (83 if failure == "ownership" else 74), result.stderr
    calls = log.read_text()
    assert "REPLACED" not in calls and "systemctl" not in calls
    assert calls.count("cleanup") == 1


def test_native_policy_preserved_and_authority_switch_refused(tmp_path):
    config, _ = native_files(tmp_path, LOCAL_MFA_POLICY="optional")
    installed = tmp_path / "installed.env"
    installed.write_text(config.read_text())
    assert renderer("identity-choice", "--config", config).stdout.strip() == "custom"
    assert (
        renderer(
            "validate-transition", "--config", config, "--installed", installed
        ).returncode
        == 0
    )
    config.write_text(
        config.read_text()
        .replace("AUTH_MODE=password", "AUTH_MODE=microsoft_sso")
        .replace("DIRECTORY_PROVIDER=none", "DIRECTORY_PROVIDER=graph")
    )
    result = renderer(
        "validate-transition", "--config", config, "--installed", installed
    )
    assert result.returncode != 0 and "switching is unsupported" in result.stderr
    config.unlink()
    assert (
        renderer(
            "validate-transition", "--config", config, "--installed", installed
        ).returncode
        != 0
    )


def test_native_secret_scaffold_preserves_existing_keys_and_unused_entra_files(
    tmp_path,
):
    config, secrets = native_files(tmp_path)
    unrelated = secrets / "entra_client_secret"
    unrelated.write_text("unused-operator-value")
    before = {p.name: p.read_bytes() for p in secrets.iterdir()}
    result = renderer("init-local-secrets", "--secret-dir", secrets)
    assert result.returncode == 0
    assert {p.name: p.read_bytes() for p in secrets.iterdir()} == before
    rendered = renderer(
        "write-runtime",
        "--config",
        config,
        "--target",
        "docker",
        "--secret-dir",
        secrets,
        "--out-dir",
        tmp_path / "out",
    )
    assert rendered.returncode == 0, rendered.stderr
    mounts = renderer(
        "secret-mount-paths", "--config", tmp_path / "out" / "backend.env"
    )
    assert mounts.returncode == 0 and str(unrelated) not in mounts.stdout
    assert str(secrets / "local_auth_keyring") in mounts.stdout


@pytest.mark.parametrize("target", ["docker", "linux"])
def test_native_source_admission_remains_closed(tmp_path, target):
    config, _ = native_files(tmp_path, LOCAL_MFA_POLICY="optional")
    result = subprocess.run(
        [
            str(REPO_ROOT / "scripts" / "deploy.sh"),
            "deploy",
            "--target",
            target,
            "--config",
            str(config),
            "--yes",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0 and "#208" in result.stderr
    assert "Pulling" not in result.stdout


@pytest.mark.parametrize("failure_stage", ["candidate", "bootstrap"])
def test_linux_failed_install_retries_same_bundle_without_losing_identity(tmp_path, failure_stage):
    import shlex

    from tests.backend.pytest.test_deploy_cli_contracts import _make_linux_bundle

    config, _ = native_files(tmp_path)
    bundle = _make_linux_bundle(tmp_path, "test-retry")
    root = tmp_path / "installed"
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    handoff = tmp_path / "admin-handoff"
    script = f"""
set -euo pipefail
source {shlex.quote(str(REPO_ROOT / 'scripts/deploy/lib/common.sh'))}
source {shlex.quote(str(REPO_ROOT / 'scripts/deploy/lib/linux.sh'))}
LINUX_RELEASES_DIR={shlex.quote(str(root / 'releases'))}
LINUX_CURRENT_LINK={shlex.quote(str(root / 'current'))}
LINUX_PREVIOUS_LINK={shlex.quote(str(root / 'previous'))}
LINUX_BACKEND_ENV={shlex.quote(str(runtime / 'backend.env'))}
LINUX_USER=test-user
LINUX_GROUP=test-group
linux_preflight() {{ :; }}
confirm_or_die() {{ :; }}
ensure_linux_user() {{ :; }}
run_privileged() {{ if [[ "$1" == chown || "$1" == systemctl ]]; then return; fi; "$@"; }}
linux_install_venvs() {{ :; }}
linux_identity_preflight() {{ if [[ "${{ATTEMPT}}" == first && {failure_stage} == candidate ]]; then return 74; fi; }}
linux_render_runtime_files() {{ cp {shlex.quote(str(config))} "$LINUX_BACKEND_ENV"; }}
prepare_native_handoff_directory() {{ :; }}
linux_run_db_tasks() {{
  if [[ ! -f {shlex.quote(str(handoff))} ]]; then echo committed-handoff > {shlex.quote(str(handoff))}; fi
  if [[ "${{ATTEMPT}}" == first && {failure_stage} == bootstrap ]]; then return 75; fi
}}
linux_reload_services() {{ :; }}
linux_smoke() {{ :; }}
ATTEMPT=first
# Capture the child status without putting the function in a conditional list.
set +e
linux_deploy_or_upgrade deploy {shlex.quote(str(config))} {shlex.quote(str(bundle))}
first_rc=$?
set -e
[[ "$first_rc" == {74 if failure_stage == 'candidate' else 75} ]]
[[ ! -e "$LINUX_RELEASES_DIR/test-retry" ]]
ATTEMPT=second
action=deploy
[[ ! -f "$LINUX_BACKEND_ENV" ]] || action=upgrade
linux_deploy_or_upgrade "$action" {shlex.quote(str(config))} {shlex.quote(str(bundle))}
[[ "$(readlink "$LINUX_CURRENT_LINK")" == "$LINUX_RELEASES_DIR/test-retry" ]]
[[ "$(cat {shlex.quote(str(handoff))})" == committed-handoff ]]
"""
    result = subprocess.run(["bash", "-c", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (root / "releases/test-retry/manifest.json").is_file()


def test_root_privileged_wrappers_propagate_candidate_failure(tmp_path):
    import os

    image = os.environ.get("RISKHUB_PRIVILEGE_TEST_IMAGE")
    if not image:
        pytest.skip("Set RISKHUB_PRIVILEGE_TEST_IMAGE to a local Linux image with bash/python/runuser")
    script = """
set -euo pipefail
source /work/scripts/deploy/lib/common.sh
source /work/scripts/deploy/lib/linux.sh
LINUX_USER=root
LINUX_GROUP=root
make_runtime_dir() { mkdir -p /tmp/candidate; touch /tmp/candidate/backend.env; echo /tmp/candidate; }
cleanup_runtime_dir() { rm -rf /tmp/candidate; }
if run_privileged false; then echo masked-command; exit 91; fi
if run_privileged_sh deliberate-failure 'exit 73'; then echo masked-shell; exit 92; fi
if linux_identity_preflight /no-such-candidate /unused; then echo masked-preflight; exit 93; fi
[[ ! -d /tmp/candidate ]]
"""
    result = subprocess.run(
        ["docker", "run", "--rm", "--network", "none", "--user", "0", "--entrypoint", "bash",
         "-v", f"{REPO_ROOT}:/work:ro", image, "-c", script],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "masked-" not in result.stdout


@pytest.mark.parametrize("target", ["docker", "linux"])
def test_native_public_dry_run_summary_matches_policy_and_release_boundary(tmp_path, target):
    import os

    from tests.backend.pytest.test_deploy_cli_contracts import _image

    args = [str(REPO_ROOT / "scripts/install.sh"), "production", "--target", target,
            "--config", str(tmp_path / "config"), "--secret-dir", str(tmp_path / "secrets"),
            "--user-management", "custom", "--mfa-policy", "optional", "--yes", "--dry-run"]
    if target == "docker":
        for flag, name in [("--backend-image", "backend"), ("--backend-db-image", "db"),
                           ("--frontend-image", "frontend"), ("--redis-image", "redis")]:
            args.extend([flag, _image(name)])
    else:
        args.extend(["--bundle", "unused.tar.gz"])
    result = subprocess.run(args, env={**os.environ, "RISKHUB_RUNTIME_DIR": str(tmp_path / "runtime")},
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert "MFA policy: optional" in result.stdout
    assert "#208" in result.stdout
    assert "Microsoft Entra app credentials are required" not in result.stdout
    if target == "docker":
        assert "deploy.sh rollback" not in result.stdout
        assert "all four pinned artifacts" in result.stdout


def test_native_init_does_not_reopen_protected_config_after_copy(tmp_path):
    import os
    import shlex
    import shutil

    if os.geteuid() == 0:
        pytest.skip("This file-permission regression requires an unprivileged operator")
    config, secrets = tmp_path / "riskhub.env", tmp_path / "secrets"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    chmod = shutil.which("chmod")
    assert chmod
    shim = fake_bin / "chmod"
    # Model a privilege-assisted protected copy: after chmod, the operator
    # cannot reopen the config, but can continue creating their test scaffold.
    shim.write_text(f'''#!/usr/bin/env bash
if [[ "$1" == 600 && "$2" == {shlex.quote(str(config))} ]]; then
  exec {shlex.quote(chmod)} 000 "$2"
fi
exec {shlex.quote(chmod)} "$@"
''')
    shim.chmod(0o755)
    try:
        result = subprocess.run(
            [str(REPO_ROOT / "scripts/deploy.sh"), "init", "--target", "linux",
             "--config", str(config), "--secret-dir", str(secrets),
             "--user-management", "custom", "--mfa-policy", "optional"],
            env={**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}",
                 "RISKHUB_RUNTIME_DIR": str(tmp_path / "runtime")},
            capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr
    finally:
        if config.exists():
            config.chmod(0o600)
    assert "LOCAL_MFA_POLICY=optional" in config.read_text()
    assert (secrets / "local_auth_keyring").is_file()


@pytest.mark.parametrize("target", ["docker", "linux"])
@pytest.mark.parametrize("proxy", ["0.0.0.0/0", "::/0", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fd00::/8"])
def test_broad_proxy_trust_is_refused_before_runtime_is_written(tmp_path, target, proxy):
    config, secrets = native_files(tmp_path, TRUSTED_PROXIES=json.dumps([proxy]))
    out = tmp_path / "candidate"
    result = renderer("write-runtime", "--config", config, "--target", target,
                      "--secret-dir", secrets, "--out-dir", out)
    assert result.returncode != 0 and "broad network ranges" in result.stderr
    assert not (out / "backend.env").exists()


def test_docker_derived_proxy_trust_uses_the_runtime_policy(tmp_path):
    config, secrets = native_files(tmp_path, DOCKER_NETWORK_SUBNET="172.16.0.0/12")
    out = tmp_path / "candidate"
    refused = renderer("write-runtime", "--config", config, "--target", "docker",
                       "--secret-dir", secrets, "--out-dir", out)
    assert refused.returncode != 0 and "broad proxy trust" in refused.stderr
    assert not (out / "backend.env").exists()
    # Linux does not derive proxy trust from the Docker subnet.
    accepted = renderer("write-runtime", "--config", config, "--target", "linux",
                        "--secret-dir", secrets, "--out-dir", out)
    assert accepted.returncode == 0, accepted.stderr


@pytest.mark.parametrize("profile", ["entra", "required", "optional"])
def test_human_readable_doctor_repair_preserves_identity_summary(tmp_path, profile):
    import os

    from tests.backend.pytest import test_install_script_contracts as install_support

    if profile == "entra":
        config, secrets = tmp_path / "riskhub.env", tmp_path / "secrets"
        install_support._write_config(config)
        install_support._write_secrets(secrets)
    else:
        config, secrets = native_files(tmp_path, LOCAL_MFA_POLICY=profile)
    fake_bin = install_support._make_fake_bin(tmp_path)
    fake_deploy = install_support._make_fake_deploy_script(tmp_path)
    if profile != "entra":
        fake_deploy.write_text(fake_deploy.read_text().replace('"microsoft_sso"', '"password"')
                              .replace('"graph"', '"none"').replace('"not_applicable"', f'"{profile}"')
                              .replace('"provider_managed"', '"completed"'))
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    result = install_support._run_install(
        "doctor", "--mode", "production", "--target", "docker", "--config", str(config),
        "--secret-dir", str(secrets), "--repair",
        env={"PATH": f"{fake_bin}:{os.environ['PATH']}", "RISKHUB_RUNTIME_DIR": str(runtime),
             "RISKHUB_LINUX_ROOT": str(tmp_path / "linux"), "RISKHUB_INSTALL_DEPLOY_SCRIPT": str(fake_deploy)},
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Repair applied: yes" in result.stdout
    assert (runtime / "install-state.json").is_file()
    if profile == "entra":
        assert "Microsoft Entra app credentials are required" in result.stdout
    else:
        assert f"MFA policy: {profile}" in result.stdout
        assert "Microsoft Entra app credentials are required" not in result.stdout
