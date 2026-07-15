"""RoI-readiness element — per-template completeness over the 15 RoI templates (issue #52).

Two concerns, both pure:

1. **The template registry** (``ROI_TEMPLATE_REGISTRY``): the 15 templates of
   CIR 2024/2956 Annex I in Article 5(1)(a)-(o) order, each with the workbook's
   feed + gate (functional spec section 4) and the field mapping the register
   carries. Field codes follow the POST-corrigendum numbering verified by the
   legal spec's addendum (ticket #40): B_06.01 is the contiguous 0010-0100
   table with the criticality flag at 0050 (B_06.01.0110 no longer exists);
   the addendum's spot-verified codes (B_05.01.0020/0070, B_07.01.0110) and
   the workbook's own B_02.02.0180 pin their fields; unverified codes stay
   ``None`` rather than fabricated.

2. **The readiness computation** (``derive_roi_readiness``): per template, the
   gated row set, % of required fields populated across those rows, and the
   concrete gaps (row identity + missing field codes, capped with a total).
   Engine-derived values (CIF, tier, ranks, main-contract lookups, F-codes)
   are consumed from the #48/#49 derivation outputs, never recomputed.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal

import pytest

from app.services._ict_register_lifecycle.derivation import (
    AssetDerivationInput,
    AssetVendorLinkInput,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivationInput,
    SubOutsourcingInput,
    VendorContractInput,
    VendorDerivationInput,
    derive_ict_register,
)
from app.services._ict_register_lifecycle.roi_readiness import (
    ROI_COVERAGE_DOCUMENTARY,
    ROI_COVERAGE_FULL,
    ROI_COVERAGE_PARTIAL,
    ROI_GAP_ROW_CAP,
    ROI_GATE_DOCUMENTARY,
    ROI_GATE_PRESENCE,
    ROI_GATE_ROI_SCOPE,
    ROI_GATE_UNCONDITIONAL,
    ROI_REQUIRED,
    ROI_REQUIRED_WHEN_CIF,
    ROI_TEMPLATE_REGISTRY,
    RoiContractSupplement,
    RoiProcessSupplement,
    RoiRegisterSupplement,
    RoiSubOutsourcingSupplement,
    RoiVendorSupplement,
    build_b0601_process_export_row,
    derive_roi_readiness,
)
from app.services._ict_register_reference.parameters import (
    ICT_WORKBOOK_PARAMETERS,
    ICT_WORKBOOK_PARAMETERS_BY_NAME,
    IctParameterValue,
    IctWorkbookParameterSet,
)

# A filled entity LEI (20-char) standing in for a register whose P_LEI
# placeholder has been replaced; the fresh-DB placeholder default is pinned
# explicitly in the LEI tests below.
REAL_LEI = "315700FFGL2JGHVWJC12"


def parameter_set(**overrides: IctParameterValue) -> IctWorkbookParameterSet:
    """The verbatim workbook parameter set (spec section 6), with overrides."""
    values: dict[str, IctParameterValue] = {
        p.name: p.default for p in ICT_WORKBOOK_PARAMETERS
    }
    values.update(overrides)
    return IctWorkbookParameterSet(version=str(values["P_Verze"]), values=values)


# ---------------------------------------------------------------------------
# 1. Template registry integrity — the addendum is the source of truth.
# ---------------------------------------------------------------------------

# Article 5(1)(a)-(o) of CIR 2024/2956, confirmed by the addendum (A.5.1).
ANNEX_TEMPLATE_CODES = (
    "B_01.01",
    "B_01.02",
    "B_01.03",
    "B_02.01",
    "B_02.02",
    "B_02.03",
    "B_03.01",
    "B_03.02",
    "B_03.03",
    "B_04.01",
    "B_05.01",
    "B_05.02",
    "B_06.01",
    "B_07.01",
    "B_99.01",
)

TEMPLATES_BY_CODE = {template.code: template for template in ROI_TEMPLATE_REGISTRY}


def test_registry_carries_the_fifteen_annex_templates_in_annex_order():
    assert (
        tuple(template.code for template in ROI_TEMPLATE_REGISTRY)
        == ANNEX_TEMPLATE_CODES
    )


def test_registry_names_are_bilingual_and_official():
    """EN names per the legal spec's template table (codes confirmed against
    Article 5(1)); CZ glosses verbatim from the workbook's RoI blocks."""
    b0601 = TEMPLATES_BY_CODE["B_06.01"]
    assert b0601.name_en == "Functions identification"
    assert b0601.name_cs == "Určení funkcí"
    b0502 = TEMPLATES_BY_CODE["B_05.02"]
    assert b0502.name_en == "ICT service supply chains"
    assert b0502.name_cs == "Dodavatelský řetězec"
    assert all(
        template.name_en and template.name_cs for template in ROI_TEMPLATE_REGISTRY
    )


