from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


REPO_ROOT = Path(__file__).resolve().parents[4]
KRI_HISTORY_ROOT = REPO_ROOT / "backend/app/services/_kri_history"


def _python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if path.is_file())


def test_kri_history_services_do_not_raise_fastapi_http_exceptions():
    offenders: list[str] = []
    for path in _python_files(KRI_HISTORY_ROOT):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Raise) or node.exc is None:
                continue
            call = node.exc
            if isinstance(call, ast.Call) and getattr(call.func, "id", None) == "HTTPException":
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []
