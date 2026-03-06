"""Contract checks for Phase 500 production script behavior."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PROD_SCRIPTS_DIR = REPO_ROOT / "scripts" / "prod"


def _script_text(name: str) -> str:
    return (PROD_SCRIPTS_DIR / name).read_text(encoding="utf-8")


def test_preflight_exposes_allow_frontend_port_in_use_flag():
    text = _script_text("preflight.sh")
    assert "--allow-frontend-port-in-use" in text
    assert "allow_frontend_port_in_use=true" in text
    assert 'preflight_frontend_env "$FRONTEND_ENV" "$allow_frontend_port_in_use"' in text


def test_preflight_validates_frontend_port_ranges_and_container_port():
    text = _script_text("lib/preflight.sh")
    assert "FRONTEND_HOST_PORT must be between 1 and 65535" in text
    assert "FRONTEND_CONTAINER_PORT must be numeric" in text
    assert "FRONTEND_CONTAINER_PORT must be between 1 and 65535" in text
    assert 'envfile_require_nonempty "$backend_env" "ENTRA_CLIENT_SECRET_FILE"' in text
    assert 'envfile_require_nonempty "$backend_env" "DATABASE_URL_FILE"' in text


def test_upgrade_preflight_calls_allow_frontend_port_in_use():
    text = _script_text("upgrade.sh")
    preflight_calls = [line.strip() for line in text.splitlines() if 'run "${SCRIPT_DIR}/preflight.sh"' in line]
    assert len(preflight_calls) >= 2
    assert all("--allow-frontend-port-in-use" in line for line in preflight_calls)


def test_setup_resolves_action_before_preflight_and_applies_upgrade_allow_mode():
    text = _script_text("setup.sh")
    assert text.index('if [[ "$action" == "auto" ]]') < text.index('log "Running preflight checks"')
    assert 'preflight_args=(--backend-env "$BACKEND_ENV" --frontend-env "$FRONTEND_ENV")' in text
    assert 'if [[ "$action" == "upgrade" ]]; then' in text
    assert 'preflight_args+=(--allow-frontend-port-in-use)' in text
    assert '"${SCRIPT_DIR}/preflight.sh" "${preflight_args[@]}"' in text


def test_setup_cleanup_removes_dry_run_temp_dir():
    text = _script_text("setup.sh")
    assert 'setup_tmp_dir=""' in text
    assert 'if [[ -n "$setup_tmp_dir" && -d "$setup_tmp_dir" ]]; then rm -rf "$setup_tmp_dir" || true; fi' in text


def test_setup_requires_entra_client_secret_flag_and_writes_backend_env_value():
    text = _script_text("setup.sh")
    assert "--entra-client-secret SECRET" in text
    assert '--entra-client-secret)' in text
    assert 'missing_required+=(--entra-client-secret)' in text
    assert "ENTRA_CLIENT_SECRET=${entra_client_secret}" in text


def test_bootstrap_db_uses_module_execution_for_seed_scripts():
    text = _script_text("bootstrap_db.sh")
    assert "python -m scripts.seed_roles_permissions" in text
    assert "python -m scripts.seed_departments" in text
    assert "python -m scripts.bootstrap_sso_user" in text


def test_install_frontend_applies_capability_hardening():
    text = _script_text("install_frontend.sh")
    assert "--security-opt no-new-privileges" in text
    assert "--cap-drop ALL" in text
    assert "--cap-add NET_BIND_SERVICE" in text
