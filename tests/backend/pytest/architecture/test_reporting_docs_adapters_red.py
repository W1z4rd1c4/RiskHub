from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

ADMIN_DOCS_ENDPOINT = REPO_ROOT / "backend/app/api/v1/endpoints/admin/docs.py"
AUDIT_TRAIL_ENDPOINT = REPO_ROOT / "backend/app/api/v1/endpoints/reports/audit_trail_excel.py"
SUMMARY_ENDPOINT = REPO_ROOT / "backend/app/api/v1/endpoints/reports/summary_excel.py"


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text())
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
        elif isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
    return modules


def test_admin_docs_endpoint_delegates_document_assembly_to_service() -> None:
    source = ADMIN_DOCS_ENDPOINT.read_text()
    modules = _imported_modules(ADMIN_DOCS_ENDPOINT)

    assert "app.services._documentation_service" in modules
    assert "glob(" not in source
    assert "open(" not in source
    assert "_parse_frontmatter" not in source
    assert "_extract_tags_from_metadata" not in source


@pytest.mark.parametrize("endpoint", [AUDIT_TRAIL_ENDPOINT, SUMMARY_ENDPOINT])
def test_report_excel_endpoints_delegate_report_assembly_to_service(endpoint: Path) -> None:
    source = endpoint.read_text()
    modules = _imported_modules(endpoint)

    assert "app.services._reporting.excel" in modules
    for forbidden in (
        "select(",
        "selectinload",
        "db.execute",
        "generate_tabular_csv",
        "control_visibility_clause",
        "risk_visibility_clause",
        "visible_risk_ids",
    ):
        assert forbidden not in source
