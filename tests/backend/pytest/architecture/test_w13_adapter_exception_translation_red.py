from __future__ import annotations

import ast
import tomllib
from pathlib import Path
from typing import Any

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ARCH_DIR = Path(__file__).parent
ADAPTERS = ARCH_DIR / "_bounded_context_adapters.toml"
AUTH_SESSION_SSO_IDENTITY = REPO_ROOT / "backend/app/services/_auth_session/sso_identity.py"


def _load_toml(path: Path) -> dict[str, Any]:
    return tomllib.loads(path.read_text())


def _adapter_python_files() -> list[Path]:
    files: list[Path] = []
    for package in _load_toml(ADAPTERS).get("packages", []):
        package_dir = REPO_ROOT / "backend/app/services" / package
        if package_dir.exists():
            files.extend(package_dir.rglob("*.py"))
    return sorted(set(files))


def test_adapter_contexts_do_not_raise_fastapi_http_exception() -> None:
    offenders: list[str] = []
    for path in _adapter_python_files():
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Raise) and "HTTPException" in ast.unparse(node):
                offenders.append(str(path.relative_to(REPO_ROOT)))
                break
    assert offenders == [], f"ADR-007 adapters translate errors before HTTP projection: {offenders}"


def test_sso_adapter_translates_provider_errors_to_session_failures() -> None:
    text = AUTH_SESSION_SSO_IDENTITY.read_text()
    assert "except SsoProviderUnavailableError" in text
    assert "except SsoTokenVerificationError" in text
    assert "SsoFailure(" in text
