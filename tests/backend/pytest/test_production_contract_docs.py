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
DEPLOYMENT_PRODUCTION = REPO_ROOT / "docs" / "deployment" / "production.md"
DEPLOYMENT_SECURITY_CHECKLIST = (
    REPO_ROOT / "docs" / "deployment" / "security-checklist.md"
)
AUTH_SESSION_ADR = (
    REPO_ROOT / "docs" / "adr" / "ADR-011-auth-scheme-and-session-model.md"
)
BACKEND_ENV_EXAMPLE = REPO_ROOT / "scripts" / "prod" / "config" / "backend.env.example"


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
        "refresh_token_migration_grace": False,
        "access_token_expire_minutes": 30,
        "platform_admin_access_token_expire_minutes": 15,
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


def test_backend_env_example_documents_session_security_invariants() -> None:
    content = BACKEND_ENV_EXAMPLE.read_text(encoding="utf-8")

    assert "REFRESH_TOKEN_MIGRATION_GRACE=false" in content.splitlines()
    assert "ACCESS_TOKEN_EXPIRE_MINUTES=30" in content.splitlines()
    assert "PLATFORM_ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES=15" in content.splitlines()


def test_deployment_reference_documents_required_production_contract() -> None:
    content = DEPLOYMENT_REFERENCE.read_text(encoding="utf-8")

    for key in PRODUCTION_REQUIRED_CONFIG_KEYS:
        assert key in content

    for snippet in PRODUCTION_REFERENCE_REQUIRED_SNIPPETS:
        assert snippet in content


@pytest.mark.parametrize(
    ("path", "section_heading"),
    [
        (DEPLOYMENT_REFERENCE, "## Production Invariants"),
        (
            DEPLOYMENT_PRODUCTION,
            "Rendered production runtime config is intentionally opinionated:",
        ),
        (DEPLOYMENT_SECURITY_CHECKLIST, "## Config And Startup Guards"),
    ],
)
def test_canonical_production_sections_document_session_security_invariants(
    path: Path,
    section_heading: str,
) -> None:
    content = path.read_text(encoding="utf-8")
    section = content.split(section_heading, maxsplit=1)[1].split("\n## ", maxsplit=1)[
        0
    ]

    assert "- `REFRESH_TOKEN_MIGRATION_GRACE=false`" in section.splitlines()
    assert "- `ACCESS_TOKEN_EXPIRE_MINUTES=30`" in section.splitlines()
    assert "- `PLATFORM_ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES=15`" in section.splitlines()


@pytest.mark.parametrize(
    ("override", "expected_fragment"),
    [
        ({"mock_auth_enabled": True}, "MOCK_AUTH_ENABLED"),
        ({"auth_mode": "password"}, "AUTH_MODE"),
        ({"directory_provider": "auto"}, "DIRECTORY_PROVIDER"),
        ({"entra_jit_provisioning_enabled": True}, "ENTRA_JIT_PROVISIONING_ENABLED"),
        ({"auth_sso_allow_email_link": True}, "AUTH_SSO_ALLOW_EMAIL_LINK"),
        ({"refresh_token_migration_grace": True}, "REFRESH_TOKEN_MIGRATION_GRACE"),
        ({"access_token_expire_minutes": 31}, "ACCESS_TOKEN_EXPIRE_MINUTES"),
        (
            {"platform_admin_access_token_expire_minutes": 16},
            "PLATFORM_ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES",
        ),
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


def test_bootstrap_runtime_validation_accepts_strict_refresh_claims() -> None:
    validate_settings_for_runtime(_baseline_production_settings())


def test_refresh_token_migration_grace_defaults_on_for_controlled_development() -> None:
    settings = Settings(debug=True, secret_key="development-secret")

    assert settings.refresh_token_migration_grace is True
    validate_settings_for_runtime(settings)


@pytest.mark.parametrize(
    "field_name",
    ["access_token_expire_minutes", "platform_admin_access_token_expire_minutes"],
)
@pytest.mark.parametrize("invalid_value", [0, -1])
def test_access_token_lifetimes_must_be_positive(
    field_name: str,
    invalid_value: int,
) -> None:
    with pytest.raises(ValueError, match=field_name):
        Settings(**{field_name: invalid_value})


def test_access_token_lifetimes_default_to_60_minutes_for_development() -> None:
    settings = Settings(debug=True, secret_key="development-secret")

    assert settings.access_token_expire_minutes == 60
    assert settings.platform_admin_access_token_expire_minutes == 60


def test_auth_session_adr_documents_production_lifetime_rollout_and_rollback() -> None:
    content = AUTH_SESSION_ADR.read_text(encoding="utf-8")
    migration = content.split("## Migration Impact", maxsplit=1)[1].split(
        "\n## ", maxsplit=1
    )[0]
    rollback = content.split("## Rollback Strategy", maxsplit=1)[1].split(
        "\n## ", maxsplit=1
    )[0]

    assert "ordinary users at 30 minutes" in migration
    assert "platform administrators at 15 minutes" in migration
    assert "signed `exp` claim, for up to the previous 60-minute lifetime" in migration
    assert "age out naturally" in migration
    assert "no mass `token_version` bump or refresh-session revocation" in migration
    assert "runtime guard, renderer, preflight checks, and managed config" in rollback
    assert "Changing only the environment values back to 60 fails closed" in rollback
