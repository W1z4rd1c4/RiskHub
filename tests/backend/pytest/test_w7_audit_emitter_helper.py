from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.audit.control import control_created
from app.models.activity_log import ActivityAction, ActivityEntityType


@pytest.mark.asyncio
async def test_control_created_preserves_audit_payload_through_emitter() -> None:
    calls: list[dict[str, object]] = []
    actor = SimpleNamespace(id=7)
    control = SimpleNamespace(id=42, name="Quarter close review", department_id=5)

    async def capture_log_activity(db, **kwargs) -> None:
        calls.append({"db": db, **kwargs})

    await control_created(
        "db",
        actor=actor,
        control=control,
        log_activity_func=capture_log_activity,
    )

    assert calls == [
        {
            "db": "db",
            "entity_type": ActivityEntityType.CONTROL,
            "entity_id": 42,
            "entity_name": "Quarter close review",
            "safe_entity_label": "CTRL-42",
            "action": ActivityAction.CREATE,
            "actor": actor,
            "department_id": 5,
        }
    ]
