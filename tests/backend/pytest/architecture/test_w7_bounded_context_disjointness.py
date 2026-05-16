from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

import pytest

from ._allowlist_expiry import assert_not_expired

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
SERVICES = REPO_ROOT / "backend/app/services"
ARCH_DIR = Path(__file__).parent

WRITE_SIDE = ARCH_DIR / "_bounded_context_write_side.toml"
READ_SHAPE = ARCH_DIR / "_bounded_context_read_shape.toml"
WORKFLOW_PAIRS = ARCH_DIR / "_bounded_context_workflow_pairs.toml"
ADAPTERS = ARCH_DIR / "_bounded_context_adapters.toml"
CROSS_CUTTING = ARCH_DIR / "_bounded_context_cross_cutting.toml"
BASELINE_PATH = ARCH_DIR / "_w7_bounded_context_disjointness_baseline.toml"
EXPECTED_DISJOINT_COUNT_KEY = "expected_disjoint_count"


def _baseline_int(key: str) -> int:
    data = tomllib.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    value = data[key]
    assert isinstance(value, int), f"{BASELINE_PATH}::{key} must be an integer"
    return value


EXPECTED_DISJOINT_COUNT = _baseline_int(EXPECTED_DISJOINT_COUNT_KEY)


def _load_toml(path: Path) -> dict[str, Any]:
    assert_not_expired(path)
    return tomllib.loads(path.read_text())


def _underscored_packages() -> set[str]:
    return {
        path.name
        for path in SERVICES.iterdir()
        if path.is_dir() and path.name.startswith("_") and path.name != "__pycache__"
    }


def test_every_package_in_a_primary_allowlist_or_workflow_pair() -> None:
    pkgs = _underscored_packages()
    write_side = set(_load_toml(WRITE_SIDE).get("packages", []))
    read_shape = set(_load_toml(READ_SHAPE).get("packages", []))
    adapters = set(_load_toml(ADAPTERS).get("packages", []))
    cross_cutting = set(_load_toml(CROSS_CUTTING).get("packages", []))
    pairs = _load_toml(WORKFLOW_PAIRS).get("pairs", [])
    workflow_lefts = {pair["left"] for pair in pairs}
    workflow_rights = {pair["right"] for pair in pairs}

    primaries = write_side | read_shape | adapters | cross_cutting | workflow_lefts | workflow_rights
    unclassified = pkgs - primaries
    assert unclassified == set(), f"ADR-007 amendment: unclassified packages: {unclassified}"

    documented_dual = set(_load_toml(READ_SHAPE)["dual_classed_packages"])
    overlaps = (write_side & read_shape) - documented_dual
    assert overlaps == set(), f"undocumented dual-class: {overlaps}"


def test_register_listings_is_dual_classed() -> None:
    write_side = set(_load_toml(WRITE_SIDE).get("packages", []))
    read_shape = set(_load_toml(READ_SHAPE).get("packages", []))
    assert "_register_listings" in write_side
    assert "_register_listings" in read_shape


def test_monitoring_response_is_file_entry_in_read_shape() -> None:
    files = set(_load_toml(READ_SHAPE).get("files", []))
    assert "backend/app/services/_monitoring_response.py" in files


def test_at_least_32_packages_classified() -> None:
    """Phase 7: #61 landed; lock asserts >= 32 underscored packages."""
    pkgs = _underscored_packages()
    assert len(pkgs) >= EXPECTED_DISJOINT_COUNT, (
        f"expected >= {EXPECTED_DISJOINT_COUNT} underscored packages per "
        f"{BASELINE_PATH}::{EXPECTED_DISJOINT_COUNT_KEY}, got {len(pkgs)}"
    )