def test_b_06_01_field_codes_are_the_post_corrigendum_contiguous_table():
    """Addendum A.2: 0010-0100 contiguous, criticality at 0050, 0110 gone."""
    fields = TEMPLATES_BY_CODE["B_06.01"].fields
    assert [field.code for field in fields] == [
        f"B_06.01.{index:04d}" for index in range(10, 101, 10)
    ]
    by_key = {field.key: field for field in fields}
    assert by_key["function_identifier"].code == "B_06.01.0010"
    assert by_key["criticality_assessment"].code == "B_06.01.0050"
    assert by_key["rto_hours"].code == "B_06.01.0080"
    assert by_key["rpo_hours"].code == "B_06.01.0090"
    assert by_key["discontinuation_impact"].code == "B_06.01.0100"
    # Reasons (0060) is the annex's one Optional B_06.01 column.
    assert by_key["criticality_reasons"].requirement != ROI_REQUIRED


def test_no_field_anywhere_cites_the_stale_b_06_01_0110_code():
    """Addendum A.6.1: any mapping row citing B_06.01.0110 is stale by construction."""
    all_codes = [
        field.code
        for template in ROI_TEMPLATE_REGISTRY
        for field in template.fields
        if field.code is not None
    ]
    assert "B_06.01.0110" not in all_codes


def test_spot_verified_codes_pin_their_fields():
    """The addendum's other primary-verified codes land on the right fields;
    everything unverified stays None (never fabricated)."""
    b0501 = {field.key: field for field in TEMPLATES_BY_CODE["B_05.01"].fields}
    assert b0501["provider_identification_type"].code == "B_05.01.0020"
    assert b0501["person_type"].code == "B_05.01.0070"
    assert b0501["provider_identification_code"].code is None

    b0701 = {field.key: field for field in TEMPLATES_BY_CODE["B_07.01"].fields}
    assert b0701["alternative_providers"].code == "B_07.01.0110"

    b0202 = {field.key: field for field in TEMPLATES_BY_CODE["B_02.02"].fields}
    assert b0202["reliance_level"].code == "B_02.02.0180"
    assert b0202["reliance_level"].requirement == ROI_REQUIRED_WHEN_CIF


def test_documentary_templates_match_the_workbook_disposition():
    """B_01.x from entity params/manual cells; B_02.03/B_03.03 note-only;
    B_99.01 narrative (its legal-text row R0070 points at B_06.01.0100
    post-corrigendum — addendum A.5.3/A.6.5)."""
    documentary = {
        template.code
        for template in ROI_TEMPLATE_REGISTRY
        if template.coverage == ROI_COVERAGE_DOCUMENTARY
    }
    assert documentary == {
        "B_01.01",
        "B_01.02",
        "B_01.03",
        "B_02.03",
        "B_03.03",
        "B_99.01",
    }
    for code in documentary:
        assert TEMPLATES_BY_CODE[code].fields == ()
        assert TEMPLATES_BY_CODE[code].gate == ROI_GATE_DOCUMENTARY


def test_gates_and_feeds_follow_the_workbook_mapping():
    """Functional spec section 4: the per-arrangement blocks gate on the
    contract RoI-scope flag; the per-service VAD blocks are unconditional
    (the documented asymmetry); B_05.01/B_06.01 gate on row presence."""
    for code in ("B_02.01", "B_03.01", "B_03.02", "B_04.01"):
        assert TEMPLATES_BY_CODE[code].gate == ROI_GATE_ROI_SCOPE, code
        assert TEMPLATES_BY_CODE[code].feed == "contracts", code
    for code in ("B_02.02", "B_07.01"):
        assert TEMPLATES_BY_CODE[code].gate == ROI_GATE_UNCONDITIONAL, code
        assert TEMPLATES_BY_CODE[code].feed == "asset_vendor_links", code
    assert TEMPLATES_BY_CODE["B_05.02"].gate == ROI_GATE_UNCONDITIONAL
    assert TEMPLATES_BY_CODE["B_05.02"].feed == "supply_chain"
    assert TEMPLATES_BY_CODE["B_06.01"].gate == ROI_GATE_PRESENCE
    assert TEMPLATES_BY_CODE["B_06.01"].feed == "processes"
    assert TEMPLATES_BY_CODE["B_05.01"].gate == ROI_GATE_PRESENCE
    assert TEMPLATES_BY_CODE["B_05.01"].feed == "vendors"


def test_coverage_flags_are_honest_per_template():
    """full = every template field the register can emit; partial = mapped
    subset (unmapped annex fields recorded in the module docstring);
    documentary per the workbook."""
    expected = {
        "B_01.01": ROI_COVERAGE_DOCUMENTARY,
        "B_01.02": ROI_COVERAGE_DOCUMENTARY,
        "B_01.03": ROI_COVERAGE_DOCUMENTARY,
        "B_02.01": ROI_COVERAGE_PARTIAL,
        "B_02.02": ROI_COVERAGE_PARTIAL,
        "B_02.03": ROI_COVERAGE_DOCUMENTARY,
        "B_03.01": ROI_COVERAGE_FULL,
        "B_03.02": ROI_COVERAGE_FULL,
        "B_03.03": ROI_COVERAGE_DOCUMENTARY,
        "B_04.01": ROI_COVERAGE_FULL,
        "B_05.01": ROI_COVERAGE_PARTIAL,
        "B_05.02": ROI_COVERAGE_PARTIAL,
        "B_06.01": ROI_COVERAGE_FULL,
        "B_07.01": ROI_COVERAGE_PARTIAL,
        "B_99.01": ROI_COVERAGE_DOCUMENTARY,
    }
    assert {
        template.code: template.coverage for template in ROI_TEMPLATE_REGISTRY
    } == expected


