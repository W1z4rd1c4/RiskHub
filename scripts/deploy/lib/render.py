#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import ipaddress
import json
import os
import re
import secrets as secure_random
import shlex
import stat
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))
from app.core.production_contract import (  # noqa: E402
    IDENTITY_CONTRACT_VERSION,
    KNOWN_WEAK_SECRET_KEYS,
    IDENTITY_PROFILE_CHOICES,
    LOCAL_KDF_SLOTS_PER_PROCESS,
    LOCAL_KDF_MEMORY_MIB,
    IdentityProfile,
    IdentityProfileInputs,
    enforce_identity_release_admission,
    resolve_identity_profile,
)
from app.core.native_identity_files import (
    load_approver_material,
    load_keyring_material,
    read_native_secret,
)  # noqa: E402

TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates"
DEFAULT_DATABASE_URL = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"
DEFAULT_SECRET_DIR = Path("/etc/riskhub/secrets")
DEFAULT_RUNTIME_DIR = Path("/etc/riskhub/runtime")
DEFAULT_DOCKER_NETWORK_SUBNET = "172.31.255.0/24"
SECRET_PLACEHOLDERS = {
    "database_url": "CHANGE_ME_DATABASE_URL",
    "secret_key": "CHANGE_ME_SECRET_KEY_AT_LEAST_32_CHARACTERS",
    "entra_client_secret": "CHANGE_ME_ENTRA_CLIENT_SECRET",
    "entra_client_certificate_private_key": "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
    "redis_password": "CHANGE_ME_REDIS_PASSWORD",
}


class RenderError(ValueError):
    pass


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        contents = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        raise RenderError(
            "Configuration is unreadable; restore the known installation configuration"
        ) from None
    for raw_line in contents.split("\n"):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in raw_line:
            raise RenderError(
                "Configuration requires one KEY=value assignment per line"
            )
        key, value = raw_line.split("=", 1)
        key, value = key.strip(), value.removesuffix("\r").strip()
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in values:
            raise RenderError("Configuration contains an invalid or duplicate key")
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise RenderError(f"{key} contains control characters")
        values[key] = value
    return values


def validate_identity_transition(desired_path: Path, installed_path: Path) -> None:
    """Compare recorded authority before scaffolding, overwrites or service actions."""
    if not installed_path.exists():
        return
    desired, installed = _parse_env_file(desired_path), _parse_env_file(installed_path)
    defaults = {
        "AUTH_MODE": "microsoft_sso",
        "DIRECTORY_PROVIDER": "graph",
        "ENTRA_TENANT_ID": "",
    }
    for values in (desired, installed):
        pair = tuple(
            values.get(key, defaults[key])
            for key in ("AUTH_MODE", "DIRECTORY_PROVIDER")
        )
        if pair not in IDENTITY_PROFILE_CHOICES.values():
            raise RenderError(
                "Invalid recorded identity profile; reconcile before upgrade"
            )
    for key, default in defaults.items():
        if desired.get(key, default) != installed.get(key, default):
            raise RenderError(
                f"{key} differs from installed runtime; identity/tenant switching is unsupported"
            )


def _render_template(path: Path, replacements: dict[str, str]) -> str:
    text = path.read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace(f"__{key}__", value)
    return text


def _render_shell_assignments(values: dict[str, str]) -> str:
    return "".join(
        f"{key}={shlex.quote(str(value))}\n" for key, value in values.items()
    )


def _validate_email(name: str, email: str) -> str:
    value = email.strip()
    if not value or "@" not in value or value.startswith("@") or value.endswith("@"):
        raise RenderError(f"{name} must be a valid email address")
    return value


def _validate_port(name: str, value: str | int) -> int:
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise RenderError(f"{name} must be numeric") from exc
    if port < 1 or port > 65535:
        raise RenderError(f"{name} must be between 1 and 65535")
    return port


