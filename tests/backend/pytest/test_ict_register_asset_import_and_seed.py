"""Asset import, deterministic seed, and export contracts for ICT-GOV #75."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services._ict_register_reference import (
    ASSET_CONTROLLED_CODES_BY_FIELD,
    asset_regulatory_value,
)
from scripts.import_ict_register_workbook import (
    ImportReport,
    _asset_accountability_ids,
    _asset_payload,
    import_assets,
)
from scripts.seed_e2e_ict_register import E2E_ASSETS


def _workbook_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "key": "claims-db",
        "display": "Claims DB",
        "typ": "Databáze",
        "aliases": ["CDB"],
        "gdpr": "Ano",
        "ai": "Ne",
        "bia_crit": 4,
        "src_class": "Nízká",
        "conflicts": ["owner"],
        # Legacy presentation text must never drive relationship resolution.
        "owner": "Exact directory display name",
    }
    row.update(overrides)
    return row


def _seed(row: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(
        SRC={"assets": [row]},
        VERIS_OVERLAY={},
        BIA_CRIT_TO_TRIDA={4: "Kritická"},
        OWNER_UTVAR_MAP={"Exact directory display name": "IT"},
    )


def test_asset_import_payload_uses_relationship_ids_and_canonical_codes() -> None:
    row = _workbook_row()

    payload = _asset_payload(
        _seed(row),
        row,
        business_owner_user_id=17,
        ict_owner_user_id=23,
        owning_department_id=8,
    )

    assert payload["business_owner_user_id"] == 17
    assert payload["ict_owner_user_id"] == 23
    assert payload["owning_department_id"] == 8
    assert "business_owner" not in payload
    assert "ict_owner" not in payload
    assert "owner_department" not in payload
    assert payload["asset_type"] == "database"
    assert payload["gdpr_relevance"] == "yes"
    assert payload["ai_relevance"] == "no"
    assert payload["preliminary_criticality"] == "critical"
    assert payload["lifecycle_state"] == "operational"
    assert payload["review_state"] == "review_required"


def test_asset_import_accepts_only_explicit_canonical_relationship_ids() -> None:
    row = _workbook_row(
        business_owner_user_id=17,
        ict_owner_user_id=23,
        owning_department_id=8,
    )
    report = ImportReport()

    result = _asset_accountability_ids(row=row, key=str(row["key"]), report=report)

    assert result == (17, 23, 8)
    assert report.findings == []


@pytest.mark.asyncio
async def test_asset_import_never_reconciles_legacy_owner_presentation_text() -> None:
    row = _workbook_row()
    report = ImportReport()

    result = await import_assets(
        db=object(),
        seed=_seed(row),
        user=object(),
        report=report,
    )

    assert result == {}
    assert len(report.findings) == 1
    assert (
        "business_owner_user_id, ict_owner_user_id, owning_department_id"
        in report.findings[0]
    )
    assert "legacy owner presentation text is not reconciled" in report.findings[0]


@pytest.mark.asyncio
async def test_asset_import_reports_and_skips_unsupported_controlled_value() -> None:
    row = _workbook_row(
        typ="Unsupported Asset type",
        business_owner_user_id=17,
        ict_owner_user_id=23,
        owning_department_id=8,
    )
    report = ImportReport()

    result = await import_assets(
        db=object(),
        seed=_seed(row),
        user=object(),
        report=report,
    )

    assert result == {}
    assert len(report.findings) == 1
    assert "unsupported controlled value" in report.findings[0]
    assert "Unsupported Asset asset_type value" in report.findings[0]
    assert "row was not imported" in report.findings[0]


def test_e2e_asset_seed_has_real_relationship_keys_and_canonical_values() -> None:
    assert len(E2E_ASSETS) == 7
    for asset in E2E_ASSETS:
        assert asset["business_owner_email"].endswith("@riskhub.local")
        assert asset["ict_owner_email"].endswith("@riskhub.local")
        assert asset["owning_department"] in {"Operations", "Finance", "IT"}
        assert "business_owner" not in asset
        assert "ict_owner" not in asset
        assert "owner_department" not in asset
        for field, codes in ASSET_CONTROLLED_CODES_BY_FIELD.items():
            value = asset.get(field)
            assert value is None or value in codes

    same_user = next(
        asset
        for asset in E2E_ASSETS
        if asset["name"] == "E2E-ASSET-003 Integration Message Bus"
    )
    assert same_user["business_owner_email"] == same_user["ict_owner_email"]

    cross_department = next(
        asset
        for asset in E2E_ASSETS
        if asset["name"] == "E2E-ASSET-004 Reporting Warehouse"
    )
    assert cross_department["business_owner_email"] == "fin.head@riskhub.local"
    assert cross_department["ict_owner_email"] == "it.head@riskhub.local"
    assert cross_department["owning_department"] == "Finance"

    owner_scoped = next(
        asset
        for asset in E2E_ASSETS
        if asset["name"] == "E2E-ASSET-005 Cross-Department Owner Scope"
    )
    assert owner_scoped["business_owner_email"] == "ops.analyst@riskhub.local"
    assert owner_scoped["ict_owner_email"] == "it.analyst@riskhub.local"
    assert owner_scoped["business_owner_email"] != owner_scoped["ict_owner_email"]
    assert owner_scoped["owning_department"] == "Finance"

    archived_owner_scoped = next(
        asset
        for asset in E2E_ASSETS
        if asset["name"] == "E2E-ASSET-OWNER-ARCH Archived Owner Scope"
    )
    assert archived_owner_scoped["is_archived"] is True
    assert archived_owner_scoped["business_owner_email"] == owner_scoped["business_owner_email"]
    assert archived_owner_scoped["ict_owner_email"] == owner_scoped["ict_owner_email"]


def test_asset_regulatory_export_maps_every_canonical_code_to_english() -> None:
    for field, codes in ASSET_CONTROLLED_CODES_BY_FIELD.items():
        assert all(asset_regulatory_value(field, code) for code in codes)

    assert asset_regulatory_value("asset_type", "database") == "Database"
    assert (
        asset_regulatory_value("data_classification", "highly_confidential_regulated")
        == "Highly confidential / regulated data"
    )
    assert (
        asset_regulatory_value("deployment_model", "not_assessed")
        == "Assessment not performed"
    )

    with pytest.raises(ValueError, match="Unsupported regulatory Asset"):
        asset_regulatory_value("asset_type", "Databáze")
