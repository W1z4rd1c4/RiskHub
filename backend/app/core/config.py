from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource

from app.core.client_ip import DEFAULT_TRUSTED_PROXIES
from app.core.config_sections import (
    AuthSettingsSection,
    OutboundSettingsSection,
    ProtocolGuardSettingsSection,
    RedisSettingsSection,
    SessionSettingsSection,
)


def _lookup_raw_value(data: dict[str, Any], *keys: str) -> tuple[bool, Any]:
    for key in keys:
        if key in data:
            return True, data[key]
    return False, None


def _normalize_alias_keys_for_settings(
    settings_cls: type["Settings"],
    data: dict[str, Any],
) -> dict[str, Any]:
    normalized = dict(data)
    for field_name, field_info in settings_cls.model_fields.items():
        validation_alias = field_info.validation_alias
        if isinstance(validation_alias, AliasChoices):
            aliases = [str(choice) for choice in validation_alias.choices]
        elif isinstance(validation_alias, str):
            aliases = [validation_alias]
        else:
            aliases = []

        for alias in aliases:
            if alias in normalized and field_name not in normalized:
                normalized[field_name] = normalized[alias]
            if alias != field_name:
                normalized.pop(alias, None)
    return normalized


def _read_secret_value(file_env_name: str, raw_path: Any) -> str:
    path = Path(str(raw_path)).expanduser()
    try:
        value = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ValueError(f"{file_env_name} points to a missing file: {path}") from exc
    except PermissionError as exc:
        raise ValueError(f"{file_env_name} is not readable: {path}") from exc
    except OSError as exc:
        raise ValueError(f"{file_env_name} could not be read: {path} ({exc})") from exc

    if value.endswith("\n"):
        value = value[:-1]
        if value.endswith("\r"):
            value = value[:-1]
    if value == "":
        raise ValueError(f"{file_env_name} must not point to an empty file: {path}")
    return value


