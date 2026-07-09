"""ICT Register reference-data surface (issue #41).

Behavior under test, at the HTTP seam via ``client_factory``:
- the workbook's 45 closed lists, S01-S19 ICT service taxonomy, and country
  categories are served verbatim per docs/dora-ict-register/dora-excel-functional-spec.md;
- the CZ->EN RoI closed-list mapping registry is queryable with the workbook's
  fallback rule (unmapped source values pass through unchanged, never blank);
- the 23 workbook parameters are exposed as a versioned, read-only set that
  honors ADR-008-style global_config overrides;
- the surface is read-only and gated by vendors:read.

Expected values are literals from the functional spec (the workbook is the
source of truth), never recomputed from the implementation.
"""

import pytest

from app.models import User
from app.models.global_config import clear_config_cache


@pytest.fixture(autouse=True)
def _clear_config_cache():
    clear_config_cache()
    yield
    clear_config_cache()


@pytest.mark.asyncio
async def test_closed_lists_expose_all_45_workbook_lists_verbatim(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        resp = await client.get("/api/v1/ict-register/reference/closed-lists")

    assert resp.status_code == 200
    lists = {entry["name"]: entry["values"] for entry in resp.json()["lists"]}

    # The functional spec defines exactly 45 named closed lists (spec section 3.1).
    assert len(lists) == 45

    # Spot-check verbatim workbook values from the spec table.
    assert lists["AnoNe"] == ["Ano", "Ne"]
    assert lists["TridyKrit"] == ["Nízká", "Střední", "Vysoká", "Kritická"]
    assert lists["Substituce"] == [
        "Nenahraditelný",
        "Velmi obtížně nahraditelný",
        "Středně obtížně nahraditelný",
        "Snadno nahraditelný",
    ]
    assert lists["TypKodu"] == ["LEI", "EUID", "IČO (CRN)", "VAT", "Jiný"]
    assert lists["TierDod"] == ["Kritický dodavatel", "Významný dodavatel", "Standardní dodavatel"]
    assert lists["MenaList"] == ["CZK", "EUR", "USD", "GBP"]
    assert lists["ZemeList"] == ["CZ", "SK", "DE", "AT", "NL", "PL", "GB", "US", "IE", "FR", "LU"]
    assert lists["Skala15"] == [1, 2, 3, 4, 5]
    assert lists["DueDiligenceStav"] == [
        "Nerelevantní",
        "Nezahájeno",
        "Probíhá",
        "Dokončeno bez výhrad",
        "Dokončeno s výhradami",
        "K revizi",
        "Neposouzeno",
    ]


@pytest.mark.asyncio
async def test_single_closed_list_is_fetchable_and_unknown_name_is_rejected(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        found = await client.get("/api/v1/ict-register/reference/closed-lists/StavAktiva")
        unknown = await client.get("/api/v1/ict-register/reference/closed-lists/NotAWorkbookList")

    assert found.status_code == 200
    assert found.json() == {
        "name": "StavAktiva",
        "values": ["V provozu", "Ve vývoji", "Utlumováno", "Legacy", "Vyřazeno"],
    }

    assert unknown.status_code == 404
    assert "NotAWorkbookList" in unknown.json()["detail"]


def test_importable_closed_list_enforcement_accepts_verbatim_values_and_rejects_others():
    from app.core.exceptions import NotFoundError
    from app.services._ict_register_reference import is_closed_list_value

    assert is_closed_list_value("Substituce", "Nenahraditelný") is True
    assert is_closed_list_value("Substituce", "nenahraditelný") is False  # case-sensitive, verbatim only
    assert is_closed_list_value("Substituce", "Snadno") is False
    assert is_closed_list_value("Skala15", 5) is True
    assert is_closed_list_value("Skala15", 6) is False
    assert is_closed_list_value("TridyKrit", "") is False

    with pytest.raises(NotFoundError):
        is_closed_list_value("NotAWorkbookList", "Ano")


@pytest.mark.asyncio
async def test_ict_service_taxonomy_serves_s01_to_s19_with_cloud_trigger_codes(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        resp = await client.get("/api/v1/ict-register/reference/ict-service-taxonomy")

    assert resp.status_code == 200
    body = resp.json()
    services = body["services"]

    assert [entry["code"] for entry in services] == [f"S{n:02d}" for n in range(1, 20)]
    by_code = {entry["code"]: entry["label"] for entry in services}
    assert by_code["S01"] == "Řízení projektů v oblasti IKT"
    assert by_code["S07"] == "IKT, zařízení a hostingové služby"
    assert by_code["S17"] == "Cloudové služby: IaaS"
    assert by_code["S18"] == "Cloudové služby: PaaS"
    assert by_code["S19"] == "Cloudové služby: SaaS"

    # S17-S19 are the codes checked by the vendor-tier cloud trigger (spec section 3.2).
    assert body["cloud_service_codes"] == ["S17", "S18", "S19"]


@pytest.mark.asyncio
async def test_country_categories_pair_zemelist_countries_per_workbook(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        resp = await client.get("/api/v1/ict-register/reference/country-categories")

    assert resp.status_code == 200
    entries = resp.json()["countries"]

    # Paired 1:1 with ZemeList order (spec section 3.4, ZEME_KATEGORIE).
    assert entries == [
        {"country": "CZ", "category": "ČR"},
        {"country": "SK", "category": "EU"},
        {"country": "DE", "category": "EU"},
        {"country": "AT", "category": "EU"},
        {"country": "NL", "category": "EU"},
        {"country": "PL", "category": "EU"},
        {"country": "GB", "category": "mimo EU"},
        {"country": "US", "category": "mimo EU"},
        {"country": "IE", "category": "EU"},
        {"country": "FR", "category": "EU"},
        {"country": "LU", "category": "EU"},
    ]


@pytest.mark.asyncio
async def test_roi_map_registry_serves_all_10_workbook_maps_and_rejects_unknown(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        all_maps = await client.get("/api/v1/ict-register/reference/roi-maps")
        single = await client.get("/api/v1/ict-register/reference/roi-maps/MapSubst")
        unknown = await client.get("/api/v1/ict-register/reference/roi-maps/MapNeexistuje")

    assert all_maps.status_code == 200
    maps = {entry["name"]: entry["entries"] for entry in all_maps.json()["maps"]}
    assert sorted(maps) == [
        "MapAlt",
        "MapCitl",
        "MapDopad",
        "MapDuvod",
        "MapLic",
        "MapOsoba",
        "MapReint",
        "MapRel",
        "MapSubst",
        "MapUjedn",
    ]
    # Verbatim pairs from spec section 3.3 (ITS 2024/2956 closed lists).
    assert maps["MapDopad"] == {
        "Nízký": "Low",
        "Střední": "Medium",
        "Vysoký": "High",
        "Neposouzeno": "Assessment not performed",
    }
    assert maps["MapUjedn"]["Rámcové (master)"] == "overarching (master) arrangement"
    assert maps["MapOsoba"]["Fyzická osoba podnikající"] == "Individual acting in a business capacity"

    assert single.status_code == 200
    assert single.json() == {
        "name": "MapSubst",
        "entries": {
            "Nenahraditelný": "Not substitutable",
            "Velmi obtížně nahraditelný": "Highly complex substitutability",
            "Středně obtížně nahraditelný": "Medium complexity of substitutability",
            "Snadno nahraditelný": "Easily substitutable",
        },
    }

    assert unknown.status_code == 404
    assert "MapNeexistuje" in unknown.json()["detail"]


@pytest.mark.asyncio
async def test_roi_translation_maps_known_values_and_falls_back_to_source_for_unmapped(
    client_factory, test_user_cro: User
):
    async with client_factory(user=test_user_cro) as client:
        mapped = await client.get(
            "/api/v1/ict-register/reference/roi-maps/MapSubst/translation",
            params={"value": "Nenahraditelný"},
        )
        unmapped = await client.get(
            "/api/v1/ict-register/reference/roi-maps/MapSubst/translation",
            params={"value": "Mimo číselník"},
        )
        unknown_map = await client.get(
            "/api/v1/ict-register/reference/roi-maps/MapNeexistuje/translation",
            params={"value": "Ano"},
        )

    assert mapped.status_code == 200
    assert mapped.json() == {
        "map": "MapSubst",
        "source": "Nenahraditelný",
        "value": "Not substitutable",
        "mapped": True,
    }

    # Workbook rule: IFERROR(INDEX/MATCH, src) — unmapped values pass through, never blank.
    assert unmapped.status_code == 200
    assert unmapped.json() == {
        "map": "MapSubst",
        "source": "Mimo číselník",
        "value": "Mimo číselník",
        "mapped": False,
    }

    assert unknown_map.status_code == 404


def test_importable_roi_en_value_reproduces_workbook_fallback_rule():
    from app.core.exceptions import NotFoundError
    from app.services._ict_register_reference import roi_en_value

    assert roi_en_value("MapLic", "Podpůrné funkce") == "support functions"
    assert roi_en_value("MapLic", "Neexistující hodnota") == "Neexistující hodnota"
    assert roi_en_value("MapLic", "") == ""  # blank stays blank, never invented

    with pytest.raises(NotFoundError):
        roi_en_value("MapNeexistuje", "Ano")


@pytest.mark.asyncio
async def test_parameter_set_exposes_all_23_workbook_parameters_with_version(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        resp = await client.get("/api/v1/ict-register/parameters")

    assert resp.status_code == 200
    body = resp.json()

    # The parameter set is versioned by the workbook methodology version P_Verze.
    assert body["version"] == "1.0"

    parameters = {entry["name"]: entry for entry in body["parameters"]}
    assert len(parameters) == 23

    # Numeric thresholds and MTPD bonuses, verbatim from spec section 6.
    assert parameters["P_KritSkore"]["value"] == 16
    assert parameters["P_VysSkore"]["value"] == 12
    assert parameters["P_StrSkore"]["value"] == 8
    assert parameters["P_MTPDKrit"]["value"] == 4
    assert parameters["P_MTPDStr"]["value"] == 24
    assert parameters["P_BonusKrit"]["value"] == 5
    assert parameters["P_BonusStr"]["value"] == 3
    assert parameters["P_BonusDef"]["value"] == 1
    assert parameters["P_AktNizka"]["value"] == 2
    assert parameters["P_AktStredni"]["value"] == 3
    assert parameters["P_AktVysoka"]["value"] == 4
    assert parameters["P_RizStr"]["value"] == 15
    assert parameters["P_RizVys"]["value"] == 40
    assert parameters["P_RizKrit"]["value"] == 80
    assert parameters["P_Tolerance"]["value"] == 39
    assert parameters["P_VKProc"]["value"] == 4
    assert parameters["P_Vypadek"]["value"] == 24
    assert parameters["P_GdprMinC"]["value"] == 3

    # Text and date parameters.
    assert parameters["P_Verze"]["value"] == "1.0"
    assert parameters["P_Entita"]["value"] == "Slavia pojišťovna a.s."
    assert parameters["P_LEI"]["value"] == "LEI-DOPLNIT"
    assert parameters["P_RefDatum"] == {
        "name": "P_RefDatum",
        "value": "2026-07-03",
        "value_type": "date",
        "meaning": "Reference date for EOL/deadline checks",
    }
    assert parameters["P_RoIDatum"]["value"] == "2026-12-31"

    assert parameters["P_KritSkore"]["value_type"] == "int"
    assert parameters["P_Entita"]["value_type"] == "string"


@pytest.mark.asyncio
async def test_parameter_set_honors_seeded_config_rows_over_defaults(client_factory, db_session, test_user_cro: User):
    from app.models import GlobalConfig

    db_session.add_all(
        [
            GlobalConfig(
                key="ict_register_krit_skore",
                value="18",
                value_type="int",
                category="ict_register_parameters",
                display_name="P_KritSkore",
                is_editable=False,
            ),
            GlobalConfig(
                key="ict_register_verze",
                value="1.1",
                value_type="string",
                category="ict_register_parameters",
                display_name="P_Verze",
                is_editable=False,
            ),
            GlobalConfig(
                key="ict_register_ref_datum",
                value="not-a-date",
                value_type="string",
                category="ict_register_parameters",
                display_name="P_RefDatum",
                is_editable=False,
            ),
        ]
    )
    await db_session.commit()
    clear_config_cache()

    async with client_factory(user=test_user_cro) as client:
        resp = await client.get("/api/v1/ict-register/parameters")

    assert resp.status_code == 200
    body = resp.json()
    parameters = {entry["name"]: entry["value"] for entry in body["parameters"]}

    # Configured rows are authoritative (ADR-008 SSOT), including the set version.
    assert parameters["P_KritSkore"] == 18
    assert parameters["P_Verze"] == "1.1"
    assert body["version"] == "1.1"

    # An unparseable stored value never breaks reads; the workbook default applies.
    assert parameters["P_RefDatum"] == "2026-07-03"

    # Untouched parameters keep their workbook defaults.
    assert parameters["P_Tolerance"] == 39


@pytest.mark.asyncio
async def test_parameter_config_seed_is_idempotent_and_read_only(db_session):
    from sqlalchemy import select

    from app.db.seed import seed_ict_workbook_parameter_config
    from app.models import GlobalConfig

    created_first = await seed_ict_workbook_parameter_config(db_session)
    await db_session.commit()
    created_second = await seed_ict_workbook_parameter_config(db_session)
    await db_session.commit()

    assert created_first == 23
    assert created_second == 0  # re-seeding does not duplicate

    result = await db_session.execute(
        select(GlobalConfig).where(GlobalConfig.category == "ict_register_parameters")
    )
    rows = {config.key: config for config in result.scalars().all()}
    assert len(rows) == 23

    # Verbatim workbook defaults land in the seeded rows.
    assert rows["ict_register_krit_skore"].value == "16"
    assert rows["ict_register_krit_skore"].value_type == "int"
    assert rows["ict_register_verze"].value == "1.0"
    assert rows["ict_register_ref_datum"].value == "2026-07-03"
    assert rows["ict_register_entita"].display_name == "P_Entita"

    # The parameter set is read-only: no seeded row is editable through the
    # admin global-config surface until explicit governance ships.
    assert all(config.is_editable is False for config in rows.values())


@pytest.mark.asyncio
async def test_seeded_parameter_rows_reject_admin_edits(client_factory, db_session, test_user_cro: User):
    from app.db.seed import seed_ict_workbook_parameter_config

    await seed_ict_workbook_parameter_config(db_session)
    await db_session.commit()

    async with client_factory(user=test_user_cro) as client:
        resp = await client.patch(
            "/api/v1/riskhub/config/ict_register_krit_skore",
            json={"value": "20"},
        )

    assert resp.status_code == 422
    assert "cannot be edited" in resp.json()["detail"][0]["msg"]


def test_parameter_seed_migration_matches_ssot_and_is_forward_only():
    """The alembic seed migration stays in parity with the parameter SSOT (ADR-010)."""
    import importlib.util
    from pathlib import Path

    from app.services._ict_register_reference import ICT_WORKBOOK_PARAMETERS

    migration_path = (
        Path(__file__).resolve().parents[3]
        / "backend/alembic/versions/o2p3q4r5s6t7_add_ict_register_parameter_config.py"
    )
    spec = importlib.util.spec_from_file_location("ict_parameter_seed_migration", migration_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert migration.down_revision == "n9o0p1q2r3s5"

    rows = {row["key"]: row for row in migration.ICT_PARAMETER_CONFIG_ROWS}
    assert len(rows) == 23

    from app.db.seed import _ict_parameter_config_value

    for parameter in ICT_WORKBOOK_PARAMETERS:
        row = rows[parameter.config_key]
        value, value_type = _ict_parameter_config_value(parameter.default)
        assert row["value"] == value, parameter.name
        assert row["value_type"] == value_type, parameter.name
        assert row["category"] == "ict_register_parameters"
        assert row["display_name"] == parameter.name
        assert row["description"] == parameter.meaning

    with pytest.raises(NotImplementedError):
        migration.downgrade()


@pytest.mark.asyncio
async def test_reference_surface_requires_vendors_read(
    client_factory,
    test_user_employee: User,
    test_user_platform_admin: User,
):
    surface_paths = [
        "/api/v1/ict-register/reference/closed-lists",
        "/api/v1/ict-register/reference/closed-lists/AnoNe",
        "/api/v1/ict-register/reference/ict-service-taxonomy",
        "/api/v1/ict-register/reference/country-categories",
        "/api/v1/ict-register/reference/roi-maps",
        "/api/v1/ict-register/reference/roi-maps/MapSubst",
        "/api/v1/ict-register/reference/roi-maps/MapSubst/translation?value=Ano",
        "/api/v1/ict-register/parameters",
    ]

    # Employee holds the standard business-entity read permission (vendors:read).
    async with client_factory(user=test_user_employee) as client:
        for path in surface_paths:
            resp = await client.get(path)
            assert resp.status_code == 200, path

    # Platform admin has no business read permissions: every route is denied.
    async with client_factory(user=test_user_platform_admin) as client:
        for path in surface_paths:
            resp = await client.get(path)
            assert resp.status_code == 403, path

    # Unauthenticated requests are rejected.
    async with client_factory() as client:
        for path in surface_paths:
            resp = await client.get(path)
            assert resp.status_code == 401, path


@pytest.mark.asyncio
async def test_reference_surface_is_read_only(client_factory, test_user_cro: User):
    """Reference data cannot be mutated through the API, even by the CRO wildcard."""
    async with client_factory(user=test_user_cro) as client:
        post = await client.post(
            "/api/v1/ict-register/reference/closed-lists",
            json={"name": "Nova", "values": ["A"]},
        )
        put = await client.put(
            "/api/v1/ict-register/reference/roi-maps/MapSubst",
            json={"name": "MapSubst", "entries": {}},
        )
        patch = await client.patch("/api/v1/ict-register/parameters", json={})
        delete = await client.delete("/api/v1/ict-register/reference/closed-lists/AnoNe")

    assert post.status_code == 405
    assert put.status_code == 405
    assert patch.status_code == 405
    assert delete.status_code == 405
