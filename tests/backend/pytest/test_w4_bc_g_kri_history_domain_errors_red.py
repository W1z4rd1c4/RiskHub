from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from app.core.exceptions import NotFoundError
from app.schemas.kri import KRIRecordValue
from app.services._kri_history import direct_application
from app.services._kri_history.loading import _load_kri_with_risk_or_404
from app.services.kri_history_service import KRIHistoryService


@pytest.mark.asyncio
async def test_missing_kri_load_uses_not_found_domain_error(db_session):
    with pytest.raises(NotFoundError) as exc_info:
        await _load_kri_with_risk_or_404(db_session, 999_999)

    assert exc_info.value.detail == "KRI not found"


@pytest.mark.asyncio
async def test_direct_kri_value_breach_commits_core_then_notification_batch(monkeypatch: pytest.MonkeyPatch):
    db = _FakeDb()
    kri = SimpleNamespace(
        id=1,
        metric_name="Breach KRI",
        current_value=10.0,
        last_period_end=None,
        last_reported_at=None,
        lower_limit=0.0,
        upper_limit=20.0,
        reporting_owner_id=101,
        risk=SimpleNamespace(owner_id=202, risk_id_code="RISK-1", department=None, owner=None),
        vendor_links=[],
    )
    data = KRIRecordValue(value=30.0, period_end=date(2026, 4, 30))
    notifications: list[int] = []

    async def fake_record_value(**kwargs):
        target = kwargs["kri"]
        target.current_value = kwargs["value"]
        target.last_period_end = kwargs["period_end"]
        target.last_reported_at = datetime(2026, 5, 7, 12, 0, tzinfo=UTC)
        return SimpleNamespace(id=88, period_end=kwargs["period_end"])

    async def noop_activity(*_args, **_kwargs):
        return None

    async def fake_notification(**kwargs):
        notifications.append(kwargs["user_id"])

    async def fake_capabilities(*_args, **_kwargs):
        return {}

    async def fake_serialize(*_args, **_kwargs):
        return SimpleNamespace(id=1)

    monkeypatch.setattr(KRIHistoryService, "record_value", fake_record_value)
    monkeypatch.setattr(direct_application, "kri_value_created", noop_activity)
    monkeypatch.setattr(direct_application, "kri_value_mutation_updated", noop_activity)
    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.create_notification",
        fake_notification,
    )
    monkeypatch.setattr(direct_application, "kri_capabilities", fake_capabilities)
    monkeypatch.setattr(direct_application, "serialize_kri_history_response", fake_serialize)
    monkeypatch.setattr(direct_application, "visible_linked_vendors", lambda *_args, **_kwargs: [])

    await direct_application.apply_kri_value_directly(
        db,
        kri=kri,
        data=data,
        current_user=SimpleNamespace(id=77),
        is_privileged_submission=True,
    )

    assert notifications == [101, 202]
    assert db.commits == 2
    assert db.rollbacks == 0


class _FakeDb:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    async def refresh(self, _instance) -> None:
        return None

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one=lambda: _statement)
