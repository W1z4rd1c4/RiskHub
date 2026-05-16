"""BL §6.1: sensitive-field resources are a closed set."""

from __future__ import annotations

import tomllib
from pathlib import Path

import pytest

from app.core._permissions.sensitive import SENSITIVE_FIELDS

pytestmark = pytest.mark.contract

BASELINE = Path(__file__).parent / "_sensitive_fields_baseline.toml"


def test_sensitive_fields_closed_set_red() -> None:
    baseline = tomllib.loads(BASELINE.read_text(encoding="utf-8"))
    expected_resources = set(baseline["expected_resources"])

    actual_resources = set(SENSITIVE_FIELDS)
    unexpected = actual_resources - expected_resources
    assert unexpected == set(), (
        f"unexpected sensitive resources {sorted(unexpected)} in SENSITIVE_FIELDS; "
        f"closed set is {sorted(expected_resources)} per {BASELINE}::expected_resources"
    )
    assert actual_resources == expected_resources, (
        f"SENSITIVE_FIELDS resources must match {BASELINE}::expected_resources; "
        f"found {sorted(actual_resources)}"
    )

    for resource, fields in baseline["minimum_fields"].items():
        missing = set(fields) - SENSITIVE_FIELDS[resource]
        assert missing == set(), f"{resource} missing {sorted(missing)} per {BASELINE}::minimum_fields"

    for resource, fields in baseline["exact_fields"].items():
        assert SENSITIVE_FIELDS[resource] == set(fields), (
            f"{resource} fields must equal {BASELINE}::exact_fields; "
            f"found {sorted(SENSITIVE_FIELDS[resource])}"
        )
