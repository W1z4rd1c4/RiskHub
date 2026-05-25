from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.schemas.approval_request import ApprovalRequestCapabilities
from app.services._approval_queue import projection


def _capabilities() -> ApprovalRequestCapabilities:
    return ApprovalRequestCapabilities(
        can_read=True,
        can_approve=False,
        can_reject=False,
        can_cancel=False,
        can_cancel_as_requester=False,
        can_cancel_as_resolver=False,
        can_view_pending_changes=False,
        can_view_resolution_notes=False,
        can_inspect_side_effects=False,
        is_requester=False,
        is_primary_approver=False,
        is_privileged_resolver=False,
        is_pending=True,
        requires_privileged_resolution=False,
        would_apply_side_effects_on_approve=False,
    )


class _LoggerProbe:
    def __init__(self) -> None:
        self.exception_calls: list[tuple[str, tuple, dict]] = []

    def exception(self, message: str, *args, **kwargs) -> None:
        self.exception_calls.append((message, args, kwargs))


def _counter_value() -> float:
    samples = [
        sample
        for metric in projection.APPROVAL_QUEUE_PROJECTION_SKIPPED_TOTAL.collect()
        for sample in metric.samples
        if sample.name == "riskhub_approval_queue_projection_skipped_total"
    ]
    return float(samples[0].value) if samples else 0.0


def test_corrupt_projection_logs_traceback_and_surfaces_skipped_count(monkeypatch: pytest.MonkeyPatch) -> None:
    logger_probe = _LoggerProbe()
    monkeypatch.setattr(projection, "queue_logger", logger_probe)
    monkeypatch.setattr(projection, "approval_capabilities", lambda *, approval, current_user: _capabilities())

    def raise_corrupt_payload(*args, **kwargs):
        raise ValueError("malformed pending_changes payload")

    monkeypatch.setattr(projection, "build_approval_read", raise_corrupt_payload)
    before = _counter_value()
    approval = SimpleNamespace(id=77)

    page = projection.approval_queue_page(
        approvals=[approval],
        total=1,
        skip=0,
        limit=50,
        current_user=SimpleNamespace(id=10),
    )

    assert page.items == []
    assert page.skipped_corrupt_payloads == 1
    assert page.to_response().skipped_corrupt_payloads == 1
    assert _counter_value() == before + 1
    assert len(logger_probe.exception_calls) == 1
    message, args, kwargs = logger_probe.exception_calls[0]
    assert message == "approval_queue_projection_skipped"
    assert args == ()
    assert kwargs["extra"] == {
        "approval_request_id": 77,
        "operation": "approval_queue_projection",
    }


def test_approval_capability_failures_are_not_swallowed(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_capability_bug(*, approval, current_user):
        raise RuntimeError("capability policy unavailable")

    monkeypatch.setattr(projection, "approval_capabilities", raise_capability_bug)

    with pytest.raises(RuntimeError, match="capability policy unavailable"):
        projection.project_approval_read(SimpleNamespace(id=91), SimpleNamespace(id=10))
