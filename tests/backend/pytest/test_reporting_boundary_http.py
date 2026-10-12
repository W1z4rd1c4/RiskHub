"""Reconstructed public reporting tests. Historical lost passes are not reused."""

import csv
import inspect
import json
from datetime import UTC, datetime
from io import StringIO

import pytest

from app.models import Issue
from tests.backend.pytest.factories import create_test_kri, create_test_risk


@pytest.mark.asyncio
@pytest.mark.parametrize("locale", ["en", "cs"])
async def test_issue_and_kri_csv_public_journey(
    auth_client, db_session, test_user, test_department, monkeypatch, locale
):
    from app.api.v1.endpoints.issues.crud import list as issues
    from app.api.v1.endpoints.kris.crud import list as kris

    now = datetime(2026, 10, 1, tzinfo=UTC)
    monkeypatch.setattr(issues, "utc_now", lambda: now)
    monkeypatch.setattr(kris, "utc_now", lambda: now)
    title = 'Escaped "Issue",\nnext line'
    db_session.add(
        Issue(
            title=title,
            status="open",
            severity="high",
            source_type="manual",
            department_id=test_department.id,
            owner_user_id=test_user.id,
            created_by_id=test_user.id,
            opened_at=now,
        )
    )
    risk = await create_test_risk(
        db_session,
        department_id=test_department.id,
        owner_id=test_user.id,
        risk_id_code="R-BOUNDARY",
    )
    await create_test_kri(
        db_session,
        risk_id=risk.id,
        metric_name="=SUM(1,2)",
        overrides={
            "description": 'KRI "quoted",\nnext',
            "frequency": "monthly",
            "last_reported_at": now,
            "created_at": now,
        },
    )
    await db_session.commit()
    for endpoint, text in (("issues", title), ("kris", "'=SUM(1,2)")):
        response = await auth_client.get(
            f"/api/v1/{endpoint}/export", params={"locale": locale}
        )
        assert response.status_code == 200, response.text
        rows = list(csv.DictReader(StringIO(response.text)))
        assert len(rows) == 1
        assert text in rows[0].values()
        assert response.headers["content-type"].startswith("text/csv")
        # Same frozen request produces byte-for-byte output without stale or unstable row ordering.
        repeat = await auth_client.get(
            f"/api/v1/{endpoint}/export", params={"locale": locale}
        )
        assert repeat.content == response.content
        import hashlib

        expected = {
            (
                "issues",
                "en",
            ): "585b609d1b2088896d83a34b57b77d474d5e380277f81ddc811bf7e09ca3b3cf",
            (
                "issues",
                "cs",
            ): "8b20649533062bb66d9761d1905b567c8262e54e7ac208c7c05a48d4c679161e",
            (
                "kris",
                "en",
            ): "22855bd668202c8e88a82dad05956e01596f521c5fdda40c63f4e52cd6434316",
            (
                "kris",
                "cs",
            ): "e2ed4fb58f0656109f12c332eff8387ade2df1c0fa1ceb3fdcab3f2a00be3e50",
        }
        # Captured anew from accepted main76e4 with this exact fixed-time HTTP seed.
        assert (
            hashlib.sha256(response.content).hexdigest() == expected[(endpoint, locale)]
        )


@pytest.mark.asyncio
async def test_export_denied_without_domain_authority(
    client_factory, db_session, test_user_employee
):
    from sqlalchemy import delete

    from app.models import RolePermission

    await db_session.execute(
        delete(RolePermission).where(
            RolePermission.role_id == test_user_employee.role_id
        )
    )
    await db_session.commit()
    user_id = test_user_employee.id
    db_session.expire_all()
    async with client_factory(headers={"X-Mock-User-Id": str(user_id)}) as client:
        for endpoint in ("issues", "kris"):
            result = await client.get(f"/api/v1/{endpoint}/export")
            assert result.status_code == 403, result.text


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [0, 101])
async def test_issue_public_export_shared_batch_owner(
    auth_client, db_session, test_user, test_department, monkeypatch, count
):
    from app.services._reporting.exports import issue_rows

    sizes = []
    original = issue_rows.build_issue_linked_visibility

    async def observed(db, actor, models):
        sizes.append(len(models))
        return await original(db, actor, models)

    monkeypatch.setattr(issue_rows, "build_issue_linked_visibility", observed)
    for i in range(count):
        db_session.add(
            Issue(
                title=f"Batch {i:03}",
                status="open",
                severity="high",
                source_type="manual",
                department_id=test_department.id,
                owner_user_id=test_user.id,
                created_by_id=test_user.id,
            )
        )
    await db_session.commit()
    for endpoint in (
        "/api/v1/issues/export",
        "/api/v1/reports/issues/export?format=csv",
    ):
        sizes.clear()
        response = await auth_client.get(endpoint)
        assert response.status_code == 200, response.text
        rows = list(csv.DictReader(StringIO(response.text)))
        assert len(rows) == (count if count else int("reports" in endpoint))
        assert sizes == ([100, 1] if count else [])


