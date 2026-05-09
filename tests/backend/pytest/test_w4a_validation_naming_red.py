from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _python_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*.py") if "__pycache__" not in path.parts]


def test_domain_exception_surface_uses_validation_error_name_only() -> None:
    source = (ROOT / "backend/app/core/exceptions.py").read_text()
    tree = ast.parse(source)

    exported_names = {
        node.name
        for node in tree.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    }
    assigned_names = {
        target.id
        for node in tree.body
        if isinstance(node, ast.Assign)
        for target in node.targets
        if isinstance(target, ast.Name)
    }

    assert "ValidationError" in exported_names
    assert "ValidationFailure" not in exported_names | assigned_names


def test_application_code_imports_canonical_validation_error_name() -> None:
    offenders: list[str] = []
    for path in _python_files(ROOT / "backend/app"):
        if "ValidationFailure" in path.read_text():
            offenders.append(str(path.relative_to(ROOT)))

    assert offenders == []