def _validate_positive_int(name: str, value: str | int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise RenderError(f"{name} must be numeric") from exc
    if parsed < 1:
        raise RenderError(f"{name} must be at least 1")
    return parsed


def _validate_bool_string(name: str, value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in {"true", "false"}:
        raise RenderError(f"{name} must be true or false")
    return normalized


def _validate_cidr(name: str, value: str) -> str:
    try:
        return str(ipaddress.ip_network(value.strip(), strict=False))
    except ValueError as exc:
        raise RenderError(f"{name} must be a valid CIDR network") from exc


def _parse_json_string_list(name: str, raw_value: str) -> tuple[str, ...]:
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise RenderError(f"{name} must be a JSON array of strings") from exc
    if not isinstance(parsed, list) or not all(
        isinstance(item, str) and item.strip() for item in parsed
    ):
        raise RenderError(f"{name} must be a JSON array of non-empty strings")
    return tuple(item.strip() for item in parsed)


def _read_secret_file(path: Path, field_name: str) -> str:
    try:
        value = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise RenderError(f"Missing required secret file: {path}") from exc
    except PermissionError as exc:
        raise RenderError(f"Secret file is not readable: {path}") from exc
    except OSError as exc:
        raise RenderError(f"Failed to read secret file {path}: {exc}") from exc

    if value.endswith("\n"):
        value = value[:-1]
        if value.endswith("\r"):
            value = value[:-1]
    if value == "":
        raise RenderError(f"{field_name} must not be empty ({path})")
    if value == SECRET_PLACEHOLDERS.get(field_name) or value.startswith("CHANGE_ME_"):
        raise RenderError(f"{field_name} still contains the placeholder value ({path})")
    return value


def _read_optional_secret_file(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except PermissionError as exc:
        raise RenderError(f"Secret file is not readable: {path}") from exc
    except OSError as exc:
        raise RenderError(f"Failed to read secret file {path}: {exc}") from exc

    if value.endswith("\n"):
        value = value[:-1]
        if value.endswith("\r"):
            value = value[:-1]
    return value


@dataclass(frozen=True)
class DeploySecrets:
    secret_dir: Path
    database_url_path: Path
    secret_key_path: Path
    entra_client_secret_path: Path
    entra_client_certificate_private_key_path: Path
    redis_password_path: Path

    @classmethod
    def from_dir(cls, secret_dir: Path) -> "DeploySecrets":
        return cls(
            secret_dir=secret_dir,
            database_url_path=secret_dir / "database_url",
            secret_key_path=secret_dir / "secret_key",
            entra_client_secret_path=secret_dir / "entra_client_secret",
            entra_client_certificate_private_key_path=secret_dir
            / "entra_client_certificate_private_key",
            redis_password_path=secret_dir / "redis_password",
        )

    @property
    def database_url(self) -> str:
        return _read_secret_file(self.database_url_path, "database_url")

    @property
    def secret_key(self) -> str:
        return _read_secret_file(self.secret_key_path, "secret_key")

    @property
    def entra_client_secret(self) -> str:
        return _read_secret_file(self.entra_client_secret_path, "entra_client_secret")

    def optional_entra_client_secret(self) -> str | None:
        return _read_optional_secret_file(self.entra_client_secret_path)

    def optional_entra_client_certificate_private_key(self) -> str | None:
        return _read_optional_secret_file(
            self.entra_client_certificate_private_key_path
        )

    @property
    def redis_password(self) -> str:
        return _read_secret_file(self.redis_password_path, "redis_password")

    def validate(self, config: "DeployConfig") -> str:
        database_url = self.database_url
        parsed_database = urlparse(database_url)
        if (
            parsed_database.scheme != "postgresql+asyncpg"
            or not parsed_database.hostname
        ):
            raise RenderError(
                "database_url must select an external PostgreSQL asyncpg connection"
            )
        if database_url == DEFAULT_DATABASE_URL:
            raise RenderError(
                "database_url secret must not use the default placeholder"
            )
        if "@db:" in database_url:
            raise RenderError(
                "database_url secret must not target docker-compose hostname 'db'"
            )

        secret_key = self.secret_key
        if secret_key.strip().lower() in KNOWN_WEAK_SECRET_KEYS:
            raise RenderError("secret_key uses a blocked weak default")
        if len(secret_key.strip()) < 32:
            raise RenderError("secret_key must be at least 32 characters long")

        _ = self.redis_password
        if config.auth_mode == "password":
            for field, name in (
                ("LOCAL_AUTH_KEYRING_FILE", "local_auth_keyring"),
                ("LOCAL_RECOVERY_APPROVERS_FILE", "local_recovery_approvers"),
                ("LOCAL_SMTP_PASSWORD_FILE", "local_smtp_password"),
            ):
                if config.local_config.get(field, str(self.secret_dir / name)) != str(
                    self.secret_dir / name
                ):
                    raise RenderError(
                        f"{field} conflicts with the selected protected secret directory"
                    )
            try:
                load_keyring_material(str(self.secret_dir / "local_auth_keyring"))
                load_approver_material(
                    str(self.secret_dir / "local_recovery_approvers")
                )
                password = read_native_secret(
                    str(self.secret_dir / "local_smtp_password")
                )
                if not password.strip() or password.startswith(b"CHANGE_ME_"):
                    raise ValueError(
                        "LOCAL_SMTP_PASSWORD_FILE requires a populated owner-only file"
                    )
            except ValueError as exc:
                raise RenderError(str(exc)) from None
            return "none"
        client_secret = self.optional_entra_client_secret()
        certificate_key = self.optional_entra_client_certificate_private_key()
        secret_ready = bool(
            client_secret
            and client_secret != SECRET_PLACEHOLDERS["entra_client_secret"]
        )
        certificate_key_ready = bool(
            certificate_key
            and certificate_key
            != SECRET_PLACEHOLDERS["entra_client_certificate_private_key"]
        )
        thumbprint_ready = bool(config.entra_client_certificate_thumbprint)

        if thumbprint_ready and not certificate_key_ready:
            if (
                certificate_key
                == SECRET_PLACEHOLDERS["entra_client_certificate_private_key"]
            ):
                raise RenderError(
                    "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE still contains the placeholder value"
                )
            raise RenderError(
                "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is set but no valid "
                "entra_client_certificate_private_key secret file was found"
            )
        if certificate_key_ready and not thumbprint_ready:
            raise RenderError(
                "entra_client_certificate_private_key is configured but ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is missing"
            )
        if certificate_key is not None and certificate_key == "":
            raise RenderError(
                "entra_client_certificate_private_key must not be empty "
                f"({self.entra_client_certificate_private_key_path})"
            )

        if certificate_key_ready:
            return "certificate"
        if secret_ready:
            return "secret"
        if client_secret == SECRET_PLACEHOLDERS["entra_client_secret"]:
            raise RenderError(
                "ENTRA_CLIENT_SECRET_FILE still contains the placeholder value"
            )
        raise RenderError(
            "No Entra Graph credential is configured. Configure either entra_client_secret "
            "or certificate credential inputs."
        )


@dataclass(frozen=True)
class DeployConfig:
    public_url: str
    auth_mode: str
    directory_provider: str
    local_mfa_policy: str
    local_config: dict[str, str]
    entra_tenant_id: str
    entra_client_id: str
    entra_client_certificate_thumbprint: str | None
    entra_business_role_attribute_name: str | None
    bootstrap_admin_email: str
    bootstrap_admin_external_id: str | None
    bootstrap_cro_email: str
    bootstrap_cro_external_id: str | None
    api_workers: int
    frontend_bind_port: int
    metrics_enabled: str
    otel_exporter_otlp_endpoint: str | None
    otel_service_name: str
    trusted_proxies: tuple[str, ...] | None
    docker_network_subnet: str

    @classmethod
    def from_env_file(cls, path: Path) -> "DeployConfig":
        values = _parse_env_file(path)

        def require(key: str) -> str:
            value = values.get(key, "").strip()
            if not value:
                raise RenderError(f"Missing required config key: {key}")
            return value

        public_url = require("PUBLIC_URL").rstrip("/")
        parsed = urlparse(public_url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.path not in {"", "/"}
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise RenderError(
                "PUBLIC_URL must be an HTTPS origin only, for example https://riskhub.example.com"
            )
        if "*" in parsed.hostname:
            raise RenderError("PUBLIC_URL host must not contain wildcard entries")
        if not re.fullmatch(r"[A-Za-z0-9.:-]+", parsed.hostname):
            raise RenderError(
                "PUBLIC_URL host must be an explicit DNS name or IP address"
            )
        if parsed.port is not None:
            _validate_port("PUBLIC_URL port", parsed.port)
        for key, expected in (("CORS_ORIGINS", (public_url,)), ("ALLOWED_HOSTS", (parsed.hostname,))):
            if values.get(key) and _parse_json_string_list(key, values[key]) != expected:
                raise RenderError(f"{key} must match the explicit PUBLIC_URL for this same-origin deployment")

        auth_mode = values.get("AUTH_MODE", "microsoft_sso")
        directory_provider = values.get("DIRECTORY_PROVIDER", "graph")
        # Legacy omitted tuples retain Entra semantics. Explicit inputs are never
        # silently overwritten, including provider fields irrelevant to rendering.
        try:
            resolve_identity_profile(
                IdentityProfileInputs(
                    auth_mode=auth_mode,
                    directory_provider=directory_provider,
                    mock_auth_enabled=values.get("MOCK_AUTH_ENABLED", "false")
                    != "false",
                    ad_emulator_base_url=values.get("AD_EMULATOR_BASE_URL") or None,
                    ad_emulator_api_key=values.get("AD_EMULATOR_API_KEY")
                    or values.get("AD_EMULATOR_API_KEY_FILE")
                    or None,
                    entra_jit_provisioning_enabled=values.get(
                        "ENTRA_JIT_PROVISIONING_ENABLED", "false"
                    )
                    != "false",
                    auth_sso_allow_email_link=values.get(
                        "AUTH_SSO_ALLOW_EMAIL_LINK", "false"
                    )
                    != "false",
                    entra_tenant_id=values.get("ENTRA_TENANT_ID") or None,
                    entra_client_id=values.get("ENTRA_CLIENT_ID") or None,
                    entra_confidential_credential=True
                    if auth_mode == "microsoft_sso"
                    else None,
                    normalized_entra_client_secret=bool(
                        values.get("ENTRA_CLIENT_SECRET")
                        or values.get("ENTRA_CLIENT_SECRET_FILE")
                    )
                    or None,
                    normalized_entra_client_certificate_thumbprint=values.get(
                        "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT"
                    )
                    or None,
                    normalized_entra_client_certificate_private_key=bool(
                        values.get("ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY")
                        or values.get("ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE")
                    )
                    or None,
                    entra_credential_fingerprint=values.get(
                        "ENTRA_CREDENTIAL_FINGERPRINT"
                    )
                    or None,
                    entra_oidc_discovery_url=values.get("ENTRA_OIDC_DISCOVERY_URL")
                    or None,
                    entra_business_role_attribute_name=values.get(
                        "ENTRA_BUSINESS_ROLE_ATTRIBUTE_NAME"
                    )
                    or None,
                    entra_allowed_email_domains=(values["ENTRA_ALLOWED_EMAIL_DOMAINS"],)
                    if values.get("ENTRA_ALLOWED_EMAIL_DOMAINS") not in (None, "", "[]")
                    else (),
                )
            )
        except ValueError as exc:
            raise RenderError(str(exc)) from None
        if values.get("DEBUG", "false") != "false":
            raise RenderError("DEBUG must be false in production")
        if values.get("USER_MANAGEMENT_MODE") or values.get("AUTH_PROVIDER"):
            raise RenderError(
                "Persist only AUTH_MODE/DIRECTORY_PROVIDER for identity selection"
            )
        for key in (
            "DATABASE_URL",
            "SECRET_KEY",
            "REDIS_URL",
            "REDIS_PASSWORD",
            "ENTRA_CLIENT_SECRET",
            "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
            "LOCAL_SMTP_PASSWORD",
        ):
            if values.get(key):
                raise RenderError(
                    f"{key} must be supplied through its protected secret file"
                )
        local_mfa_policy = values.get("LOCAL_MFA_POLICY", "required")
        if local_mfa_policy not in {"required", "optional"}:
            raise RenderError("LOCAL_MFA_POLICY must be required or optional")
        local_config: dict[str, str] = {}

        api_workers = _validate_positive_int(
            "API_WORKERS", values.get("API_WORKERS", "4")
        )
        if auth_mode == "password":
            budget = _validate_positive_int(
                "LOCAL_KDF_MEMORY_BUDGET_MIB",
                values.get("LOCAL_KDF_MEMORY_BUDGET_MIB", "1024"),
            )
            if (
                budget
                < api_workers * LOCAL_KDF_SLOTS_PER_PROCESS * LOCAL_KDF_MEMORY_MIB
                or budget > 65536
            ):
                raise RenderError(
                    "LOCAL_KDF_MEMORY_BUDGET_MIB must cover 128 MiB per API worker and be at most 65536"
                )
            security = values.get("LOCAL_SMTP_SECURITY", "starttls")
            if security not in {"starttls", "tls"}:
                raise RenderError("LOCAL_SMTP_SECURITY must be starttls or tls")
            local_config = {
                "LOCAL_KDF_MEMORY_BUDGET_MIB": str(budget),
                "LOCAL_SMTP_HOST": require("LOCAL_SMTP_HOST"),
                "LOCAL_SMTP_PORT": str(
                    _validate_port(
                        "LOCAL_SMTP_PORT", values.get("LOCAL_SMTP_PORT", "587")
                    )
                ),
                "LOCAL_SMTP_SECURITY": security,
                "LOCAL_SMTP_SENDER": _validate_email(
                    "LOCAL_SMTP_SENDER", require("LOCAL_SMTP_SENDER")
                ),
                "LOCAL_SMTP_USERNAME": require("LOCAL_SMTP_USERNAME"),
            }
            for key in (
                "LOCAL_SMTP_CA_FILE",
                "LOCAL_PASSWORD_BLOCKLIST_FILE",
                "LOCAL_AUTH_KEYRING_FILE",
                "LOCAL_RECOVERY_APPROVERS_FILE",
                "LOCAL_SMTP_PASSWORD_FILE",
            ):
                if values.get(key):
                    local_config[key] = values[key]
            if values.get("BOOTSTRAP_ADMIN_EXTERNAL_ID") or values.get(
                "BOOTSTRAP_CRO_EXTERNAL_ID"
            ):
                raise RenderError("Native bootstrap does not accept Entra external IDs")
        frontend_bind_port = _validate_port(
            "FRONTEND_BIND_PORT", values.get("FRONTEND_BIND_PORT", "80")
        )
        metrics_enabled = _validate_bool_string(
            "METRICS_ENABLED", values.get("METRICS_ENABLED", "false")
        )
        otel_exporter_otlp_endpoint = (
            values.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip() or None
        )
        otel_service_name = (
            values.get("OTEL_SERVICE_NAME", "riskhub-api").strip() or "riskhub-api"
        )

        admin_email = _validate_email(
            "BOOTSTRAP_ADMIN_EMAIL", require("BOOTSTRAP_ADMIN_EMAIL")
        )
        cro_email = _validate_email(
            "BOOTSTRAP_CRO_EMAIL", require("BOOTSTRAP_CRO_EMAIL")
        )
        if admin_email.lower() == cro_email.lower():
            raise RenderError(
                "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_CRO_EMAIL must be different"
            )
        admin_external_id = (
            values.get("BOOTSTRAP_ADMIN_EXTERNAL_ID", "").strip() or None
        )
        cro_external_id = values.get("BOOTSTRAP_CRO_EXTERNAL_ID", "").strip() or None
        if (
            admin_external_id is not None
            and cro_external_id is not None
            and admin_external_id == cro_external_id
        ):
            raise RenderError(
                "BOOTSTRAP_ADMIN_EXTERNAL_ID and BOOTSTRAP_CRO_EXTERNAL_ID must be different"
            )

        trusted_proxies_raw = values.get("TRUSTED_PROXIES", "").strip()
        trusted_proxies = (
            _parse_json_string_list("TRUSTED_PROXIES", trusted_proxies_raw)
            if trusted_proxies_raw
            else None
        )
        if trusted_proxies is not None:
            if not trusted_proxies:
                raise RenderError(
                    "TRUSTED_PROXIES must contain explicit proxy addresses"
                )
            for proxy in trusted_proxies:
                _validate_cidr("TRUSTED_PROXIES", proxy)
        docker_network_subnet = _validate_cidr(
            "DOCKER_NETWORK_SUBNET",
            values.get("DOCKER_NETWORK_SUBNET", DEFAULT_DOCKER_NETWORK_SUBNET),
        )

        return cls(
            public_url=public_url,
            auth_mode=auth_mode,
            directory_provider=directory_provider,
            local_mfa_policy=local_mfa_policy,
            local_config=local_config,
            entra_tenant_id=values.get("ENTRA_TENANT_ID", ""),
            entra_client_id=values.get("ENTRA_CLIENT_ID", ""),
            entra_client_certificate_thumbprint=values.get(
                "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT", ""
            ).strip()
            or None,
            entra_business_role_attribute_name=values.get(
                "ENTRA_BUSINESS_ROLE_ATTRIBUTE_NAME", ""
            ).strip()
            or None,
            bootstrap_admin_email=admin_email,
            bootstrap_admin_external_id=admin_external_id,
            bootstrap_cro_email=cro_email,
            bootstrap_cro_external_id=cro_external_id,
            api_workers=api_workers,
            frontend_bind_port=frontend_bind_port,
            metrics_enabled=metrics_enabled,
            otel_exporter_otlp_endpoint=otel_exporter_otlp_endpoint,
            otel_service_name=otel_service_name,
            trusted_proxies=trusted_proxies,
            docker_network_subnet=docker_network_subnet,
        )

    @property
    def hostname(self) -> str:
        parsed = urlparse(self.public_url)
        assert parsed.hostname is not None
        return parsed.hostname

    def redis_url(self, target: str, secrets: DeploySecrets) -> str:
        host = "redis" if target == "docker" else "127.0.0.1"
        return f"redis://:{secrets.redis_password}@{host}:6379/0"

    def effective_trusted_proxies(self, target: str) -> list[str]:
        if self.trusted_proxies is not None:
            return list(self.trusted_proxies)
        defaults = ["127.0.0.1", "::1"]
        if target == "docker":
            defaults.append(self.docker_network_subnet)
        return defaults

    def backend_env(
        self, target: str, secret_dir: Path, runtime_dir: Path, credential_mode: str
    ) -> str:
        values = {
            "DEBUG": "false",
            "MOCK_AUTH_ENABLED": "false",
            "AUTH_MODE": self.auth_mode,
            "DIRECTORY_PROVIDER": self.directory_provider,
            "PUBLIC_URL": self.public_url,
            "API_WORKERS": str(self.api_workers),
            "SECRET_KEY_FILE": str(secret_dir / "secret_key"),
            "DATABASE_URL_FILE": str(secret_dir / "database_url"),
            "CORS_ORIGINS": json.dumps([self.public_url]),
            "ALLOWED_HOSTS": json.dumps([self.hostname]),
            "TRUSTED_PROXIES": json.dumps(self.effective_trusted_proxies(target)),
            "REDIS_URL_FILE": str(runtime_dir / "redis_url"),
            "METRICS_ENABLED": self.metrics_enabled,
            "OTEL_SERVICE_NAME": self.otel_service_name,
            "ENTRA_JIT_PROVISIONING_ENABLED": "false",
            "AUTH_SSO_ALLOW_EMAIL_LINK": "false",
            "REFRESH_TOKEN_MIGRATION_GRACE": "false",
            "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
            "PLATFORM_ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES": "15",
            "AUTH_SSO_REQUIRE_CHALLENGE": "true",
            "AD_DEPROVISION_CHECK_INTERVAL_MINUTES": "15",
            "BOOTSTRAP_ADMIN_EMAIL": self.bootstrap_admin_email,
            "BOOTSTRAP_ADMIN_ROLE": "admin",
            "BOOTSTRAP_ADMIN_ACCESS_SCOPE": "global",
            "BOOTSTRAP_CRO_EMAIL": self.bootstrap_cro_email,
            "BOOTSTRAP_CRO_ACCESS_SCOPE": "global",
        }
        if self.auth_mode == "password":
            values.update(self.local_config)
            values.update(
                {
                    "LOCAL_MFA_POLICY": self.local_mfa_policy,
                    "LOCAL_AUTH_KEYRING_FILE": str(secret_dir / "local_auth_keyring"),
                    "LOCAL_RECOVERY_APPROVERS_FILE": str(
                        secret_dir / "local_recovery_approvers"
                    ),
                    "LOCAL_SMTP_PASSWORD_FILE": str(secret_dir / "local_smtp_password"),
                }
            )
        else:
            values.update(
                ENTRA_TENANT_ID=self.entra_tenant_id,
                ENTRA_CLIENT_ID=self.entra_client_id,
            )
        if self.bootstrap_admin_external_id:
            values["BOOTSTRAP_ADMIN_EXTERNAL_ID"] = self.bootstrap_admin_external_id
        if self.bootstrap_cro_external_id:
            values["BOOTSTRAP_CRO_EXTERNAL_ID"] = self.bootstrap_cro_external_id
        if target == "docker":
            values["DOCKER_NETWORK_SUBNET"] = self.docker_network_subnet
        if self.otel_exporter_otlp_endpoint:
            values["OTEL_EXPORTER_OTLP_ENDPOINT"] = self.otel_exporter_otlp_endpoint
        if self.entra_business_role_attribute_name:
            values["ENTRA_BUSINESS_ROLE_ATTRIBUTE_NAME"] = (
                self.entra_business_role_attribute_name
            )
        if credential_mode == "certificate":
            assert self.entra_client_certificate_thumbprint is not None
            values["ENTRA_CLIENT_CERTIFICATE_THUMBPRINT"] = (
                self.entra_client_certificate_thumbprint
            )
            values["ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE"] = str(
                secret_dir / "entra_client_certificate_private_key"
            )
        elif credential_mode == "secret":
            values["ENTRA_CLIENT_SECRET_FILE"] = str(secret_dir / "entra_client_secret")
        return "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"

    def frontend_env(self, target: str) -> str:
        values = {
            "FRONTEND_HOST_PORT": str(self.frontend_bind_port),
            "FRONTEND_CONTAINER_PORT": "80",
            "SERVER_NAME": self.hostname,
        }
        if target == "docker":
            values["DOCKER_NETWORK_SUBNET"] = self.docker_network_subnet
        return "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"

    def metadata_env(
        self,
        target: str,
        secret_dir: Path,
        runtime_dir: Path,
        secrets: DeploySecrets,
        credential_mode: str,
    ) -> str:
        values = {
            "TARGET": target,
            "AUTH_MODE": self.auth_mode,
            "DIRECTORY_PROVIDER": self.directory_provider,
            "LOCAL_MFA_POLICY": self.local_mfa_policy
            if self.auth_mode == "password"
            else "not-applicable",
            "IDENTITY_CONTRACT_VERSION": str(IDENTITY_CONTRACT_VERSION),
            "PUBLIC_URL": self.public_url,
            "SERVER_NAME": self.hostname,
            "CORS_ORIGINS_JSON": json.dumps([self.public_url]),
            "ALLOWED_HOSTS_JSON": json.dumps([self.hostname]),
            "TRUSTED_PROXIES_JSON": json.dumps(self.effective_trusted_proxies(target)),
            "SECRET_DIR": str(secret_dir),
            "RUNTIME_DIR": str(runtime_dir),
            "REDIS_URL_FILE": str(runtime_dir / "redis_url"),
            "REDIS_PASSWORD_FILE": str(secret_dir / "redis_password"),
            "ENTRA_GRAPH_CREDENTIAL_MODE": credential_mode,
            "API_WORKERS": str(self.api_workers),
            "FRONTEND_BIND_PORT": str(self.frontend_bind_port),
            "BACKEND_BIND_HOST": "127.0.0.1",
            "BACKEND_BIND_PORT": "8000",
            "SCHEDULER_BIND_HOST": "127.0.0.1",
            "SCHEDULER_BIND_PORT": "8001",
            "SCHEDULER_ENABLED": "true",
            "SCHEDULER_WORKERS": "1",
        }
        if target == "docker":
            values["DOCKER_NETWORK_SUBNET"] = self.docker_network_subnet
        return _render_shell_assignments(values)


def _write_runtime_files(
    config_path: Path, target: str, secret_dir: Path, runtime_dir: Path, out_dir: Path
) -> None:
    config = DeployConfig.from_env_file(config_path)
    secrets = DeploySecrets.from_dir(secret_dir)
    credential_mode = secrets.validate(config)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "backend.env").write_text(
        config.backend_env(target, secret_dir, runtime_dir, credential_mode),
        encoding="utf-8",
    )
    (out_dir / "frontend.env").write_text(config.frontend_env(target), encoding="utf-8")
    (out_dir / "metadata.env").write_text(
        config.metadata_env(target, secret_dir, runtime_dir, secrets, credential_mode),
        encoding="utf-8",
    )
    (out_dir / "redis_url").write_text(
        config.redis_url(target, secrets) + "\n", encoding="utf-8"
    )


def _bundle_manifest(bundle_path: Path) -> dict[str, object]:
    with tarfile.open(bundle_path, "r:*") as archive:
        manifest_member = next(
            (
                member
                for member in archive.getmembers()
                if member.name.endswith("/manifest.json")
            ),
            None,
        )
        if manifest_member is None:
            raise RenderError(f"Bundle {bundle_path} is missing manifest.json")
        manifest_bytes = archive.extractfile(manifest_member)
        if manifest_bytes is None:
            raise RenderError(f"Unable to read manifest from {bundle_path}")
        return json.loads(manifest_bytes.read().decode("utf-8"))


def _bundle_version(bundle_path: Path) -> str:
    manifest = _bundle_manifest(bundle_path)
    version = str(manifest.get("version", "")).strip()
    if not version:
        raise RenderError(f"Bundle {bundle_path} manifest is missing version")
    return version


def _render_linux_site(config_path: Path, release_root: str) -> str:
    config = DeployConfig.from_env_file(config_path)
    return _render_template(
        TEMPLATES_DIR / "linux" / "nginx-site.conf.tmpl",
        {
            "SERVER_NAME": config.hostname,
            "FRONTEND_BIND_PORT": str(config.frontend_bind_port),
            "FRONTEND_ROOT": f"{release_root}/frontend/dist",
            "BACKEND_UPSTREAM": "127.0.0.1:8000",
        },
    )


def _render_linux_nginx_full(config_path: Path, release_root: str) -> str:
    site_conf = _render_linux_site(config_path, release_root)
    return _render_template(
        TEMPLATES_DIR / "linux" / "nginx-full.conf.tmpl",
        {
            "SERVER_BLOCK": site_conf,
        },
    )


def _render_backend_unit(
    config_path: Path, current_link: str, runtime_dir: Path, redis_service: str
) -> str:
    config = DeployConfig.from_env_file(config_path)
    return _render_template(
        TEMPLATES_DIR / "linux" / "riskhub-backend.service.tmpl",
        {
            "CURRENT_LINK": current_link,
            "RUNTIME_ENV": str(runtime_dir / "backend.env"),
            "API_WORKERS": str(config.api_workers),
            "REDIS_SERVICE": redis_service,
        },
    )


def _render_scheduler_unit(
    current_link: str, runtime_dir: Path, redis_service: str
) -> str:
    return _render_template(
        TEMPLATES_DIR / "linux" / "riskhub-scheduler.service.tmpl",
        {
            "CURRENT_LINK": current_link,
            "RUNTIME_ENV": str(runtime_dir / "backend.env"),
            "REDIS_SERVICE": redis_service,
        },
    )


def _render_redis_unit(secret_dir: Path) -> str:
    return _render_template(
        TEMPLATES_DIR / "linux" / "riskhub-redis.service.tmpl",
        {
            "REDIS_PASSWORD_FILE": str(secret_dir / "redis_password"),
        },
    )


def _print_json(payload: object) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Render RiskHub deployment runtime artifacts"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    identity_choice = sub.add_parser("identity-choice")
    identity_choice.add_argument("--config", required=True)
    transition = sub.add_parser("validate-transition")
    transition.add_argument("--config", required=True)
    transition.add_argument("--installed", required=True)
    validate_profile = sub.add_parser("validate-profile")
    validate_profile.add_argument("--config", required=True)
    validate_profile.add_argument("--secret-dir", required=True)
    admission = sub.add_parser("admit-release")
    admission.add_argument("--config", required=True)
    native_secrets = sub.add_parser("init-local-secrets")
    native_secrets.add_argument("--secret-dir", required=True)
    handoff = sub.add_parser("prepare-handoff")
    handoff.add_argument("--path", required=True)
    handoff.add_argument("--uid", type=int, required=True)
    handoff.add_argument("--gid", type=int, required=True)
    mounts = sub.add_parser("secret-mount-paths")
    mounts.add_argument("--config", required=True)

    write_runtime = sub.add_parser("write-runtime")
    write_runtime.add_argument("--config", required=True)
    write_runtime.add_argument("--target", choices=("docker", "linux"), required=True)
    write_runtime.add_argument("--secret-dir", default=str(DEFAULT_SECRET_DIR))
    write_runtime.add_argument("--runtime-dir", default=str(DEFAULT_RUNTIME_DIR))
    write_runtime.add_argument("--out-dir", required=True)

    show_json = sub.add_parser("show-json")
    show_json.add_argument("--config", required=True)
    show_json.add_argument("--target", choices=("docker", "linux"), required=True)
    show_json.add_argument("--secret-dir", default=str(DEFAULT_SECRET_DIR))
    show_json.add_argument("--runtime-dir", default=str(DEFAULT_RUNTIME_DIR))

    bundle_version = sub.add_parser("bundle-version")
    bundle_version.add_argument("--bundle", required=True)

    render_site = sub.add_parser("render-linux-site")
    render_site.add_argument("--config", required=True)
    render_site.add_argument("--release-root", required=True)

    render_full = sub.add_parser("render-linux-nginx-full")
    render_full.add_argument("--config", required=True)
    render_full.add_argument("--release-root", required=True)

    render_backend_unit = sub.add_parser("render-linux-backend-unit")
    render_backend_unit.add_argument("--config", required=True)
    render_backend_unit.add_argument("--current-link", default="/opt/riskhub/current")
    render_backend_unit.add_argument("--runtime-dir", default=str(DEFAULT_RUNTIME_DIR))
    render_backend_unit.add_argument("--redis-service", default="riskhub-redis")

    render_scheduler_unit = sub.add_parser("render-linux-scheduler-unit")
    render_scheduler_unit.add_argument("--current-link", default="/opt/riskhub/current")
    render_scheduler_unit.add_argument(
        "--runtime-dir", default=str(DEFAULT_RUNTIME_DIR)
    )
    render_scheduler_unit.add_argument("--redis-service", default="riskhub-redis")

    render_redis_unit = sub.add_parser("render-linux-redis-unit")
    render_redis_unit.add_argument("--secret-dir", default=str(DEFAULT_SECRET_DIR))

    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "identity-choice":
            values = _parse_env_file(Path(args.config))
            pair = (
                values.get("AUTH_MODE", "microsoft_sso"),
                values.get("DIRECTORY_PROVIDER", "graph"),
            )
            choice = next(
                (
                    name
                    for name, expected in IDENTITY_PROFILE_CHOICES.items()
                    if pair == expected
                ),
                None,
            )
            if choice is None:
                raise RenderError("Invalid AUTH_MODE/DIRECTORY_PROVIDER identity tuple")
            print(choice)
        elif args.command == "validate-transition":
            validate_identity_transition(Path(args.config), Path(args.installed))
        elif args.command == "validate-profile":
            config = DeployConfig.from_env_file(Path(args.config))
            DeploySecrets.from_dir(Path(args.secret_dir)).validate(config)
            print(
                next(
                    name
                    for name, pair in IDENTITY_PROFILE_CHOICES.items()
                    if pair == (config.auth_mode, config.directory_provider)
                )
            )
        elif args.command == "admit-release":
            config = DeployConfig.from_env_file(Path(args.config))
            try:
                enforce_identity_release_admission(
                    IdentityProfile(
                        config.auth_mode,
                        config.directory_provider,
                        config.entra_tenant_id or None,
                    )
                )
            except RuntimeError as exc:
                raise RenderError(str(exc)) from None
        elif args.command == "secret-mount-paths":
            values = _parse_env_file(Path(args.config))
            config = DeployConfig.from_env_file(Path(args.config))
            fields = ["DATABASE_URL_FILE", "SECRET_KEY_FILE"]
            if config.auth_mode == "password":
                fields.extend(
                    [
                        "LOCAL_AUTH_KEYRING_FILE",
                        "LOCAL_RECOVERY_APPROVERS_FILE",
                        "LOCAL_SMTP_PASSWORD_FILE",
                        "LOCAL_SMTP_CA_FILE",
                        "LOCAL_PASSWORD_BLOCKLIST_FILE",
                    ]
                )
            else:
                fields.extend(
                    [
                        "ENTRA_CLIENT_SECRET_FILE",
                        "ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE",
                    ]
                )
            for field in fields:
                if value := values.get(field):
                    if not Path(value).is_absolute() or ":" in value or "\n" in value:
                        raise RenderError(
                            "Secret mount paths must be absolute and contain no colon/newline"
                        )
                    print(value)
        elif args.command == "prepare-handoff":
            path = Path(args.path)
            if not path.is_absolute() or ".." in path.parts:
                raise RenderError("Native handoff requires an absolute protected path")
            for parent in (path, *path.parents):
                if parent.is_symlink():
                    raise RenderError("Native handoff paths cannot contain symlinks")
                if parent.exists():
                    info = parent.stat()
                    sticky_root = info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX)
                    if (
                        not stat.S_ISDIR(info.st_mode)
                        or info.st_mode & 0o022
                        and not sticky_root
                    ):
                        raise RenderError("Native handoff parent is not protected")
            try:
                path.mkdir(mode=0o700)
            except FileExistsError:
                info = path.stat()
                if info.st_uid != args.uid or stat.S_IMODE(info.st_mode) != 0o700:
                    raise RenderError(
                        "Existing native handoff directory requires operator ownership/mode reconciliation"
                    ) from None
            else:
                os.chown(path, args.uid, args.gid)
            print("Protected native handoff directory is ready")
        elif args.command == "init-local-secrets":
            secret_dir = Path(args.secret_dir)
            # O_EXCL makes scaffold resume safe: existing keys are never replaced.
            for name in (
                "local_auth_keyring",
                "local_recovery_approvers",
                "local_smtp_password",
            ):
                path = secret_dir / name
                try:
                    fd = os.open(
                        path,
                        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                        0o600,
                    )
                except FileExistsError:
                    continue
                with os.fdopen(fd, "w") as stream:
                    if name == "local_auth_keyring":
                        json.dump(
                            {
                                "version": 1,
                                "purposes": {
                                    purpose: {
                                        "active": "v1",
                                        "keys": {
                                            "v1": base64.b64encode(
                                                secure_random.token_bytes(32)
                                            ).decode()
                                        },
                                    }
                                    for purpose in ("delivery", "totp", "action")
                                },
                            },
                            stream,
                        )
                    elif name == "local_recovery_approvers":
                        json.dump({"version": 1, "approvers": []}, stream)
                    else:
                        stream.write("CHANGE_ME_LOCAL_SMTP_PASSWORD\n")
                    stream.flush()
                    os.fsync(stream.fileno())
            print(
                "Native scaffold preserved existing keys; register recovery approvers and configure the SMTP password."
            )
        elif args.command == "write-runtime":
            _write_runtime_files(
                Path(args.config),
                args.target,
                Path(args.secret_dir),
                Path(args.runtime_dir),
                Path(args.out_dir),
            )
        elif args.command == "show-json":
            config = DeployConfig.from_env_file(Path(args.config))
            secrets = DeploySecrets.from_dir(Path(args.secret_dir))
            credential_mode = secrets.validate(config)
            _print_json(
                {
                    "target": args.target,
                    "public_url": config.public_url,
                    "server_name": config.hostname,
                    "frontend_bind_port": config.frontend_bind_port,
                    "api_workers": config.api_workers,
                    "secret_dir": args.secret_dir,
                    "runtime_dir": args.runtime_dir,
                    "entra_graph_credential_mode": credential_mode,
                    "redis_url_file": str(Path(args.runtime_dir) / "redis_url"),
                    "auth_mode": config.auth_mode,
                    "directory_provider": config.directory_provider,
                    "local_mfa_policy": config.local_mfa_policy
                    if config.auth_mode == "password"
                    else None,
                    "identity_contract_version": IDENTITY_CONTRACT_VERSION,
                    "backend_env": config.backend_env(
                        args.target,
                        Path(args.secret_dir),
                        Path(args.runtime_dir),
                        credential_mode,
                    ),
                    "frontend_env": config.frontend_env(args.target),
                }
            )
        elif args.command == "bundle-version":
            print(_bundle_version(Path(args.bundle)))
        elif args.command == "render-linux-site":
            print(_render_linux_site(Path(args.config), args.release_root), end="")
        elif args.command == "render-linux-nginx-full":
            print(
                _render_linux_nginx_full(Path(args.config), args.release_root), end=""
            )
        elif args.command == "render-linux-backend-unit":
            print(
                _render_backend_unit(
                    Path(args.config),
                    args.current_link,
                    Path(args.runtime_dir),
                    args.redis_service,
                ),
                end="",
            )
        elif args.command == "render-linux-scheduler-unit":
            print(
                _render_scheduler_unit(
                    args.current_link, Path(args.runtime_dir), args.redis_service
                ),
                end="",
            )
        elif args.command == "render-linux-redis-unit":
            print(_render_redis_unit(Path(args.secret_dir)), end="")
        else:
            parser.error(f"Unsupported command: {args.command}")
    except (RenderError, ValueError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