def test_field_keys_are_unique_within_each_template():
    for template in ROI_TEMPLATE_REGISTRY:
        keys = [field.key for field in template.fields]
        assert len(keys) == len(set(keys)), template.code


# ---------------------------------------------------------------------------
# Shared harness for the computation tests.
# ---------------------------------------------------------------------------


def run_readiness(
    graph: IctRegisterGraph | None = None,
    *,
    supplement: RoiRegisterSupplement | None = None,
    parameters=None,
):
    # The harness exercises a register whose entity LEI has been filled in; the
    # fresh-DB P_LEI placeholder default is pinned explicitly in the LEI tests.
    params = parameters or parameter_set(P_LEI=REAL_LEI)
    resolved_graph = graph or IctRegisterGraph()
    return derive_roi_readiness(
        resolved_graph,
        supplement or RoiRegisterSupplement(),
        derive_ict_register(resolved_graph, params),
        params,
    )


def readiness_by_code(result):
    return {template.code: template for template in result.templates}


def test_empty_register_reads_every_template_empty_and_overall_undefined():
    result = run_readiness()

    assert len(result.templates) == 15
    assert result.overall_readiness_pct is None
    assert result.total_gap_row_count == 0
    for template in result.templates:
        assert template.row_count == 0
        assert template.readiness_pct is None
        assert template.gap_rows == ()
        assert template.gap_row_count == 0


# ---------------------------------------------------------------------------
# 2. Readiness computation — gates, % math, gaps.
# ---------------------------------------------------------------------------


def _process(pid: int, **overrides: object) -> ProcessDerivationInput:
    defaults: dict[str, object] = {
        "id": pid,
        "l1_process": f"Proces {pid}",
        "owner": "Jana Nováková",
        "impact_client": 2,
        "impact_market_operations": 2,
        "impact_regulatory": 2,
        "impact_financial": 2,
        "mtpd_hours": 48,
        "rto_hours": 24,
        "rpo_hours": 4,
        "interruption_impact": "medium",
        "assessment_date": date(2026, 1, 15),
    }
    defaults.update(overrides)
    return ProcessDerivationInput(**defaults)  # type: ignore[arg-type]


def _cif_process(pid: int, **overrides: object) -> ProcessDerivationInput:
    """Score 21 (16+5) -> Kritická -> cif Ano (spec 2.1 literals)."""
    defaults: dict[str, object] = {
        "impact_client": 4,
        "impact_market_operations": 4,
        "impact_regulatory": 4,
        "impact_financial": 4,
        "mtpd_hours": 2,
        "rto_hours": 1,
    }
    defaults.update(overrides)
    return _process(pid, **defaults)


def _vendor(vid: int, **overrides: object) -> VendorDerivationInput:
    defaults: dict[str, object] = {"id": vid, "name": f"Dodavatel {vid}"}
    defaults.update(overrides)
    return VendorDerivationInput(**defaults)  # type: ignore[arg-type]


def _filled_vendor(vid: int, **overrides: object) -> VendorDerivationInput:
    defaults: dict[str, object] = {
        "country": "CZ",
        "person_type": "Právnická osoba",
        "identifier_type": "LEI",
        "identifier_value": "315700FFGL2JGHVWJC12",
        "substitutability": "Snadno nahraditelný",
    }
    defaults.update(overrides)
    return _vendor(vid, **defaults)


PROCESS_SUPPLEMENT = RoiProcessSupplement(
    f_code="F1", licensed_activity="non_life_insurance"
)


def test_b0601_export_row_maps_canonical_codes_to_regulatory_english():
    process = _process(1, interruption_impact="not_assessed", cif_override="yes")
    derivation = derive_ict_register(
        IctRegisterGraph(processes=(process,)),
        parameter_set(),
    )

    row = build_b0601_process_export_row(
        process,
        RoiProcessSupplement(f_code="F1", licensed_activity="support_functions"),
        derivation.processes[1],
        entity_lei=REAL_LEI,
    )

    assert row["licensed_activity"] == "support functions"
    assert row["discontinuation_impact"] == "Assessment not performed"
    assert row["criticality_assessment"] == "Yes"


def test_b_06_01_percentage_and_gaps_hand_worked():
    """Two processes, 9 required fields each (0060 is Optional): p1 fully
    populated (F-code + licensed activity supplied, RTO/RPO/impact entered);
    p2 misses the supplement and the continuity trio -> 13 of 18 = 72.2 %,
    one gap row listing the five post-corrigendum codes in column order."""
    graph = IctRegisterGraph(
        processes=(
            _process(1),
            _process(2, rto_hours=None, rpo_hours=None, interruption_impact=None),
        )
    )
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT}),
    )
    b0601 = readiness_by_code(result)["B_06.01"]

    assert b0601.row_count == 2
    assert b0601.required_field_count == 18
    assert b0601.populated_field_count == 13
    assert b0601.readiness_pct == 72.2
    assert b0601.gap_row_count == 1

    (gap,) = b0601.gap_rows
    assert gap.entity_type == "process"
    assert gap.entity_id == 2
    assert gap.label == "Proces 2"  # no F-code assigned in the supplement
    assert gap.route_entity_type == "process"
    assert gap.route_entity_id == 2
    assert [missing.code for missing in gap.missing] == [
        "B_06.01.0010",
        "B_06.01.0020",
        "B_06.01.0080",
        "B_06.01.0090",
        "B_06.01.0100",
    ]
    assert [missing.key for missing in gap.missing] == [
        "function_identifier",
        "licensed_activity",
        "rto_hours",
        "rpo_hours",
        "discontinuation_impact",
    ]


