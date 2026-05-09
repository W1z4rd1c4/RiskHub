from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.datetime_utils import utc_now
from app.models import Control, ControlExecution, ControlRiskLink, Department, KeyRiskIndicator, Risk, User
from app.models.control_execution import ExecutionResult
from app.models.key_risk_indicator import KRIFrequency
from app.services._kri_history.periods import latest_closed_period_for_date


async def _create_risk(
    db_session,
    *,
    department: Department,
    owner: User,
    risk_id_code: str,
    name: str,
) -> Risk:
    risk = Risk(
        risk_id_code=risk_id_code,
        name=name,
        process="Monitoring",
        description=f"{name} description",
        department_id=department.id,
        owner_id=owner.id,
        risk_type="operational",
        gross_probability=3,
        gross_impact=3,
        gross_score=9,
        net_probability=2,
        net_impact=2,
        net_score=4,
        status="active",
    )
    db_session.add(risk)
    await db_session.commit()
    await db_session.refresh(risk)
    return risk


async def _create_control(
    db_session,
    *,
    department: Department,
    owner: User,
    name: str,
    created_at=None,
) -> Control:
    control = Control(
        name=name,
        description=f"{name} description",
        department_id=department.id,
        control_owner_id=owner.id,
        control_form="manual",
        frequency="monthly",
        risk_level=3,
        status="active",
        created_at=created_at or utc_now(),
    )
    db_session.add(control)
    await db_session.commit()
    await db_session.refresh(control)
    return control


async def _create_execution(
    db_session,
    *,
    control: Control,
    executed_by: User,
    result: str,
    executed_at=None,
) -> ControlExecution:
    execution = ControlExecution(
        control_id=control.id,
        executed_by_id=executed_by.id,
        result=result,
        executed_at=executed_at or utc_now(),
    )
    db_session.add(execution)
    await db_session.commit()
    await db_session.refresh(execution)
    return execution


async def _create_kri(
    db_session,
    *,
    risk: Risk,
    metric_name: str,
    current_value: float,
    lower_limit: float,
    upper_limit: float,
    frequency: str,
    reporting_owner: User | None = None,
    last_period_end=None,
    is_archived: bool = False,
) -> KeyRiskIndicator:
    kri = KeyRiskIndicator(
        risk_id=risk.id,
        metric_name=metric_name,
        description=f"{metric_name} description",
        current_value=current_value,
        lower_limit=lower_limit,
        upper_limit=upper_limit,
        unit="count",
        frequency=frequency,
        reporting_owner_id=reporting_owner.id if reporting_owner is not None else None,
        last_period_end=last_period_end,
        is_archived=is_archived,
    )
    db_session.add(kri)
    await db_session.commit()
    await db_session.refresh(kri)
    return kri


