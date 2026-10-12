"""Mounted public requests must execute declared read-model owners."""

from __future__ import annotations

import importlib
import types

import pytest

from app.main import app

DASHBOARD_EDGES = [
    (
        "summary",
        "get_dashboard_summary",
        "build_dashboard_summary_metrics",
        "/api/v1/dashboard/summary",
    ),
    (
        "committee",
        "get_committee_summary",
        "build_committee_summary_metrics",
        "/api/v1/dashboard/committee-summary",
    ),
    (
        "quarterly",
        "get_available_periods",
        "build_available_periods",
        "/api/v1/dashboard/available-periods",
    ),
    (
        "quarterly",
        "get_quarterly_comparison",
        "build_quarterly_comparison",
        "/api/v1/dashboard/quarterly-comparison",
    ),
    (
        "issues_metrics",
        "get_issue_summary",
        "build_issue_summary_metrics",
        "/api/v1/dashboard/issues-summary",
    ),
    (
        "issues_metrics",
        "get_issue_aging",
        "build_issue_aging_metrics",
        "/api/v1/dashboard/issues-aging",
    ),
    (
        "issues_metrics",
        "get_issues_by_severity",
        "build_issue_severity_metrics",
        "/api/v1/dashboard/issues-by-severity",
    ),
]


def clone_with_binding(function, name, value):
    clone = types.FunctionType(
        function.__code__,
        {**function.__globals__, name: value},
        function.__name__,
        function.__defaults__,
        function.__closure__,
    )
    clone.__kwdefaults__ = function.__kwdefaults__
    clone.__annotations__ = function.__annotations__
    return clone


async def dashboard_edge(client_factory, actor, monkeypatch, edge, bypass=False):
    module_name, endpoint_name, symbol, path = edge
    module = importlib.import_module("app.api.v1.endpoints.dashboard." + module_name)
    endpoint = getattr(module, endpoint_name)
    canonical = getattr(module, symbol)
    called = []

    async def tracked(*args, **kwargs):
        called.append((args, kwargs))
        return await canonical(*args, **kwargs)

    monkeypatch.setattr(module, symbol, tracked)
    if bypass:
        detached = clone_with_binding(endpoint, symbol, canonical)
        matches = [
            route for route in app.routes if getattr(route, "path", None) == path
        ]
        assert len(matches) == 1
        monkeypatch.setattr(matches[0].dependant, "call", detached)
    async with client_factory(current_user=actor) as client:
        response = await client.get(path)
    assert response.status_code == 200, response.text
    assert len(called) == 1, "HTTP200 bypassed the declared metric owner"
    return response.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("edge", DASHBOARD_EDGES)
async def test_dashboard_http_uses_canonical_metric_owner(
    client_factory, test_user_cro, monkeypatch, edge
):
    await dashboard_edge(client_factory, test_user_cro, monkeypatch, edge)


@pytest.mark.asyncio
@pytest.mark.parametrize("edge", DASHBOARD_EDGES)
async def test_dashboard_http200_bypass_mutant_is_detected(
    client_factory, test_user_cro, monkeypatch, edge
):
    with pytest.raises(
        AssertionError, match="HTTP200 bypassed the declared metric owner"
    ):
        await dashboard_edge(
            client_factory, test_user_cro, monkeypatch, edge, bypass=True
        )


