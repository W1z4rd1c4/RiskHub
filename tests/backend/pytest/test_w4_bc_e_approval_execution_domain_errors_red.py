from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from app.core.exceptions import ServiceFailure
from app.services._approval_execution import kri_value_submission
from app.services._kri_history.service import KRIHistoryService


@pytest.mark.asyncio
async def test_kri_value_submission_internal_failure_preserves_cause_with_sanitized_detail(
    monkeypatch: pytest.MonkeyPatch,
):
    async def raise_runtime_error(**_kwargs):
        raise RuntimeError("super-sensitive database internals")

    monkeypatch.setattr(KRIHistoryService, "record_value", raise_runtime_error)

    with pytest.raises(ServiceFailure) as exc_info:
        await kri_value_submission._apply_kri_value_submission(
            db=SimpleNamespace(),
            approval=SimpleNamespace(id=55),
            kri=SimpleNamespace(
                id=1001,
                metric_name="Failure KRI",
                current_value=10.0,
                last_period_end=None,
                last_reported_at=None,
            ),
            changes={
                "current_value": {"old": 10.0, "new": 12.5},
                "period_end": date(2026, 5, 31).isoformat(),
            },
            current_user=SimpleNamespace(id=77),
            approval_id=55,
        )

    assert exc_info.value.detail == "Internal server error during KRI approval execution"
    assert isinstance(exc_info.value.__cause__, RuntimeError)
