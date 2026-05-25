from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


REPO_ROOT = Path(__file__).resolve().parents[4]
VENDOR_SERVICE_FILES = [
    REPO_ROOT / "backend/app/services/_vendor_governance/lifecycle.py",
    REPO_ROOT / "backend/app/services/_vendor_governance/links.py",
    REPO_ROOT / "backend/app/services/_vendor_governance/policy.py",
    REPO_ROOT / "backend/app/services/_vendor_links/kri_bridge.py",
]
VENDOR_ENDPOINT_ROOT = REPO_ROOT / "backend/app/api/v1/endpoints/vendors"


def _python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if path.is_file())


def test_vendor_governance_services_do_not_raise_fastapi_http_exceptions():
    offenders: list[str] = []
    for path in VENDOR_SERVICE_FILES:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Raise) or node.exc is None:
                continue
            call = node.exc
            if isinstance(call, ast.Call) and getattr(call.func, "id", None) == "HTTPException":
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{node.lineno}")

    assert offenders == []


def test_vendor_endpoints_do_not_own_raw_database_commits():
    offenders: list[str] = []
    for path in _python_files(VENDOR_ENDPOINT_ROOT):
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


def test_kri_vendor_assignment_old_path_is_removed() -> None:
    assert not (REPO_ROOT / "backend/app/services/kri_vendor_assignment.py").exists()
    assert not (REPO_ROOT / "backend/app/services/_vendor_links/kri_assignment.py").exists()


def test_kri_bridge_uses_canonical_link_mutators() -> None:
    path = REPO_ROOT / "backend/app/services/_vendor_links/kri_bridge.py"
    text = path.read_text(encoding="utf-8")
    for forbidden in ("db.add(VendorRiskLink(", "db.add(VendorKRILink(", "await db.delete(link)"):
        assert forbidden not in text, f"direct table mutation {forbidden} in {path}"


def test_kri_assignment_imports_migrated_in_one_step() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend").rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        if "app.services._vendor_links.kri_assignment" in path.read_text(encoding="utf-8"):
            offenders.append(str(path.relative_to(REPO_ROOT)))

    assert offenders == []