def _normalize_optional_string(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


@dataclass(frozen=True)
class EntraConfidentialCredential:
    mode: Literal["secret", "certificate"]
    client_secret: str | None = None
    client_certificate_private_key: str | None = None
    client_certificate_thumbprint: str | None = None


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "RiskHub"
    app_version: str = "1.0.0"
    debug: bool = False  # Set to True in .env for development

    # Database
    database_url: str = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"
    database_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL_FILE", "database_url_file"),
        exclude=True,
        repr=False,
    )

    # Authentication
    secret_key: str
    secret_key_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SECRET_KEY_FILE", "secret_key_file"),
        exclude=True,
        repr=False,
    )
    # SECURITY: Never enable in production - allows X-Mock-User-Id header bypass
    mock_auth_enabled: bool = False  # Set to True in .env for development/demo
    access_token_expire_minutes: int = 60

    # Auth mode (password vs SSO)
    # - password: internal username/password login
    # - microsoft_sso: Entra ID SSO only (production default)
    # - hybrid_dev: dev/demo mode (demo login + optional SSO)
    auth_mode: Literal["password", "microsoft_sso", "hybrid_dev"] = "password"

    # Microsoft Entra ID (SSO)
    entra_tenant_id: str | None = None
    entra_client_id: str | None = None
    entra_client_secret: str | None = None
    entra_client_secret_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ENTRA_CLIENT_SECRET_FILE", "entra_client_secret_file"),
        exclude=True,
        repr=False,
    )
    entra_client_certificate_thumbprint: str | None = None
    entra_client_certificate_private_key: str | None = None
    entra_client_certificate_private_key_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE",
            "entra_client_certificate_private_key_file",
        ),
        exclude=True,
        repr=False,
    )
    # SECURITY: JIT provisioning creates local users on first SSO login. Disable if you require
    # pre-provisioning via admin.
    entra_jit_provisioning_enabled: bool = False
    entra_allowed_email_domains: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("ENTRA_ALLOWED_EMAIL_DOMAINS", "ENTRA_ALLOWED_DOMAINS"),
    )
    entra_business_role_attribute_name: str | None = None
    entra_clock_skew_seconds: int = 60
    entra_oidc_discovery_url: str | None = None
    auth_sso_allow_email_link: bool = False
    auth_sso_challenge_ttl_seconds: int = 300
    auth_sso_require_challenge: bool = False
    directory_provider: Literal["auto", "graph", "ad_emulator"] = "graph"
    ad_emulator_base_url: str | None = None
    ad_emulator_api_key: str | None = None
    ad_emulator_api_key_header: str = "X-API-Key"
    graph_timeout_seconds: float = 10.0

    # CORS
    cors_origins: list[str] = Field(default_factory=list)

    # Trusted hosts (production hardening). Explicit allowlist is required when DEBUG=false.
    allowed_hosts: list[str] = Field(default_factory=list)

    # Trusted reverse proxies (IP/CIDR) for safe client IP extraction from X-Forwarded-For.
    trusted_proxies: list[str] = Field(default_factory=lambda: list(DEFAULT_TRUSTED_PROXIES))

    # Redis (required in production for multi-worker rate limiting and account lockout)
    redis_url: str | None = None
    redis_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("REDIS_URL_FILE", "redis_url_file"),
        exclude=True,
        repr=False,
    )
    # Fail-closed route prefixes when Redis-backed controls are unavailable.
    rate_limit_fail_closed_prefixes: list[str] = Field(
        default_factory=lambda: ["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"]
    )
    lockout_fail_closed_on_backend_error: bool = True

    # Request protocol hardening
    protocol_guard_enabled: bool = True
    protocol_guard_block_method_override: bool = True
    protocol_guard_sensitive_query_keys: list[str] = Field(
        default_factory=lambda: ["department_id", "skip", "limit", "format", "user_id", "role_id"]
    )
    protocol_guard_json_prefixes: list[str] = Field(
        default_factory=lambda: ["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"]
    )

    # Outbound call hardening
    outbound_allow_private_destinations: bool = False
    outbound_allowed_hosts: list[str] = Field(default_factory=list)
    outbound_block_redirects: bool = True

    # Session/refresh-token behavior
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "riskhub_refresh_token"
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    refresh_cookie_domain: str | None = None

    # AD deprovision scheduler
    ad_deprovision_check_interval_minutes: int = 24 * 60
    ad_deprovision_check_hour: int = 2
    ad_deprovision_check_minute: int = 0

    @model_validator(mode="before")
    @classmethod
    def _resolve_file_backed_settings(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        resolved = dict(data)
        mappings = (
            ("database_url", "DATABASE_URL", "database_url_file", "DATABASE_URL_FILE"),
            ("secret_key", "SECRET_KEY", "secret_key_file", "SECRET_KEY_FILE"),
            (
                "entra_client_secret",
                "ENTRA_CLIENT_SECRET",
                "entra_client_secret_file",
                "ENTRA_CLIENT_SECRET_FILE",
            ),
            (
                "entra_client_certificate_private_key",
                "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
                "entra_client_certificate_private_key_file",
                "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE",
            ),
            ("redis_url", "REDIS_URL", "redis_url_file", "REDIS_URL_FILE"),
        )

        for field_name, env_name, file_field_name, file_env_name in mappings:
            value_found, _ = _lookup_raw_value(resolved, field_name, env_name)
            file_found, file_path = _lookup_raw_value(resolved, file_field_name, file_env_name)
            if value_found and file_found:
                raise ValueError(f"{env_name} and {file_env_name} cannot both be set")
            if not file_found:
                continue
            resolved[field_name] = _read_secret_value(file_env_name, file_path)
            resolved[file_field_name] = str(file_path)

        return resolved

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        class _NormalizedAliasSource(PydanticBaseSettingsSource):
            def __init__(self, wrapped: PydanticBaseSettingsSource):
                super().__init__(wrapped.settings_cls)
                self._wrapped = wrapped

            def get_field_value(self, field, field_name):
                return self._wrapped.get_field_value(field, field_name)

            def __call__(self) -> dict[str, Any]:
                data = self._wrapped()
                return _normalize_alias_keys_for_settings(settings_cls, data)

        return (
            init_settings,
            _NormalizedAliasSource(env_settings),
            _NormalizedAliasSource(dotenv_settings),
            file_secret_settings,
        )

    @property
    def normalized_entra_client_secret(self) -> str | None:
        return _normalize_optional_string(self.entra_client_secret)

    @property
    def normalized_entra_client_certificate_thumbprint(self) -> str | None:
        return _normalize_optional_string(self.entra_client_certificate_thumbprint)

    @property
    def normalized_entra_client_certificate_private_key(self) -> str | None:
        return _normalize_optional_string(self.entra_client_certificate_private_key)

    @property
    def normalized_entra_business_role_attribute_name(self) -> str | None:
        return _normalize_optional_string(self.entra_business_role_attribute_name)

    @property
    def entra_certificate_credential_error(self) -> str | None:
        has_thumbprint = self.normalized_entra_client_certificate_thumbprint is not None
        has_private_key = self.normalized_entra_client_certificate_private_key is not None
        if has_thumbprint != has_private_key:
            return (
                "Incomplete Entra certificate credential configuration. "
                "Set both ENTRA_CLIENT_CERTIFICATE_THUMBPRINT and "
                "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY(_FILE)."
            )
        return None

    @property
    def entra_confidential_credential(self) -> EntraConfidentialCredential | None:
        if self.entra_certificate_credential_error is None:
            thumbprint = self.normalized_entra_client_certificate_thumbprint
            private_key = self.normalized_entra_client_certificate_private_key
            if thumbprint and private_key:
                return EntraConfidentialCredential(
                    mode="certificate",
                    client_certificate_private_key=private_key,
                    client_certificate_thumbprint=thumbprint,
                )

        client_secret = self.normalized_entra_client_secret
        if client_secret:
            return EntraConfidentialCredential(mode="secret", client_secret=client_secret)
        return None

    @property
    def auth(self) -> AuthSettingsSection:
        return AuthSettingsSection(
            mode=self.auth_mode,
            entra_tenant_id=self.entra_tenant_id,
            entra_client_id=self.entra_client_id,
            entra_allowed_email_domains=tuple(self.entra_allowed_email_domains),
            entra_business_role_attribute_name=self.normalized_entra_business_role_attribute_name,
            jit_provisioning_enabled=self.entra_jit_provisioning_enabled,
            allow_email_link=self.auth_sso_allow_email_link,
            sso_challenge_ttl_seconds=self.auth_sso_challenge_ttl_seconds,
            sso_require_challenge=self.auth_sso_require_challenge,
            directory_provider=self.directory_provider,
        )

    @property
    def entra_business_role_graph_field(self) -> str | None:
        attr_name = self.normalized_entra_business_role_attribute_name
        client_id = _normalize_optional_string(self.entra_client_id)
        if not attr_name or not client_id:
            return None
        return f"extension_{client_id.replace('-', '')}_{attr_name}"

    @property
    def entra_business_role_token_claim(self) -> str | None:
        attr_name = self.normalized_entra_business_role_attribute_name
        if not attr_name:
            return None
        return f"extn.{attr_name}"

    @property
    def entra_business_role_enabled(self) -> bool:
        return self.normalized_entra_business_role_attribute_name is not None

    @property
    def outbound(self) -> OutboundSettingsSection:
        return OutboundSettingsSection(
            allow_private_destinations=self.outbound_allow_private_destinations,
            allowed_hosts=tuple(self.outbound_allowed_hosts),
            block_redirects=self.outbound_block_redirects,
        )

    @property
    def session(self) -> SessionSettingsSection:
        return SessionSettingsSection(
            refresh_token_expire_days=self.refresh_token_expire_days,
            refresh_cookie_name=self.refresh_cookie_name,
            refresh_cookie_samesite=self.refresh_cookie_samesite,
            refresh_cookie_domain=self.refresh_cookie_domain,
        )

    @property
    def redis(self) -> RedisSettingsSection:
        return RedisSettingsSection(
            redis_url=self.redis_url,
            rate_limit_fail_closed_prefixes=tuple(self.rate_limit_fail_closed_prefixes),
            lockout_fail_closed_on_backend_error=self.lockout_fail_closed_on_backend_error,
        )

    @property
    def protocol_guard(self) -> ProtocolGuardSettingsSection:
        return ProtocolGuardSettingsSection(
            enabled=self.protocol_guard_enabled,
            block_method_override=self.protocol_guard_block_method_override,
            sensitive_query_keys=tuple(self.protocol_guard_sensitive_query_keys),
            json_prefixes=tuple(self.protocol_guard_json_prefixes),
        )

    @property
    def auth_settings(self) -> AuthSettingsSection:
        return self.auth

    @property
    def outbound_settings(self) -> OutboundSettingsSection:
        return self.outbound

    @property
    def session_settings(self) -> SessionSettingsSection:
        return self.session

    @property
    def redis_settings(self) -> RedisSettingsSection:
        return self.redis

    @property
    def protocol_guard_settings(self) -> ProtocolGuardSettingsSection:
        return self.protocol_guard

    model_config = {
        "env_file": ".env",
        "populate_by_name": True,
        "extra": "forbid",
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
