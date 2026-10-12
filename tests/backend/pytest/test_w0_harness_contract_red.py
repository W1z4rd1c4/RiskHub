from __future__ import annotations

import inspect
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from syrupy.assertion import SnapshotAssertion
from syrupy.extensions.amber import AmberSnapshotExtension
from syrupy.extensions.single_file import SingleFileSnapshotExtension


def test_alembic_live_harness_yields_head_revision(alembic_live_db):
    assert alembic_live_db.head_revision
    assert alembic_live_db.current_revision == alembic_live_db.head_revision


def test_freezegun_active_in_utc(frozen_clock):
    assert datetime.now(UTC).isoformat() == "2026-05-07T12:00:00+00:00"


def test_stable_uuid_is_deterministic(stable_uuid):
    assert str(stable_uuid()) == "00000000-0000-7000-8000-000000000001"
    assert str(stable_uuid()) == "00000000-0000-7000-8000-000000000002"


def test_snapshot_round_trip(snapshot):
    assert {"id": 42, "created_at": "2026-05-07T12:00:00Z", "name": "RiskHub"} == snapshot


def test_snapshot_fixture_uses_syrupy_assertion(snapshot):
    assert isinstance(snapshot, SnapshotAssertion)


def test_redacting_snapshot_extension_redacts_sensitive_keys(redacting_snapshot_extension):
    payload = {
        "id": 42,
        "created_at": "2026-05-07T12:00:00Z",
        "trace_id": "trace-123",
        "request_id": "request-123",
        "ip": "192.0.2.1",
        "email": "user@example.com",
        "name": "RiskHub",
        "nested": {"updated_at": "2026-05-07T12:00:00Z", "label": "kept"},
    }

    assert redacting_snapshot_extension._redact(payload) == {
        "id": "<redacted>",
        "created_at": "<redacted>",
        "trace_id": "<redacted>",
        "request_id": "<redacted>",
        "ip": "<redacted>",
        "email": "<redacted>",
        "name": "RiskHub",
        "nested": {"updated_at": "<redacted>", "label": "kept"},
    }


def test_redacting_snapshot_extension_uses_single_concrete_syrupy_leaf(redacting_snapshot_extension):
    assert issubclass(redacting_snapshot_extension, AmberSnapshotExtension)
    assert redacting_snapshot_extension.__bases__ == (AmberSnapshotExtension,)
    assert not issubclass(redacting_snapshot_extension, SingleFileSnapshotExtension)


@pytest.mark.parametrize("key", ["id", "trace_id", "request_id", "ip", "email", "created_at", "updated_at"])
def test_snapshot_serialization_never_leaks_nested_sensitive_values(snapshot, key):
    secret = f"must-not-appear-{key}"
    payload = {"rows": [{"nested": ({key: secret, "label": "preserved"},)}]}
    original = deepcopy(payload)

    serialized = snapshot.extension.serialize(payload)

    assert secret not in serialized
    assert "<redacted>" in serialized
    assert "preserved" in serialized
    assert payload == original


def test_snapshot_redaction_keeps_business_fields_and_plain_dates(snapshot):
    payload = {
        "candidate_id": "RISK-001",
        "email_status": "verified",
        "format": "report",
        "date": "2026-05-07",
        "name": "RiskHub",
    }

    serialized = snapshot.extension.serialize(payload)

    assert "<redacted>" not in serialized
    for value in payload.values():
        assert value in serialized


def test_snapshot_redacts_dataclasses_nested_in_containers_without_mutating_them(snapshot):
    @dataclass(frozen=True)
    class Contact:
        email: str
        created_at: datetime
        label: str
        birthday: date

    contact = Contact(
        email="must-not-leak@example.com",
        created_at=datetime(2026, 5, 7, 12, tzinfo=UTC),
        label="preserved contact",
        birthday=date(2000, 1, 2),
    )
    payload = {"rows": [(contact,)]}
    expected = {"rows": [({
        "email": "<redacted>",
        "created_at": "<redacted>",
        "label": contact.label,
        "birthday": contact.birthday,
    },)]}

    serialized = snapshot.extension.serialize(payload)

    assert serialized == snapshot.extension.serialize(expected)
    assert contact.email not in serialized
    assert "2026" not in serialized
    assert "preserved contact" in serialized
    assert contact.birthday == date(2000, 1, 2)
    assert contact.email == "must-not-leak@example.com"
    assert contact.created_at == datetime(2026, 5, 7, 12, tzinfo=UTC)


def test_frozen_clock_requires_freezegun_without_dead_module_fallback(request):
    fixture_defs = request._fixturemanager.getfixturedefs("frozen_clock", request.node)
    assert fixture_defs
    source = inspect.getsource(fixture_defs[0].func)

    assert "ModuleNotFoundError" not in source
    assert "request.module" not in source
    assert "monkeypatch.setattr" not in source