def test_b_06_01_row_identity_carries_the_f_code():
    graph = IctRegisterGraph(processes=(_process(1, rto_hours=None),))
    result = run_readiness(
        graph, supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT})
    )
    (gap,) = readiness_by_code(result)["B_06.01"].gap_rows

    assert gap.label == "F1 — Proces 1"
    assert [missing.code for missing in gap.missing] == ["B_06.01.0080"]


def test_sentinel_backed_fields_never_gap():
    """Addendum A.6.4: RTO/RPO '0' is a reported value; a blank assessment
    date rides the '9999-12-31' fallback; the criticality flag always emits
    (the engine CIF is never blank in-app)."""
    graph = IctRegisterGraph(
        processes=(_process(1, rto_hours=0, rpo_hours=0, assessment_date=None),)
    )
    result = run_readiness(
        graph, supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT})
    )
    b0601 = readiness_by_code(result)["B_06.01"]

    assert b0601.readiness_pct == 100.0
    assert b0601.gap_rows == ()


def test_blank_entity_lei_parameter_gaps_the_lei_field():
    graph = IctRegisterGraph(processes=(_process(1),))
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT}),
        parameters=parameter_set(P_LEI=""),
    )
    (gap,) = readiness_by_code(result)["B_06.01"].gap_rows

    assert [missing.code for missing in gap.missing] == ["B_06.01.0040"]
    assert [missing.key for missing in gap.missing] == ["entity_lei"]


def test_roi_scope_gate_feeds_only_ano_contracts_to_the_arrangement_templates():
    """Spec section 4: B_02.01/B_03.01/B_03.02/B_04.01 gate on 08!K="Ano";
    the VAD-fed templates ignore the flag entirely (the documented asymmetry)."""
    graph = IctRegisterGraph(
        assets=(AssetDerivationInput(id=1, name="Veris"),),
        vendors=(_filled_vendor(1),),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=1,
                ict_service_code="S02",
                contract_reference="SML-2",
            ),
        ),
        contracts=(
            VendorContractInput(
                id=1,
                vendor_id=1,
                contract_reference="SML-1",
                arrangement_type="Samostatné ujednání",
                roi_scope="Ano",
                start_date=date(2020, 1, 1),
            ),
            VendorContractInput(
                id=2, vendor_id=1, contract_reference="SML-2", roi_scope="Ne"
            ),
            VendorContractInput(
                id=3, vendor_id=1, contract_reference="SML-3", roi_scope=None
            ),
        ),
    )
    by_code = readiness_by_code(run_readiness(graph))

    for code in ("B_02.01", "B_03.01", "B_03.02", "B_04.01"):
        assert by_code[code].row_count == 1, code
    # The out-of-scope link still feeds every VAD template (asymmetry note).
    assert by_code["B_02.02"].row_count == 1
    assert by_code["B_07.01"].row_count == 1
    assert by_code["B_05.02"].row_count == 1


def test_b_02_01_gaps_name_the_missing_monetary_fields():
    graph = IctRegisterGraph(
        vendors=(_filled_vendor(1),),
        contracts=(
            VendorContractInput(
                id=1,
                vendor_id=1,
                contract_reference="SML-1",
                arrangement_type="Samostatné ujednání",
                roi_scope="Ano",
                start_date=date(2020, 1, 1),
            ),
        ),
    )
    result = run_readiness(graph)
    b0201 = readiness_by_code(result)["B_02.01"]

    assert b0201.row_count == 1
    assert b0201.required_field_count == 5
    assert b0201.populated_field_count == 3
    assert b0201.readiness_pct == 60.0
    (gap,) = b0201.gap_rows
    assert gap.entity_type == "contract"
    assert gap.label == "SML-1"
    assert gap.route_entity_type == "vendor"
    assert gap.route_entity_id == 1
    assert [missing.key for missing in gap.missing] == ["currency", "annual_expense"]

    supplied = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            contracts={
                1: RoiContractSupplement(
                    annual_cost=Decimal("120000.00"), currency="CZK"
                )
            }
        ),
    )
    assert readiness_by_code(supplied)["B_02.01"].readiness_pct == 100.0


