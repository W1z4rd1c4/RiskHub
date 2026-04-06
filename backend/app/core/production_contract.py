from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProductionInvariant:
    key: str
    required_value: str | None = None
    description: str = ""


PRODUCTION_REQUIRED_CONFIG_KEYS: tuple[str, ...] = (
    "PUBLIC_URL",
    "ALLOWED_HOSTS",
    "ENTRA_TENANT_ID",
    "ENTRA_CLIENT_ID",
    "DIRECTORY_PROVIDER",
    "ENTRA_JIT_PROVISIONING_ENABLED",
    "AUTH_SSO_ALLOW_EMAIL_LINK",
    "BOOTSTRAP_ADMIN_EMAIL",
    "BOOTSTRAP_CRO_EMAIL",
)

PRODUCTION_REQUIRED_SECRET_MODES: tuple[str, ...] = (
    "ENTRA_CLIENT_SECRET_FILE",
    "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT + ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE",
)

PRODUCTION_INVARIANTS: tuple[ProductionInvariant, ...] = (
    ProductionInvariant("DEBUG", "false", "Production must run without debug mode."),
    ProductionInvariant("MOCK_AUTH_ENABLED", "false", "Mock auth is forbidden in production."),
    ProductionInvariant(
        "AUTH_MODE",
        "microsoft_sso",
        "Production requires Entra SSO-only auth with the mandatory backend-issued SSO challenge flow.",
    ),
    ProductionInvariant("DIRECTORY_PROVIDER", "graph", "Production must use the Graph directory provider."),
    ProductionInvariant(
        "ENTRA_JIT_PROVISIONING_ENABLED",
        "false",
        "Production requires pre-provisioning instead of JIT user creation.",
    ),
    ProductionInvariant(
        "AUTH_SSO_ALLOW_EMAIL_LINK",
        "false",
        "Production forbids fallback email-link matching for SSO account binding.",
    ),
    ProductionInvariant("ALLOWED_HOSTS", None, "Production requires an explicit host allowlist."),
    ProductionInvariant("CORS_ORIGINS", None, "Production requires an explicit CORS allowlist."),
)

BOOTSTRAP_RUNTIME_ENFORCED_KEYS: tuple[str, ...] = (
    "MOCK_AUTH_ENABLED",
    "AUTH_MODE",
    "DIRECTORY_PROVIDER",
    "ENTRA_JIT_PROVISIONING_ENABLED",
    "AUTH_SSO_ALLOW_EMAIL_LINK",
    "ALLOWED_HOSTS",
    "CORS_ORIGINS",
)

PRODUCTION_REFERENCE_REQUIRED_SNIPPETS: tuple[str, ...] = (
    "DIRECTORY_PROVIDER=graph",
    "ENTRA_JIT_PROVISIONING_ENABLED=false",
    "AUTH_SSO_ALLOW_EMAIL_LINK=false",
    "ENTRA_CLIENT_SECRET_FILE",
    "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT",
    "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE",
    "ALLOWED_HOSTS",
    "TRUSTED_PROXIES",
)

PRODUCTION_ENV_EXPECTED_LINES: tuple[str, ...] = (
    "AUTH_MODE=microsoft_sso",
    "MOCK_AUTH_ENABLED=false",
    "DIRECTORY_PROVIDER=graph",
    "ENTRA_JIT_PROVISIONING_ENABLED=false",
    "AUTH_SSO_ALLOW_EMAIL_LINK=false",
)
