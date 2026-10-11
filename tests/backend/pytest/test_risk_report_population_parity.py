"""Risk reports filter final replay facts with the register's row predicates."""

import csv
import io

import pytest

from tests.backend.pytest.factories import create_test_risk


def exported_codes(response):
    assert response.status_code == 200, response.text
    return [
        row["Risk ID"]
        for row in csv.DictReader(io.StringIO(response.text.lstrip("\ufeff")))
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["category_search", "lifecycle_all"])
async def test_report_matches_list_for_named_search_and_lifecycle_defects(
    db_session, client_factory, test_user_cro, test_department, defect
):
    for label, archived, status, category in [
        ("live", False, "active", "NeedleCategoryOnly"),
        ("flag", True, "active", "Ordinary"),
    ]:
        await create_test_risk(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_id_code=f"R265-{label}",
            overrides={"is_archived": archived, "status": status, "category": category},
        )
    criteria = (
        {"search": "NeedleCategoryOnly"}
        if defect == "category_search"
        else {"lifecycle": "all"}
    )
    async with client_factory(current_user=test_user_cro) as client:
        listing = await client.get("/api/v1/risks", params=criteria)
        report = await client.get(
            "/api/v1/reports/risks/export", params={"format": "csv", **criteria}
        )
        assert listing.status_code == 200, listing.text
        expected = {row["risk_id_code"] for row in listing.json()["items"]}
        assert expected == (
            {"R265-live", "R265-flag"} if defect == "lifecycle_all" else set()
        )
        assert set(exported_codes(report)) == expected


async def assert_search_parity(db, client, department_id, owner_id):
    for index, (field, value) in enumerate(
        [
            ("risk_id_code", "Needle-ID"),
            ("name", "NeEdLe Name"),
            ("description", "Needle Description"),
            ("process", "Needle Process"),
            ("category", "CategoryOnly"),
            ("name", r"Literal%under_score\escape"),
            ("name", "Žluťoučký café"),
        ]
    ):
        await create_test_risk(
            db,
            department_id=department_id,
            owner_id=owner_id,
            risk_id_code=f"SEARCH265-{index}",
            overrides={field: value},
        )
    for search in [
        "needle",
        "NEEDLE",
        "CategoryOnly",
        "%",
        "_",
        r"\%",
        r"under\_score",
        r"\escape",
        " café",
        "Žluť",
        " needle ",
        "' OR 1=1 --",
    ]:
        criteria = {"search": search, "lifecycle": "all"}
        listed = await client.get("/api/v1/risks", params=criteria)
        report = await client.get(
            "/api/v1/reports/risks/export", params={"format": "csv", **criteria}
        )
        current = await client.get("/api/v1/risks/export", params=criteria)
        assert listed.status_code == current.status_code == 200, (
            search,
            listed.text,
            current.text,
        )
        expected = {row["risk_id_code"] for row in listed.json()["items"]}
        assert set(exported_codes(report)) == expected, search
        assert {
            row[0]
            for row in list(csv.reader(io.StringIO(current.text.lstrip("\ufeff"))))[1:]
        } == expected


