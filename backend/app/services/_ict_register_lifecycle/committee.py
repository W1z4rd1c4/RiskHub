"""ICT Risk Committee read model — 16_Dashboard + 18_CRO_přehled (issue #51).

Reproduces the workbook's two output sheets over the in-app register graph,
per the byte-verified enumeration in
``docs/dora-ict-register/dashboard-cro-tile-inventory.md`` (the reproduction
contract): the Dashboard's 10 register-state tiles and 6 key-metric rows, and
the CRO overview's 6 KPI tiles, the 5×5 gross heatmap, the 4×4 gross→net
migration matrix, the Top-10 risks table, the Top-5 vendor concentration, the
5 live narrative sentences (as structured values the frontend composes), and
the 2 chart-staging aggregates. Every tile keeps its quoted formula's
semantics; layout, conditional-formatting classes, and the static
Interpretace/Zdroj/Akce texts are presentation and live on the frontend.

Contract:
- **Pure and engine-fed** (inventory §4 precision note): the derivation comes
  from :func:`~.derivation.derive_ict_register` and the DQ tallies from
  :func:`~.dq.derive_ict_register_dq` — the DQ-equivalent tiles (Dashboard
  rows 11/15/16 ≡ DQ-09/DQ-46/DQ-49, metric row 20 ≡ DQ-04, CRO tile I7 ≡
  DQ-05, and both sheets' open-findings tile) consume the DQ engine's counts,
  never a second implementation of the rules.
- **13_Rizika columns** ride on :class:`~.dq.RiskDqInput` (the one
  workbook-risk-row analog): the committee adds the heatmap/Top-10 columns
  (``probability`` = pravdep, ``subject_value`` = hodnota_subj, ``gross_score``
  = hrube, ``code`` = the register ID) mapped by the loader from the
  production Risk's gross block — the app enters probability × impact
  directly where the workbook derived hodnota_subj from the subject and
  multiplied in ``zranit``, so the full 1-5 value axis is reachable in-app
  (the workbook renders the same 5×5 grid with a structurally-zero first
  column, inventory §2.2).
- **Subject / threat lookups** (13!subj_nazev, 13!hrozba_nazev): the subject
  label resolves the risk's FIRST Link relation in the workbook's SubjektTyp
  closed-list order (Proces, Aktivum, Dodavatel — each by link order); threat
  labels come with the graph (first linked Threat). Missing rows resolve to
  the workbook's ``"?"`` XLOOKUP fallback.
- **Ranking** (inventory §3, both tables): sort key = ranked quantity + the
  row epsilon — ties break toward the LATER register row, so the in-app
  order is ranked quantity DESC, register row id DESC. Risks with a blank
  net never rank (h_zebr="" text keys); Vendors always rank (the N()
  coercion — a zero-CIF vendor keys on the epsilon alone).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

from app.services._ict_register_reference.parameters import IctWorkbookParameterSet

from .derivation import (
    ANO,
    CHAIN_LEVEL_DEEP_SUB,
    CHAIN_LEVEL_DIRECT_SUB,
    CRITICALITY_CLASSES,
    TIER_CRITICAL,
    UNKNOWN_LOOKUP,
    _int_parameter,
    derive_ict_register,
    process_display_name,
)
from .dq import (
    RISK_BAND_CRITICAL,
    RISK_BAND_HIGH,
    RISK_BAND_LOW,
    RISK_BAND_MEDIUM,
    RISK_OVER_TOLERANCE,
    RISK_RESPONSE_ACCEPTANCE,
    IctRegisterDqGraph,
    RiskDqInput,
    derive_ict_register_dq,
    risk_net_band,
    risk_vs_tolerance,
)
from .roi_readiness import RoiReadiness, RoiRegisterSupplement, derive_roi_readiness

_CLASS_CRITICAL = CRITICALITY_CLASSES[3]

# The C7 "Materiální" KPI reads 13!material, which has NO app column (the
# loader maps it None forever) — the DQ-23 production-inert disposition: the
# verbatim COUNTIF stays golden-covered through direct engine input, but on
# production data the tile can never count, so the payload flags it and the
# UI renders "not yet measurable" instead of a silent 0.
MATERIAL_RISK_KPI_PRODUCTION_INERT_REASON = (
    "The app Risk register tracks no materiality flag; the loader maps it "
    "empty, so this KPI cannot count on production data."
)

# Heatmap axes (inventory §2.2): rows = probability 5 down to 1, columns =
# subject value 1 to 5 — the full 5×5 grid, always rendered.
HEATMAP_PROBABILITY_ROWS: tuple[int, ...] = (5, 4, 3, 2, 1)
HEATMAP_SUBJECT_VALUES: tuple[int, ...] = (1, 2, 3, 4, 5)

# Band order shared by the migration matrix and the risks-by-band aggregate
# (builder band list, inventory §2.3).
RISK_BANDS: tuple[str, ...] = (RISK_BAND_LOW, RISK_BAND_MEDIUM, RISK_BAND_HIGH, RISK_BAND_CRITICAL)

# A35's exit set (sheets_out.py:917-925): approved-or-tested ONLY — stricter
# than DQ-17's functional set (no "K revizi") and DQ-49's orderly set.
_NARRATIVE_EXIT_STATES: tuple[str, ...] = ("Schválen", "Testován")

# ---------------------------------------------------------------------------
# Input.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IctCommitteeGraph:
    """The whole-register slice both output sheets read: the DQ graph (which
    already carries the 13_Rizika rows and their Link relations) plus the
    12_Hrozby name feed for the Top-10 "Hrozba" column and the RoI-readiness
    supplement (#52) — the entered register columns the engine graph omits."""

    dq_graph: IctRegisterDqGraph = field(default_factory=IctRegisterDqGraph)
    # risk_id -> first linked Threat name, in Link-relation order (#47).
    risk_threat_labels: Mapping[int, str] = field(default_factory=dict)
    roi_supplement: RoiRegisterSupplement = field(default_factory=RoiRegisterSupplement)


# ---------------------------------------------------------------------------
# Outputs — 16_Dashboard.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CommitteeRegisterState:
    """Block "Stav registrů" (inventory §1.1, rows 7-16) — one field per tile,
    in sheet row order."""

    process_count: int
    asset_count: int
    process_asset_link_count: int
    vendor_count: int
    assets_pending_review_count: int
    direct_process_vendor_link_count: int
    contracts_in_roi_scope_count: int
    sub_outsourcing_link_count: int
    assets_without_data_classification_count: int
    top_tier_vendors_without_orderly_exit_count: int


@dataclass(frozen=True)
class CommitteeKeyMetrics:
    """Block "Klíčové metriky" (inventory §1.2, rows 19-24) — the live Hodnota
    column; the static Interpretace/Zdroj/Akce texts are content the frontend
    carries bilingually."""

    cif_process_count: int
    processes_without_impact_assessment_count: int
    critical_asset_count: int
    critical_vendor_count: int
    risks_above_tolerance_count: int
    open_dq_finding_count: int


@dataclass(frozen=True)
class CommitteeDashboard:
    register_state: CommitteeRegisterState
    key_metrics: CommitteeKeyMetrics


# ---------------------------------------------------------------------------
# Outputs — 18_CRO_přehled.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CommitteeCroKpiStrip:
    """KPI strip (inventory §2.1, cells A7-K7), in sheet column order.

    ``material_risk_count`` carries the DQ-23-style production-inert flag:
    its 13!material input has no app column, so on production data the tile
    is "not yet measurable", never a silent 0.
    """

    risk_count: int
    material_risk_count: int
    risks_above_tolerance_count: int
    accepted_above_tolerance_count: int
    cif_without_bcm_count: int
    open_dq_finding_count: int
    material_risk_count_production_inert: bool = False
    material_risk_count_production_inert_reason: str | None = None


@dataclass(frozen=True)
class CommitteeHeatmapRow:
    """One heatmap row (inventory §2.2): probability, then the counts for
    subject value 1..5 in column order."""

    probability: int
    cells: tuple[int, ...]


@dataclass(frozen=True)
class CommitteeHeatmap:
    """"Heatmapa hrubého rizika" — rows probability 5 down to 1."""

    rows: tuple[CommitteeHeatmapRow, ...]


@dataclass(frozen=True)
class CommitteeMigrationRow:
    """One migration-matrix row (inventory §2.3): the gross band, then the
    counts per net band in ``RISK_BANDS`` order."""

    gross_band: str
    cells: tuple[int, ...]


@dataclass(frozen=True)
class CommitteeMigrationMatrix:
    """"Migrační matice" — gross band rows × net band columns."""

    rows: tuple[CommitteeMigrationRow, ...]


@dataclass(frozen=True)
class CommitteeTopRisk:
    """One "Top 10 rizik" row (inventory §2.4), display columns in header
    order: # | ID | Subjekt | Hrozba | Hrubé | Čisté | Pásmo (net) |
    Tolerance | Stav."""

    rank: int
    risk_id: int
    code: str | None
    subject_label: str | None
    threat_label: str | None
    gross_score: int | None
    net_score: int | None
    net_band: str | None
    vs_tolerance: str | None
    status_label: str | None


@dataclass(frozen=True)
class CommitteeTopVendor:
    """One "Koncentrace" row (inventory §2.5): # | Dodavatel | CIF procesů |
    Klasifikace."""

    rank: int
    vendor_id: int
    name: str
    cif_process_count: int
    tier: str


@dataclass(frozen=True)
class CommitteeNarratives:
    """The five live sentences (inventory §2.6, A34-A38) as structured values;
    the frontend localizes and composes the copy."""

    # A34 — "CIF funkcí: X z Y procesů; s BCM evidencí: Z".
    cif_process_count: int
    process_count: int
    cif_with_bcm_count: int
    # A35 — Critical-Vendor readiness (exit set is Schválen/Testován ONLY).
    critical_vendor_count: int
    critical_vendors_with_functional_exit_count: int
    critical_vendors_with_identifier_count: int
    # A36 + A38 — tolerance breaches and the board-approval caveat.
    tolerance: int
    risks_above_tolerance_count: int
    accepted_above_tolerance_count: int
    # A37 — sub-outsourcing chains.
    sub_outsourcing_link_count: int
    vendors_in_sub_role_count: int


@dataclass(frozen=True)
class CommitteeBandCount:
    """One "Aktiva dle výsledné kritičnosti" staging row (inventory §2.7)."""

    band: str
    count: int


@dataclass(frozen=True)
class CommitteeRiskBandCounts:
    """One "Rizika dle pásem (hrubé vs čisté)" staging row (inventory §2.7):
    the two COUNTIF columns are independent."""

    band: str
    gross_count: int
    net_count: int


@dataclass(frozen=True)
class CommitteeCroOverview:
    kpi: CommitteeCroKpiStrip
    heatmap: CommitteeHeatmap
    migration_matrix: CommitteeMigrationMatrix
    top_risks: tuple[CommitteeTopRisk, ...]
    top_vendors: tuple[CommitteeTopVendor, ...]
    narratives: CommitteeNarratives
    assets_by_criticality: tuple[CommitteeBandCount, ...]
    risks_by_band: tuple[CommitteeRiskBandCounts, ...]


@dataclass(frozen=True)
class IctRegisterCommittee:
    """Both output sheets plus the RoI-readiness element (#52), computed on read."""

    dashboard: CommitteeDashboard
    cro: CommitteeCroOverview
    roi_readiness: RoiReadiness


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------


def derive_ict_register_committee(
    committee_graph: IctCommitteeGraph, parameters: IctWorkbookParameterSet
) -> IctRegisterCommittee:
    """Compute every tile of both sheets over the graph, on read."""
    dq_graph = committee_graph.dq_graph
    graph = dq_graph.graph
    derivation = derive_ict_register(graph, parameters)
    # One derivation per request: the DQ engine consumes ours (#52 perf item).
    dq_result = derive_ict_register_dq(dq_graph, parameters, derivation=derivation)
    dq_count = {check.check_id: check.count for check in dq_result.checks}

    tolerance = _int_parameter(parameters, "P_Tolerance")
    medium_from = _int_parameter(parameters, "P_RizStr")
    high_from = _int_parameter(parameters, "P_RizVys")
    critical_from = _int_parameter(parameters, "P_RizKrit")

    def band(score: int | None) -> str | None:
        # Same bands for gross and net (spec 2.4; dq.risk_net_band verbatim).
        return risk_net_band(
            score, medium_from=medium_from, high_from=high_from, critical_from=critical_from
        )

    def is_above_tolerance(risk: RiskDqInput) -> bool:
        # 13!vs_tolerance = "NAD TOLERANCI" (dq.risk_vs_tolerance, verbatim).
        return risk_vs_tolerance(risk.net_score, tolerance=tolerance) == RISK_OVER_TOLERANCE

    risks_above_tolerance_count = sum(1 for risk in dq_graph.risks if is_above_tolerance(risk))
    # =COUNTIFS(13.vs_tolerance,"NAD TOLERANCI",13.odezva,"Akceptace")
    # (sheets_out.py:807; reused verbatim by narrative A36).
    accepted_above_tolerance_count = sum(
        1
        for risk in dq_graph.risks
        if is_above_tolerance(risk) and risk.response == RISK_RESPONSE_ACCEPTANCE
    )
    cif_process_count = sum(1 for d in derivation.processes.values() if d.cif == ANO)

    # --- 16_Dashboard §1.1 "Stav registrů" (rows 7-16). Rows 11/15/16 are the
    # DQ-09/DQ-46/DQ-49 rules re-surfaced (inventory §4), consumed from the DQ
    # engine; the remaining tiles are the quoted register COUNTs.
    register_state = CommitteeRegisterState(
        # =SUMPRODUCT(--(03.l1<>"")) (sheets_out.py:601).
        process_count=sum(1 for row in graph.processes if row.l1_process),
        # =SUMPRODUCT(--(04.nazev<>"")) (:602).
        asset_count=sum(1 for row in graph.assets if row.name),
        # =SUMPRODUCT(--(05!B<>"")) (:603).
        process_asset_link_count=len(graph.process_asset_links),
        # =SUMPRODUCT(--(07.nazev<>"")) (:604).
        vendor_count=sum(1 for row in graph.vendors if row.name),
        # =COUNTIF(04.stav_revize,"K revizi") (:605) ≡ DQ-09.
        assets_pending_review_count=dq_count["DQ-09"],
        # =SUMPRODUCT(--(11§1!C<>"")) (:606) — the manual §1 pairs.
        direct_process_vendor_link_count=len(graph.process_vendor_links),
        # =COUNTIFS(08!B,"<>",08!K,"Ano") (:607).
        contracts_in_roi_scope_count=sum(
            1 for contract in graph.contracts if contract.contract_reference and contract.roi_scope == ANO
        ),
        # =SUMPRODUCT(--(09!B<>"")) (:608).
        sub_outsourcing_link_count=len(graph.sub_outsourcing),
        # =SUMPRODUCT((04.B<>"")*((klasdat="")+(klasdat="Neposouzeno"))) (:609-610) ≡ DQ-46.
        assets_without_data_classification_count=dq_count["DQ-46"],
        # top-tier vendors outside the orderly exit states (:611-614) ≡ DQ-49.
        top_tier_vendors_without_orderly_exit_count=dq_count["DQ-49"],
    )

    # --- 16_Dashboard §1.2 "Klíčové metriky" (rows 19-24). Row 20 ≡ DQ-04
    # (inventory §4); the open-findings tile is the #50 NÁLEZ tally.
    key_metrics = CommitteeKeyMetrics(
        # =COUNTIF(03.cif,"Ano") (sheets_out.py:630-631).
        cif_process_count=cif_process_count,
        # =SUMPRODUCT((03.l1<>"")*(03.skore="")) (:632-633) ≡ DQ-04.
        processes_without_impact_assessment_count=dq_count["DQ-04"],
        # =COUNTIF(04.vysledna,"Kritická") (:634-635).
        critical_asset_count=sum(
            1 for d in derivation.assets.values() if d.resulting_criticality == _CLASS_CRITICAL
        ),
        # =COUNTIF(07.tier,"Kritický dodavatel") (:636-637).
        critical_vendor_count=sum(1 for d in derivation.vendors.values() if d.tier == TIER_CRITICAL),
        # =COUNTIF(13.vs_tolerance,"NAD TOLERANCI") (:638-639).
        risks_above_tolerance_count=risks_above_tolerance_count,
        # =COUNTIF(15!F,"NÁLEZ") (:640-641) — the #50 engine's tally.
        open_dq_finding_count=dq_result.finding_count,
    )

    # --- 18_CRO_přehled §2.1 KPI strip (A7-K7). I7 ≡ DQ-05 (inventory §4);
    # K7 repeats the open-findings tally verbatim (sheets_out.py:809).
    # 13!material has no app column today, so the loader maps every row's
    # is_material None — derived from the DATA (not hardcoded), the inert flag
    # un-mutes automatically the moment a materiality input reaches the graph.
    material_risk_count_inert = all(risk.is_material is None for risk in dq_graph.risks)
    kpi = CommitteeCroKpiStrip(
        # =SUMPRODUCT(--(13!C<>"")) (:804) — a risk row exists iff its subject
        # id is filled; the in-app slice IS the ICT-linked rows.
        risk_count=len(dq_graph.risks),
        # =COUNTIF(13.material,"Ano") (:805).
        material_risk_count=sum(1 for risk in dq_graph.risks if risk.is_material == ANO),
        # =COUNTIF(13.vs_tolerance,"NAD TOLERANCI") (:806).
        risks_above_tolerance_count=risks_above_tolerance_count,
        # =COUNTIFS(13.vs_tolerance,"NAD TOLERANCI",13.odezva,"Akceptace") (:807).
        accepted_above_tolerance_count=accepted_above_tolerance_count,
        # =COUNTIF(03.kontrola_bcm,"GAP*") (:808) ≡ DQ-05.
        cif_without_bcm_count=dq_count["DQ-05"],
        open_dq_finding_count=dq_result.finding_count,
        material_risk_count_production_inert=material_risk_count_inert,
        material_risk_count_production_inert_reason=(
            MATERIAL_RISK_KPI_PRODUCTION_INERT_REASON if material_risk_count_inert else None
        ),
    )

    # --- §2.2 heatmap: cell = COUNTIFS(13.pravdep=i, 13.hodnota_subj=j)
    # (sheets_out.py:836-837); blank-axis rows land in no cell, so the cell
    # sum equals the count of fully-axed risks (the builder's gate-3
    # invariant, verify.py:200-204).
    heatmap = CommitteeHeatmap(
        rows=tuple(
            CommitteeHeatmapRow(
                probability=probability,
                cells=tuple(
                    sum(
                        1
                        for risk in dq_graph.risks
                        if risk.probability == probability and risk.subject_value == value
                    )
                    for value in HEATMAP_SUBJECT_VALUES
                ),
            )
            for probability in HEATMAP_PROBABILITY_ROWS
        )
    )

    # --- §2.3 migration matrix: cell = COUNTIFS(13.pasmo_hrube=g,
    # 13.pasmo_ciste=n) (sheets_out.py:856-861); a blank band matches nothing.
    risk_bands = [(band(risk.gross_score), band(risk.net_score)) for risk in dq_graph.risks]
    migration_matrix = CommitteeMigrationMatrix(
        rows=tuple(
            CommitteeMigrationRow(
                gross_band=gross_band,
                cells=tuple(
                    sum(1 for gross, net in risk_bands if gross == gross_band and net == net_band)
                    for net_band in RISK_BANDS
                ),
            )
            for gross_band in RISK_BANDS
        )
    )

    # --- §2.4 Top-10 risks. The h_zebr key (inventory §3) is net + the row
    # epsilon: net DESC, and among equal nets the later register row (higher
    # id) takes the better rank; blank-net rows never rank.
    processes_by_id = {row.id: row for row in graph.processes}
    assets_by_id = {row.id: row for row in graph.assets}
    vendors_by_id = {row.id: row for row in graph.vendors}

    def subject_label(risk_id: int) -> str | None:
        """13!subj_nazev: the FIRST Link relation in SubjektTyp order (Proces,
        Aktivum, Dodavatel); a missing target row is the XLOOKUP "?"."""
        for link in dq_graph.risk_process_links:
            if link.risk_id == risk_id:
                row = processes_by_id.get(link.process_id)
                return process_display_name(row.l1_process, row.l2_subprocess) if row else UNKNOWN_LOOKUP
        for asset_link in dq_graph.risk_asset_links:
            if asset_link.risk_id == risk_id:
                asset = assets_by_id.get(asset_link.asset_id)
                return asset.name if asset else UNKNOWN_LOOKUP
        for vendor_link in dq_graph.risk_vendor_links:
            if vendor_link.risk_id == risk_id:
                vendor = vendors_by_id.get(vendor_link.vendor_id)
                return vendor.name if vendor else UNKNOWN_LOOKUP
        return None

    ranked_risks = sorted(
        (risk for risk in dq_graph.risks if risk.net_score is not None),
        key=lambda risk: (-(risk.net_score or 0), -risk.id),
    )[:10]
    top_risks = tuple(
        CommitteeTopRisk(
            rank=rank,
            risk_id=risk.id,
            code=risk.code,
            subject_label=subject_label(risk.id),
            threat_label=committee_graph.risk_threat_labels.get(risk.id),
            gross_score=risk.gross_score,
            net_score=risk.net_score,
            net_band=band(risk.net_score),
            vs_tolerance=risk_vs_tolerance(risk.net_score, tolerance=tolerance),
            status_label=risk.status_label,
        )
        for rank, risk in enumerate(ranked_risks, start=1)
    )

    # --- §2.5 Top-5 vendor concentration. Key = N(cif_proc_n) + row epsilon
    # (inventory §3(4)): every Vendor row ranks — the engine's
    # cif_process_count is the §1+§2 CIF-pair tally, already 0-coerced.
    ranked_vendors = sorted(
        (row for row in graph.vendors if row.id in derivation.vendors),
        key=lambda row: (-derivation.vendors[row.id].cif_process_count, -row.id),
    )[:5]
    top_vendors = tuple(
        CommitteeTopVendor(
            rank=rank,
            vendor_id=row.id,
            name=row.name,
            cif_process_count=derivation.vendors[row.id].cif_process_count,
            tier=derivation.vendors[row.id].tier,
        )
        for rank, row in enumerate(ranked_vendors, start=1)
    )

    # --- §2.6 narrative sentence values (A34-A38), each formula verbatim.
    critical_vendor_ids = [vid for vid, d in derivation.vendors.items() if d.tier == TIER_CRITICAL]
    vendor_inputs_by_id = {row.id: row for row in graph.vendors}
    narratives = CommitteeNarratives(
        # A34 — reads 03.cif, 03.l1, and COUNTIFS(cif="Ano", bcm="Ano").
        cif_process_count=cif_process_count,
        process_count=register_state.process_count,
        cif_with_bcm_count=sum(
            1
            for pid, d in derivation.processes.items()
            if d.cif == ANO and d.inputs.bcm_link == "yes"
        ),
        # A35 — the exit set here is Schválen/Testován ONLY (sheets_out.py:917-925).
        critical_vendor_count=len(critical_vendor_ids),
        critical_vendors_with_functional_exit_count=sum(
            1
            for vid in critical_vendor_ids
            if vendor_inputs_by_id[vid].exit_plan_state in _NARRATIVE_EXIT_STATES
        ),
        critical_vendors_with_identifier_count=sum(
            1 for vid in critical_vendor_ids if vendor_inputs_by_id[vid].identifier_value
        ),
        # A36 + A38 — P_Tolerance and the tolerance tallies.
        tolerance=tolerance,
        risks_above_tolerance_count=risks_above_tolerance_count,
        accepted_above_tolerance_count=accepted_above_tolerance_count,
        # A37 — chain links + COUNTIF(07.uroven_ret,"B")+COUNTIF(...,"C").
        sub_outsourcing_link_count=register_state.sub_outsourcing_link_count,
        vendors_in_sub_role_count=sum(
            1
            for d in derivation.vendors.values()
            if d.chain_level in (CHAIN_LEVEL_DIRECT_SUB, CHAIN_LEVEL_DEEP_SUB)
        ),
    )

    # --- §2.7 chart-staging aggregates.
    assets_by_criticality = tuple(
        CommitteeBandCount(
            band=criticality_class,
            # =COUNTIF(04.vysledna,"<band>") over CRITICALITY_CLASSES order.
            count=sum(
                1 for d in derivation.assets.values() if d.resulting_criticality == criticality_class
            ),
        )
        for criticality_class in CRITICALITY_CLASSES
    )
    risks_by_band = tuple(
        CommitteeRiskBandCounts(
            band=risk_band,
            # =COUNTIF(13.pasmo_hrube,"<band>") / =COUNTIF(13.pasmo_ciste,"<band>")
            # — two independent columns.
            gross_count=sum(1 for gross, _ in risk_bands if gross == risk_band),
            net_count=sum(1 for _, net in risk_bands if net == risk_band),
        )
        for risk_band in RISK_BANDS
    )

    return IctRegisterCommittee(
        dashboard=CommitteeDashboard(register_state=register_state, key_metrics=key_metrics),
        cro=CommitteeCroOverview(
            kpi=kpi,
            heatmap=heatmap,
            migration_matrix=migration_matrix,
            top_risks=top_risks,
            top_vendors=top_vendors,
            narratives=narratives,
            assets_by_criticality=assets_by_criticality,
            risks_by_band=risks_by_band,
        ),
        # The RoI-readiness element (#52), fed the SAME derivation.
        roi_readiness=derive_roi_readiness(
            graph, committee_graph.roi_supplement, derivation, parameters
        ),
    )
