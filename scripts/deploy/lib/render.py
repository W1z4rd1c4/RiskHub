#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import shlex
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse


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
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _render_template(path: Path, replacements: dict[str, str]) -> str:
    text = path.read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace(f"__{key}__", value)
    return text


def _render_shell_assignments(values: dict[str, str]) -> str:
    return "".join(f"{key}={shlex.quote(str(value))}\n" for key, value in values.items())


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
    if not isinstance(parsed, list) or not all(isinstance(item, str) and item.strip() for item in parsed):
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
    if value == SECRET_PLACEHOLDERS[field_name]:
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
            entra_client_certificate_private_key_path=secret_dir / "entra_client_certificate_private_key",
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
        return _read_optional_secret_file(self.entra_client_certificate_private_key_path)

    @property
    def redis_password(self) -> str:
        return _read_secret_file(self.redis_password_path, "redis_password")

    def validate(self, config: "DeployConfig") -> str:
        database_url = self.database_url
        if database_url == DEFAULT_DATABASE_URL:
            raise RenderError("database_url secret must not use the default placeholder")
        if "@db:" in database_url:
            raise RenderError("database_url secret must not target docker-compose hostname 'db'")

        secret_key = self.secret_key
        if len(secret_key) < 32:
            raise RenderError("secret_key must be at least 32 characters long")

        _ = self.redis_password
        client_secret = self.optional_entra_client_secret()
        certificate_key = self.optional_entra_client_certificate_private_key()
        secret_ready = bool(client_secret and client_secret != SECRET_PLACEHOLDERS["entra_client_secret"])
        certificate_key_ready = bool(
            certificate_key
            and certificate_key != SECRET_PLACEHOLDERS["entra_client_certificate_private_key"]
        )
        thumbprint_ready = bool(config.entra_client_certificate_thumbprint)

        if thumbprint_ready and not certificate_key_ready:
            raise RenderError(
                "ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is set but no valid entra_client_certificate_private_key secret file was found"
            )
        if certificate_key_ready and not thumbprint_ready:
            raise RenderError(
                "entra_client_certificate_private_key is configured but ENTRA_CLIENT_CERTIFICATE_THUMBPRINT is missing"
            )
        if certificate_key is not None and certificate_key == "":
            raise RenderError(
                f"entra_client_certificate_private_key must not be empty ({self.entra_client_certificate_private_key_path})"
            )

        if certificate_key_ready:
            return "certificate"
        if secret_ready:
            return "secret"
        raise RenderError(
            "No Entra Graph credential is configured. Configure either entra_client_secret or certificate credential inputs."
        )