@pytest.mark.asyncio
async def test_database_search_semantics_match_final_report_rows(
    db_session, client_factory, test_user_cro, test_department
):
    async with client_factory(current_user=test_user_cro) as client:
        await assert_search_parity(
            db_session, client, test_department.id, test_user_cro.id
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("lifecycle", [None, "active", "archived", "all"])
@pytest.mark.parametrize("status", [None, "active", "emerging", "archived"])
async def test_report_lifecycle_and_business_status_composition(
    db_session, client_factory, test_user_cro, test_department, lifecycle, status
):
    for archived in [False, True]:
        for business_status in ["active", "emerging"]:
            await create_test_risk(
                db_session,
                department_id=test_department.id,
                owner_id=test_user_cro.id,
                risk_id_code=f"LC265-{archived}-{business_status}",
                overrides={
                    "status": business_status,
                    "is_archived": archived,
                    "is_priority": True,
                },
            )
    criteria = {
        key: value
        for key, value in {
            "lifecycle": lifecycle,
            "status": status,
            "is_priority": True,
            "risk_type": "operational",
        }.items()
        if value is not None
    }
    async with client_factory(current_user=test_user_cro) as client:
        listed = await client.get("/api/v1/risks", params=criteria)
        report = await client.get(
            "/api/v1/reports/risks/export", params={"format": "csv", **criteria}
        )
        if lifecycle is not None and status == "archived":
            assert listed.status_code == report.status_code == 422
            return
        assert listed.status_code == 200, listed.text
        expected = {row["risk_id_code"] for row in listed.json()["items"]}
        assert set(exported_codes(report)) == expected
        expected_lifecycle = lifecycle or (
            "archived" if status == "archived" else "active"
        )
        expected_status = None if lifecycle is None and status == "archived" else status
        assert expected == {
            f"LC265-{archived}-{business_status}"
            for archived in [False, True]
            for business_status in ["active", "emerging"]
            if (
                expected_lifecycle == "all"
                or archived == (expected_lifecycle == "archived")
            )
            and (expected_status is None or expected_status == business_status)
        }


@pytest.mark.asyncio
async def test_replayed_search_lifecycle_and_status_apply_after_audited_transitions(
    db_session, client_factory, test_user_cro, test_department
):
    from datetime import timedelta

    from app.core.datetime_utils import utc_now
    from app.models.activity_log import ActivityLog

    now = utc_now()
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="HISTORY265",
        overrides={
            "name": "Today Name",
            "process": "Today Process",
            "description": "Today Description",
            "category": "Today Category",
            "risk_type": "financial",
            "status": "active",
            "is_archived": True,
            "is_priority": False,
            "created_at": now - timedelta(days=10),
        },
    )
    changes = {
        field: {"old": old, "new": getattr(risk, field)}
        for field, old in {
            "name": "Before Name",
            "process": "Before Process",
            "description": "Before Description",
            "category": "Before CategoryOnly",
            "risk_type": "operational",
            "status": "emerging",
            "is_archived": False,
            "is_priority": True,
        }.items()
    }
    db_session.add(
        ActivityLog(
            entity_type="risk",
            entity_id=risk.id,
            entity_name=risk.name,
            action="update",
            actor_id=test_user_cro.id,
            actor_name=test_user_cro.name,
            department_id=test_department.id,
            changes=changes,
            description="After cutoff changes",
            created_at=now,
        )
    )
    new = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="CREATED265",
    )
    db_session.add(
        ActivityLog(
            entity_type="risk",
            entity_id=new.id,
            entity_name=new.name,
            action="create",
            actor_id=test_user_cro.id,
            actor_name=test_user_cro.name,
            department_id=test_department.id,
            description="Created after cutoff",
            created_at=now,
        )
    )
    await db_session.commit()
    async with client_factory(current_user=test_user_cro) as client:
        dated = {
            "format": "csv",
            "as_of_date": (now - timedelta(days=1)).date().isoformat(),
        }
        for search, expected in [
            ("Before", {"HISTORY265"}),
            ("Today", set()),
            ("CategoryOnly", set()),
        ]:
            response = await client.get(
                "/api/v1/reports/risks/export",
                params={
                    **dated,
                    "search": search,
                    "lifecycle": "active",
                    "status": "emerging",
                    "risk_type": "operational",
                    "is_priority": True,
                },
            )
            assert set(exported_codes(response)) == expected
        all_rows = await client.get(
            "/api/v1/reports/risks/export", params={**dated, "lifecycle": "all"}
        )
        assert set(exported_codes(all_rows)) == {"HISTORY265"}
        archived = await client.get(
            "/api/v1/reports/risks/export", params={**dated, "lifecycle": "archived"}
        )
        assert exported_codes(archived) == []
    await db_session.refresh(risk)
    assert (
        risk.name,
        risk.status,
        risk.is_archived,
        risk.risk_type,
        risk.is_priority,
    ) == (
        "Today Name",
        "active",
        True,
        "financial",
        False,
    )


async def assert_batch_identity_and_nulls(db_session, monkeypatch):
    from sqlalchemy import select

    from app.models import Risk
    from app.services._reporting.exports.risk_rows import (
        RISK_REPLAY_FILTER_BATCH_SIZE,
        filter_replayed_risk_rows,
    )
    from app.services.risk_row_criteria import (
        parse_risk_row_criteria,
        risk_row_predicates,
    )

    rows = [
        {
            "id": 7,
            "risk_id_code": "DUPLICATE",
            "name": "Needle" if index % 3 else None,
            "process": None,
            "description": None,
            "status": "archived" if index % 5 == 0 else "active",
            "is_archived": index % 7 == 0,
            "risk_type": "operational",
            "is_priority": None,
            "ordinal_payload": index,
        }
        for index in range(RISK_REPLAY_FILTER_BATCH_SIZE * 2 + 7)
    ]
    calls = []
    execute = db_session.execute

    async def observed(statement, *args, **kwargs):
        sql = str(statement.compile(dialect=db_session.bind.dialect))
        assert "FROM risks" not in sql
        assert len(statement.compile().params) < 500
        calls.append(statement)
        return await execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", observed)
    assert (
        await filter_replayed_risk_rows(db_session, [], parse_risk_row_criteria({}))
        == []
    )
    assert calls == []
    result = await filter_replayed_risk_rows(
        db_session,
        rows,
        parse_risk_row_criteria({"search": "needle", "lifecycle": "all"}),
    )
    assert [row["ordinal_payload"] for row in result] == [
        index for index in range(len(rows)) if index % 3
    ]
    assert len(calls) == 3
    calls.clear()
    result = await filter_replayed_risk_rows(
        db_session, rows, parse_risk_row_criteria({"lifecycle": "archived"})
    )
    assert [row["ordinal_payload"] for row in result] == [
        index for index in range(len(rows)) if index % 5 == 0 or index % 7 == 0
    ]
    assert len(calls) == 3
    assert rows[0]["name"] is None and rows[0]["status"] == "archived"
    # Public legacy ORM serialization is a separate existing defect; the shared
    # canonical SQL predicate and final replay row predicate still agree here.
    assert "status" in str(
        select(Risk.id).where(
            *risk_row_predicates(
                Risk, parse_risk_row_criteria({"lifecycle": "archived"})
            )
        )
    )


@pytest.mark.asyncio
async def test_replay_matcher_preserves_duplicate_ordinals_nulls_and_batch_order(
    db_session, monkeypatch
):
    await assert_batch_identity_and_nulls(db_session, monkeypatch)


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_risk_report_search_and_bounded_replay_facts(
    db_session, client_factory, test_user_cro, test_department, monkeypatch
):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Authoritative PostgreSQL dialect lane")
    async with client_factory(current_user=test_user_cro) as client:
        await assert_search_parity(
            db_session, client, test_department.id, test_user_cro.id
        )
    await assert_batch_identity_and_nulls(db_session, monkeypatch)


