from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from ._registry_policy import load_architecture_registry, load_exception_registry

pytestmark = pytest.mark.contract
ARCH_DIR = Path(__file__).parent

EXCEPTION = '''schema_version = 1
kind = "temporary_exceptions"
decision = "test-decision"
[[allowlist]]
file = "backend/app/example.py"
owner = "RiskHub Maintainer"
rationale = "Migrate the legacy boundary with atomicity coverage"
expires_at = "2026-11-11"
'''


@pytest.mark.parametrize("day", [date(2026, 11, 10), date(2026, 11, 11)])
def test_exception_is_valid_before_and_on_expiry(tmp_path, day):
    path = tmp_path / "exceptions.toml"
    path.write_text(EXCEPTION)
    load_exception_registry(path, decision="test-decision", entries_key="allowlist", today=day)


def test_exception_fails_the_day_after_expiry(tmp_path):
    path = tmp_path / "exceptions.toml"
    path.write_text(EXCEPTION)
    with pytest.raises(AssertionError, match="elapsed"):
        load_exception_registry(
            path, decision="test-decision", entries_key="allowlist", today=date(2026, 11, 12)
        )


@pytest.mark.parametrize("key", ["schema_version", "kind", "decision", "owner", "rationale", "expires_at"])
def test_missing_metadata_cannot_disable_exception_policy(tmp_path, key):
    path = tmp_path / "exceptions.toml"
    path.write_text("\n".join(line for line in EXCEPTION.splitlines() if not line.startswith(f"{key} =")))
    with pytest.raises(AssertionError):
        load_exception_registry(
            path, decision="test-decision", entries_key="allowlist", today=date(2026, 11, 11)
        )


@pytest.mark.parametrize("key", ["owner", "rationale", "expires_at"])
def test_empty_exception_metadata_is_rejected(tmp_path, key):
    path = tmp_path / "exceptions.toml"
    path.write_text("\n".join(
        f'{key} = " "' if line.startswith(f"{key} =") else line
        for line in EXCEPTION.splitlines()
    ))
    with pytest.raises(AssertionError, match=f"missing {key}"):
        load_exception_registry(path, decision="test-decision", entries_key="allowlist")


def test_each_exception_requires_its_own_expiry(tmp_path):
    path = tmp_path / "exceptions.toml"
    path.write_text(EXCEPTION + '''
[[allowlist]]
file = "backend/app/another.py"
owner = "RiskHub Maintainer"
rationale = "A different migration"
''')
    with pytest.raises(AssertionError, match="missing expires_at"):
        load_exception_registry(
            path, decision="test-decision", entries_key="allowlist", today=date(2026, 11, 11)
        )


def test_registry_cannot_choose_to_make_debt_permanent(tmp_path):
    path = tmp_path / "exceptions.toml"
    path.write_text(EXCEPTION.replace('kind = "temporary_exceptions"', 'kind = "architecture"'))
    with pytest.raises(AssertionError, match="expected kind=temporary_exceptions"):
        load_exception_registry(path, decision="test-decision", entries_key="allowlist")


@pytest.mark.parametrize("replacement", ['expires_at = "not-a-date"', 'expires_at = 0'])
def test_invalid_expiry_is_rejected(tmp_path, replacement):
    path = tmp_path / "exceptions.toml"
    path.write_text(EXCEPTION.replace('expires_at = "2026-11-11"', replacement))
    with pytest.raises(AssertionError, match="expires_at"):
        load_exception_registry(path, decision="test-decision", entries_key="allowlist")


def test_top_level_expiry_cannot_substitute_for_entry_expiry(tmp_path):
    path = tmp_path / "exceptions.toml"
    path.write_text('expires_at = "2099-01-01"\n' + EXCEPTION)
    with pytest.raises(AssertionError, match="expiry belongs to each temporary exception"):
        load_exception_registry(path, decision="test-decision", entries_key="allowlist")


@pytest.mark.parametrize("day", [date(2026, 11, 10), date(2026, 11, 11), date(2026, 11, 12), date(2030, 1, 1)])
def test_eight_reviewed_registries_have_no_blanket_expiry(monkeypatch, day):
    class FrozenDate(date):
        @classmethod
        def today(cls):
            return day

    from . import _registry_policy

    monkeypatch.setattr(_registry_policy, "date", FrozenDate)
    for path in ARCH_DIR.glob("_bounded_context_*.toml"):
        load_architecture_registry(path, decision="ADR-007")
    load_architecture_registry(ARCH_DIR / "_archive_allowlist.toml", decision="ADR-005")
    for filename, decision, key in (
        ("_endpoint_commit_allowlist.toml", "ADR-002", "allowlist"),
        ("_naming_allowlist.toml", "persistence-naming-contract", "paths"),
    ):
        data = load_exception_registry(ARCH_DIR / filename, decision=decision, entries_key=key)
        assert data[key] == []
