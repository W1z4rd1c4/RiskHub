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


def test_kri_endpoint_dept_scope_is_extracted() -> None:
    inline_offenders: list[str] = []
    for fname in ("due_soon.py", "overdue.py", "breaches.py"):
        path = REPO_ROOT / "backend/app/api/v1/endpoints/kris/crud" / fname
        if "get_user_department_ids" in path.read_text(encoding="utf-8"):
            inline_offenders.append(fname)
    assert inline_offenders == []


def test_kri_form_facade_is_removed() -> None:
    assert not (REPO_ROOT / "frontend/src/components/KRIForm.tsx").exists()


def test_eslint_kri_form_pin_is_removed() -> None:
    eslint = (REPO_ROOT / "frontend/eslint.config.js").read_text(encoding="utf-8")
    assert "src/components/KRIForm.tsx" not in eslint


def test_no_module_imports_kri_form_facade() -> None:
    offenders: list[str] = []
    single_quote_import = "@/components/" + "KRIForm'"
    double_quote_import = '"@/components/' + 'KRIForm"'
    double_quote_mock = 'vi.mock("@/components/' + 'KRIForm"'
    for root in (REPO_ROOT / "frontend/src", REPO_ROOT / "tests/frontend/unit/src"):
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
                continue
            text = path.read_text(encoding="utf-8")
            if single_quote_import in text or double_quote_import in text or double_quote_mock in text:
                offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []


def test_kris_linked_vendors_barrel_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/api/v1/endpoints/kris/linked_vendors.py").exists()


def test_kri_history_value_application_alias_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/_kri_history/value_application.py").exists()


def test_no_module_imports_value_application() -> None:
    backend_root = REPO_ROOT / "backend"
    offenders: list[str] = []
    for path in backend_root.rglob("*.py"):
        if "_kri_history.value_application" in path.read_text(encoding="utf-8"):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == []
