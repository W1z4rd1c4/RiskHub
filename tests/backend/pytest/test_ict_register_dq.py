"""ICT Register data-quality checks — the 52-check DQ suite (issue #50).

Two seams, mirroring the derivation golden suites:

1. **The pure DQ engine** (``derive_ict_register_dq``): golden, table-driven
   graphs asserting workbook-exact statuses per docs/dora-ict-register/
   dora-excel-functional-spec.md section 5 and, where the spec table
   abbreviates, the builder DQ formulas quoted verbatim
   (``sheets_out.py:352-547``; helper columns per the file:line quotes in the
   docstrings below). Every check family gets one green (OK) and one
   violating (NÁLEZ with the right row refs) golden; the structural chain
   checks, the acceptance-trio conditional, the ex-ante/exit conditionals,
   the main-contract multiplicity, and the closed-list stragglers get
   exhaustive branches.

2. **The HTTP seam** via ``client_factory``: GET /ict-register/dq returns all
   52 checks with correct statuses for a mini-graph seeded THROUGH the write
   API (which simultaneously proves the mandatory-if states are writable —
   flag-don't-prevent), plus the authz matrix on the standard vendors:read
   business pattern.

The risk-side column mapping (13_Rizika -> the production Risk entity) is
asserted against ``risk_dq_input`` — the loader seam where the app's
acceptance trio becomes the workbook's response/status columns.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models import Risk, User
from app.models.global_config import clear_config_cache
from app.services._ict_register_lifecycle.derivation import (
    AssetAssetLinkInput,
    AssetDerivationInput,
    AssetVendorLinkInput,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivationInput,
    ProcessVendorLinkInput,
    SubOutsourcingInput,
    VendorContractInput,
    VendorDerivationInput,
)
from app.services._ict_register_lifecycle.derivation_inputs import risk_dq_input
from app.services._ict_register_lifecycle.dq import (
    DQ_STATUS_FINDING,
    DQ_STATUS_OK,
    DqCheckResult,
    IctRegisterDqGraph,
    IctRegisterDqResult,
    RiskAssetLinkDqInput,
    RiskDqInput,
    RiskProcessLinkDqInput,
    RiskVendorLinkDqInput,
    acceptance_review_due,
    derive_ict_register_dq,
    next_assessment_date,
)
from app.services._ict_register_reference.parameters import (
    ICT_WORKBOOK_PARAMETERS,
    IctParameterValue,
    IctWorkbookParameterSet,
)


@pytest.fixture(autouse=True)
def _clear_config_cache():
    clear_config_cache()
    yield
    clear_config_cache()


def parameter_set(**overrides: IctParameterValue) -> IctWorkbookParameterSet:
    """The verbatim workbook parameter set (spec section 6), with overrides."""
    values: dict[str, IctParameterValue] = {p.name: p.default for p in ICT_WORKBOOK_PARAMETERS}
    values.update(overrides)
    return IctWorkbookParameterSet(version=str(values["P_Verze"]), values=values)


def run_dq(
    graph: IctRegisterGraph | None = None,
    *,
    risks: tuple[RiskDqInput, ...] = (),
    risk_process_links: tuple[RiskProcessLinkDqInput, ...] = (),
    risk_asset_links: tuple[RiskAssetLinkDqInput, ...] = (),
    risk_vendor_links: tuple[RiskVendorLinkDqInput, ...] = (),
    parameters: IctWorkbookParameterSet | None = None,
) -> IctRegisterDqResult:
    return derive_ict_register_dq(
        IctRegisterDqGraph(
            graph=graph or IctRegisterGraph(),
            risks=risks,
            risk_process_links=risk_process_links,
            risk_asset_links=risk_asset_links,
            risk_vendor_links=risk_vendor_links,
        ),
        parameters or parameter_set(),
    )


def check(result: IctRegisterDqResult, check_id: str) -> DqCheckResult:
    return next(entry for entry in result.checks if entry.check_id == check_id)


def violating_ids(result: IctRegisterDqResult, check_id: str) -> list[int]:
    return [row.entity_id for row in check(result, check_id).violating_rows]


# --- Row builders -----------------------------------------------------------


def process_row(pid: int = 1, **overrides: object) -> ProcessDerivationInput:
    """A DQ-clean Process: owned, departmented, scored low (non-CIF), no gaps."""
    defaults: dict[str, object] = {
        "id": pid,
        "l1_process": f"Proces {pid}",
        "owner": "Jana Nováková",
        "owner_department": "Úsek IT",
        "impact_client": 2,
        "impact_market_operations": 2,
        "impact_regulatory": 2,
        "impact_financial": 2,
        "mtpd_hours": 48,
        "rto_hours": 24,
        "rpo_hours": 4,
        "bcm_link": "Ano",
        "interruption_impact": "Střední",
        "assessment_date": date(2026, 1, 15),
    }
    defaults.update(overrides)
    return ProcessDerivationInput(**defaults)  # type: ignore[arg-type]


def cif_process_row(pid: int = 1, **overrides: object) -> ProcessDerivationInput:
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
    return process_row(pid, **defaults)


def asset_row(aid: int = 1, **overrides: object) -> AssetDerivationInput:
    """A DQ-clean Asset (all closed-list stragglers answered, CIAA complete)."""
    defaults: dict[str, object] = {
        "id": aid,
        "name": f"Aktivum {aid}",
        "asset_type": "Aplikace",
        "asset_level": "B – podpůrné",
        "business_owner": "Petr Svoboda",
        "ict_owner": "IT Operations",
        "owner_department": "Úsek IT",
        "gdpr_relevance": "Ne",
        "ai_relevance": "Ne",
        "data_classification": "Interní data",
        "deployment_model": "On-premise",
        "confidentiality_rating": 2,
        "integrity_rating": 2,
        "availability_rating": 2,
        "authenticity_rating": 2,
        "impact_client": 2,
        "impact_regulatory": 2,
        "internet_exposed": "Ne",
        "lifecycle_state": "V provozu",
        "review_state": "Zkontrolováno",
    }
    defaults.update(overrides)
    return AssetDerivationInput(**defaults)  # type: ignore[arg-type]


def vendor_row(vid: int = 1, **overrides: object) -> VendorDerivationInput:
    """A tier-Standard Vendor: no CIF path, no substitutability trigger."""
    defaults: dict[str, object] = {
        "id": vid,
        "name": f"Dodavatel {vid}",
        "country": "CZ",
        "substitutability": "Snadno nahraditelný",
    }
    defaults.update(overrides)
    return VendorDerivationInput(**defaults)  # type: ignore[arg-type]


def obligated_vendor_row(vid: int = 1, **overrides: object) -> VendorDerivationInput:
    """A Vendor meeting every Critical/Significant-tier obligation the DQ flags."""
    defaults: dict[str, object] = {
        "identifier_value": "12345678",
        "identifier_type": "IČO (CRN)",
        "exit_plan_state": "Schválen",
        "ex_ante_assessment_date": date(2026, 3, 1),
        "due_diligence_state": "Probíhá",
        "significance_service_quality": "Ano",
    }
    defaults.update(overrides)
    return vendor_row(vid, **defaults)


def pal(pid: int, aid: int, **overrides: object) -> ProcessAssetLinkInput:
    defaults: dict[str, object] = {
        "process_id": pid,
        "asset_id": aid,
        "significance": "Podpůrná vazba",
    }
    defaults.update(overrides)
    return ProcessAssetLinkInput(**defaults)  # type: ignore[arg-type]


def avl(aid: int, vid: int, **overrides: object) -> AssetVendorLinkInput:
    defaults: dict[str, object] = {
        "asset_id": aid,
        "vendor_id": vid,
        "ict_service_code": "S02",
        "reliance": "Úplná závislost",
    }
    defaults.update(overrides)
    return AssetVendorLinkInput(**defaults)  # type: ignore[arg-type]


def risk_input(rid: int = 1, **overrides: object) -> RiskDqInput:
    defaults: dict[str, object] = {"id": rid, "label": f"RIZ-{rid:03d} — Riziko {rid}"}
    defaults.update(overrides)
    return RiskDqInput(**defaults)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Catalog shape and the all-OK baseline
# ---------------------------------------------------------------------------


def test_catalog_serves_all_52_checks_in_workbook_order_with_threshold_zero():
    """Spec section 5: 52 checks, literal 0 threshold (sheets_out.py:569),
    OK/NÁLEZ per D>E (sheets_out.py:570), areas per the builder table."""
    result = run_dq()

    assert [entry.check_id for entry in result.checks] == [f"DQ-{n:02d}" for n in range(1, 53)]
    assert all(entry.threshold == 0 for entry in result.checks)
    assert {entry.area for entry in result.checks} == {
        "Procesy",
        "Aktiva",
        "Vazby",
        "Dodavatelé",
        "Rizika",
        "Integrita",
        "Smlouvy",
    }
    assert [entry.check_id for entry in result.checks if entry.area == "Rizika"] == [
        "DQ-20",
        "DQ-21",
        "DQ-22",
        "DQ-23",
    ]
    # CZ titles verbatim (builder sheets_out.py:360-547) — spot pins.
    assert check(result, "DQ-03").title_cs == "CIF proces bez navázaného aktiva"
    assert check(result, "DQ-21").title_cs == "Akceptace nad toleranci bez schválení/odůvodnění"
    assert check(result, "DQ-52").title_cs == (
        "Kritický/Významný dodavatel bez posouzené významnosti outsourcingu"
    )
    assert check(result, "DQ-17").severity == "Kritická"
    assert check(result, "DQ-45").severity == "Střední"


def test_empty_register_reads_all_ok():
    result = run_dq()
    assert all(entry.status == DQ_STATUS_OK for entry in result.checks)
    assert all(entry.count == 0 for entry in result.checks)
    assert result.finding_count == 0


def test_clean_mini_register_reads_all_ok():
    """A fully-tended mini-graph: every check OK, including the vendor tiers."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1),),
        process_asset_links=(pal(1, 1, is_primary=True),),
        vendors=(vendor_row(1),),
        contracts=(
            VendorContractInput(
                id=1, vendor_id=1, contract_reference="SML-2020-001", main_contract="Ano", roi_scope="Ano"
            ),
        ),
        asset_vendor_links=(avl(1, 1),),
    )
    result = run_dq(graph)
    findings = [entry.check_id for entry in result.checks if entry.status == DQ_STATUS_FINDING]
    assert findings == []


# ---------------------------------------------------------------------------
# Process checks (DQ-01..05, DQ-43)
# ---------------------------------------------------------------------------


def test_dq01_process_without_owner():
    """=COUNTIFS(03.l1<>"",03.vlastnik="") — sheets_out.py:360-362."""
    result = run_dq(IctRegisterGraph(processes=(process_row(1, owner=None), process_row(2))))
    assert check(result, "DQ-01").status == DQ_STATUS_FINDING
    assert check(result, "DQ-01").count == 1
    row = check(result, "DQ-01").violating_rows[0]
    assert (row.entity_type, row.entity_id, row.route_entity_type, row.route_entity_id) == (
        "process",
        1,
        "process",
        1,
    )
    assert row.label == "Proces 1"


def test_dq02_rto_gap_counts_gap_rows_and_ignores_half_entered_pairs():
    """=COUNTIF(03.kontrola_rto,"GAP*") — a half-entered RTO/MTPD pair is
    BLANK, never GAP (builder sheets_core.py:186)."""
    result = run_dq(
        IctRegisterGraph(
            processes=(
                process_row(1, rto_hours=72, mtpd_hours=48),
                process_row(2, rto_hours=None),
                process_row(3),
            )
        )
    )
    assert violating_ids(result, "DQ-02") == [1]


def test_dq03_cif_process_without_linked_asset():
    """=SUMPRODUCT((03.cif="Ano")*(03.aktiva_n=0)) — engine cif + aktiva_n."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1), cif_process_row(2), process_row(3)),
        assets=(asset_row(9),),
        process_asset_links=(pal(2, 9, is_primary=True),),
    )
    result = run_dq(graph)
    assert violating_ids(result, "DQ-03") == [1]
    assert check(result, "DQ-03").severity == "Kritická"


def test_dq04_process_without_score_bootstrap():
    """=SUMPRODUCT((03.l1<>"")*(03.skore="")) — score blank unless all four
    impacts AND mtpd are entered (spec 2.1)."""
    result = run_dq(
        IctRegisterGraph(processes=(process_row(1, impact_client=None), process_row(2)))
    )
    assert violating_ids(result, "DQ-04") == [1]


def test_dq05_cif_process_without_bcm():
    """=COUNTIF(03.kontrola_bcm,"GAP*") — fires on CIF processes whose BCM
    link is anything but "Ano" (builder sheets_core.py:190)."""
    result = run_dq(
        IctRegisterGraph(
            processes=(
                cif_process_row(1, bcm_link=None),
                cif_process_row(2, bcm_link="Částečně"),
                cif_process_row(3, bcm_link="Ano"),
                process_row(4, bcm_link=None),  # non-CIF: OK either way
            ),
            assets=(asset_row(9),),
            process_asset_links=(pal(1, 9), pal(2, 9), pal(3, 9, is_primary=True)),
        )
    )
    assert violating_ids(result, "DQ-05") == [1, 2]


def test_dq43_process_without_owner_department():
    """=SUMPRODUCT((03.l1<>"")*(03.utvar="")) — sheets_out.py:510-512."""
    result = run_dq(IctRegisterGraph(processes=(process_row(1, owner_department=None),)))
    assert violating_ids(result, "DQ-43") == [1]


# ---------------------------------------------------------------------------
# Asset checks (DQ-06..10, 27..31, 33..36, 44, 46..48, 51)
# ---------------------------------------------------------------------------


def test_dq06_asset_without_any_owner_and_dq34_ai_variant():
    """DQ-06 needs BOTH owner cells blank; one owner suffices. DQ-34 is the
    same rule scoped to ai="Ano" rows (sheets_out.py:375-377, 475-477)."""
    result = run_dq(
        IctRegisterGraph(
            assets=(
                asset_row(1, business_owner=None, ict_owner=None),
                asset_row(2, business_owner=None),
                asset_row(3, business_owner=None, ict_owner=None, ai_relevance="Ano"),
            )
        )
    )
    assert violating_ids(result, "DQ-06") == [1, 3]
    assert violating_ids(result, "DQ-34") == [3]


def test_dq07_asset_without_primary_process_designation():
    """=SUMPRODUCT((04.id<>"")*(h_par=0)) — h_par counts the 05 row matching
    the primary designation (sheets_core.py:410-411); in-app the designation
    IS the is_primary link."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1), asset_row(2)),
        process_asset_links=(pal(1, 1), pal(1, 2, is_primary=True)),
    )
    result = run_dq(graph)
    assert violating_ids(result, "DQ-07") == [1]


def test_dq08_critical_asset_requires_an_identified_risk():
    """=(vysledna="Kritická")*(h_rizika=0) — h_rizika is the 13_Rizika subject
    COUNTIF (sheets_core.py:412-413) -> Risk<->Asset links in-app."""
    graph = IctRegisterGraph(
        assets=(
            asset_row(1, preliminary_criticality="Kritická"),
            asset_row(2, preliminary_criticality="Kritická"),
            asset_row(3),
        )
    )
    result = run_dq(graph, risk_asset_links=(RiskAssetLinkDqInput(risk_id=7, asset_id=2),))
    assert violating_ids(result, "DQ-08") == [1]


def test_dq09_asset_flagged_for_review():
    """=COUNTIF(04.stav_revize,"K revizi") — sheets_out.py:384-386."""
    result = run_dq(
        IctRegisterGraph(assets=(asset_row(1, review_state="K revizi"), asset_row(2)))
    )
    assert violating_ids(result, "DQ-09") == [1]


def test_dq10_legacy_asset_without_risk_assessment():
    """=(legacy="Ano")*(legacy_posl="") — engine legacy is lifecycle OR
    support-end-before-P_RefDatum (spec 1.2)."""
    result = run_dq(
        IctRegisterGraph(
            assets=(
                asset_row(1, lifecycle_state="Legacy"),
                asset_row(2, standard_support_end_date=date(2026, 1, 1)),
                asset_row(3, lifecycle_state="Legacy", last_legacy_risk_assessment_date=date(2026, 5, 1)),
                asset_row(4),
            )
        )
    )
    assert violating_ids(result, "DQ-10") == [1, 2]


def test_dq27_dq28_missing_or_undetermined_relevance_flags():
    """gdpr/ai blank or "Neurčeno" both count (sheets_out.py:453-458)."""
    result = run_dq(
        IctRegisterGraph(
            assets=(
                asset_row(1, gdpr_relevance=None),
                asset_row(2, gdpr_relevance="Neurčeno"),
                asset_row(3, ai_relevance="Neurčeno"),
                asset_row(4),
            )
        )
    )
    assert violating_ids(result, "DQ-27") == [1, 2]
    assert violating_ids(result, "DQ-28") == [3]


def test_dq29_dq33_ciaa_completeness_general_and_internet_exposed():
    """DQ-29 counts any incomplete CIAA; DQ-33 only internet-exposed rows
    (sheets_out.py:459-461, 472-474)."""
    result = run_dq(
        IctRegisterGraph(
            assets=(
                asset_row(1, authenticity_rating=None),
                asset_row(2, internet_exposed="Ano", confidentiality_rating=None),
                asset_row(3, internet_exposed="Ano"),
            )
        )
    )
    assert violating_ids(result, "DQ-29") == [1, 2]
    assert violating_ids(result, "DQ-33") == [2]


def test_dq30_business_impacts_include_the_inherited_pair():
    """d_provoz/d_fin inherit from the primary Process (engine outputs); an
    asset with entered impacts but NO primary process still counts
    (sheets_out.py:462-464)."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1), asset_row(2), asset_row(3, impact_client=None)),
        process_asset_links=(pal(1, 2, is_primary=True), pal(1, 3, is_primary=True)),
    )
    result = run_dq(graph)
    assert violating_ids(result, "DQ-30") == [1, 3]


def test_dq31_cif_count_consistency_is_structurally_ok():
    """Structural self-check: the engine derives cif and cif_pocet from the
    same links, so a live graph can never fire it (spec section 5)."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1),),
        assets=(asset_row(1),),
        process_asset_links=(pal(1, 1, is_primary=True),),
    )
    result = run_dq(graph)
    assert check(result, "DQ-31").status == DQ_STATUS_OK


def test_dq35_dq47_confidentiality_thresholds_with_blank_counting():
    """GDPR assets (DQ-35) and highly-confidential data (DQ-47) need C >=
    P_GdprMinC; a BLANK C also fires (sheets_out.py:478-480, 522-524)."""
    result = run_dq(
        IctRegisterGraph(
            assets=(
                asset_row(1, gdpr_relevance="Ano", confidentiality_rating=2),
                asset_row(2, gdpr_relevance="Ano", confidentiality_rating=None),
                asset_row(3, gdpr_relevance="Ano", confidentiality_rating=3),
                asset_row(4, data_classification="Vysoce důvěrná / regulovaná data", confidentiality_rating=2),
                asset_row(5, data_classification="Vysoce důvěrná / regulovaná data", confidentiality_rating=5),
            )
        )
    )
    assert violating_ids(result, "DQ-35") == [1, 2]
    assert violating_ids(result, "DQ-47") == [4]

    # The threshold is the live P_GdprMinC parameter, not a constant.
    relaxed = run_dq(
        IctRegisterGraph(assets=(asset_row(1, gdpr_relevance="Ano", confidentiality_rating=2),)),
        parameters=parameter_set(P_GdprMinC=2),
    )
    assert check(relaxed, "DQ-35").status == DQ_STATUS_OK


def test_dq36_spof_asset_requires_reviewed_record():
    """=(spof="Ano")*(stav_revize<>"Zkontrolováno") — engine SPOF any-true
    over the 05 links; a blank review state counts (sheets_out.py:481-483)."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(
            asset_row(1, review_state=None),
            asset_row(2, review_state="K revizi"),
            asset_row(3),
        ),
        process_asset_links=(
            pal(1, 1, spof="Ano", is_primary=True),
            pal(1, 2, spof="Ano", is_primary=True),
            pal(1, 3, spof="Ano", is_primary=True),
        ),
    )
    result = run_dq(graph)
    assert violating_ids(result, "DQ-36") == [1, 2]
    # DQ-09 independently lists asset 2 ("K revizi").
    assert violating_ids(result, "DQ-09") == [2]


def test_dq44_dq46_dq48_missing_department_classification_and_model():
    """The closed-list stragglers: utvar blank; klasdat and model blank OR
    "Neposouzeno" (sheets_out.py:513-515, 519-521, 525-527)."""
    result = run_dq(
        IctRegisterGraph(
            assets=(
                asset_row(1, owner_department=None),
                asset_row(2, data_classification=None),
                asset_row(3, data_classification="Neposouzeno"),
                asset_row(4, deployment_model=None),
                asset_row(5, deployment_model="Neposouzeno"),
                asset_row(6),
            )
        )
    )
    assert violating_ids(result, "DQ-44") == [1]
    assert violating_ids(result, "DQ-46") == [2, 3]
    assert violating_ids(result, "DQ-48") == [4, 5]


def test_dq51_gdpr_asset_with_no_data_or_public_classification():
    """=(gdpr="Ano")*(klasdat∈{"Bez dat / nerelevantní","Veřejná data"}) —
    sheets_out.py:538-542."""
    result = run_dq(
        IctRegisterGraph(
            assets=(
                asset_row(1, gdpr_relevance="Ano", data_classification="Bez dat / nerelevantní"),
                asset_row(2, gdpr_relevance="Ano", data_classification="Veřejná data"),
                asset_row(3, gdpr_relevance="Ano", data_classification="Důvěrná data"),
                asset_row(4, gdpr_relevance="Ne", data_classification="Veřejná data"),
            )
        )
    )
    assert violating_ids(result, "DQ-51") == [1, 2]


# ---------------------------------------------------------------------------
# Link checks (DQ-11..15, 37, 38, 40, 45)
# ---------------------------------------------------------------------------


def test_dq11_duplicate_process_asset_pairs_count_every_row():
    """05!K flags EVERY row of a duplicated (process, asset) pair
    (sheets_core.py:588-589); COUNTIF counts them all."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1), asset_row(2)),
        process_asset_links=(pal(1, 1, is_primary=True), pal(1, 1), pal(1, 2, is_primary=True)),
    )
    result = run_dq(graph)
    assert check(result, "DQ-11").count == 2
    assert all(row.route_entity_type == "process" for row in check(result, "DQ-11").violating_rows)


def test_dq12_duplicate_asset_vendor_links_key_on_the_service_code_triple():
    """10!N keys on (asset, vendor, S-code) — builder sheets_vendors.py:445-447:
    the same pair with DIFFERENT S-codes is legitimate (the seed itself ships
    Veris↔BIZ DATA twice, S02+S14)."""
    graph = IctRegisterGraph(
        assets=(asset_row(1),),
        vendors=(vendor_row(1),),
        asset_vendor_links=(
            avl(1, 1, ict_service_code="S02"),
            avl(1, 1, ict_service_code="S14"),
            avl(1, 1, ict_service_code="S14"),
        ),
    )
    result = run_dq(graph)
    assert check(result, "DQ-12").count == 2


def test_dq13_link_to_missing_rows_counts_each_broken_end():
    """The workbook sums BOTH existence SUMPRODUCTs (sheets_out.py:396-399):
    a row broken on both ends counts twice."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1),),
        process_asset_links=(pal(1, 1, is_primary=True), pal(99, 1), pal(98, 97)),
    )
    result = run_dq(graph)
    assert check(result, "DQ-13").count == 3  # one broken process end + both ends of pal(98, 97)


def test_dq14_cif_link_requires_reliance_level():
    """=(10.assetCIF="Ano")*(10.aktID<>"")*(10.mira="") — the asset-CIF column
    is the engine cascade; a missing asset row lookups to "" and never counts
    (sheets_out.py:400-402)."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1),),
        assets=(asset_row(1), asset_row(2)),
        process_asset_links=(pal(1, 1, is_primary=True),),
        vendors=(vendor_row(1),),
        asset_vendor_links=(
            avl(1, 1, reliance=None),  # CIF asset, blank reliance -> fires
            avl(2, 1, reliance=None),  # non-CIF asset -> OK
            avl(97, 1, reliance=None),  # missing asset row -> OK (lookup blank)
        ),
    )
    result = run_dq(graph)
    dq14 = check(result, "DQ-14")
    assert dq14.count == 1
    assert dq14.violating_rows[0].route_entity_type == "asset"
    assert dq14.violating_rows[0].route_entity_id == 1


def test_dq15_direct_pair_fires_until_the_vendor_has_any_sheet10_link():
    """The 11 §1 helper is =COUNTIF(10!$C:$C, vendor) — vendor-scoped, not
    pair-scoped (builder sheets_vendors.py:515-516): ANY 10-link of the vendor
    clears its §1 rows."""
    graph = IctRegisterGraph(
        processes=(process_row(1), process_row(2)),
        assets=(asset_row(1),),
        process_asset_links=(pal(1, 1, is_primary=True),),
        vendors=(vendor_row(1), vendor_row(2)),
        process_vendor_links=(
            ProcessVendorLinkInput(process_id=1, vendor_id=1),
            ProcessVendorLinkInput(process_id=2, vendor_id=2),
        ),
        asset_vendor_links=(avl(1, 2),),
    )
    result = run_dq(graph)
    dq15 = check(result, "DQ-15")
    assert dq15.count == 1
    assert dq15.violating_rows[0].route_entity_id == 1
    assert dq15.violating_rows[0].route_entity_type == "vendor"


def test_dq37_dependency_direction_uses_level_first_chars():
    """=(06.J<>"")*(06.K<>"")*(K<J) with J/K = LEFT(level, 1) of the
    dependent/supporting asset (sheets_core.py:520-523): a primary asset
    depending on a supporting one is the EXPECTED direction; the reverse
    fires. A blank level coerces to "0" (LEFT of the XLOOKUP zero), so a
    blank-level SUPPORTING asset under a leveled dependent also fires —
    the workbook quirk, verbatim."""
    a_primary = asset_row(1, asset_level="A – primární")
    b_support = asset_row(2, asset_level="B – podpůrné")
    c_infra = asset_row(3, asset_level="C – infrastrukturní")
    blank = asset_row(4, asset_level=None)
    graph = IctRegisterGraph(
        assets=(a_primary, b_support, c_infra, blank),
        asset_asset_links=(
            AssetAssetLinkInput(dependent_asset_id=1, supporting_asset_id=2),  # A->B expected
            AssetAssetLinkInput(dependent_asset_id=2, supporting_asset_id=1),  # B->A suspicious
            AssetAssetLinkInput(dependent_asset_id=3, supporting_asset_id=1),  # C->A suspicious
            AssetAssetLinkInput(dependent_asset_id=2, supporting_asset_id=4),  # "0" < "B" fires
            AssetAssetLinkInput(dependent_asset_id=4, supporting_asset_id=2),  # "B" > "0" OK
        ),
    )
    result = run_dq(graph)
    assert [(row.route_entity_id) for row in check(result, "DQ-37").violating_rows] == [2, 3, 2]


def test_dq38_chain_breaks_reuse_the_engine_sentinel_and_duplicates_mask():
    """=COUNTIF(09.K,"CHYBA ŘETĚZCE") — the engine's chain check: DUPLICITA
    wins over the break sentinel (builder sheets_vendors.py:369-370), so a
    duplicated broken row is NOT counted here."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1),),
        contracts=(VendorContractInput(id=1, vendor_id=1, contract_reference="SML-1", main_contract="Ano"),),
        sub_outsourcing=(
            SubOutsourcingInput(id=1, vendor_id=1, contract_id=1, sub_provider_name="Sub A"),
            SubOutsourcingInput(id=2, vendor_id=1, contract_id=1, predecessor_id=99, sub_provider_name="Sub B"),
            SubOutsourcingInput(id=3, vendor_id=1, contract_id=1, predecessor_id=98, sub_provider_name="Dup"),
            SubOutsourcingInput(id=4, vendor_id=1, contract_id=1, predecessor_id=97, sub_provider_name="Dup"),
        ),
    )
    result = run_dq(graph)
    dq38 = check(result, "DQ-38")
    assert [row.entity_id for row in dq38.violating_rows] == [2]
    assert dq38.violating_rows[0].route_entity_type == "vendor"
    assert dq38.violating_rows[0].label == "Sub B"


def test_dq40_existence_checks_across_06_08_09():
    """The five-part union (sheets_out.py:494-502): 06 ends, 08 vendor,
    09 predecessor, 09 sub-provider vendor reference."""
    graph = IctRegisterGraph(
        assets=(asset_row(1),),
        vendors=(vendor_row(1),),
        asset_asset_links=(
            AssetAssetLinkInput(dependent_asset_id=1, supporting_asset_id=42),  # supporting missing
            AssetAssetLinkInput(dependent_asset_id=43, supporting_asset_id=1),  # dependent missing
        ),
        contracts=(
            VendorContractInput(id=1, vendor_id=1, contract_reference="SML-1"),
            VendorContractInput(id=2, vendor_id=77, contract_reference="SML-2"),  # vendor missing
        ),
        sub_outsourcing=(
            SubOutsourcingInput(id=1, vendor_id=1, contract_id=1, predecessor_id=55, sub_provider_name="S"),
            SubOutsourcingInput(id=2, vendor_id=1, contract_id=1, sub_provider_name="T", sub_provider_vendor_id=88),
        ),
    )
    result = run_dq(graph)
    assert check(result, "DQ-40").count == 5


def test_dq45_link_significance_unassessed_or_blank():
    """=(05.procID<>"")*((vyznam="")+(vyznam="Neposouzeno")) —
    sheets_out.py:516-518 (the workbook re-seeded all 1000 imported rows to
    "Neposouzeno"; the app stores significance on the Link relation)."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1), asset_row(2), asset_row(3)),
        process_asset_links=(
            pal(1, 1, significance=None, is_primary=True),
            pal(1, 2, significance="Neposouzeno", is_primary=True),
            pal(1, 3, is_primary=True),
        ),
    )
    result = run_dq(graph)
    assert check(result, "DQ-45").count == 2


# ---------------------------------------------------------------------------
# Vendor checks (DQ-16..19, 32, 39, 41, 49, 50, 52)
# ---------------------------------------------------------------------------


def critical_vendor_graph(vendor: VendorDerivationInput, **graph_overrides: object) -> IctRegisterGraph:
    """A Vendor made tier-Kritický through the CIF cascade (asset on a CIF process)."""
    defaults: dict[str, object] = {
        "processes": (cif_process_row(1),),
        "assets": (asset_row(1),),
        "process_asset_links": (pal(1, 1, is_primary=True),),
        "vendors": (vendor,),
        "asset_vendor_links": (avl(1, vendor.id),),
    }
    defaults.update(graph_overrides)
    return IctRegisterGraph(**defaults)  # type: ignore[arg-type]


def test_standard_tier_vendor_carries_no_top_tier_obligations():
    """A bare tier-Standard vendor: DQ-16/17/18/19/32/49/50/52 all OK even
    with every obligation field blank."""
    result = run_dq(IctRegisterGraph(vendors=(vendor_row(1),)))
    for check_id in ("DQ-16", "DQ-17", "DQ-18", "DQ-19", "DQ-32", "DQ-49", "DQ-50", "DQ-52"):
        assert check(result, check_id).status == DQ_STATUS_OK, check_id


def test_critical_vendor_with_every_obligation_met_is_clean():
    vendor = obligated_vendor_row(3)
    graph = critical_vendor_graph(
        vendor,
        contracts=(
            VendorContractInput(id=1, vendor_id=3, contract_reference="SML-1", main_contract="Ano", roi_scope="Ano"),
        ),
    )
    result = run_dq(graph, risk_vendor_links=(RiskVendorLinkDqInput(risk_id=5, vendor_id=3),))
    for check_id in ("DQ-16", "DQ-17", "DQ-18", "DQ-19", "DQ-32", "DQ-39", "DQ-41", "DQ-49", "DQ-50", "DQ-52"):
        assert check(result, check_id).status == DQ_STATUS_OK, check_id


def test_bare_critical_vendor_fires_the_whole_obligation_family():
    """A CIF-supporting vendor with nothing tended fires every top-tier
    obligation: no ID code, no exit plan, no ex-ante date, no ongoing risk,
    no main contract, links without a contract, DD not started, significance
    unassessed."""
    vendor = vendor_row(3, substitutability=None)
    result = run_dq(critical_vendor_graph(vendor))
    for check_id in ("DQ-16", "DQ-17", "DQ-18", "DQ-19", "DQ-32", "DQ-41", "DQ-49", "DQ-50", "DQ-52"):
        assert violating_ids(result, check_id) == [3], check_id
    # ... but not DQ-39 (no contracts at all -> the exactly-one rule is idle).
    assert check(result, "DQ-39").status == DQ_STATUS_OK


def test_dq17_dq49_exit_plan_state_branches_are_exhaustive():
    """DQ-17 (Critical only) accepts Schválen/Testován/K revizi; DQ-49 (both
    top tiers) additionally accepts Návrh (sheets_out.py:410-413, 528-532):
    "Není vyžadován" and blank fire both."""
    states_and_expected: list[tuple[str | None, bool, bool]] = [
        (None, True, True),
        ("Není vyžadován", True, True),
        ("Vyžadován – chybí", True, True),
        ("Neposouzen", True, True),
        ("Návrh", True, False),
        ("Schválen", False, False),
        ("Testován", False, False),
        ("K revizi", False, False),
    ]
    for state, fires_17, fires_49 in states_and_expected:
        vendor = obligated_vendor_row(3, exit_plan_state=state)
        result = run_dq(
            critical_vendor_graph(
                vendor,
                contracts=(
                    VendorContractInput(
                        id=1, vendor_id=3, contract_reference="SML-1", main_contract="Ano", roi_scope="Ano"
                    ),
                ),
            ),
            risk_vendor_links=(RiskVendorLinkDqInput(risk_id=5, vendor_id=3),),
        )
        assert (check(result, "DQ-17").count == 1) is fires_17, f"DQ-17 for {state!r}"
        assert (check(result, "DQ-49").count == 1) is fires_49, f"DQ-49 for {state!r}"


def test_dq17_dq19_are_critical_only_while_dq49_covers_significant():
    """A tier-Významný vendor (substitutability trigger, no CIF) skips the
    Critical-only checks but keeps the both-tier obligations."""
    vendor = vendor_row(3, substitutability="Nenahraditelný")
    result = run_dq(IctRegisterGraph(vendors=(vendor,)))
    assert check(result, "DQ-17").status == DQ_STATUS_OK
    assert check(result, "DQ-19").status == DQ_STATUS_OK
    for check_id in ("DQ-16", "DQ-18", "DQ-32", "DQ-49", "DQ-50", "DQ-52"):
        assert violating_ids(result, check_id) == [3], check_id


def test_dq19_counts_vendor_risk_links():
    """h_rizika in-app counts Vendor<->Risk links; the workbook's Fáze=
    "Průběžná" filter has no app column (loader disposition, dq.py docstring)."""
    vendor = obligated_vendor_row(3)
    graph = critical_vendor_graph(
        vendor,
        contracts=(
            VendorContractInput(id=1, vendor_id=3, contract_reference="SML-1", main_contract="Ano", roi_scope="Ano"),
        ),
    )
    without_risk = run_dq(graph)
    assert violating_ids(without_risk, "DQ-19") == [3]
    with_risk = run_dq(graph, risk_vendor_links=(RiskVendorLinkDqInput(risk_id=9, vendor_id=3),))
    assert check(with_risk, "DQ-19").status == DQ_STATUS_OK


def test_dq32_main_contract_reference_must_resolve():
    """sml_ref is the engine's main-contract XLOOKUP: no main contract OR a
    main contract with a blank reference both leave it blank
    (sheets_out.py:468-471)."""
    vendor = obligated_vendor_row(3)
    no_main = run_dq(
        critical_vendor_graph(
            vendor,
            contracts=(VendorContractInput(id=1, vendor_id=3, contract_reference="SML-1", main_contract="Ne"),),
        ),
        risk_vendor_links=(RiskVendorLinkDqInput(risk_id=5, vendor_id=3),),
    )
    assert violating_ids(no_main, "DQ-32") == [3]

    blank_ref_main = run_dq(
        critical_vendor_graph(
            vendor,
            contracts=(VendorContractInput(id=1, vendor_id=3, contract_reference=None, main_contract="Ano"),),
        ),
        risk_vendor_links=(RiskVendorLinkDqInput(risk_id=5, vendor_id=3),),
    )
    assert violating_ids(blank_ref_main, "DQ-32") == [3]


def test_dq39_main_contract_multiplicity_is_exactly_one():
    """=(h_smluv>0)*(h_hlavni<>1) — zero mains among contracts fires, two
    mains fire, exactly one is clean, and NO contracts is idle
    (sheets_out.py:491-493)."""

    def graph_with(mains: tuple[str | None, ...]) -> IctRegisterGraph:
        return IctRegisterGraph(
            vendors=(vendor_row(1),),
            contracts=tuple(
                VendorContractInput(id=i + 1, vendor_id=1, contract_reference=f"SML-{i + 1}", main_contract=main)
                for i, main in enumerate(mains)
            ),
        )

    assert check(run_dq(graph_with(())), "DQ-39").status == DQ_STATUS_OK
    assert violating_ids(run_dq(graph_with(("Ne", None))), "DQ-39") == [1]
    assert check(run_dq(graph_with(("Ano", "Ne"))), "DQ-39").status == DQ_STATUS_OK
    assert violating_ids(run_dq(graph_with(("Ano", "Ano"))), "DQ-39") == [1]
    assert violating_ids(run_dq(graph_with(("Ano", "Ano", "Ano"))), "DQ-39") == [1]


def test_dq41_vendor_with_links_but_no_contract():
    """=(h_smluv=0)*((aktiva_n>0)+(proc_n>0)>0) — either link kind counts;
    proc_n includes the derived §2 pairs exactly as 07!proc_n does
    (sheets_out.py:503-505)."""
    # Asset-link vendor without a contract fires.
    asset_linked = IctRegisterGraph(
        assets=(asset_row(1),),
        vendors=(vendor_row(1),),
        asset_vendor_links=(avl(1, 1),),
    )
    assert violating_ids(run_dq(asset_linked), "DQ-41") == [1]

    # Manual §1 pair alone fires too.
    process_linked = IctRegisterGraph(
        processes=(process_row(1),),
        vendors=(vendor_row(1),),
        process_vendor_links=(ProcessVendorLinkInput(process_id=1, vendor_id=1),),
    )
    assert violating_ids(run_dq(process_linked), "DQ-41") == [1]

    # A contract clears it.
    with_contract = IctRegisterGraph(
        assets=(asset_row(1),),
        vendors=(vendor_row(1),),
        asset_vendor_links=(avl(1, 1),),
        contracts=(VendorContractInput(id=1, vendor_id=1, contract_reference="SML-1", main_contract="Ano"),),
    )
    assert check(run_dq(with_contract), "DQ-41").status == DQ_STATUS_OK

    # No links, no contracts: idle.
    assert check(run_dq(IctRegisterGraph(vendors=(vendor_row(1),))), "DQ-41").status == DQ_STATUS_OK


def test_dq50_due_diligence_not_started_states():
    """dd_stav ∈ {blank, Nezahájeno, Neposouzeno} fires; any progressed state
    clears (sheets_out.py:533-537)."""
    for state, fires in [
        (None, True),
        ("Nezahájeno", True),
        ("Neposouzeno", True),
        ("Probíhá", False),
        ("Dokončeno bez výhrad", False),
        ("K revizi", False),
    ]:
        vendor = obligated_vendor_row(3, due_diligence_state=state)
        result = run_dq(
            critical_vendor_graph(
                vendor,
                contracts=(
                    VendorContractInput(
                        id=1, vendor_id=3, contract_reference="SML-1", main_contract="Ano", roi_scope="Ano"
                    ),
                ),
            ),
            risk_vendor_links=(RiskVendorLinkDqInput(risk_id=5, vendor_id=3),),
        )
        assert (check(result, "DQ-50").count == 1) is fires, f"DQ-50 for {state!r}"


def test_dq52_significance_outcome_must_not_stay_ne_for_top_tiers():
    """=(tier top)*(vyz_vysledek="Ne") — the outcome is the engine's any-true
    over the six criteria: all-blank stays "Ne" and fires; one "Ano" clears;
    "Nerelevantní" answers alone do NOT clear (sheets_out.py:543-547)."""
    all_blank = obligated_vendor_row(3, significance_service_quality=None)
    result = run_dq(critical_vendor_graph(all_blank))
    assert 3 in violating_ids(result, "DQ-52")

    irrelevant_only = obligated_vendor_row(
        3, significance_service_quality="Nerelevantní", significance_financial_impact="Nerelevantní"
    )
    assert 3 in violating_ids(run_dq(critical_vendor_graph(irrelevant_only)), "DQ-52")

    one_yes = obligated_vendor_row(3, significance_service_quality="Ano")
    assert check(run_dq(critical_vendor_graph(one_yes)), "DQ-52").status == DQ_STATUS_OK


# ---------------------------------------------------------------------------
# Risk checks (DQ-20..23) — the acceptance-trio conditional exhaustively
# ---------------------------------------------------------------------------


def test_dq20_high_or_critical_net_risk_without_action_plan():
    """=(pasmo∈{Vysoké,Kritické})*(stav<>"Akceptováno")*(stav<>"Uzavřené")*
    (termin="") — bands verbatim on P_RizStr/Vys/Krit (sheets_out.py:421-424;
    band formula sheets_vendors.py:674-676)."""
    risks = (
        risk_input(1, net_score=80),  # Kritické -> fires
        risk_input(2, net_score=40),  # Vysoké -> fires
        risk_input(3, net_score=39),  # Střední -> idle
        risk_input(4, net_score=79, status_label="Akceptováno"),
        risk_input(5, net_score=79, status_label="Uzavřené"),
        risk_input(6, net_score=79, action_plan_date=date(2026, 9, 1)),
        risk_input(7, net_score=None),  # blank band -> idle
    )
    result = run_dq(risks=risks)
    assert violating_ids(result, "DQ-20") == [1, 2]
    row = check(result, "DQ-20").violating_rows[0]
    assert (row.entity_type, row.route_entity_type, row.label) == ("risk", "risk", "RIZ-001 — Riziko 1")


def test_dq20_band_thresholds_follow_the_parameter_set():
    """With P_RizVys tuned to the app's 1-25 net scale, a net 20 risk lands
    Vysoké and fires — the banding reads the live parameters."""
    result = run_dq(
        risks=(risk_input(1, net_score=20),),
        parameters=parameter_set(P_RizVys=20, P_RizKrit=25),
    )
    assert violating_ids(result, "DQ-20") == [1]


def test_dq21_acceptance_above_tolerance_requires_the_complete_trio():
    """=(odezva="Akceptace")*(vs_tolerance="NAD TOLERANCI")*((schval="")+
    (oduv="")+(datum="")>0) — every partial-trio combination fires; the
    complete trio clears; within-tolerance and no-response rows are idle
    (sheets_out.py:425-428; tolerance formula sheets_vendors.py:677-679)."""
    trio = {
        "acceptance_approver": "CRO",
        "acceptance_justification": "Náklady převyšují dopad.",
        "acceptance_date": date(2026, 6, 30),
    }
    # Exhaustive over the 7 non-empty subsets: all partials fire, full trio clears.
    for missing in (
        ("acceptance_approver",),
        ("acceptance_justification",),
        ("acceptance_date",),
        ("acceptance_approver", "acceptance_justification"),
        ("acceptance_approver", "acceptance_date"),
        ("acceptance_justification", "acceptance_date"),
    ):
        fields = {k: v for k, v in trio.items() if k not in missing}
        result = run_dq(risks=(risk_input(1, net_score=40, response="Akceptace", **fields),))
        assert violating_ids(result, "DQ-21") == [1], f"missing={missing}"

    complete = run_dq(risks=(risk_input(1, net_score=40, response="Akceptace", **trio),))
    assert check(complete, "DQ-21").status == DQ_STATUS_OK

    # Within tolerance (net 39 <= P_Tolerance 39): partial trio is idle here.
    within = run_dq(risks=(risk_input(1, net_score=39, response="Akceptace", acceptance_approver="CRO"),))
    assert check(within, "DQ-21").status == DQ_STATUS_OK

    # No acceptance response at all: DQ-21 idle (DQ-20 owns the no-plan case).
    silent = run_dq(risks=(risk_input(1, net_score=40),))
    assert check(silent, "DQ-21").status == DQ_STATUS_OK


def test_dq22_acceptance_review_overdue_uses_date_rollover_not_edate():
    """=(prezkum_do<>"")*(prezkum_do<P_RefDatum) with prezkum_do =
    DATE(YEAR+1, MONTH, DAY) — Excel DATE overflow rolls Feb 29 to Mar 1
    (sheets_vendors.py:684-686), unlike the EDATE clamp: pinned by the leap
    anchor below (an EDATE clamp would read 2025-02-28 < ref and fire)."""
    result = run_dq(
        risks=(
            risk_input(1, acceptance_date=date(2025, 6, 1)),  # due 2026-06-01 < ref -> fires
            risk_input(2, acceptance_date=date(2025, 8, 1)),  # due 2026-08-01 -> idle
            risk_input(3),  # no acceptance date -> idle
        )
    )
    assert violating_ids(result, "DQ-22") == [1]

    assert acceptance_review_due(date(2024, 2, 29)) == date(2025, 3, 1)
    leap = run_dq(
        risks=(risk_input(1, acceptance_date=date(2024, 2, 29)),),
        parameters=parameter_set(P_RefDatum=date(2025, 3, 1)),
    )
    assert check(leap, "DQ-22").status == DQ_STATUS_OK


def test_dq23_assessment_overdue_verbatim_via_direct_input():
    """=(pristi<>"")*(pristi<P_RefDatum) with pristi = EDATE(datum_pos,
    material?6:12) (sheets_vendors.py:698-700). The production Risk has no
    assessment-date column (loader maps None), so the verbatim rule is
    exercised through direct engine input — the sub_provider_vendor_id
    disposition."""
    result = run_dq(
        risks=(
            risk_input(1, assessment_date=date(2025, 11, 15), is_material="Ano"),  # +6mo = 2026-05-15 -> fires
            risk_input(2, assessment_date=date(2025, 11, 15)),  # +12mo = 2026-11-15 -> idle
            risk_input(3, assessment_date=date(2025, 5, 1)),  # +12mo = 2026-05-01 -> fires
            risk_input(4),  # no assessment date -> idle (production shape)
        )
    )
    assert violating_ids(result, "DQ-23") == [1, 3]

    # EDATE clamps to the target month's last day.
    assert next_assessment_date(date(2025, 8, 31), "Ano") == date(2026, 2, 28)
    assert next_assessment_date(date(2025, 8, 31), None) == date(2026, 8, 31)


def test_risk_dq_input_maps_the_production_risk_columns():
    """The loader seam: net_score is ciste; any trio field IS the Akceptace
    response; the complete trio is Akceptováno; archival is Uzavřené (and
    wins); the workbook-only columns stay None (dq.py module docstring)."""
    bare = risk_dq_input(
        Risk(
            id=1,
            risk_id_code="OP-001",
            name="Výpadek",
            process="IT",
            description="x",
            net_score=12,
            is_archived=False,
        )
    )
    assert bare.label == "OP-001 — Výpadek"
    assert bare.net_score == 12
    assert bare.response is None
    assert bare.status_label is None
    assert bare.action_plan_date is None and bare.assessment_date is None and bare.is_material is None

    partial = risk_dq_input(
        Risk(
            id=2,
            risk_id_code="OP-002",
            name="R",
            process="IT",
            description="x",
            net_score=20,
            is_archived=False,
            acceptance_approver="CRO",
        )
    )
    assert partial.response == "Akceptace"
    assert partial.status_label is None

    complete = risk_dq_input(
        Risk(
            id=3,
            risk_id_code="OP-003",
            name="R",
            process="IT",
            description="x",
            net_score=20,
            is_archived=False,
            acceptance_approver="CRO",
            acceptance_justification="OK",
            acceptance_date=date(2026, 6, 30),
        )
    )
    assert complete.response == "Akceptace"
    assert complete.status_label == "Akceptováno"

    archived = risk_dq_input(
        Risk(
            id=4,
            risk_id_code="OP-004",
            name="R",
            process="IT",
            description="x",
            net_score=20,
            is_archived=True,
            acceptance_approver="CRO",
            acceptance_justification="OK",
            acceptance_date=date(2026, 6, 30),
        )
    )
    assert archived.status_label == "Uzavřené"


# ---------------------------------------------------------------------------
# Integrity + scope checks (DQ-24, 25, 26, 42)
# ---------------------------------------------------------------------------


def test_dq24_duplicate_register_ids_count_every_row():
    """=SUM over the three registers' dup helpers (>1) — every row sharing a
    duplicated id counts (sheets_out.py:435-438). Impossible under DB primary
    keys; driven through direct engine input."""
    graph = IctRegisterGraph(
        processes=(process_row(1), process_row(1, l1_process="Duplikát")),
        assets=(asset_row(7),),
        vendors=(vendor_row(9), vendor_row(9)),
    )
    result = run_dq(graph)
    assert check(result, "DQ-24").count == 4
    assert check(result, "DQ-24").status == DQ_STATUS_FINDING


def test_dq25_transitive_expansion_consistency():
    """=11!TotalPairs - COUNT(materialized §2 rows) (sheets_out.py:439-441):
    zero on any well-formed graph; a §2 pair whose Process row is missing
    leaves a residue."""
    clean = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1),),
        process_asset_links=(pal(1, 1, is_primary=True),),
        vendors=(vendor_row(1),),
        asset_vendor_links=(avl(1, 1),),
    )
    assert check(run_dq(clean), "DQ-25").status == DQ_STATUS_OK

    broken = IctRegisterGraph(
        assets=(asset_row(1),),
        process_asset_links=(pal(77, 1),),  # process row absent
        vendors=(vendor_row(1),),
        asset_vendor_links=(avl(1, 1),),
    )
    result = run_dq(broken)
    assert check(result, "DQ-25").count == 1
    assert check(result, "DQ-25").violating_rows[0].route_entity_type == "asset"


def test_dq26_error_cells_map_to_the_engine_lookup_sentinels():
    """The ISERROR sweep (sheets_out.py:442-451) maps to the engine's "?"
    sentinels: vendor kat_zeme, contract vendor-name, sub-outsourcing
    contract/vendor lookups — one row per sentinel occurrence."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1, country="XX"),),  # not on ZemeList -> kat_zeme "?"
        contracts=(VendorContractInput(id=1, vendor_id=44, contract_reference="SML-1"),),  # vendor missing
        sub_outsourcing=(
            SubOutsourcingInput(id=1, vendor_id=1, contract_id=99, sub_provider_name="S"),  # contract missing
        ),
    )
    result = run_dq(graph)
    dq26 = check(result, "DQ-26")
    # vendor kat_zeme + contract vendor-name + sub contract-ref + sub vendor-name.
    assert dq26.count == 4
    assert dq26.status == DQ_STATUS_FINDING

    clean = run_dq(IctRegisterGraph(vendors=(vendor_row(1),)))
    assert check(clean, "DQ-26").status == DQ_STATUS_OK


def test_dq42_sub_outsourcing_on_contract_outside_roi_scope():
    """=COUNTIF(09.rozsah RoI,"Ne") — the engine's roi_scope lookup; a missing
    contract lookups to blank and never counts (sheets_out.py:506-509)."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1),),
        contracts=(
            VendorContractInput(id=1, vendor_id=1, contract_reference="SML-1", main_contract="Ano", roi_scope="Ne"),
            VendorContractInput(id=2, vendor_id=1, contract_reference="SML-2", roi_scope="Ano"),
        ),
        sub_outsourcing=(
            SubOutsourcingInput(id=1, vendor_id=1, contract_id=1, sub_provider_name="Mimo"),
            SubOutsourcingInput(id=2, vendor_id=1, contract_id=2, sub_provider_name="V rozsahu"),
            SubOutsourcingInput(id=3, vendor_id=1, contract_id=88, sub_provider_name="Bez smlouvy"),
        ),
    )
    result = run_dq(graph)
    dq42 = check(result, "DQ-42")
    assert [row.entity_id for row in dq42.violating_rows] == [1]
    assert dq42.violating_rows[0].label == "Mimo"
    assert dq42.violating_rows[0].route_entity_type == "vendor"


# ---------------------------------------------------------------------------
# HTTP seam — GET /ict-register/dq
# ---------------------------------------------------------------------------


def _risk_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Výpadek jádrového systému",
        "process": "Správa pojistných smluv",
        "description": "Nedostupnost klíčové aplikace.",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_dq_endpoint_reports_all_52_checks_over_an_api_seeded_register(
    client_factory, db_session, test_user_cro: User, seed_risk_types
):
    """The read-model endpoint computes the 52 checks on read over a register
    seeded THROUGH the write API — which simultaneously proves the
    mandatory-if states are writable (findings, never write blocks): the
    ownerless process, the partially-accepted over-tolerance risk, and the
    obligation-less CIF vendor are all accepted by their endpoints and then
    flagged here."""
    from app.models import GlobalConfig

    # Tune the risk banding/tolerance to the app's 1-25 net scale (the
    # parameters are the seeded ADR-008 rows, honored by the DQ engine).
    db_session.add_all(
        [
            GlobalConfig(
                key="ict_register_riz_vys",
                value="20",
                value_type="int",
                category="ict_register_parameters",
                display_name="P_RizVys",
                is_editable=False,
            ),
            GlobalConfig(
                key="ict_register_tolerance",
                value="15",
                value_type="int",
                category="ict_register_parameters",
                display_name="P_Tolerance",
                is_editable=False,
            ),
        ]
    )
    await db_session.commit()
    clear_config_cache()

    async with client_factory(user=test_user_cro) as client:
        # An ownerless CIF process without assets or BCM (DQ-01/03/05/43; its
        # missing impacts would be DQ-04, so score it fully).
        process_resp = await client.post(
            "/api/v1/processes",
            json={
                "l0_area": "Provoz a služby klientům",
                "l1_process": "Správa pojistných smluv",
                "impact_client": 5,
                "impact_market_operations": 4,
                "impact_regulatory": 4,
                "impact_financial": 4,
                "mtpd_hours": 2,
                "rto_hours": 1,
                "rpo_hours": 1,
                "interruption_impact": "Vysoký",
                "assessment_date": "2026-01-15",
            },
        )
        assert process_resp.status_code == 201, process_resp.text
        process = process_resp.json()

        # A vendor put on the Critical tier through the cascade, with every
        # top-tier obligation left blank — accepted by the API, flagged by DQ.
        vendor_resp = await client.post(
            "/api/v1/vendors",
            json={
                "name": "BIZ DATA",
                "process": "IT",
                "department_id": None,
                "outsourcing_owner_user_id": test_user_cro.id,
            },
        )
        assert vendor_resp.status_code == 201, vendor_resp.text
        vendor = vendor_resp.json()
        asset_resp = await client.post("/api/v1/assets", json={"name": "Veris"})
        assert asset_resp.status_code == 201, asset_resp.text
        asset = asset_resp.json()
        link = await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={"process_id": process["id"], "is_primary": True},
        )
        assert link.status_code == 201, link.text
        av_link = await client.post(
            f"/api/v1/assets/{asset['id']}/vendor-links",
            json={"vendor_id": vendor["id"], "ict_service_code": "S02"},
        )
        assert av_link.status_code == 201, av_link.text

        # An over-tolerance risk with a PARTIAL acceptance package (net 5x5=25
        # > tolerance 15) — the write API accepts it (#47 pin), DQ-21 flags it.
        risk = await client.post(
            "/api/v1/risks",
            json=_risk_payload(
                net_probability=5,
                net_impact=5,
                acceptance_approver="CRO",
            ),
        )
        assert risk.status_code == 201, risk.text
        risk_link = await client.post(
            f"/api/v1/risks/{risk.json()['id']}/process-links", json={"process_id": process["id"]}
        )
        assert risk_link.status_code == 201, risk_link.text

        resp = await client.get("/api/v1/ict-register/dq")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    checks_by_id = {entry["check_id"]: entry for entry in body["checks"]}

    assert [entry["check_id"] for entry in body["checks"]] == [f"DQ-{n:02d}" for n in range(1, 53)]
    assert all(entry["threshold"] == 0 for entry in body["checks"])

    # Process findings.
    assert checks_by_id["DQ-01"]["status"] == "NÁLEZ"
    assert checks_by_id["DQ-01"]["violating_rows"] == [
        {
            "entity_type": "process",
            "entity_id": process["id"],
            "label": "Správa pojistných smluv",
            "route_entity_type": "process",
            "route_entity_id": process["id"],
        }
    ]
    assert checks_by_id["DQ-05"]["status"] == "NÁLEZ"  # CIF without BCM
    assert checks_by_id["DQ-43"]["status"] == "NÁLEZ"
    assert checks_by_id["DQ-03"]["status"] == "OK"  # the CIF process has its asset

    # Vendor obligations: the cascade makes BIZ DATA Critical; everything is
    # blank, so the whole family fires with the vendor as the violating row.
    for check_id in ("DQ-16", "DQ-17", "DQ-18", "DQ-19", "DQ-32", "DQ-41", "DQ-49", "DQ-50", "DQ-52"):
        assert checks_by_id[check_id]["status"] == "NÁLEZ", check_id
        assert checks_by_id[check_id]["violating_rows"][0]["entity_id"] == vendor["id"], check_id
        assert checks_by_id[check_id]["violating_rows"][0]["route_entity_type"] == "vendor"

    # The acceptance-trio conditional (DQ-21) and the no-action-plan check
    # (DQ-20) both flag the seeded risk; the acceptance-review check does not
    # (no acceptance date).
    assert checks_by_id["DQ-21"]["status"] == "NÁLEZ"
    assert checks_by_id["DQ-21"]["violating_rows"][0]["entity_id"] == risk.json()["id"]
    assert checks_by_id["DQ-21"]["violating_rows"][0]["route_entity_type"] == "risk"
    assert checks_by_id["DQ-20"]["status"] == "NÁLEZ"
    assert checks_by_id["DQ-22"]["status"] == "OK"

    # Structural self-checks stay silent on a live register.
    for check_id in ("DQ-24", "DQ-25", "DQ-26", "DQ-31"):
        assert checks_by_id[check_id]["status"] == "OK", check_id

    # The asset side flags the seeded skeleton asset's gaps (owner, CIAA, ...).
    assert checks_by_id["DQ-06"]["status"] == "NÁLEZ"
    assert checks_by_id["DQ-29"]["status"] == "NÁLEZ"
    # ... and the CIF link without reliance (DQ-14).
    assert checks_by_id["DQ-14"]["status"] == "NÁLEZ"

    assert body["finding_count"] == sum(1 for entry in body["checks"] if entry["status"] == "NÁLEZ")


@pytest.mark.asyncio
async def test_dq_endpoint_follows_the_vendors_read_authz_pattern(
    client_factory, test_user_employee: User, test_user_platform_admin: User
):
    """vendors:read holders 200; platform admin 403; unauthenticated 401 —
    the standard business-entity read pattern of the reference surface."""
    async with client_factory(user=test_user_employee) as client:
        resp = await client.get("/api/v1/ict-register/dq")
        assert resp.status_code == 200

    async with client_factory(user=test_user_platform_admin) as client:
        resp = await client.get("/api/v1/ict-register/dq")
        assert resp.status_code == 403

    async with client_factory() as client:
        resp = await client.get("/api/v1/ict-register/dq")
        assert resp.status_code == 401