def test_b_02_02_cif_gated_fields_required_only_for_cif_links():
    """The workbook populates the B_02.02 detail block IF(CIF="Ano") only —
    a non-CIF link never gaps on it; a CIF link requires all five, including
    the verified B_02.02.0180 reliance column (DQ-14's own trigger)."""
    graph = IctRegisterGraph(
        processes=(_cif_process(1), _process(2)),
        assets=(
            AssetDerivationInput(id=1, name="Veris"),
            AssetDerivationInput(id=2, name="Datamart"),
        ),
        process_asset_links=(
            ProcessAssetLinkInput(process_id=1, asset_id=1, is_primary=True),
            ProcessAssetLinkInput(process_id=2, asset_id=2, is_primary=True),
        ),
        vendors=(_filled_vendor(1),),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=1,
                ict_service_code="S02",
                contract_reference="SML-1",
            ),
            AssetVendorLinkInput(
                asset_id=2,
                vendor_id=1,
                ict_service_code="S02",
                contract_reference="SML-1",
            ),
        ),
        contracts=(
            VendorContractInput(
                id=1,
                vendor_id=1,
                contract_reference="SML-1",
                main_contract="Ano",
                roi_scope="Ano",
                start_date=date(2020, 1, 1),
            ),
        ),
    )
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            processes={1: PROCESS_SUPPLEMENT, 2: RoiProcessSupplement(f_code="F2")}
        ),
    )
    b0202 = readiness_by_code(result)["B_02.02"]

    # CIF link: 8 always-required + 5 CIF-gated; non-CIF link: 8 only.
    assert b0202.row_count == 2
    assert b0202.required_field_count == 21
    assert b0202.gap_row_count == 1
    (gap,) = b0202.gap_rows
    assert gap.label == "Veris ↔ Dodavatel 1 (S02)"
    assert gap.route_entity_type == "asset"
    assert gap.route_entity_id == 1
    assert [missing.key for missing in gap.missing] == [
        "provisioning_country",
        "data_storage",
        "data_location",
        "data_sensitiveness",
        "reliance_level",
    ]
    assert gap.missing[-1].code == "B_02.02.0180"

    # Supplying the vendor detail block and the reliance closes the gap.
    closed = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            processes={1: PROCESS_SUPPLEMENT, 2: RoiProcessSupplement(f_code="F2")},
            vendors={
                1: RoiVendorSupplement(
                    service_country="CZ",
                    data_storage="EU datacentrum",
                    data_location="CZ",
                    data_sensitivity="Vysoká",
                )
            },
        ),
    )
    b0202_closed = readiness_by_code(closed)["B_02.02"]
    (reliance_gap,) = b0202_closed.gap_rows
    assert [missing.key for missing in reliance_gap.missing] == ["reliance_level"]


def test_b_02_02_function_identifier_requires_a_designated_primary_process():
    """B_06.01's function id reaches B_02.02 through the asset's PRIMARY
    process (engine designation) and its F-code — no primary, no id."""
    graph = IctRegisterGraph(
        processes=(_process(1),),
        assets=(AssetDerivationInput(id=1, name="Veris"),),
        # Linked but NOT primary: the engine derives no primary process.
        process_asset_links=(ProcessAssetLinkInput(process_id=1, asset_id=1),),
        vendors=(_filled_vendor(1),),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=1,
                ict_service_code="S02",
                contract_reference="SML-1",
            ),
        ),
        contracts=(
            VendorContractInput(
                id=1,
                vendor_id=1,
                contract_reference="SML-1",
                main_contract="Ano",
                roi_scope="Ano",
                start_date=date(2020, 1, 1),
            ),
        ),
    )
    result = run_readiness(
        graph, supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT})
    )
    (gap,) = readiness_by_code(result)["B_02.02"].gap_rows

    assert [missing.key for missing in gap.missing] == ["function_identifier"]


def test_b_05_02_supply_chain_rows_rank_one_links_plus_sub_outsourcing_chain():
    """Rank-1: one row per VAD link (unconditional). Rank-2+: one row per
    Sub-outsourcing entry — a broken chain (dangling predecessor) gaps on the
    derived rank, exactly the engine's "?" sentinel."""
    graph = IctRegisterGraph(
        assets=(AssetDerivationInput(id=1, name="Veris"),),
        vendors=(_filled_vendor(1),),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=1,
                ict_service_code="S19",
                contract_reference="SML-1",
            ),
        ),
        contracts=(
            VendorContractInput(
                id=1,
                vendor_id=1,
                contract_reference="SML-1",
                main_contract="Ano",
                roi_scope="Ano",
            ),
        ),
        sub_outsourcing=(
            SubOutsourcingInput(
                id=1, vendor_id=1, contract_id=1, sub_provider_name="Sub A"
            ),
            SubOutsourcingInput(
                id=2,
                vendor_id=1,
                contract_id=1,
                predecessor_id=99,
                sub_provider_name="Sub B",
            ),
        ),
    )
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            sub_outsourcing={
                1: RoiSubOutsourcingSupplement(
                    ict_service_code="S19",
                    person_type="Právnická osoba",
                    identifier_type="LEI",
                    identifier_value="87654321",
                    country="CZ",
                ),
                2: RoiSubOutsourcingSupplement(
                    ict_service_code="S19",
                    person_type="Právnická osoba",
                    identifier_type="LEI",
                    identifier_value="11223344",
                    country="CZ",
                ),
            }
        ),
    )
    b0502 = readiness_by_code(result)["B_05.02"]

    assert b0502.row_count == 3  # 1 rank-1 link row + 2 chain rows
    # The rank-1 row and the direct sub row are complete; the broken-chain row
    # gaps on rank (no derivable rank) and recipient (dangling predecessor).
    assert b0502.gap_row_count == 1
    (gap,) = b0502.gap_rows
    assert gap.entity_type == "sub_outsourcing"
    assert gap.label == "Sub B"
    assert gap.route_entity_type == "vendor"
    assert gap.route_entity_id == 1
    assert [missing.key for missing in gap.missing] == ["rank", "recipient"]