async def monitoring_edge(client_factory, actor, monkeypatch, resource, bypass=False):
    from app.services import _monitoring_status, _reporting

    symbol = (
        "apply_control_monitoring_rows"
        if resource == "controls"
        else "apply_kri_monitoring_rows"
    )
    builder = _reporting.get_export_builder(resource)
    owner = importlib.import_module(builder.__module__)
    canonical = getattr(_monitoring_status, symbol)
    assert getattr(owner, symbol) is canonical
    called = []

    def tracked(*args, **kwargs):
        called.append(kwargs["as_of_date"])
        return canonical(*args, **kwargs)

    monkeypatch.setattr(owner, symbol, tracked)
    if bypass:
        registry = importlib.import_module(_reporting.get_export_builder.__module__)
        monkeypatch.setattr(
            registry,
            "EXPORT_BUILDERS",
            {
                **registry.EXPORT_BUILDERS,
                resource: clone_with_binding(builder, symbol, canonical),
            },
        )
    async with client_factory(current_user=actor) as client:
        response = await client.get(
            "/api/v1/reports/" + resource + "/export",
            params={"format": "csv", "as_of_date": "2026-01-31"},
        )
    assert response.status_code == 200, response.text
    assert len(called) == 1, "HTTP200 bypassed the canonical monitoring projection"
    assert called[0].isoformat() == "2026-01-31"


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["controls", "kris"])
async def test_report_http_uses_canonical_projection_with_explicit_date(
    client_factory, test_user_cro, monkeypatch, resource
):
    await monitoring_edge(client_factory, test_user_cro, monkeypatch, resource)


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["controls", "kris"])
async def test_report_http200_projection_bypass_mutant_is_detected(
    client_factory, test_user_cro, monkeypatch, resource
):
    with pytest.raises(
        AssertionError, match="HTTP200 bypassed the canonical monitoring projection"
    ):
        await monitoring_edge(
            client_factory, test_user_cro, monkeypatch, resource, bypass=True
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mutation", ["range_bypass", "forwarding_bypass", "archive_bypass"]
)
async def test_cell_population_mutants_fail_the_unchanged_http_oracle(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    mutation,
):
    import traceback

    from sqlalchemy import true

    from app.api.v1.endpoints.dashboard import risks as route
    from app.services import _dashboard_metrics
    from tests.backend.pytest.test_dashboard_cell_population_parity import (
        test_matrix_cell_opens_the_filtered_population_it_counted,
    )

    implementation = importlib.import_module(
        _dashboard_metrics.load_risks_by_cell.__module__
    )
    if mutation == "range_bypass":
        monkeypatch.setattr(
            implementation, "build_risk_level_condition_from_ranges", lambda *args: None
        )
    elif mutation == "archive_bypass":
        risk = implementation.Risk

        class RiskProxyMeta(type):
            def __getattr__(cls, name):
                return getattr(risk, name)

        class RiskProxy(metaclass=RiskProxyMeta):
            @staticmethod
            def live():
                return true()

        monkeypatch.setattr(implementation, "Risk", RiskProxy)
    else:
        original = route.load_risks_by_cell

        async def ignore_level(**kwargs):
            return await original(**{**kwargs, "risk_level": None})

        monkeypatch.setattr(route, "load_risks_by_cell", ignore_level)
    with pytest.raises(AssertionError) as failed:
        await test_matrix_cell_opens_the_filtered_population_it_counted(
            db_session,
            client_factory,
            test_department,
            test_user_cro,
            monkeypatch,
            "gross",
            "critical",
            {"CELL-critical"},
        )
    last = traceback.extract_tb(failed.value.__traceback__)[-1]
    assert last.name == "test_matrix_cell_opens_the_filtered_population_it_counted"
    assert last.line and (
        "assert counted == len(expected_codes)" in last.line
        or "assert actual_codes == expected_codes" in last.line
    ), last


@pytest.mark.asyncio
async def test_cell_stale_threshold_mutant_fails_the_unchanged_update_oracle(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
):
    import copy
    import traceback

    from app.services import _dashboard_metrics
    from tests.backend.pytest.test_dashboard_cell_population_parity import (
        test_cell_current_threshold_changes_use_existing_configuration_owner,
    )

    implementation = importlib.import_module(
        _dashboard_metrics.load_risks_by_cell.__module__
    )
    original = implementation.get_configured_risk_level_ranges
    captured = None

    async def stale(db):
        nonlocal captured
        if captured is None:
            captured = copy.deepcopy(await original(db))
        return captured

    monkeypatch.setattr(implementation, "get_configured_risk_level_ranges", stale)
    with pytest.raises(AssertionError) as failed:
        await test_cell_current_threshold_changes_use_existing_configuration_owner(
            db_session, client_factory, test_department, test_user_cro
        )
    last = traceback.extract_tb(failed.value.__traceback__)[-1]
    assert (
        last.name
        == "test_cell_current_threshold_changes_use_existing_configuration_owner"
    )
    assert (
        last.line and "after.json()" in last.line and "CELL-threshold" in last.line
    ), last


