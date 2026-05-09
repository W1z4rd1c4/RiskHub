from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
REGISTER_LISTINGS_ROOT = REPO_ROOT / "backend/app/services/_register_listings"


def test_register_listing_services_do_not_raise_fastapi_http_exceptions() -> None:
    offenders: list[str] = []
    for path in sorted(REGISTER_LISTINGS_ROOT.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Raise) or node.exc is None:
                continue
            exc = node.exc
            if isinstance(exc, ast.Call) and getattr(exc.func, "id", None) == "HTTPException":
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []
