"""Test-only characterization of the live Dashboard matrix drilldown contract."""

import pytest

from app.api.v1.endpoints.dashboard import overview
from app.core.ttl_cache import TTLCache
from app.models.global_config import clear_config_cache
from tests.backend.pytest.factories import create_test_risk
from tests.backend.pytest.test_dashboard_risk_range_destinations import seed_ranges


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "risk_type,level,expected_codes",
    [
        ("gross", "critical", {"CELL-critical"}),
        ("gross", "high", {"CELL-high"}),
        ("gross", None, {"CELL-critical", "CELL-high"}),
        ("net", "critical", {"CELL-critical"}),
    ],
)
async def test_matrix_cell_opens_the_filtered_population_it_counted(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    risk_type,
    level,
    expected_codes,
):
    monkeypatch.setattr(overview, "DASHBOARD_OVERVIEW_CACHE", TTLCache(ttl_seconds=15, max_entries=500))
    await seed_ranges(db_session)
    for label, net_probability, net_impact, archived in [
        ("critical", 5, 5, False),
        ("high", 4, 4, False),
        ("archived", 5, 5, True),
    ]:
        await create_test_risk(
            db_session,
            department_id=test_department.id,
            owner_id=test_user_cro.id,
            risk_id_code=f"CELL-{label}",
            overrides={
                "gross_probability": 5,
                "gross_impact": 5,
                "gross_score": 25,
                "net_probability": net_probability,
                "net_impact": net_impact,
                "net_score": net_probability * net_impact,
                "is_archived": archived,
            },
        )
    await db_session.commit()
    params = {"department_id": test_department.id, "risk_type": risk_type}
    if level:
        params["risk_level"] = level
    try:
        async with client_factory(current_user=test_user_cro) as client:
            dashboard = await client.get("/api/v1/dashboard/overview", params=params)
            matrix = await client.get("/api/v1/dashboard/risk-distribution", params=params)
            cell = await client.get("/api/v1/dashboard/risks-by-cell", params={**params, "probability": 5, "impact": 5})
        assert dashboard.status_code == matrix.status_code == cell.status_code == 200
        distribution = matrix.json()["distribution"]
        assert dashboard.json()[f"{risk_type}_distribution"] == matrix.json()
        counted = sum(row["count"] for row in distribution if row["probability"] == 5 and row["impact"] == 5)
        assert counted == len(expected_codes), "fixture must pin the actual displayed cell population"
        actual_codes = {row["risk_id_code"] for row in cell.json()}
        print({"risk_type": risk_type, "risk_level": level, "counted": counted, "actual_codes": sorted(actual_codes)})
        assert actual_codes == expected_codes
    finally:
        clear_config_cache()


