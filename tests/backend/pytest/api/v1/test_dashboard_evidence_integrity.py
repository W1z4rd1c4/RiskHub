from __future__ import annotations

import csv
from datetime import UTC, datetime
from io import StringIO

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.snapshot_service import save_quarter_snapshot
from app.models import Control, Department, Permission, Risk, Role, RolePermission, User
from app.models.global_config import GlobalConfig, clear_config_cache
from app.models.quarterly_metric_snapshot import SnapshotType
from app.models.user import AccessScope
from app.services._quarterly_comparison import composition


def _csv_metrics(content: str) -> dict[str, str]:
    return {
        row["Metric"]: row["Value"]
        for row in csv.DictReader(StringIO(content))
    }


async def _create_summary_export_actor(
    db_session: AsyncSession,
    *,
    name: str,
    permissions: tuple[tuple[str, str], ...],
) -> User:
    role = Role(name=name, display_name=name.replace("_", " ").title())
    db_session.add(role)
    await db_session.flush()

    role_permissions = []
    for resource, action in permissions:
        permission = Permission(
            resource=resource,
            action=action,
            description=f"{resource}:{action}",
        )
        db_session.add(permission)
        await db_session.flush()
        role_permissions.append(RolePermission(role_id=role.id, permission_id=permission.id))
    db_session.add_all(role_permissions)

    actor = User(
        name=role.display_name,
        email=f"{name}@example.test",
        role=role,
        access_scope=AccessScope.GLOBAL,
        is_active=True,
    )
    db_session.add(actor)
    await db_session.commit()

    loaded_actor = await db_session.scalar(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(User.id == actor.id)
    )
    assert loaded_actor is not None
    return loaded_actor


@pytest.mark.asyncio
async def test_dashboard_summary_export_omits_permission_hidden_risk_and_control_sections(
    client_factory,
    db_session: AsyncSession,
) -> None:
    actor = await _create_summary_export_actor(
        db_session,
        name="dashboard_summary_reports_only",
        permissions=(("reports", "read"),),
    )

    async with client_factory(current_user=actor) as client:
        response = await client.get("/api/v1/reports/summary/export", params={"format": "csv"})

    assert response.status_code == 200, response.text
    exported = _csv_metrics(response.text)
    assert "Total Risks" not in exported
    assert "Critical Risks" not in exported
    assert "Average Net Risk Score" not in exported
    assert "Critical Risk Threshold" not in exported
    assert "Total Controls" not in exported
    assert "Controls by Status" not in exported
    assert "Controls by Form" not in exported
    assert "Controls by Frequency" not in exported
    assert "Total Vendors" not in exported


@pytest.mark.asyncio
async def test_dashboard_summary_export_gates_risk_and_control_sections_independently(
    client_factory,
    db_session: AsyncSession,
) -> None:
    department = Department(name="Mixed Visibility", code="MIX")
    db_session.add(department)
    await db_session.flush()
    db_session.add_all(
        [
            Risk(
                risk_id_code="MIX-R-001",
                name="Visible Risk",
                process="Evidence",
                description="Visible to the mixed-permission actor.",
                category="Operational",
                department_id=department.id,
                risk_type="operational",
                net_probability=4,
                net_impact=4,
                net_score=16,
                status="active",
            ),
            Control(
                name="Hidden Control",
                description="Must not be quantified without controls:read.",
                department_id=department.id,
                status="active",
                control_form="manual",
                frequency="monthly",
            ),
        ]
    )
    actor = await _create_summary_export_actor(
        db_session,
        name="dashboard_summary_risks_only",
        permissions=(("reports", "read"), ("risks", "read")),
    )

    async with client_factory(current_user=actor) as client:
        response = await client.get("/api/v1/reports/summary/export", params={"format": "csv"})

    assert response.status_code == 200, response.text
    exported = _csv_metrics(response.text)
    assert exported["Total Risks"] == "1"
    assert exported["Critical Risks"] == "1"
    assert exported["Average Net Risk Score"] == "16.0"
    assert "Total Controls" not in exported
    assert "Controls by Status" not in exported
    assert "Controls by Form" not in exported
    assert "Controls by Frequency" not in exported


