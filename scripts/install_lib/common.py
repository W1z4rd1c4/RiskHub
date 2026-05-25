from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable
from urllib.error import URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class InstallPaths:
    repo_root: Path
    config_path: Path
    secret_dir: Path
    runtime_dir: Path
    linux_root: Path
    linux_current_link: Path
    compose_script: Path
    dev_script: Path
    deploy_script: Path
    install_state_basename: str = "install-state.json"
    linux_backend_service: str = "riskhub-backend"
    linux_scheduler_service: str = "riskhub-scheduler"
    linux_redis_service: str = "riskhub-redis"


@dataclass(frozen=True)
class SharedOptions:
    dry_run: bool = False
    yes: bool = False
    verbose: bool = False


def get_paths() -> InstallPaths:
    linux_root = Path(os.environ.get("RISKHUB_LINUX_ROOT", "/opt/riskhub"))
    return InstallPaths(
        repo_root=REPO_ROOT,
        config_path=Path(os.environ.get("RISKHUB_DEFAULT_CONFIG_PATH", "/etc/riskhub/riskhub.env")),
        secret_dir=Path(os.environ.get("RISKHUB_DEFAULT_SECRET_DIR", "/etc/riskhub/secrets")),
        runtime_dir=Path(os.environ.get("RISKHUB_RUNTIME_DIR", "/etc/riskhub/runtime")),
        linux_root=linux_root,
        linux_current_link=linux_root / "current",
        compose_script=Path(os.environ.get("RISKHUB_INSTALL_COMPOSE_SCRIPT", str(REPO_ROOT / "scripts" / "compose.sh"))),
        dev_script=Path(os.environ.get("RISKHUB_INSTALL_DEV_SCRIPT", str(REPO_ROOT / "scripts" / "dev.sh"))),
        deploy_script=Path(os.environ.get("RISKHUB_INSTALL_DEPLOY_SCRIPT", str(REPO_ROOT / "scripts" / "deploy.sh"))),
        linux_backend_service=os.environ.get("RISKHUB_LINUX_BACKEND_SERVICE", "riskhub-backend"),
        linux_scheduler_service=os.environ.get("RISKHUB_LINUX_SCHEDULER_SERVICE", "riskhub-scheduler"),
        linux_redis_service=os.environ.get("RISKHUB_LINUX_REDIS_SERVICE", "riskhub-redis"),
    )


def timestamp_utc() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def run_command(args: Iterable[str | Path], *, options: SharedOptions, cwd: Path | None = None) -> None:
    command = [str(arg) for arg in args]
    if options.dry_run:
        print("+ " + " ".join(shlex.quote(part) for part in command), file=os.sys.stderr)
        return
    subprocess.run(command, cwd=cwd or REPO_ROOT, check=True)


