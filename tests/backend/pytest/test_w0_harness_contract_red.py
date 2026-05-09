from __future__ import annotations

import inspect
from datetime import UTC, datetime

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


def test_frozen_clock_requires_freezegun_without_dead_module_fallback(request):
    fixture_defs = request._fixturemanager.getfixturedefs("frozen_clock", request.node)
    assert fixture_defs
    source = inspect.getsource(fixture_defs[0].func)

    assert "ModuleNotFoundError" not in source
    assert "request.module" not in source
    assert "monkeypatch.setattr" not in source
