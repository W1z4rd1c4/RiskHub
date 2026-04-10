from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import Settings
from app.core.production_contract import (
    BOOTSTRAP_RUNTIME_ENFORCED_KEYS,
    PRODUCTION_ENV_EXPECTED_LINES,
    PRODUCTION_INVARIANTS,
    PRODUCTION_REFERENCE_REQUIRED_SNIPPETS,
    PRODUCTION_REQUIRED_CONFIG_KEYS,
)
from app.main import validate_settings_for_runtime

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_EXAMPLE = REPO_ROOT / ".env.example"
DEPLOYMENT_REFERENCE = REPO_ROOT / "docs" / "deployment" / "reference.md"


def _baseline_production_settings(**overrides) -> Settings:
    values = {
        "debug": False,
        "secret_key": "test-secret-for-production-mode-123456",
        "mock_auth_enabled": False,
        "auth_mode": "microsoft_sso",
        "entra_tenant_id": "00000000-0000-0000-0000-000000000000",
        "entra_client_id": "11111111-1111-1111-1111-111111111111",
        "entra_client_secret": "production-entra-client-secret",
        "directory_provider": "graph",
        "entra_jit_provisioning_enabled": False,
        "auth_sso_allow_email_link": False,
        "cors_origins": ["https://riskhub.example.com"],
        "allowed_hosts": ["riskhub.example.com"],
        "database_url": "postgresql+asyncpg://riskhub:tests@prod-db:5432/riskhub",
        "trusted_proxies": ["127.0.0.1", "::1"],
    }
    values.update(overrides)
    return Settings(**values)


def test_env_example_matches_production_safe_contract() -> None:
    content = ENV_EXAMPLE.read_text(encoding="utf-8")

    for expected_line in PRODUCTION_ENV_EXPECTED_LINES:
        assert expected_line in content

    assert "allowed hosts are derived from CORS_ORIGINS" not in content
    assert 'TRUSTED_PROXIES=["127.0.0.1","::1"]' in content


def test_deployment_reference_documents_required_production_contract() -> None:
    content = DEPLOYMENT_REFERENCE.read_text(encoding="utf-8")

    for key in PRODUCTION_REQUIRED_CONFIG_KEYS:
        assert key in content

    for snippet in PRODUCTION_REFERENCE_REQUIRED_SNIPPETS:
        assert snippet in content


@pytest.mark.parametrize(
    ("override", "expected_fragment"),
    [
        ({"mock_auth_enabled": True}, "MOCK_AUTH_ENABLED"),
        ({"auth_mode": "password"}, "AUTH_MODE"),
        ({"directory_provider": "auto"}, "DIRECTORY_PROVIDER"),
        ({"entra_jit_provisioning_enabled": True}, "ENTRA_JIT_PROVISIONING_ENABLED"),
        ({"auth_sso_allow_email_link": True}, "AUTH_SSO_ALLOW_EMAIL_LINK"),
        ({"allowed_hosts": []}, "ALLOWED_HOSTS"),
        ({"cors_origins": []}, "CORS_ORIGINS"),
    ],
)
def test_bootstrap_runtime_validation_enforces_documented_contract(
    override: dict[str, object],
    expected_fragment: str,
) -> None:
    with pytest.raises(RuntimeError, match=expected_fragment):
        validate_settings_for_runtime(_baseline_production_settings(**override))


def test_bootstrap_runtime_validation_keys_match_contract_surface() -> None:
    invariant_keys = {item.key for item in PRODUCTION_INVARIANTS}
    assert set(BOOTSTRAP_RUNTIME_ENFORCED_KEYS).issubset(invariant_keys)
