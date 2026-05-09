from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CONSUMERS = [
    "backend/app/services/_kri_history/corrections.py",
    "backend/app/services/_kri_history/recording.py",
    "backend/app/services/kri_deadline_decisions.py",
    "backend/app/services/_reporting/exports/rows.py",
    "backend/app/services/_monitoring_status/kris.py",
]


def _source(path: str) -> str:
    return (REPO_ROOT / path).read_text()


def test_kri_breach_consumers_call_classifier_not_model_property() -> None:
    for path in CONSUMERS:
        source = _source(path)
        assert "classify_kri_breach" in source, path
        tree = ast.parse(source)
        offenders = [
            node.lineno
            for node in ast.walk(tree)
            if isinstance(node, ast.Attribute)
            and node.attr == "breach_status"
            and isinstance(node.value, ast.Name)
            and node.value.id == "kri"
        ]
        assert offenders == [], path


def test_key_risk_indicator_model_has_no_breach_status_property() -> None:
    tree = ast.parse(_source("backend/app/models/key_risk_indicator.py"))
    property_names: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        if any(isinstance(decorator, ast.Name) and decorator.id == "property" for decorator in node.decorator_list):
            property_names.add(node.name)

    assert "breach_status" not in property_names