@pytest.mark.asyncio
@pytest.mark.parametrize("ownership", ["risk", "reporting", "control"])
async def test_report_search_lifecycle_keeps_read_scope_and_selected_department(
    db_session,
    client_factory,
    test_user_employee,
    test_user_cro,
    test_department,
    ownership,
):
    from app.models import ControlRiskLink, Department
    from tests.backend.pytest.factories import create_test_control, create_test_kri

    other = Department(name="Report outside", code="R265OUT")
    db_session.add(other)
    await db_session.commit()
    owned = await create_test_risk(
        db_session,
        department_id=other.id,
        owner_id=test_user_employee.id if ownership == "risk" else test_user_cro.id,
        risk_id_code="SCOPE265-OWNED",
        overrides={"name": "Find this"},
    )
    await create_test_risk(
        db_session,
        department_id=other.id,
        owner_id=test_user_cro.id,
        risk_id_code="SCOPE265-HIDDEN",
        overrides={"name": "Find this"},
    )
    await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="SCOPE265-LOCAL",
        overrides={"name": "Find this", "is_archived": True},
    )
    if ownership == "reporting":
        await create_test_kri(
            db_session,
            risk_id=owned.id,
            overrides={"reporting_owner_id": test_user_employee.id},
        )
    if ownership == "control":
        control = await create_test_control(
            db_session, department_id=other.id, owner_id=test_user_employee.id
        )
        db_session.add(ControlRiskLink(control_id=control.id, risk_id=owned.id))
        await db_session.commit()
    async with client_factory(current_user=test_user_employee) as client:
        for department, expected in [
            (None, {"SCOPE265-OWNED", "SCOPE265-LOCAL"}),
            (test_department.id, {"SCOPE265-LOCAL"}),
            (other.id, set()),
        ]:
            criteria = {
                "search": "Find",
                "lifecycle": "all",
                **({"department_id": department} if department else {}),
            }
            listing = await client.get("/api/v1/risks", params=criteria)
            report = await client.get(
                "/api/v1/reports/risks/export", params={"format": "csv", **criteria}
            )
            assert listing.status_code == 200, listing.text
            assert {row["risk_id_code"] for row in listing.json()["items"]} == expected
            if department == other.id:
                assert report.status_code == 403
            else:
                assert set(exported_codes(report)) == expected
                assert "SCOPE265-HIDDEN" not in report.text


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["reports", "risks"])
async def test_report_row_criteria_do_not_grant_missing_permission(
    db_session, client_factory, test_user_employee, test_department, missing
):
    await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_employee.id,
        risk_id_code="DENIED265",
    )
    test_user_employee.role.permissions = [
        grant
        for grant in test_user_employee.role.permissions
        if grant.permission.resource != missing
    ]
    async with client_factory(current_user=test_user_employee) as client:
        report = await client.get(
            "/api/v1/reports/risks/export", params={"format": "csv", "lifecycle": "all"}
        )
        current = await client.get("/api/v1/risks/export", params={"lifecycle": "all"})
        assert current.status_code == 403
        if missing == "reports":
            assert report.status_code == 403
        else:
            assert exported_codes(report) == []


@pytest.mark.asyncio
async def test_replay_restored_row_uses_historical_archive_state(
    db_session, client_factory, test_user_cro, test_department
):
    from datetime import timedelta

    from app.core.datetime_utils import utc_now
    from app.models.activity_log import ActivityLog

    now = utc_now()
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="RESTORE265",
        overrides={"is_archived": False, "created_at": now - timedelta(days=10)},
    )
    db_session.add(
        ActivityLog(
            entity_type="risk",
            entity_id=risk.id,
            entity_name=risk.name,
            action="update",
            actor_id=test_user_cro.id,
            actor_name=test_user_cro.name,
            department_id=test_department.id,
            changes={"is_archived": {"old": True, "new": False}},
            description="Restored after cutoff",
            created_at=now,
        )
    )
    await db_session.commit()
    async with client_factory(current_user=test_user_cro) as client:
        for lifecycle, expected in [
            ("active", []),
            ("archived", ["RESTORE265"]),
            ("all", ["RESTORE265"]),
        ]:
            report = await client.get(
                "/api/v1/reports/risks/export",
                params={
                    "format": "csv",
                    "as_of_date": (now - timedelta(days=1)).date().isoformat(),
                    "lifecycle": lifecycle,
                    "status": "active",
                },
            )
            assert exported_codes(report) == expected