@pytest.mark.asyncio
async def test_control_detail_includes_monitoring_bundle(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    control = await _create_control(
        db_session,
        department=test_department,
        owner=test_user,
        name="Detail Monitoring Control",
        created_at=utc_now() - timedelta(days=3),
    )

    response = await auth_client.get(f"/api/v1/controls/{control.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["monitoring_status"] == "new"
    assert data["monitoring_status_reason"] == "no_execution_logs_recent"
    assert data["latest_execution_result"] is None
    assert data["latest_executed_at"] is None
    assert data["days_since_last_execution"] is None
    assert data["execution_log_count"] == 0


@pytest.mark.asyncio
async def test_control_list_filters_by_monitoring_status(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    passed_control = await _create_control(
        db_session,
        department=test_department,
        owner=test_user,
        name="Passed Monitoring Control",
        created_at=utc_now() - timedelta(days=30),
    )
    await _create_execution(
        db_session,
        control=passed_control,
        executed_by=test_user,
        result=ExecutionResult.passed.value,
        executed_at=utc_now() - timedelta(days=1),
    )

    failed_control = await _create_control(
        db_session,
        department=test_department,
        owner=test_user,
        name="Failed Monitoring Control",
        created_at=utc_now() - timedelta(days=30),
    )
    await _create_execution(
        db_session,
        control=failed_control,
        executed_by=test_user,
        result=ExecutionResult.failed.value,
        executed_at=utc_now() - timedelta(days=1),
    )

    response = await auth_client.get("/api/v1/controls?monitoring_status=passed&include_archived=true")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    returned_ids = {item["id"] for item in data["items"]}
    assert passed_control.id in returned_ids
    assert failed_control.id not in returned_ids
    passed_item = next(item for item in data["items"] if item["id"] == passed_control.id)
    assert passed_item["monitoring_status"] == "passed"
    assert passed_item["latest_execution_result"] == "passed"
    assert passed_item["execution_log_count"] == 1


@pytest.mark.asyncio
async def test_kri_detail_includes_monitoring_bundle(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    risk = await _create_risk(
        db_session,
        department=test_department,
        owner=test_user,
        risk_id_code="MON-KRI-DETAIL",
        name="Monitoring KRI Detail Risk",
    )
    _, required_period_end = latest_closed_period_for_date(utc_now().date(), KRIFrequency.quarterly.value)
    kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Warning Monitoring KRI",
        current_value=95.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        reporting_owner=test_user,
        last_period_end=required_period_end,
    )

    response = await auth_client.get(f"/api/v1/kris/{kri.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["monitoring_status"] == "warning"
    assert data["monitoring_status_reason"] == "latest_measurement_warning_upper_margin"
    assert data["is_submitted_for_required_period"] is True
    assert data["required_period_end"] == required_period_end.isoformat()
    assert data["days_overdue"] == 0
    assert data["warning_upper_margin_ratio"] == 0.1


@pytest.mark.asyncio
async def test_kri_list_filters_by_monitoring_status(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    risk = await _create_risk(
        db_session,
        department=test_department,
        owner=test_user,
        risk_id_code="MON-KRI-LIST",
        name="Monitoring KRI List Risk",
    )
    _, required_period_end = latest_closed_period_for_date(utc_now().date(), KRIFrequency.quarterly.value)
    warning_kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Warning Filter KRI",
        current_value=91.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=required_period_end,
    )
    breach_kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Breach Filter KRI",
        current_value=120.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=required_period_end,
    )

    response = await auth_client.get("/api/v1/kris?monitoring_status=warning")

    assert response.status_code == 200
    data = response.json()
    returned_ids = {item["id"] for item in data["items"]}
    assert warning_kri.id in returned_ids
    assert breach_kri.id not in returned_ids
    warning_item = next(item for item in data["items"] if item["id"] == warning_kri.id)
    assert warning_item["monitoring_status"] == "warning"
    assert warning_item["required_period_end"] == required_period_end.isoformat()


@pytest.mark.asyncio
async def test_kri_list_filters_by_timeliness_status_due_soon(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
    monkeypatch: pytest.MonkeyPatch,
):
    risk = await _create_risk(
        db_session,
        department=test_department,
        owner=test_user,
        risk_id_code="MON-KRI-DUE-SOON",
        name="Monitoring Due Soon Risk",
    )
    due_soon_kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Due Soon Filter KRI",
        current_value=30.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=None,
    )
    non_due_soon_kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Reported KRI",
        current_value=45.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=datetime(2026, 3, 31, tzinfo=UTC).date(),
    )

    monkeypatch.setattr(
        "app.services._register_listings.kris.utc_now",
        lambda: datetime(2026, 3, 27, 12, 0, tzinfo=UTC),
    )

    response = await auth_client.get("/api/v1/kris?timeliness_status=due_soon")

    assert response.status_code == 200
    data = response.json()
    returned_ids = {item["id"] for item in data["items"]}
    assert due_soon_kri.id in returned_ids
    assert non_due_soon_kri.id not in returned_ids


@pytest.mark.asyncio
async def test_kri_list_rejects_combined_monitoring_and_timeliness_filters(auth_client: AsyncClient):
    response = await auth_client.get("/api/v1/kris?monitoring_status=warning&timeliness_status=due_soon")

    assert response.status_code == 422
    assert "timeliness_status" in response.json()["detail"]


@pytest.mark.asyncio
async def test_risk_endpoints_expose_monitoring_status_for_linked_items(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    risk = await _create_risk(
        db_session,
        department=test_department,
        owner=test_user,
        risk_id_code="MON-RISK-DETAIL",
        name="Monitoring Risk Detail",
    )
    _, required_period_end = latest_closed_period_for_date(utc_now().date(), KRIFrequency.quarterly.value)
    kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Risk Detail KRI",
        current_value=90.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=required_period_end,
    )
    control = await _create_control(
        db_session,
        department=test_department,
        owner=test_user,
        name="Risk Detail Control",
        created_at=utc_now() - timedelta(days=30),
    )
    await _create_execution(
        db_session,
        control=control,
        executed_by=test_user,
        result=ExecutionResult.passed.value,
        executed_at=utc_now() - timedelta(days=2),
    )

    link = ControlRiskLink(
        control_id=control.id,
        risk_id=risk.id,
        effectiveness="high",
        notes="Monitoring test link",
    )
    db_session.add(link)
    await db_session.commit()

    risk_response = await auth_client.get(f"/api/v1/risks/{risk.id}")
    assert risk_response.status_code == 200
    risk_data = risk_response.json()
    risk_kri = next(item for item in risk_data["kris"] if item["id"] == kri.id)
    assert risk_kri["monitoring_status"] == "warning"
    assert risk_kri["required_period_end"] == required_period_end.isoformat()

    links_response = await auth_client.get(f"/api/v1/risks/{risk.id}/controls")
    assert links_response.status_code == 200
    links_data = links_response.json()
    linked_control = next(item["control"] for item in links_data if item["control_id"] == control.id)
    assert linked_control["monitoring_status"] == "passed"
    assert linked_control["latest_execution_result"] == "passed"
    assert linked_control["execution_log_count"] == 1


@pytest.mark.asyncio
async def test_department_detail_exposes_kri_monitoring_counts(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    risk = await _create_risk(
        db_session,
        department=test_department,
        owner=test_user,
        risk_id_code="MON-DEPT-COUNTS",
        name="Monitoring Department Counts Risk",
    )
    _, required_period_end = latest_closed_period_for_date(utc_now().date(), KRIFrequency.quarterly.value)
    await _create_kri(
        db_session,
        risk=risk,
        metric_name="Department Breach KRI",
        current_value=150.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=required_period_end,
    )
    await _create_kri(
        db_session,
        risk=risk,
        metric_name="Department Warning KRI",
        current_value=95.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=required_period_end,
    )

    response = await auth_client.get(f"/api/v1/departments/{test_department.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["kri_monitoring_counts"]["breach"] >= 1
    assert data["kri_monitoring_counts"]["warning"] >= 1


@pytest.mark.asyncio
async def test_department_kri_endpoints_exclude_archived_kris_by_default(
    auth_client: AsyncClient,
    db_session,
    test_user: User,
    test_department: Department,
):
    baseline_detail_response = await auth_client.get(f"/api/v1/departments/{test_department.id}")
    assert baseline_detail_response.status_code == 200
    baseline_detail = baseline_detail_response.json()

    baseline_list_response = await auth_client.get(f"/api/v1/departments/{test_department.id}/kris?limit=100")
    assert baseline_list_response.status_code == 200
    baseline_list = baseline_list_response.json()

    risk = await _create_risk(
        db_session,
        department=test_department,
        owner=test_user,
        risk_id_code="MON-DEPT-ARCHIVE",
        name="Department Archived KRI Risk",
    )
    _, required_period_end = latest_closed_period_for_date(utc_now().date(), KRIFrequency.quarterly.value)
    active_kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Department Active Breach KRI",
        current_value=150.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=required_period_end,
    )
    archived_kri = await _create_kri(
        db_session,
        risk=risk,
        metric_name="Department Archived Warning KRI",
        current_value=95.0,
        lower_limit=0.0,
        upper_limit=100.0,
        frequency=KRIFrequency.quarterly.value,
        last_period_end=required_period_end,
        is_archived=True,
    )

    detail_response = await auth_client.get(f"/api/v1/departments/{test_department.id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()

    list_response = await auth_client.get(f"/api/v1/departments/{test_department.id}/kris?limit=100")
    assert list_response.status_code == 200
    data = list_response.json()

    returned_ids = {item["id"] for item in data["items"]}
    assert active_kri.id in returned_ids
    assert archived_kri.id not in returned_ids

    assert data["total"] == baseline_list["total"] + 1
    assert detail["kri_count"] == baseline_detail["kri_count"] + 1
    assert detail["kri_monitoring_counts"]["breach"] == baseline_detail["kri_monitoring_counts"]["breach"] + 1
    assert detail["kri_monitoring_counts"]["warning"] == baseline_detail["kri_monitoring_counts"]["warning"]