def test_provider_identifier_legality_applies_to_b_02_02_and_b_05_02():
    graph = IctRegisterGraph(
        assets=(AssetDerivationInput(id=1, name="Veris"),),
        vendors=(_filled_vendor(1, identifier_type="VAT", identifier_value="VAT-1"),),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=1,
                ict_service_code="S19",
                contract_reference="SML-1",
            ),
        ),
    )

    result = run_readiness(graph)

    assert [
        missing.key
        for missing in readiness_by_code(result)["B_02.02"].gap_rows[0].missing
    ] == [
        "provider_identification_code",
        "provider_identification_type",
        "function_identifier",
        "start_date",
    ]
    assert [
        missing.key
        for missing in readiness_by_code(result)["B_05.02"].gap_rows[0].missing
    ] == ["provider_identification_code"]


def test_b_05_02_sub_provider_identifier_requires_legal_type_and_country():
    graph = IctRegisterGraph(
        vendors=(_filled_vendor(1),),
        contracts=(VendorContractInput(id=1, vendor_id=1, contract_reference="SML-1"),),
        sub_outsourcing=(
            SubOutsourcingInput(
                id=1, vendor_id=1, contract_id=1, sub_provider_name="Sub A"
            ),
        ),
    )
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            sub_outsourcing={
                1: RoiSubOutsourcingSupplement(
                    ict_service_code="S19",
                    person_type="Právnická osoba",
                    identifier_type="EUID",
                    identifier_value="EUID-1",
                    country="US",
                )
            }
        ),
    )

    gap = readiness_by_code(result)["B_05.02"].gap_rows[0]
    assert [missing.key for missing in gap.missing] == ["provider_identification_code"]


def test_b_05_02_accepts_business_individual_sub_provider_identifier():
    graph = IctRegisterGraph(
        vendors=(_filled_vendor(1),),
        contracts=(VendorContractInput(id=1, vendor_id=1, contract_reference="SML-1"),),
        sub_outsourcing=(
            SubOutsourcingInput(
                id=1, vendor_id=1, contract_id=1, sub_provider_name="Jan Novák"
            ),
        ),
    )

    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            sub_outsourcing={
                1: RoiSubOutsourcingSupplement(
                    person_type="Fyzická osoba podnikající",
                    identifier_type="NIN",
                    identifier_value="NIN-1",
                    country="CZ",
                    ict_service_code="S19",
                )
            }
        ),
    )

    assert readiness_by_code(result)["B_05.02"].gap_row_count == 0


def test_b_07_01_reads_the_vendor_assessment_block_per_link():
    graph = IctRegisterGraph(
        assets=(AssetDerivationInput(id=1, name="Veris"),),
        vendors=(_filled_vendor(1, exit_plan_state=None),),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=1,
                ict_service_code="S02",
                contract_reference="SML-1",
            ),
        ),
    )
    sparse = readiness_by_code(run_readiness(graph))["B_07.01"]
    assert sparse.row_count == 1
    (gap,) = sparse.gap_rows
    # Substitutability is entered on the harness vendor; the audit date is
    # sentinel-backed and the exit plan derives Yes/No — never gaps.
    assert [missing.key for missing in gap.missing] == [
        "substitutability_reason",
        "reintegration",
        "discontinuation_impact",
        "alternative_providers",
    ]

    full = readiness_by_code(
        run_readiness(
            graph,
            supplement=RoiRegisterSupplement(
                vendors={
                    1: RoiVendorSupplement(
                        substitutability_reason="Nízká náročnost migrace",
                        reintegration="Ano",
                        service_disruption_impact="Střední",
                        alternative_providers="Ano",
                    )
                }
            ),
        )
    )["B_07.01"]
    assert full.readiness_pct == 100.0
    assert full.gap_rows == ()


def test_b_05_01_vendor_master_data_gaps():
    graph = IctRegisterGraph(vendors=(_filled_vendor(1), _vendor(2)))
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            vendors={1: RoiVendorSupplement(latin_name="Dodavatel 1")}
        ),
    )
    b0501 = readiness_by_code(result)["B_05.01"]

    assert b0501.row_count == 2
    assert b0501.required_field_count == 12
    assert b0501.populated_field_count == 7  # v1 all six; v2 only its legal name
    assert b0501.readiness_pct == 58.3
    (gap,) = b0501.gap_rows
    assert gap.entity_type == "vendor"
    assert gap.entity_id == 2
    assert [missing.key for missing in gap.missing] == [
        "provider_identification_code",
        "provider_identification_type",
        "latin_name",
        "person_type",
        "headquarters_country",
    ]
    assert gap.missing[1].code == "B_05.01.0020"


