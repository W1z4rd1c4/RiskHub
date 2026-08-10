from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import sqlalchemy as sa
from pydantic import ValidationError

from app.schemas.vendor import VendorCreate
from app.services._ict_register_lifecycle.derivation_inputs import (
    vendor_derivation_input,
)
from app.services._ict_register_reference.vendor_values import (
    VENDOR_CONTROLLED_CODES_BY_FIELD,
    canonicalize_vendor_derived,
    vendor_controlled_value_code,
    vendor_regulatory_value,
    vendor_value_label,
    vendor_workbook_value,
)
from app.services._reporting.exports.vendors import (
    _canonicalize_vendor_export_values,
    _vendor_row_values,
)
from app.services._vendor_governance.reports import dora_register_rows
from scripts.import_ict_register_workbook import _canonicalize_vendor_payload


def _minimal_vendor_payload(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Canonical Provider",
        "process": "Claims",
        "outsourcing_owner_user_id": 7,
        "vendor_type": "ict",
    }
    payload.update(updates)
    return payload


def test_vendor_catalog_has_complete_workbook_and_bilingual_round_trip() -> None:
    assert len(VENDOR_CONTROLLED_CODES_BY_FIELD) == 29
    for field, codes in VENDOR_CONTROLLED_CODES_BY_FIELD.items():
        for code in codes:
            workbook_value = vendor_workbook_value(field, code)
            assert vendor_controlled_value_code(field, workbook_value) == code
            assert vendor_value_label(field, code, locale="en")
            assert vendor_value_label(field, code, locale="cs")

    assert vendor_controlled_value_code("identifier_type", "IČO (CRN)") == "CRN"
    assert vendor_controlled_value_code("replaceability", "hard") == "highly_complex"
    assert (
        vendor_regulatory_value("replaceability", "highly_complex")
        == "Highly complex substitutability"
    )


def test_vendor_write_models_accept_codes_and_reject_workbook_labels() -> None:
    parsed = VendorCreate(
        **_minimal_vendor_payload(
            country="CZ",
            person_type="legal_person",
            replaceability="highly_complex",
            exit_plan_state="approved",
        )
    )
    assert parsed.person_type == "legal_person"
    assert parsed.replaceability == "highly_complex"

    with pytest.raises(ValidationError, match="canonical Vendor replaceability code"):
        VendorCreate(
            **_minimal_vendor_payload(replaceability="Velmi obtížně nahraditelný")
        )


def test_import_adapter_maps_source_values_without_owner_guessing() -> None:
    payload = {
        "person_type": "Právnická osoba",
        "identifier_type": "IČO (CRN)",
        "replaceability": "Nenahraditelný",
        "due_diligence_state": "Probíhá",
        "outsourcing_owner_name": "Workbook free text must not be resolved",
    }
    _canonicalize_vendor_payload(payload)
    assert payload == {
        "person_type": "legal_person",
        "identifier_type": "CRN",
        "replaceability": "not_substitutable",
        "due_diligence_state": "in_progress",
        "outsourcing_owner_name": "Workbook free text must not be resolved",
    }


def test_derivation_bridge_preserves_workbook_formula_inputs_and_canonicalizes_output() -> (
    None
):
    vendor = SimpleNamespace(
        id=1,
        name="Provider",
        country="CZ",
        person_type="legal_person",
        identifier_type="LEI",
        identifier_value="LEI-1",
        replaceability="not_substitutable",
        exit_plan_state="approved",
        ex_ante_assessment_date=None,
        due_diligence_state="in_progress",
        significance_authorization_conditions="yes",
        significance_regulatory_requirements="no",
        significance_service_quality="not_applicable",
        significance_financial_impact="no",
        significance_reputation_continuity="no",
        significance_cumulative_impact="no",
    )
    engine_input = vendor_derivation_input(vendor)
    assert engine_input.person_type == "Právnická osoba"
    assert engine_input.substitutability == "Nenahraditelný"
    assert engine_input.due_diligence_state == "Probíhá"
    assert engine_input.significance_authorization_conditions == "Ano"

    projected = canonicalize_vendor_derived(
        {
            "country_category": "ČR",
            "cif": "Ano",
            "max_criticality": "Kritická",
            "tier": "Kritický dodavatel",
            "cif_chain": "Ano",
            "chain_level": "A",
            "significance_outcome": "Ne",
            "main_contract_arrangement_type": "Rámcové (master)",
            "inputs": {
                "substitutability": "Nenahraditelný",
                "exit_plan_state": "Schválen",
                "significance_authorization_conditions": "Ano",
            },
            "transitive_process_links": [
                {"process_cif": "Ne", "process_criticality": "Vysoká"}
            ],
        }
    )
    assert projected["country_category"] == "domestic"
    assert projected["tier"] == "critical"
    assert projected["chain_level"] == "A"
    assert projected["main_contract_arrangement_type"] == "overarching_master"
    assert projected["inputs"]["substitutability"] == "not_substitutable"
    assert projected["transitive_process_links"] == [
        {"process_cif": "no", "process_criticality": "high"}
    ]


