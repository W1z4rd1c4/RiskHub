"""Linked risk disclosure in controls exports follows canonical Risk read access."""

import csv
from datetime import timedelta
from io import StringIO
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from app.core.datetime_utils import utc_now
from app.core.permissions import visible_risk_ids
from app.models import ActivityLog, Control, Department, KeyRiskIndicator, Risk, User
from app.models.risk import ControlRiskLink
from app.services._reporting.exports import controls as controls_export
from app.services._reporting.exports.fetch import _fetch_controls_for_export
from app.services._reporting.exports.rows import _control_to_row


@pytest_asyncio.fixture
async def linked_controls(db_session, test_department, test_role_employee):
    restricted = Department(name="Restricted finance", code="RESTRICTED")
    hidden_owner = User(
        name="Restricted risk owner", email="restricted-owner@example.test", role_id=test_role_employee.id
    )
    visible_owner = User(name="Visible risk owner", email="visible-owner@example.test", role_id=test_role_employee.id)
    db_session.add_all([restricted, hidden_owner, visible_owner])
    await db_session.flush()
    hidden = Risk(
        risk_id_code="RESTRICTED-RISK-001",
        name="Restricted acquisition risk",
        department_id=restricted.id,
        owner_id=hidden_owner.id,
        process="Finance",
        description="Restricted risk details",
        status="active",
    )
    visible = Risk(
        risk_id_code="VISIBLE-RISK-001",
        name="Visible operational risk",
        department_id=test_department.id,
        owner_id=visible_owner.id,
        process="Operations",
        description="Visible risk details",
        status="active",
    )
    controls = {
        name: Control(name=name, description="Readable control", department_id=test_department.id, status="active")
        for name in ("Hidden only", "Mixed links", "Visible only", "Unlinked")
    }
    db_session.add_all([hidden, visible, *controls.values()])
    await db_session.flush()
    # Insert the hidden risk first: projection must select the first readable link.
    for name, risks in (
        ("Hidden only", [hidden]),
        ("Mixed links", [hidden, visible]),
        ("Visible only", [visible]),
    ):
        for risk in risks:
            db_session.add(ControlRiskLink(control_id=controls[name].id, risk_id=risk.id))
    await db_session.commit()
    return hidden, visible, restricted, controls


def export_rows(response):
    assert response.status_code == 200, response.text
    return {row["Name"]: row for row in csv.DictReader(StringIO(response.text))}


@pytest.mark.asyncio
@pytest.mark.parametrize("historical", [False, True])
@pytest.mark.parametrize("explicit_department", [False, True])
async def test_controls_export_redacts_hidden_risk_metadata_and_counts(
    client_employee, db_session, linked_controls, test_department, monkeypatch, historical, explicit_department
):
    hidden, visible, restricted, controls = linked_controls
    visibility = AsyncMock(wraps=visible_risk_ids)
    monkeypatch.setattr(controls_export, "visible_risk_ids", visibility, raising=False)
    params = {"format": "csv"}
    if historical:
        params["as_of_date"] = (utc_now().date() - timedelta(days=1)).isoformat()
        db_session.add(
            ActivityLog(
                entity_type="control",
                entity_id=controls["Hidden only"].id,
                entity_name="Hidden only",
                action="update",
                actor_name="Test actor",
                description="Replay must preserve the authorized linked-risk projection",
                changes={
                    "description": {"old": "Historical control description", "new": "Readable control"},
                    "risk_name": {"old": hidden.name, "new": None},
                    "risk_id_code": {"old": hidden.risk_id_code, "new": None},
                    "risk_owner_name": {"old": "Restricted risk owner", "new": None},
                    "risk_department_name": {"old": restricted.name, "new": None},
                    "linked_risk_count": {"old": 1, "new": 0},
                },
                created_at=utc_now(),
            )
        )
        await db_session.commit()
    if explicit_department:
        params["department_id"] = test_department.id

    denied = await client_employee.get(f"/api/v1/risks/{hidden.id}")
    assert denied.status_code == 404
    response = await client_employee.get("/api/v1/reports/controls/export", params=params)
    rows = export_rows(response)
    assert set(rows) == set(controls)
    for name in ("Hidden only", "Unlinked"):
        assert rows[name]["Linked Risk"] == ""
        assert rows[name]["Linked Risk ID"] == ""
        assert rows[name]["Linked Risks"] == "0"
    for name in ("Mixed links", "Visible only"):
        assert rows[name]["Linked Risk"] == visible.name
        assert rows[name]["Linked Risk ID"] == visible.risk_id_code
        assert rows[name]["Linked Risks"] == "1"
    assert hidden.name not in response.text
    assert hidden.risk_id_code not in response.text
    if historical:
        assert rows["Hidden only"]["Description"] == "Historical control description"
    visibility.assert_awaited_once()
    assert set(visibility.call_args.args[2]) == {hidden.id, visible.id}

    # Hidden names, codes and departments must not act as search oracles either.
    for search in (hidden.name, hidden.risk_id_code, restricted.name):
        assert (
            export_rows(
                await client_employee.get("/api/v1/reports/controls/export", params={**params, "search": search})
            )
            == {}
        )
    for search in (visible.name, visible.risk_id_code, test_department.name):
        assert "Mixed links" in export_rows(
            await client_employee.get("/api/v1/reports/controls/export", params={**params, "search": search})
        )


