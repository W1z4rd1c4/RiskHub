"""Import, seed, and regulatory terminology contracts for ICT-GOV #74."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services._ict_register_reference import (
    PROCESS_CONTROLLED_CODES_BY_FIELD,
    process_regulatory_value,
)
from scripts.import_ict_register_workbook import (
    ImportReport,
    _process_accountability_ids,
    _process_payload,
    import_processes,
)
from scripts.seed_e2e_ict_register import E2E_PROCESSES


def _workbook_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "l0": "Likvidace škod",
        "l1": "Příjem hlášení",
        "l2": "FNOL",
        "owner": "Jana Example",
        "src_class": "Kritická",
        "kdf_override": "Ano",
        "bcm": "Nerelevantní",
    }
    row.update(overrides)
    return row


def test_process_import_payload_uses_relationship_ids_and_canonical_codes() -> None:
    payload = _process_payload(
        _workbook_row(),
        process_owner_user_id=17,
        owning_department_id=8,
    )

    assert payload["process_owner_user_id"] == 17
    assert payload["owning_department_id"] == 8
    assert "owner" not in payload
    assert "owner_department" not in payload
    assert payload["preliminary_criticality"] == "critical"
    assert payload["cif_override"] == "yes"
    assert payload["licensed_activity"] == "non_life_insurance"
    assert payload["bcm_link"] == "not_applicable"


def test_process_import_accepts_only_explicit_canonical_relationship_ids() -> None:
    row = _workbook_row(
        owner="A legacy presentation name that must be ignored",
        process_owner_user_id=17,
        owning_department_id=8,
    )
    report = ImportReport()

    result = _process_accountability_ids(
        row=row,
        key=(str(row["l0"]), str(row["l1"]), str(row["l2"])),
        report=report,
    )

    assert result == (17, 8)
    assert report.findings == []


@pytest.mark.asyncio
async def test_process_import_never_reconciles_legacy_owner_presentation_text() -> None:
    row = _workbook_row(owner="Exact active directory name")
    report = ImportReport()

    result = await import_processes(
        db=object(),
        seed=SimpleNamespace(SRC={"processes": [row]}),
        user=object(),
        report=report,
    )

    assert result == {}
    assert len(report.findings) == 1
    assert "process_owner_user_id, owning_department_id" in report.findings[0]
    assert "legacy owner presentation text is not reconciled" in report.findings[0]


def test_e2e_process_seed_has_real_relationship_keys_and_canonical_values() -> None:
    assert len(E2E_PROCESSES) == 5
    for process in E2E_PROCESSES:
        assert process["owner_email"].endswith("@riskhub.local")
        assert process["owning_department"] in {"Operations", "Finance", "IT"}
        assert "owner" not in process
        assert "owner_department" not in process
        for field, codes in PROCESS_CONTROLLED_CODES_BY_FIELD.items():
            value = process.get(field)
            assert value is None or value in codes

    cross_department = next(
        process
        for process in E2E_PROCESSES
        if process["l1_process"] == "E2E-PROC-004 Customer Portal Support"
    )
    assert cross_department["owner_email"] == "it.analyst@riskhub.local"
    assert cross_department["owning_department"] == "Operations"


def test_process_regulatory_export_uses_mandated_b0601_terminology() -> None:
    assert (
        process_regulatory_value("licensed_activity", "non_life_insurance")
        == "non-life insurance activities"
    )
    assert process_regulatory_value("licensed_activity", "support_functions") == "support functions"
    assert process_regulatory_value("interruption_impact", "high") == "High"
    assert (
        process_regulatory_value("interruption_impact", "not_assessed")
        == "Assessment not performed"
    )

    with pytest.raises(ValueError, match="Unsupported regulatory Process"):
        process_regulatory_value("licensed_activity", "Podpůrné funkce")
