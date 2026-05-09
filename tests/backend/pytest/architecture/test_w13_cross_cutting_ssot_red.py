from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ARCH_DIR = Path(__file__).parent
CROSS_CUTTING = ARCH_DIR / "_bounded_context_cross_cutting.toml"


def _load_toml(path: Path) -> dict[str, Any]:
    return tomllib.loads(path.read_text())


def test_cross_cutting_contexts_are_registered() -> None:
    packages = set(_load_toml(CROSS_CUTTING).get("packages", []))
    assert packages == {"_authorization_capabilities", "_config"}


def test_authorization_capabilities_binds_to_adr_001_interface() -> None:
    init_text = (REPO_ROOT / "backend/app/services/_authorization_capabilities/__init__.py").read_text()
    adr_text = (REPO_ROOT / "docs/adr/ADR-001-capabilities-module-unification.md").read_text()
    assert "Capabilities" in init_text
    assert "build_me_capabilities" in init_text
    assert "Capabilities" in adr_text


def test_config_context_binds_to_adr_008_ssot_chain() -> None:
    lookup_text = (REPO_ROOT / "backend/app/services/_config/lookup.py").read_text()
    adr_text = (REPO_ROOT / "docs/adr/ADR-008-risk-threshold-ssot.md").read_text()
    assert "class ConfigDefaults" in lookup_text
    assert "REPORTING_GRACE_DAYS = 15" not in lookup_text
    assert "Risk Threshold" in adr_text
