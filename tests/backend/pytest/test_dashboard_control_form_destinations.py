"""Control destinations preserve exact form and selected populations."""

import csv
import io
import json

import pytest
from sqlalchemy import select

from app.models import Control, Department
from tests.backend.pytest.factories import create_test_control


@pytest.mark.asyncio
@pytest.mark.parametrize("form", ["manual", "automatic"])
@pytest.mark.parametrize("status", [None, "draft", "active", "inactive"])
async def test_control_form_count_list_csv_population(
    db_session, client_factory, test_department, test_user_cro, form, status
):
    expected = set()
    for stored_form in ["manual", "automatic"]:
        for stored_status in ["draft", "active", "inactive"]:
            for archived in [False, True]:
                control = await create_test_control(
                    db_session,
                    department_id=test_department.id,
                    owner_id=test_user_cro.id,
                    name=f"C249-{stored_form}-{stored_status}-{archived}",
                    overrides={"control_form": stored_form, "status": stored_status, "is_archived": archived},
                )
                if stored_form == form and (status is None or status == stored_status) and not archived:
                    expected.add(control.name)
    async with client_factory(current_user=test_user_cro) as client:
        criteria = {"control_form": form, "lifecycle": "active", **({"status": status} if status else {})}
        response = await client.get("/api/v1/controls", params={"filters": json.dumps(criteria)})
        assert response.status_code == 200, response.text
        assert {r["name"] for r in response.json()["items"]} == expected
        summary = await client.get(
            "/api/v1/dashboard/summary", params={"control_form": form, **({"control_status": status} if status else {})}
        )
        assert summary.status_code == 200, summary.text
        assert summary.json()["total_controls"] == response.json()["total"] == len(expected)
        exported = await client.get("/api/v1/controls/export", params={"filters": json.dumps(criteria)})
        assert exported.status_code == 200, exported.text
        assert {row[0] for row in list(csv.reader(io.StringIO(exported.text.lstrip("\ufeff"))))[1:]} == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("selection", ["none", "allowed", "forbidden"])
async def test_explicit_department_selection_preserves_owner_authority(
    db_session, client_factory, test_department, test_user_employee, selection
):
    other = Department(name="Other Control selection", code="C249-OTHER")
    db_session.add(other)
    await db_session.commit()
    for label, department, owner in [
        ("local", test_department.id, None),
        ("owned", other.id, test_user_employee.id),
        ("hidden", other.id, None),
    ]:
        await create_test_control(db_session, department_id=department, owner_id=owner, name=f"C249-{label}")
    department = (
        {} if selection == "none" else {"department_id": test_department.id if selection == "allowed" else other.id}
    )
    expected = (
        {"C249-local", "C249-owned"} if selection == "none" else {"C249-local"} if selection == "allowed" else set()
    )
    async with client_factory(current_user=test_user_employee) as client:
        listed = await client.get("/api/v1/controls", params=department)
        assert listed.status_code == 200, listed.text
        assert {row["name"] for row in listed.json()["items"]} == expected
        grouped = await client.get("/api/v1/controls", params={**department, "group_by": "department"})
        assert grouped.status_code == 200, grouped.text
        assert sum(group["count"] for group in grouped.json()["groups"]) == len(expected)
        if selection == "forbidden":
            assert grouped.json()["groups"] == []
            # Existing facet contract echoes only the caller's selected token,
            # without looking up the forbidden Department's name or population.
            department_facets = grouped.json()["facets"]["department"]
            assert len(department_facets) == 1
            assert department_facets[0]["value"] == department_facets[0]["label"] == str(other.id)
            assert department_facets[0]["count"] == 0
            assert department_facets[0]["selected"] is True
            assert "Other Control selection" not in json.dumps(grouped.json()["facets"])
            assert not any(option["count"] for options in grouped.json()["facets"].values() for option in options)
        if selection == "allowed":
            assert all(option["value"] != str(other.id) for option in listed.json()["facets"]["department"])

        summary = await client.get("/api/v1/dashboard/summary", params=department)
        assert summary.status_code == 200, summary.text
        assert summary.json()["total_controls"] == listed.json()["total"] == len(expected)
        exported = await client.get("/api/v1/controls/export", params=department)
        assert exported.status_code == 200, exported.text
        assert {row[0] for row in list(csv.reader(io.StringIO(exported.text.lstrip("\ufeff"))))[1:]} == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["unknown", "Manual", ["manual"], True, {"form": "manual"}])
async def test_invalid_form_rejects_instead_of_unfiltering(client_factory, test_user_cro, value):
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get("/api/v1/controls", params={"filters": json.dumps({"control_form": value})})
        assert response.status_code in {400, 422}, response.text


@pytest.mark.asyncio
async def test_no_read_helper_and_public_denial(
    db_session, client_factory, test_department, test_user_directory_reader
):
    from app.services._register_listings.controls import apply_control_department_scoping

    actor = test_user_directory_reader
    await create_test_control(db_session, department_id=test_department.id, owner_id=actor.id)
    for selected in [None, test_department.id]:
        query = await apply_control_department_scoping(db_session, select(Control.id), actor, selected)
        assert not (await db_session.execute(query)).scalars().all()
        async with client_factory(current_user=actor) as client:
            for route in ["/api/v1/controls", "/api/v1/controls/export"]:
                result = await client.get(
                    route, params={"control_form": "manual", **({"department_id": selected} if selected else {})}
                )
                assert result.status_code == 403


@pytest.mark.asyncio
async def test_unknown_scalar_form_rejects_and_storage_remains_nonnullable(client_factory, test_user_cro):
    assert Control.__table__.c.control_form.nullable is False
    async with client_factory(current_user=test_user_cro) as client:
        for invalid in ["Manual", "unknown", "automatic,manual"]:
            response = await client.get("/api/v1/controls", params={"control_form": invalid})
            assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_control_snapshot_current_day_all_live_status_control(
    db_session, client_factory, test_department, test_user_cro
):
    from app.core.datetime_utils import utc_now

    for status, archived in [("draft", False), ("active", False), ("inactive", False), ("active", True)]:
        await create_test_control(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            name=f"C249-SNAPSHOT-{status}-{archived}",
            overrides={"status": status, "is_archived": archived},
        )
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get(
            "/api/v1/reports/controls/export", params={"format": "csv", "as_of_date": utc_now().date().isoformat()}
        )
        assert response.status_code == 200, response.text
        for status in ["draft", "active", "inactive"]:
            assert f"C249-SNAPSHOT-{status}-False" in response.text
        assert "C249-SNAPSHOT-active-True" not in response.text


@pytest.mark.asyncio
async def test_form_does_not_grant_current_view_export_permission(client_factory, test_user_employee):
    test_user_employee.role.permissions = [
        grant for grant in test_user_employee.role.permissions if grant.permission.resource != "reports"
    ]
    async with client_factory(current_user=test_user_employee) as client:
        listed = await client.get("/api/v1/controls", params={"control_form": "manual"})
        assert listed.status_code == 200, listed.text
        exported = await client.get("/api/v1/controls/export", params={"control_form": "manual"})
        assert exported.status_code == 403, exported.text