def run_capture(args: Iterable[str | Path], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    command = [str(arg) for arg in args]
    return subprocess.run(command, cwd=cwd or REPO_ROOT, check=False, capture_output=True, text=True)


def curl_ok(url: str) -> bool:
    try:
        with urlopen(url, timeout=10) as response:  # noqa: S310 - fixed localhost/operator URLs only
            return 200 <= response.status < 400
    except (OSError, URLError):
        return False


def port_listening(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def read_envfile_value(path: Path, key: str) -> str | None:
    if not path.exists():
        return None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        current_key, current_value = line.split("=", 1)
        if current_key == key:
            return current_value
    return None


def production_public_url(config_path: Path) -> str:
    return read_envfile_value(config_path, "PUBLIC_URL") or ""


CONFIG_PLACEHOLDERS = {
    "PUBLIC_URL": "https://riskhub.example.com",
    "ENTRA_TENANT_ID": "00000000-0000-0000-0000-000000000000",
    "ENTRA_CLIENT_ID": "11111111-1111-1111-1111-111111111111",
    "BOOTSTRAP_ADMIN_EMAIL": "admin@example.com",
    "BOOTSTRAP_CRO_EMAIL": "cro@example.com",
}

CONFIG_PROMPTS = {
    "PUBLIC_URL": "Public RiskHub URL",
    "ENTRA_TENANT_ID": "Microsoft Entra tenant ID",
    "ENTRA_CLIENT_ID": "Microsoft Entra client ID",
    "BOOTSTRAP_ADMIN_EMAIL": "Bootstrap admin email",
    "BOOTSTRAP_CRO_EMAIL": "Bootstrap CRO email",
}

SECRET_PLACEHOLDERS = {
    "database_url": "CHANGE_ME_DATABASE_URL",
    "secret_key": "CHANGE_ME_SECRET_KEY_AT_LEAST_32_CHARACTERS",
    "entra_client_secret": "CHANGE_ME_ENTRA_CLIENT_SECRET",
    "entra_client_certificate_private_key": "CHANGE_ME_ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY",
    "redis_password": "CHANGE_ME_REDIS_PASSWORD",
}


def bundle_version_guess(bundle: str | None) -> str | None:
    if not bundle:
        return None
    bundle_name = Path(bundle).name
    parts = bundle_name.replace(".tar.gz", "").replace(".tgz", "").split("-")
    for part in parts:
        if part.startswith("v"):
            return part
    return None


def dump_json(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True)


def prompt_value(prompt: str, default: str, *, options: SharedOptions) -> str:
    if options.yes or not os.isatty(0):
        raise RuntimeError(f"Missing required input in non-interactive mode: {prompt}")
    value = input(f"{prompt} [{default}]: ").strip()
    return value or default


def write_envfile_value(path: Path, key: str, value: str) -> None:
    lines: list[str] = []
    replaced = False
    if path.exists():
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            if raw_line.startswith(f"{key}="):
                lines.append(f"{key}={value}")
                replaced = True
            else:
                lines.append(raw_line)
    if not replaced:
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def config_value_is_placeholder(key: str, value: str | None) -> bool:
    placeholder = CONFIG_PLACEHOLDERS[key]
    return value is None or value.strip() == "" or value.strip() == placeholder


def ensure_production_config_ready(config_path: Path, *, options: SharedOptions) -> None:
    for key, placeholder in CONFIG_PLACEHOLDERS.items():
        current_value = read_envfile_value(config_path, key)
        if not config_value_is_placeholder(key, current_value):
            continue
        replacement = prompt_value(CONFIG_PROMPTS[key], placeholder, options=options)
        if config_value_is_placeholder(key, replacement):
            raise RuntimeError(f"{key} must be changed from the template placeholder.")
        write_envfile_value(config_path, key, replacement)


def secret_placeholder(name: str) -> str:
    return SECRET_PLACEHOLDERS[name]


def trimmed_file_value(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


def secret_value_is_placeholder(secret_dir: Path, name: str) -> bool:
    path = secret_dir / name
    value = trimmed_file_value(path)
    return value == "" or value == secret_placeholder(name)


def required_secret_missing(secret_dir: Path, secret_name: str) -> bool:
    return not (secret_dir / secret_name).exists()


def have_editor() -> bool:
    return bool(os.environ.get("VISUAL") or os.environ.get("EDITOR"))


def show_help() -> None:
    print(
        """Usage: ./scripts/install.sh <demo|dev|production|verify|status|logs|doctor|upgrade> [options]

Public first-run and lifecycle installer for RiskHub.

Commands:
  demo                         Docker-backed demo/onboarding install
  dev                          Local contributor install/startup
  production --target TARGET   Guided production install wrapper (docker|linux)
  upgrade --target TARGET      Guided production upgrade wrapper (docker|linux)
  verify --mode MODE           Verify an existing install (demo|dev|production)
  status --mode MODE           Report runtime status (demo|dev|production)
  logs --mode MODE             Stream runtime logs (demo|dev|production)
  doctor --mode MODE           Diagnose or repair runtime issues (demo|dev|production)

Shared options:
  --dry-run                    Print commands without executing them
  --yes                        Non-interactive mode where supported
  --verbose                    More logging

Examples:
  ./scripts/install.sh demo
  ./scripts/install.sh demo --reset test
  ./scripts/install.sh dev
  ./scripts/install.sh dev --backend
  ./scripts/install.sh production --target docker --backend-image ghcr.io/owner/riskhub-backend:v1.2.3@sha256:<digest> --backend-db-image ghcr.io/owner/riskhub-backend-db:v1.2.3@sha256:<digest> --frontend-image ghcr.io/owner/riskhub-frontend:v1.2.3@sha256:<digest> --redis-image ghcr.io/owner/riskhub-redis:v1.2.3@sha256:<digest>
  ./scripts/install.sh production --target linux --bundle ./riskhub-linux-v1.2.3.tar.gz
  ./scripts/install.sh upgrade --target docker --backend-image ghcr.io/owner/riskhub-backend:v1.2.4@sha256:<digest> --backend-db-image ghcr.io/owner/riskhub-backend-db:v1.2.4@sha256:<digest> --frontend-image ghcr.io/owner/riskhub-frontend:v1.2.4@sha256:<digest> --redis-image ghcr.io/owner/riskhub-redis:v1.2.4@sha256:<digest>
  ./scripts/install.sh status --mode production --target docker --json
  ./scripts/install.sh logs --mode dev --tail 200 --follow
  ./scripts/install.sh doctor --mode production --target linux --repair

Advanced/manual entrypoints remain available:
  ./scripts/compose.sh
  ./scripts/dev.sh
  ./scripts/deploy.sh"""
    )
