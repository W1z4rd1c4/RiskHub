"""B6 parity and authorization regressions for department register metrics."""

from dataclasses import asdict
from datetime import date

import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints.departments import _register_counts
from app.db.seed import seed_ict_workbook_parameter_config
from app.models import (
    ApprovalScenario,
    Asset,
    Department,
    GlobalConfig,
    OrphanedItem,
    Permission,
    Process,
    ProcessAssetLink,
    Role,
    RolePermission,
    User,
)
from app.models.global_config import clear_config_cache
from app.models.user import AccessScope
from app.services._register_listings import (
    AssetListCriteria,
    ProcessListCriteria,
    build_asset_listing,
    build_process_listing,
)


async def _reader(db, department_id, *, domains=("processes", "assets"), role_name="b6_reader"):
    role = Role(name=role_name, display_name="B6 reader")
    permissions = [Permission(resource=resource, action="read") for resource in ("departments", *domains)]
    db.add_all([role, *permissions])
    await db.flush()
    db.add_all([RolePermission(role_id=role.id, permission_id=permission.id) for permission in permissions])
    user = User(
        name="B6 reader",
        email="b6-reader@test.com",
        role_id=role.id,
        department_id=department_id,
        access_scope=AccessScope.DEPARTMENT,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    return (
        await db.execute(
            select(User)
            .where(User.id == user.id)
            .options(
                selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission),
                selectinload(User.department),
            )
        )
    ).scalar_one()


def _process(code, department_id, owner_id, **values):
    return Process(
        f_code=code,
        l0_area="B6",
        l1_process=code,
        owning_department_id=department_id,
        process_owner_user_id=owner_id,
        **values,
    )


def _asset(name, department_id, owner_id, **values):
    return Asset(
        name=name,
        owning_department_id=department_id,
        business_owner_user_id=owner_id,
        ict_owner_user_id=owner_id,
        **values,
    )


async def _canonical_counts(db, actor, department_id):
    processes = await build_process_listing(
        db, current_user=actor, criteria=ProcessListCriteria(department_ids=(department_id,))
    )
    assets = await build_asset_listing(
        db, current_user=actor, criteria=AssetListCriteria(department_ids=(department_id,))
    )

    def facet(listing, name, value):
        return next((option.count for option in listing.facets[name] if option.value == value), 0)

    return {
        "process_count": len(processes.matching_items),
        "critical_process_count": facet(processes, "criticality", "critical"),
        "cif_process_count": facet(processes, "cif", "yes"),
        "asset_count": len(assets.matching_items),
        "critical_asset_count": facet(assets, "criticality", "critical"),
        "legacy_asset_count": facet(assets, "legacy", "yes"),
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("global_reader", [False, True, pytest.param(True, marks=pytest.mark.postgres, id="postgres")])
async def test_department_counts_match_registers_with_hidden_and_archived_sources(
    db_session, client_factory, test_department, test_user_cro, global_reader
):
    await seed_ict_workbook_parameter_config(db_session)
    clear_config_cache()
    actor = test_user_cro if global_reader else await _reader(db_session, test_department.id)
    foreign = Department(name="B6 foreign", code="B6-FOREIGN")
    db_session.add(foreign)
    await db_session.flush()
    scored = _process(
        "B6-SCORED",
        test_department.id,
        actor.id,
        preliminary_criticality="low",
        cif_override="no",
        mtpd_hours=1,
        impact_client=5,
        impact_market_operations=5,
        impact_regulatory=5,
        impact_financial=5,
    )
    fallback = _process("B6-FALLBACK", test_department.id, actor.id, preliminary_criticality="low", cif_override="yes")
    hidden = _process("B6-HIDDEN", foreign.id, test_user_cro.id, preliminary_criticality="critical")
    archived_source = _process(
        "B6-ARCHIVED-SOURCE", foreign.id, actor.id, preliminary_criticality="critical", is_archived=True
    )
    archived_target = _process(
        "B6-ARCHIVED-TARGET", test_department.id, actor.id, preliminary_criticality="critical", is_archived=True
    )
    assets = [
        _asset("B6 hidden-primary", test_department.id, actor.id, preliminary_criticality="low"),
        _asset("B6 archived-primary", test_department.id, actor.id, preliminary_criticality="low"),
        _asset("B6 before reference", test_department.id, actor.id, standard_support_end_date=date(2026, 7, 2)),
        _asset("B6 equal reference", test_department.id, actor.id, standard_support_end_date=date(2026, 7, 3)),
        _asset("B6 after reference", test_department.id, actor.id, standard_support_end_date=date(2026, 7, 4)),
        _asset("B6 lifecycle legacy", test_department.id, actor.id, lifecycle_state="legacy"),
    ]
    padding = [_process(f"B6-PAD-{i}", test_department.id, actor.id) for i in range(51)]
    db_session.add_all(
        [
            scored,
            fallback,
            hidden,
            archived_source,
            archived_target,
            *assets,
            *padding,
            _asset(
                "B6 archived target", test_department.id, actor.id, preliminary_criticality="critical", is_archived=True
            ),
            _asset("B6 foreign target", foreign.id, actor.id, preliminary_criticality="critical"),
            _process("B6-UNASSIGNED", None, actor.id, preliminary_criticality="critical"),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            ProcessAssetLink(process_id=hidden.id, asset_id=assets[0].id, is_primary=True),
            ProcessAssetLink(process_id=archived_source.id, asset_id=assets[1].id, is_primary=True),
            ProcessAssetLink(process_id=fallback.id, asset_id=assets[1].id),
            OrphanedItem(item_type="process", item_id=scored.id, previous_owner_id=actor.id, status="pending"),
            OrphanedItem(
                item_type="asset",
                item_id=assets[1].id,
                previous_owner_id=actor.id,
                responsibility_role="business_owner",
                status="pending",
            ),
        ]
    )
    await db_session.commit()

    expected = await _canonical_counts(db_session, actor, test_department.id)
    assert expected == {
        "process_count": 53,
        "critical_process_count": 1,
        "cif_process_count": 1,
        "asset_count": 6,
        "critical_asset_count": 2 if global_reader else 1,
        "legacy_asset_count": 2,
    }
    counts = await _register_counts.load_department_register_counts(
        db_session, department_id=test_department.id, current_user=actor
    )
    assert asdict(counts) == expected
    async with client_factory(user=actor) as client:
        response = await client.get(f"/api/v1/departments/{test_department.id}")
        assert response.status_code == 200, response.text
        assert {name: response.json()[name] for name in expected} == expected
        if not global_reader:
            denied = await client.get(f"/api/v1/departments/{foreign.id}")
            assert denied.status_code == 403
        missing = await client.get("/api/v1/departments/999999")
        assert missing.status_code == 404

    # Owner exceptions allow these records individually, but never change
    # the department that owns the target or resurrect archived targets.
    foreign_expected = await _canonical_counts(db_session, actor, foreign.id)
    foreign_counts = await _register_counts.load_department_register_counts(
        db_session, department_id=foreign.id, current_user=actor
    )
    assert asdict(foreign_counts) == foreign_expected
    assert foreign_counts.asset_count == 1
    assert foreign_counts.process_count == (1 if global_reader else 0)

    parameter = (
        await db_session.execute(select(GlobalConfig).where(GlobalConfig.key == "ict_register_ref_datum"))
    ).scalar_one()
    parameter.value = "2026-07-04"
    await db_session.commit()
    clear_config_cache()
    changed = await _register_counts.load_department_register_counts(
        db_session, department_id=test_department.id, current_user=actor
    )
    assert changed.legacy_asset_count == 3
    assert asdict(changed) == await _canonical_counts(db_session, actor, test_department.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("domains", [(), ("processes",), ("assets",)])
async def test_department_counts_keep_domain_permission_masks_even_for_owned_rows(
    db_session, client_factory, test_department, monkeypatch, domains
):
    actor = await _reader(db_session, test_department.id, domains=domains)
    db_session.add_all(
        [
            _process("B6-OWNED", test_department.id, actor.id, preliminary_criticality="critical"),
            _asset(
                "B6 owned", test_department.id, actor.id, preliminary_criticality="critical", lifecycle_state="legacy"
            ),
        ]
    )
    await db_session.commit()

    async def forbidden(*args, **kwargs):
        pytest.fail("A domain without read permission must not be derived")

    if "processes" not in domains:
        monkeypatch.setattr(_register_counts, "load_process_derived_blocks", forbidden)
    if "assets" not in domains:
        monkeypatch.setattr(_register_counts, "load_asset_derived_blocks", forbidden)
    async with client_factory(user=actor) as client:
        response = await client.get(f"/api/v1/departments/{test_department.id}")
    assert response.status_code == 200, response.text
    body = response.json()
    for domain, fields in (
        ("processes", ("process_count", "critical_process_count", "cif_process_count")),
        ("assets", ("asset_count", "critical_asset_count", "legacy_asset_count")),
    ):
        if domain not in domains:
            assert all(body[field] is None for field in fields)
        else:
            assert body[fields[0]] == 1
            assert body[fields[1]] == 1


@pytest.mark.asyncio
async def test_department_head_inactive_department_keeps_only_owned_assets(db_session, test_department, test_user_cro):
    actor = await _reader(db_session, test_department.id, role_name="department_head")
    test_department.is_active = False
    db_session.add_all(
        [
            _asset("B6 head owned", test_department.id, actor.id, preliminary_criticality="critical"),
            _asset("B6 head hidden", test_department.id, test_user_cro.id, preliminary_criticality="critical"),
        ]
    )
    await db_session.commit()
    expected = await _canonical_counts(db_session, actor, test_department.id)
    counts = await _register_counts.load_department_register_counts(
        db_session, department_id=test_department.id, current_user=actor
    )
    assert counts.asset_count == counts.critical_asset_count == 1
    assert asdict(counts) == expected


@pytest.mark.asyncio
async def test_department_counts_use_operational_values_during_pending_edits_and_creations(
    db_session, client_factory, test_department, test_user_cro, test_user_risk_manager
):
    del test_user_risk_manager  # A separate eligible resolver exists.
    await seed_ict_workbook_parameter_config(db_session)
    clear_config_cache()
    process = _process(
        "B6-PENDING", test_department.id, test_user_cro.id, preliminary_criticality="low", cif_override="no"
    )
    asset = _asset("B6 pending edit", test_department.id, test_user_cro.id, preliminary_criticality="low")
    db_session.add_all([process, asset])
    db_session.add_all(
        [
            ApprovalScenario(
                key=key,
                display_name=key,
                description="B6 pending parity",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
            )
            for key in ("protected_process_edit", "protected_asset_edit")
        ]
    )
    await db_session.commit()
    expected = {
        "process_count": 1,
        "critical_process_count": 0,
        "cif_process_count": 0,
        "asset_count": 1,
        "critical_asset_count": 0,
        "legacy_asset_count": 0,
    }
    async with client_factory(user=test_user_cro) as client:
        pending_process = await client.patch(
            f"/api/v1/processes/{process.id}",
            json={"preliminary_criticality": "critical", "cif_override": "yes", "request_reason": "B6 edit parity"},
        )
        pending_asset = await client.patch(
            f"/api/v1/assets/{asset.id}",
            json={
                "preliminary_criticality": "critical",
                "lifecycle_state": "legacy",
                "request_reason": "B6 edit parity",
            },
        )
        assert pending_process.status_code == 202, pending_process.text
        assert pending_asset.status_code == 202, pending_asset.text
        for domain, row_id in (("processes", process.id), ("assets", asset.id)):
            detail = await client.get(f"/api/v1/{domain}/{row_id}")
            assert detail.status_code == 200, detail.text
            assert detail.json()["pending_change"] is not None
            assert detail.json()["preliminary_criticality"] == "low"

        process_creation = await client.post(
            "/api/v1/processes",
            json={
                "l0_area": "B6",
                "l1_process": "B6 rowless Process",
                "process_owner_user_id": test_user_cro.id,
                "owning_department_id": test_department.id,
                "preliminary_criticality": "critical",
                "cif_override": "yes",
                "request_reason": "B6 creation parity",
            },
        )
        asset_creation = await client.post(
            "/api/v1/assets",
            json={
                "name": "B6 rowless Asset",
                "business_owner_user_id": test_user_cro.id,
                "ict_owner_user_id": test_user_cro.id,
                "owning_department_id": test_department.id,
                "preliminary_criticality": "critical",
                "lifecycle_state": "legacy",
                "request_reason": "B6 creation parity",
            },
        )
        assert process_creation.status_code == 202, process_creation.text
        assert asset_creation.status_code == 202, asset_creation.text
        response = await client.get(f"/api/v1/departments/{test_department.id}")
        assert response.status_code == 200, response.text
        assert {name: response.json()[name] for name in expected} == expected
    assert await _canonical_counts(db_session, test_user_cro, test_department.id) == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("unrelated_rows,linked", [(0, False), (55, False), (55, True)])
async def test_department_count_path_reduces_executed_queries_and_scopes_derivation_targets(
    db_session, client_factory, test_department, test_user_cro, monkeypatch, unrelated_rows, linked, record_property
):
    await seed_ict_workbook_parameter_config(db_session)
    foreign = Department(name="B6 performance foreign", code="B6-PERF")
    db_session.add(foreign)
    await db_session.flush()
    target_process = _process("B6-PERF-TARGET", test_department.id, test_user_cro.id)
    target_asset = _asset("B6 performance target", test_department.id, test_user_cro.id)
    db_session.add_all([target_process, target_asset])
    db_session.add_all(
        [
            row
            for i in range(unrelated_rows)
            for row in (
                _process(f"B6-PERF-{i}", foreign.id, test_user_cro.id),
                _asset(f"B6 unrelated {i}", foreign.id, test_user_cro.id),
            )
        ]
    )
    await db_session.flush()
    if linked:
        db_session.add(ProcessAssetLink(process_id=target_process.id, asset_id=target_asset.id, is_primary=True))
    await db_session.commit()
    sessions = async_sessionmaker(db_session.bind, expire_on_commit=False)
    engine = db_session.bind.sync_engine
    statements = []

    def executed(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", executed)
    try:
        for cache_mode in ("cold", "warm"):
            clear_config_cache()
            if cache_mode == "warm":
                async with sessions() as warmup:
                    await _canonical_counts(warmup, test_user_cro, test_department.id)
            statements.clear()
            async with sessions() as baseline:
                expected = await _canonical_counts(baseline, test_user_cro, test_department.id)
            baseline_queries = len(statements)
            if cache_mode == "cold":
                clear_config_cache()
            statements.clear()
            async with sessions() as optimized:
                counts = await _register_counts.load_department_register_counts(
                    optimized, department_id=test_department.id, current_user=test_user_cro
                )
            optimized_queries = len(statements)
            assert asdict(counts) == expected
            assert optimized_queries < baseline_queries
            record_property(f"{cache_mode}_listing_queries", baseline_queries)
            record_property(f"{cache_mode}_count_queries", optimized_queries)
    finally:
        event.remove(engine, "before_cursor_execute", executed)

    for name, expected_ids in (
        ("load_process_derived_blocks", [target_process.id]),
        ("load_asset_derived_blocks", [target_asset.id]),
    ):
        original = getattr(_register_counts, name)

        async def scoped(db, rows, *, current_user, original=original, expected_ids=expected_ids):
            assert [row.id for row in rows] == expected_ids
            return await original(db, rows, current_user=current_user)

        monkeypatch.setattr(_register_counts, name, scoped)
    counts = await _register_counts.load_department_register_counts(
        db_session, department_id=test_department.id, current_user=test_user_cro
    )
    assert counts.process_count == counts.asset_count == 1

    # An endpoint regression must not reintroduce full row serialization.
    from app.services._register_listings import assets as asset_listings
    from app.services._register_listings import processes as process_listings

    def forbidden(*args, **kwargs):
        pytest.fail("Department counts must not serialize full register rows")

    monkeypatch.setattr(process_listings, "serialize_process_detail", forbidden)
    monkeypatch.setattr(asset_listings, "serialize_asset_detail", forbidden)
    async with client_factory(user=test_user_cro) as client:
        response = await client.get(f"/api/v1/departments/{test_department.id}")
    assert response.status_code == 200, response.text
    assert response.json()["process_count"] == response.json()["asset_count"] == 1
