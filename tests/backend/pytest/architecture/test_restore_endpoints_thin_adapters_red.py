from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
RESTORE_ENDPOINTS = [
    REPO_ROOT / "backend/app/api/v1/endpoints/risks/crud/restore.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/controls/crud/restore.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/kris/crud/restore.py",
]
FORBIDDEN_TEXT = [
    "select(",
    "selectinload",
    "joinedload",
    "db.execute",
    "db.commit",
    "db.flush",
    "db.refresh",
    "commit_service_transaction",
]


def test_restore_endpoints_are_http_adapters_only() -> None:
    offenders: dict[str, list[str]] = {}
    for path in RESTORE_ENDPOINTS:
        source = path.read_text()
        tree = ast.parse(source)
        violations = [text for text in FORBIDDEN_TEXT if text in source]
        if any(
            isinstance(node, ast.ImportFrom)
            and node.module is not None
            and (node.module == "app.models" or node.module.startswith("app.models."))
            for node in ast.walk(tree)
        ):
            violations.append("app.models import")
        if violations:
            offenders[path.relative_to(REPO_ROOT).as_posix()] = sorted(set(violations))

    assert offenders == {}