@pytest.mark.asyncio
async def test_cell_scope_bypass_mutant_fails_the_unchanged_read_authority_oracle(
    db_session,
    client_factory,
    test_department,
    test_user_employee,
    test_user_cro,
    monkeypatch,
):
    import traceback

    from app.services import _dashboard_metrics
    from tests.backend.pytest.test_dashboard_cell_population_parity import (
        test_cell_preserves_scoped_ownership_selected_department_and_permission,
    )

    implementation = importlib.import_module(
        _dashboard_metrics.load_risks_by_cell.__module__
    )

    async def unrestricted(*args, **kwargs):
        return None

    monkeypatch.setattr(implementation, "risk_visibility_clause", unrestricted)
    with pytest.raises(AssertionError) as failed:
        await test_cell_preserves_scoped_ownership_selected_department_and_permission(
            db_session,
            client_factory,
            test_department,
            test_user_employee,
            test_user_cro,
        )
    last = traceback.extract_tb(failed.value.__traceback__)[-1]
    assert (
        last.name
        == "test_cell_preserves_scoped_ownership_selected_department_and_permission"
    )
    assert (
        last.line and "response.json()" in last.line and "expected" in last.line
    ), last


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["department", "active_exception", "severity"])
async def test_issue_population_mutants_fail_existing_dashboard_destination_oracle(
    db_session,
    client_factory,
    test_department,
    test_user_cro,
    monkeypatch,
    mutation,
):
    import traceback

    from app.services import _dashboard_metrics
    from tests.backend.pytest.test_dashboard_drillthrough_existing_contracts import (
        test_existing_dashboard_destinations_match_their_counted_populations,
    )

    implementation = importlib.import_module(
        _dashboard_metrics.build_issue_summary_metrics.__module__
    )
    if mutation == "department":
        original = implementation._load_scoped_issues

        async def ignore_selection(db, current_user, *, department_id):
            return await original(db, current_user, department_id=None)

        monkeypatch.setattr(implementation, "_load_scoped_issues", ignore_selection)
    elif mutation == "active_exception":
        monkeypatch.setattr(
            implementation, "issue_has_active_approved_exception", lambda *args: False
        )
    else:
        original = implementation._build_issue_metrics_bundle

        def ignore_severity(issues, now):
            bundle = original(issues, now)
            bundle.summary.high_severity_open = bundle.summary.open_issues
            return bundle

        monkeypatch.setattr(
            implementation, "_build_issue_metrics_bundle", ignore_severity
        )
    with pytest.raises(AssertionError) as failed:
        await test_existing_dashboard_destinations_match_their_counted_populations(
            db_session,
            client_factory,
            test_department,
            test_user_cro,
            monkeypatch,
            True,
        )
    last = traceback.extract_tb(failed.value.__traceback__)[-1]
    assert (
        last.name
        == "test_existing_dashboard_destinations_match_their_counted_populations"
    )
    assert last.line and 'listed.json()["total"] == summary[metric]' in last.line, last


def monitoring_time_oracle():
    from datetime import UTC, date, datetime

    from app.services import _monitoring_status as monitoring

    control = {
        "created_at": datetime(2025, 1, 1, tzinfo=UTC),
        "latest_execution_result": "passed",
        "latest_executed_at": datetime(2026, 1, 1, tzinfo=UTC),
        "execution_log_count": 1,
    }
    early = monitoring.apply_control_monitoring_rows(
        [dict(control)],
        config=monitoring.ControlMonitoringConfig(execution_stale_days=30),
        as_of_date=date(2026, 1, 15),
    )[0]
    later = monitoring.apply_control_monitoring_rows(
        [dict(control)],
        config=monitoring.ControlMonitoringConfig(execution_stale_days=30),
        as_of_date=date(2026, 3, 1),
    )[0]
    assert early["monitoring_status"] == "passed"
    assert (
        later["monitoring_status"] == "needs_review"
    ), "explicit Control as-of date must select the stale window"
    kri = {
        "frequency": "monthly",
        "last_period_end": date(2026, 6, 30),
        "current_value": 50,
        "lower_limit": 0,
        "upper_limit": 100,
        "breach_status": "within",
    }
    warning = monitoring.apply_kri_monitoring_rows(
        [dict(kri)],
        config=monitoring.KRIMonitoringConfig(warning_upper_margin_ratio=0.1),
        as_of_date=date(2026, 7, 30),
    )[0]
    overdue = monitoring.apply_kri_monitoring_rows(
        [dict(kri)],
        config=monitoring.KRIMonitoringConfig(warning_upper_margin_ratio=0.1),
        as_of_date=date(2026, 8, 22),
    )[0]
    assert warning["timeliness_status"] == "due_soon"
    assert (
        overdue["monitoring_status"] == "not_submitted"
    ), "explicit KRI as-of date must select the missing period"
    assert overdue["required_period_end"] == date(2026, 7, 31)


def test_declared_monitoring_projections_preserve_explicit_time_semantics():
    monitoring_time_oracle()


@pytest.mark.parametrize("resource", ["control", "kri"])
def test_monitoring_stale_time_mutants_are_detected(monkeypatch, resource):
    from datetime import UTC, date, datetime

    from app.services import _monitoring_status as monitoring

    projection = getattr(monitoring, "apply_" + resource + "_monitoring_rows")
    owner = importlib.import_module(projection.__module__)
    symbol = "derive_" + resource + "_monitoring_snapshot"
    original = getattr(owner, symbol)

    def stale(*args, **kwargs):
        kwargs["now" if resource == "control" else "today"] = (
            datetime(2026, 1, 15, tzinfo=UTC)
            if resource == "control"
            else date(2026, 7, 30)
        )
        return original(*args, **kwargs)

    monkeypatch.setattr(owner, symbol, stale)
    with pytest.raises(AssertionError, match="explicit (Control|KRI) as-of date"):
        monitoring_time_oracle()