@pytest.mark.parametrize(
    ("person_type", "country", "identifier_type", "identifier_value", "ready"),
    [
        ("Právnická osoba", "CZ", "LEI", "LEI-1", True),
        ("Právnická osoba", "DE", "EUID", "EUID-1", True),
        ("Právnická osoba", "CZ", "VAT", "VAT-1", False),
        ("Právnická osoba", "US", "LEI", "LEI-2", True),
        ("Právnická osoba", "US", "EUID", "EUID-2", False),
        ("Fyzická osoba podnikající", "CZ", "LEI", "LEI-3", True),
        ("Fyzická osoba podnikající", "CZ", "EUID", "EUID-3", True),
        ("Fyzická osoba podnikající", "CZ", "CRN", "CRN-1", True),
        ("Fyzická osoba podnikající", "CZ", "VAT", "VAT-2", True),
        ("Fyzická osoba podnikající", "CZ", "PNR", "PNR-1", True),
        ("Fyzická osoba podnikající", "CZ", "NIN", "NIN-1", True),
        ("Fyzická osoba podnikající", "US", "IČO (CRN)", "12345678", True),
        ("Právnická osoba", "CZ", "IČO (CRN)", "12345678", False),
        ("Fyzická osoba podnikající", "CZ", "Jiný", "legacy", False),
        ("Právnická osoba", "ZZ", "LEI", "LEI-4", False),
        ("Právnická osoba", "CZ", None, "LEI-5", False),
        ("Právnická osoba", "CZ", "LEI", None, False),
    ],
)
def test_b_05_01_identifier_pair_obeys_person_and_country_rules(
    person_type: str,
    country: str,
    identifier_type: str | None,
    identifier_value: str | None,
    ready: bool,
):
    graph = IctRegisterGraph(
        vendors=(
            _filled_vendor(
                1,
                person_type=person_type,
                country=country,
                identifier_type=identifier_type,
                identifier_value=identifier_value,
            ),
        )
    )
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            vendors={1: RoiVendorSupplement(latin_name="Provider One")}
        ),
    )
    b0501 = readiness_by_code(result)["B_05.01"]

    assert b0501.readiness_pct == (100.0 if ready else 66.7)
    assert (
        b0501.gap_rows == ()
        if ready
        else [missing.key for missing in b0501.gap_rows[0].missing]
        == ["provider_identification_code", "provider_identification_type"]
    )


def test_fully_populated_register_reaches_one_hundred_percent_overall():
    graph = IctRegisterGraph(
        processes=(_process(1),),
        vendors=(_filled_vendor(1),),
        contracts=(
            VendorContractInput(
                id=1,
                vendor_id=1,
                contract_reference="SML-1",
                arrangement_type="Samostatné ujednání",
                main_contract="Ano",
                roi_scope="Ano",
                start_date=date(2020, 1, 1),
            ),
        ),
    )
    result = run_readiness(
        graph,
        supplement=RoiRegisterSupplement(
            processes={1: PROCESS_SUPPLEMENT},
            vendors={1: RoiVendorSupplement(latin_name="Dodavatel 1")},
            contracts={
                1: RoiContractSupplement(annual_cost=Decimal("1"), currency="CZK")
            },
        ),
    )

    assert result.overall_readiness_pct == 100.0
    assert result.total_gap_row_count == 0
    for code in ("B_02.01", "B_03.01", "B_03.02", "B_04.01", "B_05.01", "B_06.01"):
        template = readiness_by_code(result)[code]
        assert template.readiness_pct == 100.0, code
        assert template.gap_rows == (), code


def test_gap_rows_are_capped_with_the_total_count_preserved():
    graph = IctRegisterGraph(vendors=tuple(_vendor(vid) for vid in range(1, 26)))
    b0501 = readiness_by_code(run_readiness(graph))["B_05.01"]

    assert b0501.gap_row_count == 25
    assert len(b0501.gap_rows) == ROI_GAP_ROW_CAP


def test_overall_summary_weights_by_required_fields_across_templates():
    """Overall % = total populated / total required across every fed template
    (documentary templates contribute nothing)."""
    graph = IctRegisterGraph(
        processes=(_process(1),),
        vendors=(_vendor(1),),
    )
    result = run_readiness(
        graph, supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT})
    )

    # B_06.01: 9/9; B_05.01: 1/6 (name only) -> 10 of 15 = 66.7 %.
    assert result.overall_readiness_pct == 66.7
    assert result.total_gap_row_count == 1


# ---------------------------------------------------------------------------
# P_LEI placeholder handling — the entity LEI counts as populated only once the
# workbook 'LEI-DOPLNIT' placeholder default is replaced (functional spec §6;
# a fresh DB must not inflate readiness on the LEI-bearing templates).
# ---------------------------------------------------------------------------

# Every template that carries the entity_lei required field.
LEI_BEARING_TEMPLATES = frozenset({"B_02.02", "B_03.01", "B_04.01", "B_06.01"})


def _lei_gapped_templates(result) -> set[str]:
    """Templates whose gap rows list the entity_lei field among the missing."""
    return {
        template.code
        for template in result.templates
        for row in template.gap_rows
        if any(missing.key == "entity_lei" for missing in row.missing)
    }