@pytest.mark.asyncio
async def test_dashboard_summary_export_uses_the_filtered_configured_screen_population(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    request: pytest.FixtureRequest,
) -> None:
    request.addfinalizer(clear_config_cache)
    department = Department(name="Evidence Operations", code="EVID")
    db_session.add(department)
    await db_session.flush()

    critical_config = (
        await db_session.execute(
            select(GlobalConfig).where(GlobalConfig.key == "critical_risk_min_net_score")
        )
    ).scalar_one_or_none()
    if critical_config is None:
        critical_config = GlobalConfig(
            key="critical_risk_min_net_score",
            value="20",
            value_type="int",
            category="risk_thresholds",
            display_name="Critical Risk Threshold",
        )
        db_session.add(critical_config)
    else:
        critical_config.value = "20"

    db_session.add_all(
        [
            Risk(
                risk_id_code="EVID-R-001",
                name="Included configured critical Risk",
                process="Evidence",
                description="Included by the critical filter at the configured threshold.",
                category="Operational",
                department_id=department.id,
                risk_type="operational",
                gross_probability=5,
                gross_impact=5,
                net_probability=4,
                net_impact=5,
                net_score=20,
                status="active",
            ),
            Risk(
                risk_id_code="EVID-R-002",
                name="Excluded default-only critical Risk",
                process="Evidence",
                description="Score sixteen must not qualify when the configured threshold is twenty.",
                category="Operational",
                department_id=department.id,
                risk_type="operational",
                gross_probability=4,
                gross_impact=4,
                net_probability=4,
                net_impact=4,
                net_score=16,
                status="active",
            ),
            Risk(
                risk_id_code="EVID-R-003",
                name="Included second twenty-point Risk",
                process="Evidence",
                description="Makes the canonical average require two decimal places.",
                category="Operational",
                department_id=department.id,
                risk_type="operational",
                gross_probability=5,
                gross_impact=4,
                net_probability=5,
                net_impact=4,
                net_score=20,
                status="active",
            ),
            Risk(
                risk_id_code="EVID-R-004",
                name="Included twenty-five-point Risk",
                process="Evidence",
                description="Makes the canonical average require two decimal places.",
                category="Operational",
                department_id=department.id,
                risk_type="operational",
                gross_probability=5,
                gross_impact=5,
                net_probability=5,
                net_impact=5,
                net_score=25,
                status="active",
            ),
            Control(
                name="Included manual Control",
                description="Included by the active/manual filters.",
                department_id=department.id,
                status="active",
                control_form="manual",
                frequency="monthly",
            ),
            Control(
                name="Included quarterly manual Control",
                description="Provides a distinct frequency breakdown value.",
                department_id=department.id,
                status="active",
                control_form="manual",
                frequency="quarterly",
            ),
            Control(
                name="Excluded automatic Control",
                description="Excluded by the manual form filter.",
                department_id=department.id,
                status="active",
                control_form="automatic",
                frequency="daily",
            ),
        ]
    )
    await db_session.commit()
    clear_config_cache()

    params = {
        "department_id": department.id,
        "risk_level": "critical",
        "control_status": "active",
        "control_form": "manual",
    }
    screen_response = await client_cro.get("/api/v1/dashboard/summary", params=params)
    export_response = await client_cro.get(
        "/api/v1/reports/summary/export",
        params={"format": "csv", **params},
    )

    assert screen_response.status_code == 200, screen_response.text
    assert export_response.status_code == 200, export_response.text
    screen = screen_response.json()
    exported = _csv_metrics(export_response.text)

    assert screen["total_controls"] == 2
    assert screen["total_risks"] == 3
    assert screen["critical_risks_count"] == 3
    assert screen["average_net_risk_score"] == 21.67
    assert screen["risk_thresholds"]["critical"] == 20
    assert screen["controls_by_status"] == {"active": 2}
    assert screen["controls_by_form"] == {"manual": 2}
    assert screen["controls_by_frequency"] == {"monthly": 1, "quarterly": 1}
    assert exported["Total Controls"] == "2"
    assert exported["Total Risks"] == "3"
    assert exported["Critical Risks"] == "3"
    assert exported["Average Net Risk Score"] == str(screen["average_net_risk_score"])
    assert exported["Average Net Risk Score"] == "21.67"
    assert exported["Critical Risk Threshold"] == "20"
    assert exported["Filter: Department"] == "EVID — Evidence Operations"
    assert exported["Filter: Risk Level"] == "critical"
    assert exported["Filter: Control Status"] == "active"
    assert exported["Filter: Control Form"] == "manual"
    assert exported["Applies to: Risk Level"] == "Risk metrics only"
    assert exported["Applies to: Control Status"] == "Control metrics only"
    assert exported["Applies to: Control Form"] == "Control metrics only"
    assert exported["Unaffected by Risk/Control Filters"] == "Vendor metrics"
    assert exported["Scope"] == "Actor-visible Dashboard records in the selected Department"
    assert exported["Generated At"].endswith("+00:00")
    assert exported["Controls by Status"] == ""
    assert exported["Active"] == "2"
    assert exported["Controls by Form"] == ""
    assert exported["Manual"] == "2"
    assert "Automatic" not in exported
    assert exported["Controls by Frequency"] == ""
    assert exported["Monthly"] == "1"
    assert exported["Quarterly"] == "1"


