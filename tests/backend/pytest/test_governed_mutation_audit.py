from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.audit.governed_mutation import (
    proposal_applied,
    proposal_cancelled,
    proposal_expired,
    proposal_rejected,
    proposal_submitted,
)
from app.models.activity_log import ActivityAction, ActivityEntityType


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("adapter", "action", "outcome"),
    [
        (proposal_submitted, ActivityAction.CREATE, "submitted"),
        (proposal_applied, ActivityAction.APPROVE, "applied"),
        (proposal_rejected, ActivityAction.REJECT, "rejected"),
        (proposal_cancelled, ActivityAction.CANCEL, "cancelled"),
        (proposal_expired, ActivityAction.STATUS_CHANGE, "expired"),
    ],
)
async def test_governed_mutation_audit_uses_safe_proposal_identity(
    adapter,
    action: ActivityAction,
    outcome: str,
) -> None:
    calls: list[dict[str, object]] = []
    actor = SimpleNamespace(id=7, name="Test Actor")
    approval = SimpleNamespace(id=42, resource_name="Unrestricted Process free text")
    proposal = SimpleNamespace(proposal_id="proposal-uuid", proposal_version=3)

    async def capture_log_activity(db, **kwargs) -> None:
        calls.append({"db": db, **kwargs})

    await adapter(
        "db",
        actor=actor,
        approval=approval,
        proposal=proposal,
        department_id=9,
        changes={"l1_process": {"old": "Before", "new": "After"}},
        log_activity_func=capture_log_activity,
    )

    assert calls == [
        {
            "db": "db",
            "entity_type": ActivityEntityType.APPROVAL,
            "entity_id": 42,
            "entity_name": "proposal-uuid:v3",
            "safe_entity_label": "GOVPROP-42",
            "action": action,
            "actor": actor,
            "department_id": 9,
            "changes": {"l1_process": {"old": "Before", "new": "After"}},
            "description": f"Governed Process proposal proposal-uuid v3 {outcome}",
            "safe_description": f"Governed Process proposal proposal-uuid v3 {outcome}",
            "safe_description_siem": f"Governed Process proposal proposal-uuid v3 {outcome}",
        }
    ]


@pytest.mark.asyncio
async def test_governed_mutation_audit_never_uses_approval_resource_free_text() -> None:
    calls: list[dict[str, object]] = []
    approval = SimpleNamespace(id=12, resource_name="Customer secret in Process name")
    proposal = SimpleNamespace(proposal_id="safe-id", proposal_version=1)

    async def capture_log_activity(db, **kwargs) -> None:
        calls.append(kwargs)

    await proposal_expired(
        "db",
        actor=SimpleNamespace(id=8, name="Resolver"),
        approval=approval,
        proposal=proposal,
        log_activity_func=capture_log_activity,
    )

    serialized = repr(calls)
    assert approval.resource_name not in serialized
    assert "safe-id" in serialized