def test_standard_vendor_export_emits_each_code_and_localized_label() -> None:
    row: dict[str, object] = {
        "name": "Provider",
        "vendor_type": "ict",
        "replaceability": "highly_complex",
    }
    for field, codes in VENDOR_CONTROLLED_CODES_BY_FIELD.items():
        row.setdefault(field, codes[0])

    values_en = _vendor_row_values(row, locale="en")
    values_cs = _vendor_row_values(row, locale="cs")
    assert "highly_complex" in values_en
    assert "Highly complex substitutability" in values_en
    assert "Velmi obtížně nahraditelný" in values_cs
    assert len(values_en) == len(values_cs) == 12 + 2 * 28


def test_standard_vendor_export_logs_and_safely_clears_unknown_historical_values(
    caplog,
) -> None:
    rows = [
        {
            "id": 42,
            "vendor_type": "UNKNOWN-TYPE",
            "replaceability": "UNKNOWN-SUBSTITUTABILITY",
        }
    ]

    normalized = _canonicalize_vendor_export_values(rows)

    assert normalized[0]["vendor_type"] == "other"
    assert normalized[0]["replaceability"] is None
    assert "vendor_id=42 field=vendor_type" in caplog.text
    assert "vendor_id=42 field=replaceability" in caplog.text


def test_formal_dora_export_uses_regulatory_not_ui_terminology() -> None:
    row = SimpleNamespace(
        vendor_id=1,
        name="Provider",
        legal_name=None,
        registration_id=None,
        vendor_type="ict",
        dora_relevant=True,
        is_significant_vendor=True,
        supports_important_core_insurance_function=True,
        risk_score_1_5=4,
        outsourcing_owner_user_id=7,
        outsourcing_owner_name="Owner",
        department_id=3,
        department_name="IT",
        process="Claims",
        subprocess=None,
        replaceability="highly_complex",
        has_alternative_providers=False,
    )
    headers, rows = dora_register_rows([row])
    assert rows[0][headers.index("replaceability")] == "Highly complex substitutability"


def test_vendor_canonical_migration_is_idempotent_and_clears_unknowns(
    monkeypatch,
) -> None:
    migration_path = (
        Path(__file__).resolve().parents[3]
        / "backend/alembic/versions/j1e2f3g4h5i6_canonicalize_vendor_controlled_values.py"
    )
    spec = importlib.util.spec_from_file_location(
        "vendor_canonical_values_migration", migration_path
    )
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    vendors = sa.Table(
        "vendors",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        *(
            sa.Column(field, sa.String, nullable=field != "vendor_type")
            for field in migration._FIELD_MAPS
        ),
    )
    metadata.create_all(engine)

    legacy = {"id": 1}
    unknown = {"id": 2}
    for field, mapping in migration._FIELD_MAPS.items():
        legacy[field] = (
            next(source for source, target in mapping.items() if source != target)
            if any(source != target for source, target in mapping.items())
            else next(iter(mapping))
        )
        unknown[field] = "UNRECOGNIZED"

    with engine.begin() as conn:
        conn.execute(vendors.insert(), [legacy, unknown])
        monkeypatch.setattr(migration.op, "get_bind", lambda: conn)
        migration.upgrade()
        first = conn.execute(sa.select(vendors).order_by(vendors.c.id)).mappings().all()
        migration.upgrade()
        second = (
            conn.execute(sa.select(vendors).order_by(vendors.c.id)).mappings().all()
        )

    assert first == second
    assert first[0]["person_type"] == "legal_person"
    assert (
        first[0]["replaceability"] in VENDOR_CONTROLLED_CODES_BY_FIELD["replaceability"]
    )
    assert first[1]["vendor_type"] == "other"
    assert first[1]["replaceability"] is None
    assert migration.down_revision == "i0d1e2f3g4h5"
