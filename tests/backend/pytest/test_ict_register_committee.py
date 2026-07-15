"""ICT Risk Committee read model — the workbook's 16_Dashboard + 18_CRO_přehled (issue #51).

Two seams, mirroring the DQ suite (#50):

1. **The pure committee engine** (``derive_ict_register_committee``): golden,
   table-driven graphs asserting tile-exact values per
   docs/dora-ict-register/dashboard-cro-tile-inventory.md — every quoted
   formula reproduced over the in-app graph, consuming the #48/#49 derivation
   and the #50 DQ results (the DQ-equivalent tiles are the same derivation
   invoked once, per the inventory §4 precision note). Explicit goldens cover
   the tricky mechanics: the Top-10 h_zebr tiebreaker (net DESC, register row
   DESC — inventory §3), blank-net exclusion, the Top-5 N() coercion, the
   heatmap cell-sum == risk-count gate-3 invariant, migration-matrix band
   edges, narrative sentence values, and DQ-count consistency with the #50
   surface.

2. **The HTTP seam** via ``client_factory``: GET /ict-register/committee is
   gated by the NEW ``ict_committee:read`` resource permission (executive /
   oversight roles only — inventory audience note; #38 authz decision), with
   an ADR-006 redacting snapshot over an API-seeded mini-graph, plus the
   role-by-role authz matrix and the permission-sync migration parity pin.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.rbac_seed_contract import RBAC_ROLE_PERMISSIONS, expand_permission_keys
from app.models import Permission, Role, RolePermission, User
from app.models.user import AccessScope
from app.services._ict_register_lifecycle.committee import (
    IctCommitteeGraph,
    IctRegisterCommittee,
    derive_ict_register_committee,
)
from app.services._ict_register_lifecycle.derivation import (
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
from app.services._ict_register_lifecycle.dq import (
    IctRegisterDqGraph,
    RiskAssetLinkDqInput,
    RiskDqInput,
    RiskProcessLinkDqInput,
    RiskVendorLinkDqInput,
    derive_ict_register_dq,
)
from app.services._ict_register_lifecycle.roi_readiness import (
    RoiProcessSupplement,
    RoiRegisterSupplement,
)
from app.services._ict_register_reference.parameters import (
    ICT_WORKBOOK_PARAMETERS,
    IctParameterValue,
    IctWorkbookParameterSet,
)

# ---------------------------------------------------------------------------
# Harness — parameter set and row builders (the DQ-suite shapes).
# ---------------------------------------------------------------------------


def parameter_set(**overrides: IctParameterValue) -> IctWorkbookParameterSet:
    """The verbatim workbook parameter set (spec section 6), with overrides."""
    values: dict[str, IctParameterValue] = {p.name: p.default for p in ICT_WORKBOOK_PARAMETERS}
    values.update(overrides)
    return IctWorkbookParameterSet(version=str(values["P_Verze"]), values=values)


# A filled entity LEI standing in for a register whose P_LEI placeholder has
# been replaced; the fresh-DB placeholder default gaps the LEI-bearing RoI
# templates and is pinned in test_ict_register_roi_readiness.py.
REAL_LEI = "315700FFGL2JGHVWJC12"


def run_committee(
    graph: IctRegisterGraph | None = None,
    *,
    risks: tuple[RiskDqInput, ...] = (),
    risk_process_links: tuple[RiskProcessLinkDqInput, ...] = (),
    risk_asset_links: tuple[RiskAssetLinkDqInput, ...] = (),
    risk_vendor_links: tuple[RiskVendorLinkDqInput, ...] = (),
    risk_threat_labels: dict[int, str] | None = None,
    roi_supplement: RoiRegisterSupplement | None = None,
    parameters: IctWorkbookParameterSet | None = None,
) -> IctRegisterCommittee:
    return derive_ict_register_committee(
        IctCommitteeGraph(
            dq_graph=IctRegisterDqGraph(
                graph=graph or IctRegisterGraph(),
                risks=risks,
                risk_process_links=risk_process_links,
                risk_asset_links=risk_asset_links,
                risk_vendor_links=risk_vendor_links,
            ),
            risk_threat_labels=risk_threat_labels or {},
            roi_supplement=roi_supplement or RoiRegisterSupplement(),
        ),
        # The harness exercises a register whose entity LEI has been filled in;
        # the fresh-DB placeholder default is pinned in the RoI-readiness tests.
        parameters or parameter_set(P_LEI=REAL_LEI),
    )


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
        "bcm_link": "yes",
        "interruption_impact": "medium",
        "assessment_date": None,
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
    """A DQ-clean Asset (closed-list stragglers answered, CIAA complete)."""
    defaults: dict[str, object] = {
        "id": aid,
        "name": f"Aktivum {aid}",
        "asset_type": "application",
        "asset_level": "supporting",
        "business_owner": "Petr Svoboda",
        "ict_owner": "IT Operations",
        "owner_department": "Úsek IT",
        "gdpr_relevance": "no",
        "ai_relevance": "no",
        "data_classification": "internal",
        "deployment_model": "on_premise",
        "confidentiality_rating": 2,
        "integrity_rating": 2,
        "availability_rating": 2,
        "authenticity_rating": 2,
        "impact_client": 2,
        "impact_regulatory": 2,
        "internet_exposed": "no",
        "lifecycle_state": "operational",
        "review_state": "reviewed",
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
# 16_Dashboard §1.1 — "Stav registrů": 10 register-state tiles.
# ---------------------------------------------------------------------------


def test_empty_register_reads_all_dashboard_tiles_zero():
    result = run_committee()
    state = result.dashboard.register_state

    assert state.process_count == 0
    assert state.asset_count == 0
    assert state.process_asset_link_count == 0
    assert state.vendor_count == 0
    assert state.assets_pending_review_count == 0
    assert state.direct_process_vendor_link_count == 0
    assert state.contracts_in_roi_scope_count == 0
    assert state.sub_outsourcing_link_count == 0
    assert state.assets_without_data_classification_count == 0
    assert state.top_tier_vendors_without_orderly_exit_count == 0


def test_register_state_tiles_reproduce_the_ten_dashboard_formulas():
    """Inventory §1.1 rows 7-16 — each tile's COUNT formula over the graph.

    Hand-worked expectations: 2 processes, 2 assets, 2 sheet-05 links,
    2 vendors; 1 asset "K revizi" (row 11 ≡ DQ-09) which also misses its data
    classification (row 15 ≡ DQ-46); 1 direct §1 pair (row 12); 1 of 3
    contracts both referenced AND RoI-scoped (row 13, COUNTIFS B<>"" K="Ano");
    1 sub-outsourcing row (row 14); 1 Significant-tier vendor with a blank
    exit-plan state (row 16 ≡ DQ-49, orderly-state exclusion list).
    """
    graph = IctRegisterGraph(
        processes=(process_row(1), process_row(2)),
        assets=(
            asset_row(1),
            asset_row(2, review_state="review_required", data_classification=None),
        ),
        process_asset_links=(pal(1, 1, is_primary=True), pal(2, 1)),
        vendors=(
            vendor_row(1),
            vendor_row(2, substitutability="Nenahraditelný"),
        ),
        process_vendor_links=(ProcessVendorLinkInput(process_id=1, vendor_id=1),),
        contracts=(
            VendorContractInput(
                id=1, vendor_id=1, contract_reference="SML-2020-001", main_contract="Ano", roi_scope="Ano"
            ),
            VendorContractInput(
                id=2, vendor_id=1, contract_reference="SML-2020-002", main_contract="Ne", roi_scope="Ne"
            ),
            VendorContractInput(id=3, vendor_id=2, contract_reference=None, roi_scope="Ano"),
        ),
        sub_outsourcing=(
            SubOutsourcingInput(id=1, vendor_id=1, contract_id=1, sub_provider_name="Subdodavatel s.r.o."),
        ),
    )

    state = run_committee(graph).dashboard.register_state

    assert state.process_count == 2
    assert state.asset_count == 2
    assert state.process_asset_link_count == 2
    assert state.vendor_count == 2
    assert state.assets_pending_review_count == 1
    assert state.direct_process_vendor_link_count == 1
    assert state.contracts_in_roi_scope_count == 1
    assert state.sub_outsourcing_link_count == 1
    assert state.assets_without_data_classification_count == 1
    assert state.top_tier_vendors_without_orderly_exit_count == 1


def test_dq_equivalent_tiles_agree_with_the_dq_engine_counts():
    """Inventory §4 precision note: Dashboard rows 11/15/16 ≡ DQ-09/46/49 —
    one derivation invoked once, so the committee counts EQUAL the DQ counts."""
    graph = IctRegisterGraph(
        assets=(
            asset_row(1, review_state="review_required"),
            asset_row(2, data_classification="not_assessed"),
            asset_row(3, data_classification=None),
        ),
        vendors=(
            vendor_row(1, substitutability="Nenahraditelný", exit_plan_state="Ukončen"),
        ),
    )
    committee = run_committee(graph)
    dq = derive_ict_register_dq(IctRegisterDqGraph(graph=graph), parameter_set())
    dq_counts = {entry.check_id: entry.count for entry in dq.checks}

    state = committee.dashboard.register_state
    assert state.assets_pending_review_count == dq_counts["DQ-09"] == 1
    assert state.assets_without_data_classification_count == dq_counts["DQ-46"] == 2
    assert state.top_tier_vendors_without_orderly_exit_count == dq_counts["DQ-49"] == 1


# ---------------------------------------------------------------------------
# 16_Dashboard §1.2 — "Klíčové metriky": 6 key-metric rows.
# ---------------------------------------------------------------------------


def _key_metric_graph() -> IctRegisterGraph:
    """2 CIF processes (one asset-backed), 1 unscored process, 1 critical
    asset, 1 Critical-tier vendor (via the CIF cascade)."""
    return IctRegisterGraph(
        processes=(
            cif_process_row(1),
            cif_process_row(2),
            process_row(
                3,
                impact_client=None,
                impact_market_operations=None,
                impact_regulatory=None,
                impact_financial=None,
            ),
        ),
        assets=(asset_row(1),),
        process_asset_links=(pal(1, 1, is_primary=True),),
        vendors=(vendor_row(1),),
        asset_vendor_links=(avl(1, 1),),
    )


def test_key_metric_rows_reproduce_the_six_dashboard_formulas():
    """Inventory §1.2 rows 19-24. Hand-worked: p1/p2 score 21 -> Kritická ->
    CIF Ano (row 19 = 2); p3 unscored (row 20 ≡ DQ-04 = 1); a1 inherits p1's
    Kritická through the primary cascade (row 21 = 1); v1 rides the CIF chain
    to Kritický dodavatel (row 22 = 1); net 40 > P_Tolerance 39 is above,
    39 is within, blank never counts (row 23 = 1)."""
    result = run_committee(
        _key_metric_graph(),
        risks=(
            risk_input(1, net_score=40),
            risk_input(2, net_score=39),
            risk_input(3),
        ),
    )
    metrics = result.dashboard.key_metrics

    assert metrics.cif_process_count == 2
    assert metrics.processes_without_impact_assessment_count == 1
    assert metrics.critical_asset_count == 1
    assert metrics.critical_vendor_count == 1
    assert metrics.risks_above_tolerance_count == 1


def test_open_dq_findings_tile_consumes_the_dq_engine_tally_on_both_sheets():
    """Inventory §4: one DQ tile per sheet, both = the NÁLEZ count of the #50
    engine — asserted against the independently-run DQ surface."""
    graph = _key_metric_graph()
    committee = run_committee(graph)
    dq = derive_ict_register_dq(IctRegisterDqGraph(graph=graph), parameter_set())

    assert dq.finding_count > 0  # the mini-graph leaves real findings open
    assert committee.dashboard.key_metrics.open_dq_finding_count == dq.finding_count
    assert committee.cro.kpi.open_dq_finding_count == dq.finding_count

    empty = run_committee()
    assert empty.dashboard.key_metrics.open_dq_finding_count == 0
    assert empty.cro.kpi.open_dq_finding_count == 0


# ---------------------------------------------------------------------------
# 18_CRO_přehled §2.1 — KPI strip: 6 tiles.
# ---------------------------------------------------------------------------


def test_cro_kpi_strip_reproduces_the_six_formulas():
    """Inventory §2.1. Hand-worked: 4 risk rows exist (A7); one carries the
    material flag (C7); nets 40/45 are above tolerance 39 (E7); of those only
    the Akceptace-response row counts as accepted (G7); one CIF process has a
    BCM gap (I7 ≡ DQ-05, COUNTIF("GAP*"))."""
    result = run_committee(
        IctRegisterGraph(processes=(cif_process_row(1, bcm_link=None), cif_process_row(2))),
        risks=(
            risk_input(1, net_score=40, response="Akceptace", is_material="Ano"),
            risk_input(2, net_score=45),
            risk_input(3, net_score=10),
            risk_input(4),
        ),
    )
    kpi = result.cro.kpi

    assert kpi.risk_count == 4
    assert kpi.material_risk_count == 1
    assert kpi.risks_above_tolerance_count == 2
    assert kpi.accepted_above_tolerance_count == 1
    assert kpi.cif_without_bcm_count == 1


# ---------------------------------------------------------------------------
# 18_CRO_přehled §2.2 — the 5×5 gross heatmap (pravděpodobnost × hodnota).
# ---------------------------------------------------------------------------


def test_heatmap_counts_by_probability_rows_5_down_to_1_and_value_columns_1_to_5():
    """Inventory §2.2: cell = COUNTIFS(13.pravdep = i, 13.hodnota_subj = j);
    rows render probability 5 down to 1, columns value 1 to 5. The value-1
    column is reachable in-app (the workbook rendered it structurally zero
    but kept the full grid)."""
    result = run_committee(
        risks=(
            risk_input(1, probability=5, subject_value=1),
            risk_input(2, probability=5, subject_value=5),
            risk_input(3, probability=5, subject_value=5),
            risk_input(4, probability=1, subject_value=3),
            risk_input(5, probability=3, subject_value=3),
        ),
    )
    heatmap = result.cro.heatmap

    assert [row.probability for row in heatmap.rows] == [5, 4, 3, 2, 1]
    by_probability = {row.probability: row.cells for row in heatmap.rows}
    assert by_probability[5] == (1, 0, 0, 0, 2)
    assert by_probability[3] == (0, 0, 1, 0, 0)
    assert by_probability[1] == (0, 0, 1, 0, 0)
    assert by_probability[4] == (0, 0, 0, 0, 0)
    assert by_probability[2] == (0, 0, 0, 0, 0)


def test_heatmap_cell_sum_equals_risk_count_gate_3_invariant():
    """The builder's own gate 3 (verify.py:200-204, inventory §2.2): every
    Risk with pravdep and hodnota_subj filled lands in exactly one cell —
    blank-axis rows fall out of the grid."""
    result = run_committee(
        risks=(
            risk_input(1, probability=5, subject_value=2),
            risk_input(2, probability=2, subject_value=2),
            risk_input(3, probability=4, subject_value=4),
            risk_input(4, probability=None, subject_value=3),
            risk_input(5, probability=3, subject_value=None),
        ),
    )

    filled = 3  # rows 1-3; rows 4-5 miss an axis and never land
    assert sum(sum(row.cells) for row in result.cro.heatmap.rows) == filled


# ---------------------------------------------------------------------------
# 18_CRO_přehled §2.3 — the 4×4 gross→net band migration matrix.
# ---------------------------------------------------------------------------


def test_migration_matrix_band_edges_follow_the_verbatim_thresholds():
    """Inventory §2.3 over the workbook bands (spec 2.4): >=P_RizKrit(80)
    Kritické, >=P_RizVys(40) Vysoké, >=P_RizStr(15) Střední, else Nízké —
    same bands for gross and net. Edge values pin every boundary: 14|15 and
    39|40 and 79|80."""
    result = run_committee(
        risks=(
            risk_input(1, gross_score=14, net_score=14),   # Nízké -> Nízké
            risk_input(2, gross_score=15, net_score=14),   # Střední -> Nízké
            risk_input(3, gross_score=39, net_score=15),   # Střední -> Střední
            risk_input(4, gross_score=40, net_score=39),   # Vysoké -> Střední
            risk_input(5, gross_score=79, net_score=40),   # Vysoké -> Vysoké
            risk_input(6, gross_score=80, net_score=79),   # Kritické -> Vysoké
            risk_input(7, gross_score=80, net_score=80),   # Kritické -> Kritické
            risk_input(8, gross_score=None, net_score=10),  # no gross band: out
            risk_input(9, gross_score=90, net_score=None),  # no net band: out
        ),
    )
    matrix = result.cro.migration_matrix

    assert [row.gross_band for row in matrix.rows] == ["Nízké", "Střední", "Vysoké", "Kritické"]
    by_gross = {row.gross_band: row.cells for row in matrix.rows}
    # cells ordered by net band Nízké, Střední, Vysoké, Kritické
    assert by_gross["Nízké"] == (1, 0, 0, 0)
    assert by_gross["Střední"] == (1, 1, 0, 0)
    assert by_gross["Vysoké"] == (0, 1, 1, 0)
    assert by_gross["Kritické"] == (0, 0, 1, 1)


# ---------------------------------------------------------------------------
# 18_CRO_přehled §2.4 — "Top 10 rizik podle čistého rizika" (h_zebr, §3).
# ---------------------------------------------------------------------------


def test_top_risks_rank_by_net_desc_with_ties_to_the_later_register_row():
    """Inventory §3: key = ciste + ROW()/1e6 — net DESC, and among equal nets
    the LATER register row takes the better rank; blank-net risks never rank
    (h_zebr="" text keys are ignored by LARGE). Display columns per §2.4."""
    graph = IctRegisterGraph(
        processes=(process_row(1),),
        assets=(asset_row(1),),
        vendors=(vendor_row(1),),
    )
    result = run_committee(
        graph,
        risks=(
            risk_input(1, code="RIZ-001", net_score=50, gross_score=60, status_label="Akceptováno"),
            risk_input(2, code="RIZ-002", net_score=50, gross_score=55),
            risk_input(3, code="RIZ-003", net_score=80, gross_score=100),
            risk_input(4, code="RIZ-004", net_score=None, gross_score=90),
            risk_input(5, code="RIZ-005", net_score=10, gross_score=12),
            risk_input(6, code="RIZ-006", net_score=10, gross_score=12),
        ),
        risk_process_links=(
            RiskProcessLinkDqInput(risk_id=1, process_id=1),
            RiskProcessLinkDqInput(risk_id=3, process_id=1),
            RiskProcessLinkDqInput(risk_id=6, process_id=99),
        ),
        risk_asset_links=(
            RiskAssetLinkDqInput(risk_id=2, asset_id=1),
            RiskAssetLinkDqInput(risk_id=3, asset_id=1),
        ),
        risk_vendor_links=(RiskVendorLinkDqInput(risk_id=5, vendor_id=1),),
        risk_threat_labels={1: "Ransomware", 3: "Výpadek datového centra"},
    )
    top = result.cro.top_risks

    # 5 ranked rows: the blank-net RIZ-004 never ranks.
    assert [entry.risk_id for entry in top] == [3, 2, 1, 6, 5]
    assert [entry.rank for entry in top] == [1, 2, 3, 4, 5]

    first = top[0]
    assert first.code == "RIZ-003"
    # Both a process and an asset link: the SubjektTyp order (Proces first).
    assert first.subject_label == "Proces 1"
    assert first.threat_label == "Výpadek datového centra"
    assert first.gross_score == 100
    assert first.net_score == 80
    assert first.net_band == "Kritické"
    assert first.vs_tolerance == "NAD TOLERANCI"
    assert first.status_label is None

    by_id = {entry.risk_id: entry for entry in top}
    assert by_id[2].subject_label == "Aktivum 1"
    assert by_id[1].status_label == "Akceptováno"
    assert by_id[1].threat_label == "Ransomware"
    assert by_id[5].subject_label == "Dodavatel 1"
    assert by_id[5].vs_tolerance == "V toleranci"
    assert by_id[5].net_band == "Nízké"
    # Link onto a missing register row: the workbook XLOOKUP "?" fallback.
    assert by_id[6].subject_label == "?"
    assert by_id[6].threat_label is None


def test_top_risks_truncate_at_ten_positions():
    """§2.4: the # column holds 10 static positions; with more ranked rows the
    table keeps the best 10."""
    result = run_committee(
        risks=tuple(risk_input(rid, net_score=100 - rid) for rid in range(1, 13)),
    )
    top = result.cro.top_risks

    assert len(top) == 10
    assert [entry.rank for entry in top] == list(range(1, 11))
    assert [entry.risk_id for entry in top] == list(range(1, 11))  # nets 99..89


# ---------------------------------------------------------------------------
# 18_CRO_přehled §2.5 — "Koncentrace: top 5 dodavatelů dle CIF vazeb".
# ---------------------------------------------------------------------------


def test_top_vendors_rank_by_cif_pairs_with_n_coercion_so_zero_cif_vendors_still_rank():
    """Inventory §3(4): the vendor key is N(cif_proc_n) + ROW()/1e6 — every
    existing Vendor row ranks, zero-CIF vendors among themselves by
    descending row; 6 vendors -> the best 5 positions."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1), cif_process_row(2), process_row(3)),
        vendors=tuple(vendor_row(vid) for vid in range(1, 7)),
        process_vendor_links=(
            ProcessVendorLinkInput(process_id=1, vendor_id=4),
            ProcessVendorLinkInput(process_id=2, vendor_id=4),
            ProcessVendorLinkInput(process_id=1, vendor_id=5),
            ProcessVendorLinkInput(process_id=3, vendor_id=1),  # non-CIF pair: counts 0
        ),
    )
    top = run_committee(graph).cro.top_vendors

    assert [entry.vendor_id for entry in top] == [4, 5, 6, 3, 2]
    assert [entry.rank for entry in top] == [1, 2, 3, 4, 5]
    assert [entry.cif_process_count for entry in top] == [2, 1, 0, 0, 0]
    assert top[0].name == "Dodavatel 4"
    # The CIF §1 pairs put v4/v5 on the Critical tier; the rest stay Standard.
    assert [entry.tier for entry in top] == [
        "Kritický dodavatel",
        "Kritický dodavatel",
        "Standardní dodavatel",
        "Standardní dodavatel",
        "Standardní dodavatel",
    ]


