from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
CREATE_ENDPOINTS = [
    REPO_ROOT / "backend/app/api/v1/endpoints/risks/crud/create.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/controls/crud/create.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/kris/crud/create.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/issues/crud/create.py",
    REPO_ROOT / "backend/app/api/v1/endpoints/issues/crud/contextual.py",
]

FORBIDDEN_TEXT = [
    "MAX_RETRIES",
    "IntegrityError",
    "for attempt in range",
    "Risk(",
    "Control(",
    "KeyRiskIndicator(",
    "Issue(",
    "IssueRemediationPlan(",
    "db.add",
    "db.flush",
    "db.refresh",
    "db.rollback",
    "db.commit",
    "commit_service_transaction",
    "select(",
    "selectinload",
    "joinedload",
    "db.execute",
]
FORBIDDEN_MODEL_IMPORTS = {
    "Control",
    "Issue",
    "IssueRemediationPlan",
    "IssueRemediationStatus",
    "IssueStatus",
    "KeyRiskIndicator",
    "Risk",
    "VendorKRILink",
}


def _forbidden_model_imports(tree: ast.AST) -> list[str]:
    violations: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom) or node.module not in {"app.models", "app.models.issue"}:
            continue
        for alias in node.names:
            if alias.name in FORBIDDEN_MODEL_IMPORTS:
                violations.append(f"{node.module}.{alias.name}")
    return violations


def test_create_endpoints_are_http_adapters_only() -> None:
    offenders: dict[str, list[str]] = {}
    for path in CREATE_ENDPOINTS:
        source = path.read_text()
        tree = ast.parse(source)
        violations = [text for text in FORBIDDEN_TEXT if text in source]
        violations.extend(_forbidden_model_imports(tree))
        if violations:
            offenders[path.relative_to(REPO_ROOT).as_posix()] = sorted(set(violations))

    assert offenders == {}
