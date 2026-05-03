from types import SimpleNamespace

import pytest

from app.models import ApprovalActionType, ApprovalResourceType
from app.services._approval_execution import side_effects
from app.services._approval_execution.results import SideEffectOutcome


def test_side_effect_dispatch_registry_declares_supported_handlers() -> None:
    expected_handlers = {
        (ApprovalActionType.DELETE, ApprovalResourceType.RISK),
        (ApprovalActionType.DELETE, ApprovalResourceType.CONTROL),
        (ApprovalActionType.DELETE, ApprovalResourceType.KRI),
        (ApprovalActionType.EDIT, ApprovalResourceType.RISK),
        (ApprovalActionType.EDIT, ApprovalResourceType.CONTROL),
        (ApprovalActionType.EDIT, ApprovalResourceType.KRI),
    }

    assert expected_handlers <= set(side_effects.SIDE_EFFECT_HANDLERS)


def test_missing_resource_helper_uses_standard_auto_rejection_reason() -> None:
    from app.services._approval_execution.helpers import missing_resource_auto_rejection

    approval = SimpleNamespace(id=101, resource_id=202)

    result = missing_resource_auto_rejection(approval, resource_label="Risk")

    assert result.outcome == SideEffectOutcome.AUTO_REJECTED
    assert result.reason == "Resource was deleted before approval could be applied."


@pytest.mark.asyncio
async def test_whitelisted_change_helper_rejects_stale_change_before_mutating() -> None:
    from app.services._approval_execution.helpers import apply_whitelisted_pending_changes

    approval = SimpleNamespace(
        id=101,
        pending_changes={"name": {"old": "Original", "new": "Approved"}},
    )
    target = SimpleNamespace(name="Changed")

    result = await apply_whitelisted_pending_changes(
        None,
        approval=approval,
        target=target,
        changes=approval.pending_changes,
        allowed_fields={"name"},
    )

    assert result.stale_result is not None
    assert result.stale_result.outcome == SideEffectOutcome.AUTO_REJECTED
    assert target.name == "Changed"