def _lei_probe_graph() -> IctRegisterGraph:
    """A register feeding all four LEI-bearing templates: one Process (B_06.01),
    one Asset<->Vendor link (B_02.02), one RoI-scope Contract (B_03.01/B_04.01)."""
    return IctRegisterGraph(
        processes=(_process(1),),
        assets=(AssetDerivationInput(id=1, name="Veris"),),
        vendors=(_filled_vendor(1),),
        asset_vendor_links=(
            AssetVendorLinkInput(
                asset_id=1,
                vendor_id=1,
                ict_service_code="S02",
                contract_reference="SML-1",
            ),
        ),
        contracts=(
            VendorContractInput(
                id=1,
                vendor_id=1,
                contract_reference="SML-1",
                arrangement_type="Samostatné ujednání",
                main_contract="Ano",
                roi_scope="Ano",
                start_date=date(2020, 1, 1),
            ),
        ),
    )


def test_placeholder_entity_lei_default_gaps_every_lei_bearing_template():
    """A fresh DB reads P_LEI at its registry placeholder default; until it is
    replaced the entity LEI is a GAP on every template that carries it —
    B_02.02, B_03.01, B_04.01, B_06.01 (functional spec §6, the workbook
    'LEI-DOPLNIT' placeholder)."""
    placeholder = run_readiness(
        _lei_probe_graph(),
        supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT}),
        parameters=parameter_set(),  # P_LEI at its verbatim placeholder default
    )

    assert _lei_gapped_templates(placeholder) == LEI_BEARING_TEMPLATES


def test_placeholder_lei_is_sourced_from_the_registry_default_not_a_literal():
    """The rejected placeholder is the registry's declared P_LEI default (read
    from ICT_WORKBOOK_PARAMETERS), never a string hardcoded in the readiness
    module: setting P_LEI to that exact declared default still gaps."""
    declared_default = ICT_WORKBOOK_PARAMETERS_BY_NAME["P_LEI"].default
    at_declared_default = run_readiness(
        _lei_probe_graph(),
        supplement=RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT}),
        parameters=parameter_set(P_LEI=declared_default),
    )

    assert _lei_gapped_templates(at_declared_default) == LEI_BEARING_TEMPLATES


def test_replacing_the_placeholder_lei_fills_the_field_and_lifts_readiness():
    """Overriding P_LEI to a real value (the ADR-008 config overlay) fills the
    LEI on every bearing template and raises both per-template and overall %."""
    graph = _lei_probe_graph()
    supplement = RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT})

    placeholder = run_readiness(
        graph, supplement=supplement, parameters=parameter_set()
    )
    filled = run_readiness(
        graph, supplement=supplement, parameters=parameter_set(P_LEI=REAL_LEI)
    )

    assert _lei_gapped_templates(filled) == set()

    placeholder_by_code = readiness_by_code(placeholder)
    filled_by_code = readiness_by_code(filled)
    for code in LEI_BEARING_TEMPLATES:
        assert (
            filled_by_code[code].readiness_pct > placeholder_by_code[code].readiness_pct
        ), code

    assert filled.overall_readiness_pct is not None
    assert placeholder.overall_readiness_pct is not None
    assert filled.overall_readiness_pct > placeholder.overall_readiness_pct


def test_blank_and_whitespace_lei_are_not_confused_with_the_placeholder():
    """A blank/whitespace LEI still gaps (never 'filled'); a real value fills —
    the placeholder check is an AND over presence, not a replacement of it."""
    graph = _lei_probe_graph()
    supplement = RoiRegisterSupplement(processes={1: PROCESS_SUPPLEMENT})

    for blank in ("", "   "):
        blank_result = run_readiness(
            graph, supplement=supplement, parameters=parameter_set(P_LEI=blank)
        )
        assert _lei_gapped_templates(blank_result) == LEI_BEARING_TEMPLATES, blank


def test_roi_gap_labels_never_synthesize_raw_ids_for_absent_business_labels():
    """A gap row whose OWN business label is genuinely absent (an unnamed
    vendor, a contract without a reference, an unnamed sub-provider) emits a
    localizable {{unknown_*}} token, never a raw #<pk>/SUB-<pk> string
    (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md)."""
    graph = IctRegisterGraph(
        # A named vendor 1 owns the reference-less contract and the unnamed sub;
        # an unnamed vendor 2 (no chain) exercises the B_05.01 vendor fallback.
        vendors=(_vendor(1, name="Dodavatel 1"), _vendor(2, name=None)),
        contracts=(
            # B_02.01/B_03.01/B_03.02/B_04.01 — RoI-scope contract, no reference.
            VendorContractInput(
                id=1, vendor_id=1, contract_reference=None, roi_scope="Ano"
            ),
        ),
        sub_outsourcing=(
            # B_05.02 — sub-outsourcing entry with no provider name.
            SubOutsourcingInput(
                id=1, vendor_id=1, contract_id=1, sub_provider_name=None
            ),
        ),
    )
    labels = [
        row.label
        for template in run_readiness(graph).templates
        for row in template.gap_rows
    ]

    assert any("{{unknown_vendor}}" in label for label in labels), labels
    assert any("{{unknown_contract}}" in label for label in labels), labels
    assert any("{{unknown_sub_outsourcing}}" in label for label in labels), labels
    for label in labels:
        assert not re.search(r"#\d+", label), label
        assert not re.search(r"SUB-\d+", label), label