async def _assert_issue_group_precedence_public_listing_and_report(
    auth_client, db_session, test_user, test_department
):
    for severity in ("low", "high", "critical"):
        db_session.add(
            Issue(
                title=severity,
                status="open",
                severity=severity,
                source_type="manual",
                department_id=test_department.id,
                owner_user_id=test_user.id,
                created_by_id=test_user.id,
            )
        )
    await db_session.commit()
    filters = {"severity": "low", "severity_group": "high_critical"}
    listing = await auth_client.get(
        "/api/v1/issues", params={"filters": json.dumps(filters)}
    )
    assert listing.status_code == 200, listing.text
    assert {row["title"] for row in listing.json()["items"]} == {
        "high",
        "critical",
    }, "severity population"
    report = await auth_client.get(
        "/api/v1/reports/issues/export", params={"format": "csv", **filters}
    )
    assert report.status_code == 200, report.text
    assert {row["Title"] for row in csv.DictReader(StringIO(report.text))} == {
        "high",
        "critical",
    }, "severity population"


async def _assert_http_listing_reaches_declared_canonical_planner(
    auth_client, monkeypatch, entity, *, bypass_builder=False
):
    from app.services import _register_listings

    canonical = getattr(_register_listings, f"plan_{entity}_listing")
    owner = inspect.getmodule(canonical)
    hits = []
    if inspect.iscoroutinefunction(canonical):

        async def observed(*args, **kwargs):
            hits.append(True)
            return await canonical(*args, **kwargs)
    else:

        def observed(*args, **kwargs):
            hits.append(True)
            return canonical(*args, **kwargs)

    monkeypatch.setattr(owner, canonical.__name__, observed)
    # Direct endpoint bindings were resolved before this mutation; replace those exact identities too.
    import sys

    for module in list(sys.modules.values()):
        if getattr(module, "__name__", "").startswith("app.api."):
            if getattr(module, canonical.__name__, None) is canonical:
                monkeypatch.setattr(module, canonical.__name__, observed)
    if bypass_builder:
        from importlib import import_module
        from types import FunctionType

        adapter_path, builder_name = {
            "control": ("controls.crud.list", "build_control_listing_plan"),
            "kri": ("kris.crud.list", "build_kri_listing_plan"),
            "vendor": ("vendors.crud", "list_vendor_governance"),
        }[entity]
        adapter = import_module("app.api.v1.endpoints." + adapter_path)
        builder = getattr(adapter, builder_name)
        # A realistic duplicate binding still returns the real plan and200 response,
        # while bypassing the package owner's canonical planner binding.
        detached_globals = {**builder.__globals__, canonical.__name__: canonical}
        detached = FunctionType(
            builder.__code__,
            detached_globals,
            builder.__name__,
            builder.__defaults__,
            builder.__closure__,
        )
        detached.__kwdefaults__ = builder.__kwdefaults__
        monkeypatch.setattr(adapter, builder_name, detached)
    response = await auth_client.get(
        "/api/v1/"
        + {
            "risk": "risks",
            "control": "controls",
            "kri": "kris",
            "issue": "issues",
            "vendor": "vendors",
        }[entity]
    )
    assert response.status_code == 200, response.text
    assert hits == [True], "canonical planner not called"


@pytest.mark.asyncio
async def test_issue_group_precedence_public_listing_and_report(
    auth_client, db_session, test_user, test_department
):
    await _assert_issue_group_precedence_public_listing_and_report(
        auth_client, db_session, test_user, test_department
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("consumer", ["listing", "report"])
async def test_http_severity_population_detects_bypassed_shared_filter(
    auth_client, db_session, test_user, test_department, monkeypatch, consumer
):
    from app.services._register_listings import issues
    from app.services._reporting.exports import fetch

    monkeypatch.setattr(
        issues if consumer == "listing" else fetch,
        "issue_severity_clause",
        lambda *args: None,
    )
    with pytest.raises(AssertionError, match="severity population"):
        await _assert_issue_group_precedence_public_listing_and_report(
            auth_client, db_session, test_user, test_department
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("entity", ["risk", "control", "kri", "issue", "vendor"])
async def test_actual_http_listing_reaches_declared_canonical_planner(
    auth_client, monkeypatch, entity
):
    await _assert_http_listing_reaches_declared_canonical_planner(
        auth_client, monkeypatch, entity
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("entity", ["control", "kri", "vendor"])
async def test_http_delegation_rejects_successful_builder_bypass(
    auth_client, monkeypatch, entity
):
    with pytest.raises(AssertionError, match="canonical planner not called"):
        await _assert_http_listing_reaches_declared_canonical_planner(
            auth_client, monkeypatch, entity, bypass_builder=True
        )