@dataclass(frozen=True)
class DeployConfig:
    public_url: str
    entra_tenant_id: str
    entra_client_id: str
    entra_client_certificate_thumbprint: str | None
    bootstrap_admin_email: str
    bootstrap_cro_email: str
    api_workers: int
    frontend_bind_port: int
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
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.path not in {"", "/"}:
            raise RenderError("PUBLIC_URL must be an origin only, for example https://riskhub.example.com")

        api_workers = _validate_positive_int("API_WORKERS", values.get("API_WORKERS", "4"))
        frontend_bind_port = _validate_port("FRONTEND_BIND_PORT", values.get("FRONTEND_BIND_PORT", "80"))

        admin_email = _validate_email("BOOTSTRAP_ADMIN_EMAIL", require("BOOTSTRAP_ADMIN_EMAIL"))
        cro_email = _validate_email("BOOTSTRAP_CRO_EMAIL", require("BOOTSTRAP_CRO_EMAIL"))
        if admin_email.lower() == cro_email.lower():
            raise RenderError("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_CRO_EMAIL must be different")

        trusted_proxies_raw = values.get("TRUSTED_PROXIES", "").strip()
        trusted_proxies = _parse_json_string_list("TRUSTED_PROXIES", trusted_proxies_raw) if trusted_proxies_raw else None
        docker_network_subnet = _validate_cidr(
            "DOCKER_NETWORK_SUBNET",
            values.get("DOCKER_NETWORK_SUBNET", DEFAULT_DOCKER_NETWORK_SUBNET),
        )

        return cls(
            public_url=public_url,
            entra_tenant_id=require("ENTRA_TENANT_ID"),
            entra_client_id=require("ENTRA_CLIENT_ID"),
            entra_client_certificate_thumbprint=values.get("ENTRA_CLIENT_CERTIFICATE_THUMBPRINT", "").strip() or None,
            bootstrap_admin_email=admin_email,
            bootstrap_cro_email=cro_email,
            api_workers=api_workers,
            frontend_bind_port=frontend_bind_port,
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

    def backend_env(self, target: str, secret_dir: Path, runtime_dir: Path, credential_mode: str) -> str:
        values = {
            "DEBUG": "false",
            "MOCK_AUTH_ENABLED": "false",
            "AUTH_MODE": "microsoft_sso",
            "DIRECTORY_PROVIDER": "graph",
            "SECRET_KEY_FILE": str(secret_dir / "secret_key"),
            "DATABASE_URL_FILE": str(secret_dir / "database_url"),
            "CORS_ORIGINS": json.dumps([self.public_url]),
            "ALLOWED_HOSTS": json.dumps([self.hostname]),
            "TRUSTED_PROXIES": json.dumps(self.effective_trusted_proxies(target)),
            "REDIS_URL_FILE": str(runtime_dir / "redis_url"),
            "ENTRA_TENANT_ID": self.entra_tenant_id,
            "ENTRA_CLIENT_ID": self.entra_client_id,
            "ENTRA_JIT_PROVISIONING_ENABLED": "false",
            "AUTH_SSO_ALLOW_EMAIL_LINK": "false",
            "AUTH_SSO_REQUIRE_CHALLENGE": "false",
            "AD_DEPROVISION_CHECK_INTERVAL_MINUTES": "15",
            "BOOTSTRAP_ADMIN_EMAIL": self.bootstrap_admin_email,
            "BOOTSTRAP_ADMIN_ROLE": "admin",
            "BOOTSTRAP_ADMIN_ACCESS_SCOPE": "global",
            "BOOTSTRAP_CRO_EMAIL": self.bootstrap_cro_email,
            "BOOTSTRAP_CRO_ACCESS_SCOPE": "global",
        }
        if target == "docker":
            values["DOCKER_NETWORK_SUBNET"] = self.docker_network_subnet
        if credential_mode == "certificate":
            assert self.entra_client_certificate_thumbprint is not None
            values["ENTRA_CLIENT_CERTIFICATE_THUMBPRINT"] = self.entra_client_certificate_thumbprint
            values["ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE"] = str(
                secret_dir / "entra_client_certificate_private_key"
            )
        else:
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
            "PUBLIC_URL": self.public_url,
            "SERVER_NAME": self.hostname,
            "CORS_ORIGINS_JSON": json.dumps([self.public_url]),
            "ALLOWED_HOSTS_JSON": json.dumps([self.hostname]),
            "TRUSTED_PROXIES_JSON": json.dumps(self.effective_trusted_proxies(target)),
            "SECRET_DIR": str(secret_dir),
            "RUNTIME_DIR": str(runtime_dir),
            "REDIS_URL_FILE": str(runtime_dir / "redis_url"),
            "REDIS_PASSWORD_FILE": str(secret_dir / "redis_password"),
            "REDIS_URL": self.redis_url(target, secrets),
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


def _write_runtime_files(config_path: Path, target: str, secret_dir: Path, runtime_dir: Path, out_dir: Path) -> None:
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
    (out_dir / "redis_url").write_text(config.redis_url(target, secrets) + "\n", encoding="utf-8")


def _bundle_manifest(bundle_path: Path) -> dict[str, object]:
    with tarfile.open(bundle_path, "r:*") as archive:
        manifest_member = next(
            (member for member in archive.getmembers() if member.name.endswith("/manifest.json")),
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


def _render_backend_unit(config_path: Path, current_link: str, runtime_dir: Path, redis_service: str) -> str:
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


def _render_scheduler_unit(current_link: str, runtime_dir: Path, redis_service: str) -> str:
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
    parser = argparse.ArgumentParser(description="Render RiskHub deployment runtime artifacts")
    sub = parser.add_subparsers(dest="command", required=True)

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
    render_scheduler_unit.add_argument("--runtime-dir", default=str(DEFAULT_RUNTIME_DIR))
    render_scheduler_unit.add_argument("--redis-service", default="riskhub-redis")

    render_redis_unit = sub.add_parser("render-linux-redis-unit")
    render_redis_unit.add_argument("--secret-dir", default=str(DEFAULT_SECRET_DIR))

    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "write-runtime":
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
                    "redis_url": config.redis_url(args.target, secrets),
                    "backend_env": config.backend_env(args.target, Path(args.secret_dir), Path(args.runtime_dir), credential_mode),
                    "frontend_env": config.frontend_env(args.target),
                }
            )
        elif args.command == "bundle-version":
            print(_bundle_version(Path(args.bundle)))
        elif args.command == "render-linux-site":
            print(_render_linux_site(Path(args.config), args.release_root), end="")
        elif args.command == "render-linux-nginx-full":
            print(_render_linux_nginx_full(Path(args.config), args.release_root), end="")
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
            print(_render_scheduler_unit(args.current_link, Path(args.runtime_dir), args.redis_service), end="")
        elif args.command == "render-linux-redis-unit":
            print(_render_redis_unit(Path(args.secret_dir)), end="")
        else:
            parser.error(f"Unsupported command: {args.command}")
    except RenderError as exc:
        parser.exit(1, f"ERROR: {exc}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