# ---------------------------------------------------------------------------
# 18_CRO_přehled §2.6 — the five live narrative sentences (values only; the
# frontend composes and localizes the sentences).
# ---------------------------------------------------------------------------


def test_narrative_sentence_values_reproduce_the_five_live_formulas():
    """Inventory §2.6 A34-A38. Hand-worked: 2 CIF of 3 processes, 1 CIF with
    BCM=Ano; 2 Critical vendors, 1 with a Schválen/Testován exit (A35 is
    stricter than DQ-49's orderly set — K revizi does NOT count), 1 with an
    identifier; nets 40/45 above tolerance 39, 1 of them Akceptace; 2 chain
    links, and via the inline sub-provider identities v3 sits at rank 2 (B)
    and v4 deeper (C)."""
    graph = IctRegisterGraph(
        processes=(
            cif_process_row(1),                    # CIF, bcm Ano
            cif_process_row(2, bcm_link="no"),     # CIF, no BCM evidence
            process_row(3),                        # non-CIF, bcm Ano
        ),
        vendors=(
            vendor_row(1, exit_plan_state="Schválen", identifier_value="12345678"),
            vendor_row(2, exit_plan_state="K revizi"),
            vendor_row(3),
            vendor_row(4),
            vendor_row(5),
        ),
        process_vendor_links=(
            ProcessVendorLinkInput(process_id=1, vendor_id=1),
            ProcessVendorLinkInput(process_id=1, vendor_id=2),
        ),
        # The chain hangs off the NON-CIF v5 so its sub-providers v3/v4 stay
        # off the Critical tier (a CIF prime would propagate cif_ret down the
        # chain and tier them Critical — the workbook's own rule).
        contracts=(
            VendorContractInput(id=1, vendor_id=5, contract_reference="SML-2020-001", main_contract="Ano"),
        ),
        sub_outsourcing=(
            SubOutsourcingInput(
                id=1, vendor_id=5, contract_id=1, sub_provider_name="Sub A", sub_provider_vendor_id=3
            ),
            SubOutsourcingInput(
                id=2,
                vendor_id=5,
                contract_id=1,
                predecessor_id=1,
                sub_provider_name="Sub B",
                sub_provider_vendor_id=4,
            ),
        ),
    )
    narratives = run_committee(
        graph,
        risks=(
            risk_input(1, net_score=40, response="Akceptace"),
            risk_input(2, net_score=45),
        ),
    ).cro.narratives

    # A34 — CIF coverage.
    assert narratives.cif_process_count == 2
    assert narratives.process_count == 3
    assert narratives.cif_with_bcm_count == 1
    # A35 — Critical-Vendor readiness.
    assert narratives.critical_vendor_count == 2
    assert narratives.critical_vendors_with_functional_exit_count == 1
    assert narratives.critical_vendors_with_identifier_count == 1
    # A36 / A38 — tolerance breaches and the board-approval caveat parameter.
    assert narratives.tolerance == 39
    assert narratives.risks_above_tolerance_count == 2
    assert narratives.accepted_above_tolerance_count == 1
    # A37 — sub-outsourcing chains.
    assert narratives.sub_outsourcing_link_count == 2
    assert narratives.vendors_in_sub_role_count == 2