@pytest.mark.asyncio
async def test_dashboard_summary_export_names_a_missing_department_without_exposing_its_id(
    client_cro: AsyncClient,
) -> None:
    missing_department_id = 999_999_999

    response = await client_cro.get(
        "/api/v1/reports/summary/export",
        params={"format": "csv", "department_id": missing_department_id},
    )

    assert response.status_code == 200, response.text
    exported = _csv_metrics(response.text)
    assert exported["Filter: Department"] == "Unknown department"
    assert exported["Scope"] == "Actor-visible Dashboard records in the selected Department"
    assert str(missing_department_id) not in response.text


@pytest.mark.asyncio
async def test_in_progress_quarter_uses_equal_elapsed_windows_and_named_delta_reasons(
    client_cro: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    frozen_now = datetime(2026, 5, 15, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(composition, "utc_now", lambda: frozen_now)

    department = Department(name="Quarter Window Evidence", code="QWIN")
    db_session.add(department)
    await db_session.flush()
    db_session.add_all(
        [
            Risk(
                risk_id_code="QWIN-CURRENT",
                name="Current elapsed-window Risk",
                process="Evidence",
                description="Included in the selected in-progress quarter.",
                category="Operational",
                department_id=department.id,
                risk_type="operational",
                status="active",
                created_at=datetime(2026, 4, 10, 9, 0, tzinfo=UTC),
            ),
            Risk(
                risk_id_code="QWIN-OUTSIDE-COMPARE",
                name="Outside equal prior window Risk",
                process="Evidence",
                description="Inside Q1, but after the equal elapsed comparison cutoff.",
                category="Operational",
                department_id=department.id,
                risk_type="operational",
                status="active",
                created_at=datetime(2026, 3, 1, 9, 0, tzinfo=UTC),
            ),
        ]
    )
    await db_session.commit()

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": "2026-Q2", "compare_quarter": "2026-Q1"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["period"] == {
        "this_start": "2026-04-01T00:00:00+00:00",
        "this_end": "2026-05-15T12:00:00+00:00",
        "last_start": "2026-01-01T00:00:00+00:00",
        "last_end": "2026-02-14T12:00:00+00:00",
        "window_type": "equal_elapsed",
    }
    assert payload["this_quarter"]["new_risks"] == 1
    assert payload["last_quarter"]["new_risks"] == 0
    assert payload["metric_observations"]["new_risks"] == {
        "metric_type": "flow",
        "current": {
            "source": "live",
            "start": "2026-04-01T00:00:00+00:00",
            "end": "2026-05-15T12:00:00+00:00",
        },
        "compare": {
            "source": "live",
            "start": "2026-01-01T00:00:00+00:00",
            "end": "2026-02-14T12:00:00+00:00",
        },
    }
    assert payload["changes"]["new_risks"] == {
        "absolute": 1,
        "percentage": None,
        "direction": "unknown",
        "reason": "baseline_zero",
    }
    assert payload["snapshot_info"]["snapshot_sources"] == {
        "current": "live",
        "compare": "missing",
    }
    assert payload["changes"]["priority_risks"] == {
        "absolute": None,
        "percentage": None,
        "direction": "unknown",
        "reason": "missing_observation",
    }


@pytest.mark.asyncio
async def test_clamped_unequal_flow_window_suppresses_the_delta(
    client_cro: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    frozen_now = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(composition, "utc_now", lambda: frozen_now)

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": "2026-Q3", "compare_quarter": "2026-Q2"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["period"] == {
        "this_start": "2026-07-01T00:00:00+00:00",
        "this_end": "2026-09-30T12:00:00+00:00",
        "last_start": "2026-04-01T00:00:00+00:00",
        "last_end": "2026-07-01T00:00:00+00:00",
        "window_type": "equal_elapsed",
    }
    assert payload["changes"]["new_risks"] == {
        "absolute": None,
        "percentage": None,
        "direction": "unknown",
        "reason": "unequal_window",
    }


@pytest.mark.asyncio
async def test_manual_stored_stock_exposes_capture_times_and_suppresses_unequal_offsets(
    client_cro: AsyncClient,
    db_session: AsyncSession,
) -> None:
    current_observed_at = datetime(2026, 4, 11, 12, 0, tzinfo=UTC)
    compare_observed_at = datetime(2026, 1, 21, 12, 0, tzinfo=UTC)
    current_snapshot = await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q2",
        year=2026,
        quarter_number=2,
        metrics={"priority_risks": 2},
        snapshot_type=SnapshotType.MANUAL,
    )
    compare_snapshot = await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q1",
        year=2026,
        quarter_number=1,
        metrics={"priority_risks": 1},
        snapshot_type=SnapshotType.MANUAL,
    )
    current_snapshot.captured_at = current_observed_at
    compare_snapshot.captured_at = compare_observed_at
    await db_session.commit()

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": "2026-Q2", "compare_quarter": "2026-Q1"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    observation = payload["metric_observations"]["priority_risks"]
    assert observation["current"]["observed_at"] == current_observed_at.isoformat()
    assert observation["compare"]["observed_at"] == compare_observed_at.isoformat()
    assert payload["changes"]["priority_risks"] == {
        "absolute": None,
        "percentage": None,
        "direction": "unknown",
        "reason": "unequal_window",
    }


