from datetime import date
from types import SimpleNamespace

import pytest

from app.models import ApprovalActionType, ApprovalResourceType, ApprovalStatus
from app.services._approval_execution import side_effects
from app.services._approval_execution.results import SideEffectOutcome, apply_auto_rejection


class _ScalarResult:
    def __init__(self, value) -> None:
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    def __init__(self, value) -> None:
        self._value = value

    async def execute(self, statement):
        return _ScalarResult(self._value)


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


async def _run_stale_history_correction_case(monkeypatch: pytest.MonkeyPatch):
    from app.services._approval_execution import kri_history_correction
    from app.services._approval_execution.kri_history_correction import _apply_kri_history_correction

    async def reject_stale_correction(**kwargs):
        raise ValueError("stale correction")

    monkeypatch.setattr(kri_history_correction, "apply_approved_kri_history_correction", reject_stale_correction)
    approval = SimpleNamespace(id=301, status=None, resolution_notes="Reviewer note")
    kri = SimpleNamespace(
        id=401,
        current_value=4.0,
        last_period_end=date(2026, 1, 31),
        last_reported_at=None,
    )
    entry = SimpleNamespace(id=501, kri_id=kri.id, value=4.0, period_end=date(2026, 1, 31))

    result = await _apply_kri_history_correction(
        _FakeSession(entry),
        approval=approval,
        kri=kri,
        changes={
            "history_entry_id": entry.id,
            "new_value": 5.0,
            "old_value": entry.value,
            "period_end": entry.period_end.isoformat(),
        },
        current_user=SimpleNamespace(id=601),
    )

    return approval, result


async def _run_stale_value_submission_case(monkeypatch: pytest.MonkeyPatch):
    from app.services._approval_execution import kri_value_submission
    from app.services._approval_execution.kri_value_submission import _apply_kri_value_submission

    async def reject_stale_submission(**kwargs):
        raise ValueError("stale submission")

    monkeypatch.setattr(kri_value_submission, "apply_approved_kri_value_submission", reject_stale_submission)
    approval = SimpleNamespace(id=302, status=None, resolution_notes="Reviewer note")
    kri = SimpleNamespace(
        id=402,
        current_value=4.0,
        last_period_end=date(2026, 1, 31),
        last_reported_at=None,
    )

    result = await _apply_kri_value_submission(
        None,
        approval=approval,
        kri=kri,
        changes={
            "current_value": {"old": 4.0, "new": 5.0},
            "period_end": {"new": "2026-02-28"},
            "recorded_at": {"new": "2026-02-28T12:00:00+00:00"},
        },
        current_user=SimpleNamespace(id=602),
        approval_id=approval.id,
    )

    return approval, result


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("case_runner", "expected_reason_fragment"),
    (
        (_run_stale_history_correction_case, "stale correction"),
        (_run_stale_value_submission_case, "stale submission"),
    ),
)
async def test_kri_auto_reject_paths_propagate_reason_through_apply_auto_rejection(
    monkeypatch: pytest.MonkeyPatch,
    case_runner,
    expected_reason_fragment: str,
) -> None:
    approval, result = await case_runner(monkeypatch)

    assert result.outcome == SideEffectOutcome.AUTO_REJECTED
    assert result.reason is not None
    assert expected_reason_fragment in result.reason

    apply_auto_rejection(approval, result)

    assert approval.status == ApprovalStatus.REJECTED
    assert "Reviewer note" in approval.resolution_notes
    assert f"Auto-rejected: {result.reason}" in approval.resolution_notes