@pytest.mark.asyncio
async def test_control_row_redacts_linked_risk_owner_and_department(
    db_session, test_user_employee, test_department, linked_controls
):
    hidden, visible, _, _ = linked_controls
    models = await _fetch_controls_for_export(db_session, current_user=test_user_employee, department_id=None)
    rows = {control.name: _control_to_row(control, visible_linked_risk_ids={visible.id}) for control in models}
    assert rows["Hidden only"]["risk_owner_name"] is None
    assert rows["Hidden only"]["risk_department_name"] is None
    assert rows["Mixed links"]["risk_owner_name"] == "Visible risk owner"
    assert rows["Mixed links"]["risk_department_name"] == test_department.name
    # Projection must not mutate the ORM relationship or discard permitted controls.
    assert {link.risk_id for model in models for link in model.risk_links} == {hidden.id, visible.id}


@pytest.mark.asyncio
@pytest.mark.parametrize("role_name", ["admin", "cro"])
async def test_controls_export_preserves_globally_visible_linked_risks(
    client_factory, db_session, test_user, linked_controls, role_name
):
    hidden, visible, _, _ = linked_controls
    test_user.role.name = role_name
    await db_session.commit()
    async with client_factory(user=test_user) as client:
        rows = export_rows(await client.get("/api/v1/reports/controls/export?format=csv"))
    assert rows["Hidden only"]["Linked Risk"] == hidden.name
    assert rows["Hidden only"]["Linked Risk ID"] == hidden.risk_id_code
    assert rows["Hidden only"]["Linked Risks"] == "1"
    assert rows["Mixed links"]["Linked Risks"] == "2"
    assert rows["Visible only"]["Linked Risk"] == visible.name
    assert rows["Unlinked"]["Linked Risks"] == "0"


@pytest.mark.asyncio
@pytest.mark.parametrize("ownership", ["risk", "control", "kri"])
async def test_controls_export_preserves_cross_department_ownership_visibility(
    client_employee, db_session, test_user_employee, test_department, linked_controls, ownership
):
    hidden, _, _, controls = linked_controls
    if ownership == "risk":
        hidden.owner_id = test_user_employee.id
    elif ownership == "control":
        controls["Hidden only"].control_owner_id = test_user_employee.id
    else:
        db_session.add(
            KeyRiskIndicator(
                risk_id=hidden.id,
                metric_name="Owned reporting metric",
                description="Reporting ownership grants risk visibility",
                current_value=1.0,
                lower_limit=0.0,
                upper_limit=10.0,
                reporting_owner_id=test_user_employee.id,
            )
        )
    await db_session.commit()
    allowed = await client_employee.get(f"/api/v1/risks/{hidden.id}")
    assert allowed.status_code == 200
    rows = export_rows(
        await client_employee.get(
            "/api/v1/reports/controls/export", params={"format": "csv", "department_id": test_department.id}
        )
    )
    assert rows["Hidden only"]["Linked Risk"] == hidden.name
    assert rows["Hidden only"]["Linked Risk ID"] == hidden.risk_id_code
    assert rows["Mixed links"]["Linked Risks"] == "2"


@pytest.mark.asyncio
async def test_controls_export_requires_independent_risk_read_permission(
    client_employee, db_session, test_user_employee, linked_controls
):
    test_user_employee.role.permissions = [
        link for link in test_user_employee.role.permissions if link.permission.resource != "risks"
    ]
    await db_session.commit()
    rows = export_rows(await client_employee.get("/api/v1/reports/controls/export?format=csv"))
    assert len(rows) == 4
    for row in rows.values():
        assert row["Linked Risk"] == ""
        assert row["Linked Risk ID"] == ""
        assert row["Linked Risks"] == "0"
