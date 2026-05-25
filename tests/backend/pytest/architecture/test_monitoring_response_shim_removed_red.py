"""RED: _monitoring_response endpoints shim deleted; canonical service path used."""

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
FORBIDDEN_ENDPOINT_SHIM_IMPORT = "app.api.v1.endpoints._monitoring_response"
EXCLUDED_PATH_PARTS = {"venv", "__pycache__", ".mypy_cache", ".pytest_cache"}


def _python_files(root: Path) -> list[Path]:
    return [
        path
        for path in sorted(root.rglob("*.py"))
        if not (set(path.relative_to(root).parts) & EXCLUDED_PATH_PARTS)
    ]


def test_endpoint_shim_file_deleted() -> None:
    assert not (REPO_ROOT / "backend/app/api/v1/endpoints/_monitoring_response.py").exists()


def _find_endpoint_monitoring_shim_imports(root: Path) -> list[str]:
    offenders: list[str] = []
    for path in _python_files(root):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        except SyntaxError as exc:
            raise AssertionError(f"Could not parse {path}: {exc}") from exc

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == FORBIDDEN_ENDPOINT_SHIM_IMPORT:
                relative = path.relative_to(root)
                for alias in node.names:
                    offenders.append(f"{relative} imports {FORBIDDEN_ENDPOINT_SHIM_IMPORT}.{alias.name}")
    return offenders


def test_endpoint_import_shim_detector_reports_direct_import(tmp_path: Path) -> None:
    offender = tmp_path / "offender.py"
    offender.write_text(
        "from app.api.v1.endpoints._monitoring_response import serialize_risk_read\n",
        encoding="utf-8",
    )

    assert _find_endpoint_monitoring_shim_imports(tmp_path) == [
        "offender.py imports app.api.v1.endpoints._monitoring_response.serialize_risk_read"
    ]


def test_no_endpoint_imports_shim() -> None:
    offenders = _find_endpoint_monitoring_shim_imports(REPO_ROOT / "backend")
    assert offenders == []


def test_canonical_service_module_exposes_surface() -> None:
    from app.services import _monitoring_response as svc

    for name in (
        "MonitoringResponseContext",
        "build_control_monitoring_fields",
        "build_kri_monitoring_fields",
        "load_monitoring_response_context",
        "serialize_control_brief_for_link",
        "serialize_control_read",
        "serialize_control_risk_link",
        "serialize_kri_response",
        "serialize_risk_read",
    ):
        assert hasattr(svc, name), name