@pytest.mark.asyncio
async def test_manual_stored_stock_compares_adjacent_unequal_length_quarter_ends(
    client_cro: AsyncClient,
    db_session: AsyncSession,
) -> None:
    metric_definitions = {
        "_metric_definitions": {"priority_risks": "riskhub.snapshot.priority_risks.v1"},
    }
    current_snapshot = await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q2",
        year=2026,
        quarter_number=2,
        metrics={"priority_risks": 2, **metric_definitions},
        snapshot_type=SnapshotType.MANUAL,
    )
    compare_snapshot = await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q1",
        year=2026,
        quarter_number=1,
        metrics={"priority_risks": 1, **metric_definitions},
        snapshot_type=SnapshotType.MANUAL,
    )
    current_snapshot.captured_at = datetime(2026, 7, 1, tzinfo=UTC)
    compare_snapshot.captured_at = datetime(2026, 4, 1, tzinfo=UTC)
    await db_session.commit()

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": "2026-Q2", "compare_quarter": "2026-Q1"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["changes"]["priority_risks"] == {
        "absolute": 1,
        "percentage": 100.0,
        "direction": "up",
    }


@pytest.mark.asyncio
async def test_stock_delta_is_suppressed_when_metric_definitions_differ(
    client_cro: AsyncClient,
    db_session: AsyncSession,
) -> None:
    current_snapshot = await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q2",
        year=2026,
        quarter_number=2,
        metrics={
            "priority_risks": 2,
            "_metric_definitions": {"priority_risks": "riskhub.snapshot.priority_risks.v2"},
        },
        snapshot_type=SnapshotType.MANUAL,
    )
    compare_snapshot = await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q1",
        year=2026,
        quarter_number=1,
        metrics={
            "priority_risks": 1,
            "_metric_definitions": {"priority_risks": "riskhub.snapshot.priority_risks.v1"},
        },
        snapshot_type=SnapshotType.MANUAL,
    )
    current_snapshot.captured_at = datetime(2026, 4, 10, 12, 0, tzinfo=UTC)
    compare_snapshot.captured_at = datetime(2026, 1, 10, 12, 0, tzinfo=UTC)
    await db_session.commit()

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": "2026-Q2", "compare_quarter": "2026-Q1"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["metric_observations"]["priority_risks"]["current"]["definition_id"] == (
        "riskhub.snapshot.priority_risks.v2"
    )
    assert payload["metric_observations"]["priority_risks"]["compare"]["definition_id"] == (
        "riskhub.snapshot.priority_risks.v1"
    )
    assert payload["changes"]["priority_risks"] == {
        "absolute": None,
        "percentage": None,
        "direction": "unknown",
        "reason": "different_definition",
    }


@pytest.mark.asyncio
async def test_legacy_stock_delta_without_both_metric_definitions_is_suppressed(
    client_cro: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q2",
        year=2026,
        quarter_number=2,
        metrics={
            "priority_risks": 2,
            "_metric_definitions": {"priority_risks": "riskhub.snapshot.priority_risks.v1"},
        },
    )
    await save_quarter_snapshot(
        db_session,
        quarter_label="2026-Q1",
        year=2026,
        quarter_number=1,
        metrics={"priority_risks": 1},
    )
    await db_session.commit()

    response = await client_cro.get(
        "/api/v1/dashboard/quarterly-comparison",
        params={"current_quarter": "2026-Q2", "compare_quarter": "2026-Q1"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["changes"]["priority_risks"] == {
        "absolute": None,
        "percentage": None,
        "direction": "unknown",
        "reason": "missing_definition",
    }
