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