# ---------------------------------------------------------------------------
# 18_CRO_přehled §2.7 — the two chart-staging aggregates.
# ---------------------------------------------------------------------------


def test_assets_by_resulting_criticality_aggregate():
    """§2.7 "Aktiva dle výsledné kritičnosti": COUNTIF(04.vysledna, band) over
    Nízká/Střední/Vysoká/Kritická; an asset with no derivable class lands in
    no band."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1),),
        assets=(
            asset_row(1),
            asset_row(
                2,
                confidentiality_rating=None,
                integrity_rating=None,
                availability_rating=None,
                authenticity_rating=None,
                impact_client=None,
                impact_regulatory=None,
            ),
        ),
        process_asset_links=(pal(1, 1, is_primary=True),),
    )
    aggregate = run_committee(graph).cro.assets_by_criticality

    assert [entry.band for entry in aggregate] == ["Nízká", "Střední", "Vysoká", "Kritická"]
    by_band = {entry.band: entry.count for entry in aggregate}
    assert by_band["Kritická"] == 1  # a1 inherits the primary process's class
    assert sum(by_band.values()) == 1  # a2 has no class and lands nowhere


def test_risks_by_band_gross_vs_net_aggregate():
    """§2.7 "Rizika dle pásem": two independent COUNTIF columns — a risk with
    only one side scored still counts on that side."""
    aggregate = run_committee(
        risks=(
            risk_input(1, gross_score=80, net_score=40),
            risk_input(2, gross_score=20, net_score=10),
            risk_input(3, gross_score=None, net_score=5),
        ),
    ).cro.risks_by_band

    assert [entry.band for entry in aggregate] == ["Nízké", "Střední", "Vysoké", "Kritické"]
    by_band = {entry.band: (entry.gross_count, entry.net_count) for entry in aggregate}
    assert by_band["Nízké"] == (0, 2)
    assert by_band["Střední"] == (1, 0)
    assert by_band["Vysoké"] == (0, 1)
    assert by_band["Kritické"] == (1, 0)


# ---------------------------------------------------------------------------
# RoI-readiness element (issue #52) + the committee-adjacent review items.
# ---------------------------------------------------------------------------


def test_committee_carries_the_roi_readiness_element():
    """#52: the committee read model gains the 15-template RoI-readiness
    block, computed over the SAME graph and derivation as the tiles (the
    per-template mechanics are golden-covered in the dedicated suite)."""
    result = run_committee(
        IctRegisterGraph(processes=(process_row(1, rto_hours=None),)),
        roi_supplement=RoiRegisterSupplement(
            processes={1: RoiProcessSupplement(f_code="F1", licensed_activity="non_life_insurance")}
        ),
    )
    roi = result.roi_readiness

    assert [template.code for template in roi.templates][:3] == ["B_01.01", "B_01.02", "B_01.03"]
    assert len(roi.templates) == 15
    by_code = {template.code: template for template in roi.templates}
    assert by_code["B_06.01"].row_count == 1
    (gap,) = by_code["B_06.01"].gap_rows
    assert gap.label == "F1 — Proces 1"
    assert [missing.code for missing in gap.missing] == ["B_06.01.0080"]


def test_material_kpi_is_marked_production_inert_never_a_silent_zero():
    """Review item: 13!material has NO app column (the loader maps it None
    forever — the DQ-23 disposition). The flag derives from the DATA — inert
    iff no risk row carries a materiality signal — so the production-shaped
    graph reads "not yet measurable" (never a silent 0), while wiring a
    future materiality column automatically un-mutes the KPI."""
    production_shaped = run_committee(risks=(risk_input(1), risk_input(2))).cro.kpi
    assert production_shaped.material_risk_count == 0
    assert production_shaped.material_risk_count_production_inert is True
    assert production_shaped.material_risk_count_production_inert_reason
    assert "materiality" in production_shaped.material_risk_count_production_inert_reason

    measured = run_committee(
        risks=(risk_input(1, is_material="Ano"), risk_input(2))
    ).cro.kpi
    assert measured.material_risk_count == 1  # the verbatim rule, golden-covered
    assert measured.material_risk_count_production_inert is False
    assert measured.material_risk_count_production_inert_reason is None


def test_dq_engine_accepts_a_precomputed_derivation_with_identical_results():
    """Perf seam (#52 review item): the committee derives the register once
    and hands the result to the DQ engine — behaviour must be IDENTICAL to
    the DQ engine deriving for itself."""
    from app.services._ict_register_lifecycle.derivation import derive_ict_register

    graph = _key_metric_graph()
    dq_graph = IctRegisterDqGraph(graph=graph, risks=(risk_input(1, net_score=40),))
    params = parameter_set()

    self_derived = derive_ict_register_dq(dq_graph, params)
    pre_derived = derive_ict_register_dq(
        dq_graph, params, derivation=derive_ict_register(graph, params)
    )

    assert pre_derived == self_derived


# ---------------------------------------------------------------------------
# HTTP seam — the NEW ict_committee resource permission (#38 authz decision:
# executive/oversight roles only; platform admin stays excluded).
# ---------------------------------------------------------------------------


async def _seed_contract_user(db_session: AsyncSession, role_name: str) -> User:
    """A user whose role holds exactly the canonical RBAC seed grants."""
    role = Role(name=role_name, display_name=role_name, description=f"Seed-contract {role_name}")
    db_session.add(role)
    await db_session.commit()

    permissions = []
    for key in sorted(expand_permission_keys(RBAC_ROLE_PERMISSIONS[role_name])):
        resource, action = key.split(":", maxsplit=1)
        permissions.append(Permission(resource=resource, action=action, description=key))
    db_session.add_all(permissions)
    await db_session.commit()
    db_session.add_all(RolePermission(role_id=role.id, permission_id=p.id) for p in permissions)
    await db_session.commit()

    user = User(
        name=f"Seeded {role_name}",
        email=f"seeded.{role_name}@test.com",
        role_id=role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(User.id == user.id)
    )
    return result.scalar_one()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role_name", ["ceo", "cfo", "coo", "risk_manager", "compliance", "internal_audit"]
)
async def test_committee_endpoint_allows_every_granted_seed_role(
    client_factory, db_session: AsyncSession, role_name: str
):
    """Each executive/oversight role holds ict_committee:read in the RBAC seed
    contract and reads the committee page."""
    user = await _seed_contract_user(db_session, role_name)
    async with client_factory(user=user) as client:
        resp = await client.get("/api/v1/ict-register/committee")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_committee_endpoint_denies_ungranted_and_anonymous_callers(
    client_factory, db_session: AsyncSession, test_user_employee: User, test_user_platform_admin: User
):
    """NOT employee, NOT department_head, NOT viewer (#38 decision as landed);
    the platform admin holds no business permissions; anonymous is 401. CRO
    rides its *:* wildcard."""
    async with client_factory(user=test_user_employee) as client:
        resp = await client.get("/api/v1/ict-register/committee")
        assert resp.status_code == 403
        # The RoI-readiness element rides the same permission (#52): a denied
        # caller gets no committee payload at all.
        assert "roi_readiness" not in resp.json()

    for role_name in ("department_head", "viewer"):
        user = await _seed_contract_user(db_session, role_name)
        async with client_factory(user=user) as client:
            resp = await client.get("/api/v1/ict-register/committee")
            assert resp.status_code == 403, role_name

    async with client_factory(user=test_user_platform_admin) as client:
        resp = await client.get("/api/v1/ict-register/committee")
        assert resp.status_code == 403

    async with client_factory() as client:
        resp = await client.get("/api/v1/ict-register/committee")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_committee_endpoint_allows_cro_via_wildcard(client_factory, test_user_cro: User):
    async with client_factory(user=test_user_cro) as client:
        resp = await client.get("/api/v1/ict-register/committee")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
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
async def test_vendor_api_identifier_rules_flow_into_committee_roi_readiness(
    client_factory,
    test_user_cro: User,
    person_type: str,
    country: str,
    identifier_type: str | None,
    identifier_value: str | None,
    ready: bool,
):
    async with client_factory(user=test_user_cro) as client:
        created = await client.post(
            "/api/v1/vendors",
            json={
                "name": "Provider One",
                "process": "IT",
                "outsourcing_owner_user_id": test_user_cro.id,
                "person_type": person_type,
                "country": country,
                "identifier_type": identifier_type,
                "identifier_value": identifier_value,
            },
        )
        assert created.status_code == 201, created.text

        committee = await client.get("/api/v1/ict-register/committee")

    assert committee.status_code == 200, committee.text
    b0501 = next(
        template
        for template in committee.json()["roi_readiness"]["templates"]
        if template["code"] == "B_05.01"
    )
    identifier_gaps = {
        missing["key"]
        for gap in b0501["gap_rows"]
        if gap["entity_id"] == created.json()["id"]
        for missing in gap["missing"]
        if missing["key"].startswith("provider_identification_")
    }
    assert identifier_gaps == (
        set() if ready else {"provider_identification_code", "provider_identification_type"}
    )


def _risk_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Výpadek jádrového systému",
        "process": "Správa pojistných smluv",
        "description": "Nedostupnost klíčové aplikace.",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Permission-sync migration parity (ADR-010; the repo convention for every
# new resource — threats z1a2b3c4d5e6 precedent).
# ---------------------------------------------------------------------------


@pytest.mark.contract
def test_committee_permission_sync_migration_mirrors_the_rbac_seed():
    """``<rev>_sync_ict_committee_permissions_for_existing_dbs.py`` chains
    onto the current head, is forward-only, ensures the ict_committee:read
    row and the three NEW executive roles verbatim from the seed contract,
    and grants exactly the seed's holder set (CRO rides the re-ensured
    wildcard)."""
    import importlib.util
    from pathlib import Path

    from app.db.rbac_seed_contract import PERMISSION_BY_KEY, ROLE_BY_NAME

    versions_dir = Path(__file__).resolve().parents[3] / "backend/alembic/versions"
    filename = "b3c4d5e6f7a8_sync_ict_committee_permissions_for_existing_dbs.py"
    spec = importlib.util.spec_from_file_location("ict_committee_permission_sync_migration", versions_dir / filename)
    assert spec is not None and spec.loader is not None
    sync = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sync)

    assert sync.down_revision == "z1a2b3c4d5e6"
    with pytest.raises(NotImplementedError):
        sync.downgrade()

    # The ensured permission row is the verbatim seed-contract row.
    assert sync.COMMITTEE_PERMISSION == PERMISSION_BY_KEY["ict_committee:read"]

    # The ensured executive roles are the verbatim seed-contract rows (the
    # seed only runs on empty DBs, so the sync must create them).
    assert {role["name"] for role in sync.EXECUTIVE_ROLES} == {"ceo", "cfo", "coo"}
    for role in sync.EXECUTIVE_ROLES:
        assert role == ROLE_BY_NAME[role["name"]], role["name"]

    # Role grants mirror the seed as of this migration (CRO holds the
    # wildcard). CISO stewardship was introduced later and its committee grant
    # is owned by e6f7a8b9c0d1, so an applied historical migration stays frozen.
    seed_committee_grants = {
        role_name
        for role_name, permission_keys in RBAC_ROLE_PERMISSIONS.items()
        if "ict_committee:read" in expand_permission_keys(permission_keys)
        if role_name not in {"cro", "ciso"}
    }
    assert set(sync.COMMITTEE_GRANT_ROLES) == seed_committee_grants
    assert seed_committee_grants == {
        "ceo",
        "cfo",
        "coo",
        "risk_manager",
        "compliance",
        "internal_audit",
    }


@pytest.mark.asyncio
async def test_committee_endpoint_over_an_api_seeded_register(
    client_factory,
    db_session: AsyncSession,
    test_user_cro: User,
    test_department,
    seed_risk_types,
    snapshot,
):
    """The full committee read model over a register seeded THROUGH the write
    API, read by a seeded CEO (the new grant end-to-end), pinned by an
    ADR-006 redacting snapshot plus explicit goldens: the loader's gross-block
    mapping, the h_zebr order on live rows, the heatmap gate-3 invariant, and
    DQ-count consistency with the #50 surface."""
    from app.models import GlobalConfig
    from app.models.global_config import clear_config_cache

    ciso_role = Role(name="ciso", display_name="Chief Information Security Officer")
    db_session.add(ciso_role)
    await db_session.flush()
    ciso = User(
        name="Committee Test CISO",
        email="committee.ciso@test.com",
        role_id=ciso_role.id,
        is_active=True,
        access_scope=AccessScope.GLOBAL,
    )
    db_session.add(ciso)
    await db_session.commit()

    # Tune banding/tolerance to the app's 1-25 scale (seeded ADR-008 rows).
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
            # Replace the P_LEI placeholder with a real LEI through the ADR-008
            # config overlay: the entity LEI then counts as populated on the
            # LEI-bearing RoI templates (a fresh-DB placeholder would gap it).
            GlobalConfig(
                key="ict_register_lei",
                value="315700FFGL2JGHVWJC12",
                value_type="string",
                category="ict_register_parameters",
                display_name="P_LEI",
                is_editable=False,
            ),
        ]
    )
    await db_session.commit()
    clear_config_cache()
    try:
        async with client_factory(user=test_user_cro) as client:
            process_resp = await client.post(
                "/api/v1/processes",
                json={
                    "l0_area": "Provoz a služby klientům",
                    "l1_process": "Správa pojistných smluv",
                    "process_owner_user_id": test_user_cro.id,
                    "owning_department_id": test_department.id,
                    "impact_client": 5,
                    "impact_market_operations": 4,
                    "impact_regulatory": 4,
                    "impact_financial": 4,
                    "mtpd_hours": 2,
                    "rto_hours": 1,
                    "rpo_hours": 1,
                    "interruption_impact": "high",
                    "assessment_date": "2026-01-15",
                },
            )
            assert process_resp.status_code == 201, process_resp.text
            process = process_resp.json()

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
            asset_resp = await client.post(
                "/api/v1/assets",
                json={
                    "name": "Veris",
                    "business_owner_user_id": test_user_cro.id,
                    "ict_owner_user_id": test_user_cro.id,
                    "owning_department_id": test_department.id,
                },
            )
            assert asset_resp.status_code == 201, asset_resp.text
            asset = asset_resp.json()
            # Preserve coverage of the historical DQ-06/DQ-44 guards after
            # #75 made these relationships mandatory for new active Assets.
            from app.models import Asset

            stored_asset = await db_session.get(Asset, asset["id"])
            assert stored_asset is not None
            stored_asset.business_owner_user_id = None
            stored_asset.ict_owner_user_id = None
            stored_asset.owning_department_id = None
            await db_session.commit()
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

            threat_resp = await client.post(
                "/api/v1/threats",
                json={"name": "Ransomware", "threat_steward_user_id": ciso.id},
            )
            assert threat_resp.status_code == 201, threat_resp.text
            threat = threat_resp.json()

            # Top risk: gross 5×5=25, net 5×5=25 (> tolerance 15, band Vysoké
            # at the tuned 20), partially accepted.
            risk1_resp = await client.post(
                "/api/v1/risks",
                json=_risk_payload(
                    gross_probability=5,
                    gross_impact=5,
                    net_probability=5,
                    net_impact=5,
                    acceptance_approver="CRO",
                ),
            )
            assert risk1_resp.status_code == 201, risk1_resp.text
            risk1 = risk1_resp.json()
            for path, body in (
                (f"/api/v1/risks/{risk1['id']}/process-links", {"process_id": process["id"]}),
                (f"/api/v1/risks/{risk1['id']}/threat-links", {"threat_id": threat["id"]}),
            ):
                link_resp = await client.post(path, json=body)
                assert link_resp.status_code == 201, link_resp.text

            # Second risk: gross 2×2=4, net 1×2=2 — Nízké, within tolerance.
            risk2_resp = await client.post(
                "/api/v1/risks",
                json=_risk_payload(
                    name="Chyba datové migrace",
                    gross_probability=2,
                    gross_impact=2,
                    net_probability=1,
                    net_impact=2,
                ),
            )
            assert risk2_resp.status_code == 201, risk2_resp.text
            risk2 = risk2_resp.json()
            link_resp = await client.post(
                f"/api/v1/risks/{risk2['id']}/asset-links", json={"asset_id": asset["id"]}
            )
            assert link_resp.status_code == 201, link_resp.text

            dq_resp = await client.get("/api/v1/ict-register/dq")
            assert dq_resp.status_code == 200

        ceo = await _seed_contract_user(db_session, "ceo")
        async with client_factory(user=ceo) as client:
            resp = await client.get("/api/v1/ict-register/committee")
    finally:
        clear_config_cache()

    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Register-state and key-metric goldens over the live loader path.
    state = body["dashboard"]["register_state"]
    assert state["process_count"] == 1
    assert state["asset_count"] == 1
    assert state["process_asset_link_count"] == 1
    assert state["vendor_count"] == 1
    metrics = body["dashboard"]["key_metrics"]
    assert metrics["cif_process_count"] == 1
    assert metrics["critical_asset_count"] == 1
    assert metrics["critical_vendor_count"] == 1
    assert metrics["risks_above_tolerance_count"] == 1

    # Cross-surface consistency: both open-findings tiles == the #50 endpoint.
    dq_finding_count = dq_resp.json()["finding_count"]
    assert metrics["open_dq_finding_count"] == dq_finding_count
    assert body["cro"]["kpi"]["open_dq_finding_count"] == dq_finding_count

    # KPI strip + the gate-3 invariant on live data: every risk row has the
    # gross block filled, so the heatmap cells sum to the risk count.
    kpi = body["cro"]["kpi"]
    assert kpi["risk_count"] == 2
    assert kpi["accepted_above_tolerance_count"] == 1
    assert sum(sum(row["cells"]) for row in body["cro"]["heatmap"]["rows"]) == kpi["risk_count"]

    # Top-10 columns ride the loader's gross-block + lookup mapping.
    top = body["cro"]["top_risks"]
    assert [entry["risk_id"] for entry in top] == [risk1["id"], risk2["id"]]
    assert top[0]["code"] == risk1["risk_id_code"]
    assert top[0]["subject_label"] == "Správa pojistných smluv"
    assert top[0]["threat_label"] == "Ransomware"
    assert top[0]["gross_score"] == 25
    assert top[0]["net_score"] == 25
    assert top[0]["net_band"] == "Vysoké"
    assert top[0]["vs_tolerance"] == "NAD TOLERANCI"
    assert top[1]["subject_label"] == "Veris"
    assert top[1]["threat_label"] is None

    # Vendor concentration: the CIF cascade counts the §2 pair.
    assert body["cro"]["top_vendors"][0]["name"] == "BIZ DATA"
    assert body["cro"]["top_vendors"][0]["cif_process_count"] == 1
    assert body["cro"]["top_vendors"][0]["tier"] == "Kritický dodavatel"

    # The material KPI ships its production-inert affordance (#52 review item).
    assert kpi["material_risk_count_production_inert"] is True
    assert kpi["material_risk_count_production_inert_reason"]

    # RoI-readiness (#52) rides the same payload: 15 templates in annex order;
    # the API-created Process gaps only on its unposted licensed activity (the
    # server-assigned F-code and the engine CIF populate the rest), and the
    # loader's supplement path feeds the VAD-driven templates.
    roi = body["roi_readiness"]
    assert [template["code"] for template in roi["templates"]] == [
        "B_01.01", "B_01.02", "B_01.03", "B_02.01", "B_02.02", "B_02.03",
        "B_03.01", "B_03.02", "B_03.03", "B_04.01", "B_05.01", "B_05.02",
        "B_06.01", "B_07.01", "B_99.01",
    ]
    roi_by_code = {template["code"]: template for template in roi["templates"]}
    b0601 = roi_by_code["B_06.01"]
    assert b0601["row_count"] == 1
    (b0601_gap,) = b0601["gap_rows"]
    assert b0601_gap["label"].startswith("F")  # the server-assigned F-code
    assert [missing["code"] for missing in b0601_gap["missing"]] == ["B_06.01.0020"]
    assert b0601["readiness_pct"] == 88.9  # 8 of 9 required fields
    assert roi_by_code["B_02.02"]["row_count"] == 1
    assert roi_by_code["B_02.01"]["row_count"] == 0  # no RoI-scope contract seeded
    assert roi_by_code["B_99.01"]["coverage"] == "documentary"
    assert roi["overall_readiness_pct"] is not None
    assert roi["total_gap_row_count"] >= 2

    assert body == snapshot
