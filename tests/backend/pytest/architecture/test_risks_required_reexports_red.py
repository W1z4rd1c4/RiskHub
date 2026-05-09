"""S1.6: lock the load-bearing risks package re-export of generate_risk_id_code."""

from __future__ import annotations

import importlib
import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_generate_risk_id_code_is_re_exported_from_risks_package() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    deep = importlib.import_module("app.api.v1.endpoints.risks.id_generation")
    assert getattr(pkg, "generate_risk_id_code") is deep.generate_risk_id_code


def test_generate_risk_id_code_listed_in_package_all() -> None:
    pkg = importlib.import_module("app.api.v1.endpoints.risks")
    assert "generate_risk_id_code" in getattr(pkg, "__all__", ())


def test_two_or_more_test_files_use_package_facade_import() -> None:
    pattern = re.compile(r"from\s+app\.api\.v1\.endpoints\.risks\s+import\s+generate_risk_id_code")
    matches = []
    for path in (REPO_ROOT / "tests/backend/pytest").rglob("*.py"):
        if pattern.search(path.read_text(encoding="utf-8")):
            matches.append(str(path.relative_to(REPO_ROOT)))
    assert len(matches) >= 2, matches


def test_endpoint_invariants_doc_pins_required_reexport() -> None:
    invariants = (REPO_ROOT / "docs/agent/ENDPOINT_INVARIANTS.md").read_text(encoding="utf-8")
    assert "app.api.v1.endpoints.risks.generate_risk_id_code" in invariants