@pytest.mark.asyncio
@pytest.mark.parametrize("risk_type", ["gross", "net"])
@pytest.mark.parametrize("level", [None, "low", "medium", "high", "critical"])
@pytest.mark.parametrize("include_archived", [False, True])
async def test_configured_cell_matrix_preserves_applicable_filters_and_archive_rules(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    risk_type,
    level,
    include_archived,
):
    monkeypatch.setattr(overview, "DASHBOARD_OVERVIEW_CACHE", TTLCache(ttl_seconds=15, max_entries=500))
    await seed_ranges(db_session)
    points = {"low": (1, 1), "medium": (2, 4), "high": (4, 4), "critical": (5, 5)}
    for band, (probability, impact) in points.items():
        for archived in [False, True]:
            await create_test_risk(
                db_session,
                department_id=test_department.id,
                owner_id=test_user_cro.id,
                risk_id_code=f"CELL-{band}-{archived}",
                overrides={
                    "gross_probability": 5,
                    "gross_impact": 5,
                    "gross_score": 25,
                    "net_probability": probability,
                    "net_impact": impact,
                    "net_score": probability * impact,
                    "is_archived": archived,
                },
            )
    probability, impact = (5, 5) if risk_type == "gross" else points[level or "critical"]
    selected_bands = [level] if level else (list(points) if risk_type == "gross" else ["critical"])
    expected = {
        f"CELL-{band}-{archived}"
        for band in selected_bands
        for archived in [False, True]
        if include_archived or not archived
    }
    params = {"department_id": test_department.id, "risk_type": risk_type, "include_archived": include_archived}
    if level:
        params["risk_level"] = level
    try:
        async with client_factory(current_user=test_user_cro) as client:
            matrix = await client.get("/api/v1/dashboard/risk-distribution", params=params)
            dashboard = await client.get("/api/v1/dashboard/overview", params=params)
            for irrelevant in [{}, {"control_form": "manual", "control_status": "inactive"}]:
                cell = await client.get(
                    "/api/v1/dashboard/risks-by-cell",
                    params={**params, **irrelevant, "probability": probability, "impact": impact},
                )
                assert cell.status_code == 200
                assert {row["risk_id_code"] for row in cell.json()} == expected
        assert matrix.status_code == dashboard.status_code == 200
        assert dashboard.json()[f"{risk_type}_distribution"] == matrix.json()
        assert sum(
            row["count"]
            for row in matrix.json()["distribution"]
            if (row["probability"], row["impact"]) == (probability, impact)
        ) == len(expected)
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_cell_current_threshold_changes_use_existing_configuration_owner(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
):
    await seed_ranges(db_session)
    await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user_cro.id,
        risk_id_code="CELL-threshold",
        overrides={
            "gross_probability": 5,
            "gross_impact": 5,
            "gross_score": 25,
            "net_probability": 4,
            "net_impact": 4,
            "net_score": 16,
        },
    )
    params = {"probability": 5, "impact": 5, "risk_type": "gross", "risk_level": "critical"}
    try:
        async with client_factory(current_user=test_user_cro) as client:
            before = await client.get("/api/v1/dashboard/risks-by-cell", params=params)
            assert before.status_code == 200 and before.json() == []
            updated = await client.patch(
                "/api/v1/riskhub/config/critical_risk_min_net_score", json={"value": "16"}
            )
            assert updated.status_code == 200, updated.text
            after = await client.get("/api/v1/dashboard/risks-by-cell", params=params)
            assert after.status_code == 200
            assert {row["risk_id_code"] for row in after.json()} == {"CELL-threshold"}
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_cell_preserves_scoped_ownership_selected_department_and_permission(
    db_session,
    client_factory,
    test_department,
    test_user_employee,
    test_user_cro,
):
    from app.models import Department

    await seed_ranges(db_session)
    other = Department(name="Cell hidden department", code="CELL-OTHER")
    db_session.add(other)
    await db_session.commit()
    for name, department_id, owner_id in [
        ("local", test_department.id, test_user_cro.id),
        ("owned", other.id, test_user_employee.id),
        ("hidden", other.id, test_user_cro.id),
    ]:
        await create_test_risk(
            db_session,
            department_id=department_id,
            owner_id=owner_id,
            risk_id_code=f"CELL-{name}",
            overrides={
                "gross_probability": 5,
                "gross_impact": 5,
                "gross_score": 25,
                "net_probability": 5,
                "net_impact": 5,
                "net_score": 25,
            },
        )
    try:
        async with client_factory(current_user=test_user_employee) as client:
            params = {"probability": 5, "impact": 5, "risk_type": "gross", "risk_level": "critical"}
            for department_id, expected in [
                (None, {"CELL-local", "CELL-owned"}),
                (test_department.id, {"CELL-local"}),
                (other.id, set()),
            ]:
                criteria = params if department_id is None else {**params, "department_id": department_id}
                response = await client.get("/api/v1/dashboard/risks-by-cell", params=criteria)
                assert response.status_code == 200
                assert {row["risk_id_code"] for row in response.json()} == expected
                if department_id is not None:
                    assert "Cell hidden department" not in response.text
            test_user_employee.role.permissions = [
                grant for grant in test_user_employee.role.permissions if grant.permission.resource != "risks"
            ]
            await db_session.commit()
            denied = await client.get("/api/v1/dashboard/risks-by-cell", params=params)
            assert denied.status_code == 403
    finally:
        clear_config_cache()


@pytest.mark.asyncio
async def test_cell_rejects_invalid_risk_level(client_factory, test_user_cro):
    async with client_factory(current_user=test_user_cro) as client:
        response = await client.get(
            "/api/v1/dashboard/risks-by-cell", params={"probability": 5, "impact": 5, "risk_level": "extreme"}
        )
        assert response.status_code == 422
        assert any(error["loc"] == ["query", "risk_level"] for error in response.json()["detail"])
