from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
RISKHUB_CONFIG_SERVICE_ROOT = REPO_ROOT / "backend/app/services/_riskhub_config"
RISKHUB_ENDPOINT_ROOT = REPO_ROOT / "backend/app/api/v1/endpoints/riskhub"


def _python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


def test_riskhub_config_services_do_not_raise_fastapi_http_exceptions():
    offenders: list[str] = []
    for path in _python_files(RISKHUB_CONFIG_SERVICE_ROOT):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Raise) or node.exc is None:
                continue
            call = node.exc
            if isinstance(call, ast.Call) and getattr(call.func, "id", None) == "HTTPException":
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []


def test_riskhub_endpoints_do_not_own_raw_database_commits():
    offenders: list[str] = []
    for path in _python_files(RISKHUB_ENDPOINT_ROOT):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Await):
                continue
            call = node.value
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr == "commit"
            ):
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []
