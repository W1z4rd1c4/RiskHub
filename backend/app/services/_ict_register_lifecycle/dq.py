"""ICT Register data-quality checks — the 52-check DQ engine (issue #50).

Reproduces the workbook's ``15_Kontroly_kvality`` sheet (spec section 5;
builder ``sheets_out.py:352-547``) over the in-app register graph: every check
keeps its workbook id, area, CZ title verbatim, severity, the literal
threshold 0 (``ws[f"E{r}"] = 0``, sheets_out.py:569), the ``NÁLEZ``-if-D>E
status rule (sheets_out.py:570), and drills down to the violating rows.

Contract:
- **Pure** and engine-fed: the base derivation comes from
  :func:`~.derivation.derive_ict_register` — engine-derived columns
  (``cif``, ``kontrola_rto``, ``tier``, ``sml_ref``, chain sentinels, the §2
  expansion) are consumed from its outputs, never recomputed here. The DQ
  module adds only what the workbook's DQ sheet itself adds: raw-column
  COUNTIFs, duplicate tallies, and the 13_Rizika deriveds no other slice owns.
- **Findings, not write blocks** (parent spec #38, "flag-don't-prevent"): the
  mandatory-if rules here — the risk acceptance trio (DQ-21), the
  Critical/Significant vendor obligations (DQ-16/17/18/32/49/50/52), and
  main-contract uniqueness (DQ-39) — are surfaced as findings only; the write
  paths accept the incomplete states these checks flag.
- **Structural self-checks** (DQ-24/25/26/31, and DQ-37's direction sanity)
  map to graph-integrity conditions: duplicate ids, unmaterialized §2 pairs,
  the engine's "?" lookup sentinels, CIF/count inconsistency. In a correct
  deployment they read 0 forever (spec section 5); goldens drive them through
  direct engine input.

Risk-side column mapping (13_Rizika -> the production Risk entity): the app
reuses the existing Risk register (spec #38, "Risks reuse the existing
records"), which carries only a subset of the workbook's risk columns. The
loader (``derivation_inputs.risk_dq_input``) maps what exists and leaves the
rest ``None``, the same "emptiness over absence" disposition as the engine's
``sub_provider_vendor_id``:

- ``ciste``            -> ``Risk.net_score`` (bands/tolerance verbatim on
                          P_RizStr/P_RizVys/P_RizKrit/P_Tolerance);
- ``akc_schval/oduv/datum`` -> the #47 acceptance trio columns;
- ``odezva="Akceptace"``    -> any acceptance-trio field entered (the app has
                          no Odezvy column; entering the package IS the
                          acceptance response);
- ``stav="Akceptováno"``    -> the trio complete; ``stav="Uzavřené"`` -> the
                          Risk archived (the app's closure);
- ``termin`` / ``datum_pos`` / ``material`` -> no app columns; loaded as
                          ``None`` so DQ-20 reads "not accepted, not closed"
                          and DQ-23 never fires in production (its verbatim
                          rule stays golden-covered via direct input).

The DQ risk set is the ICT-linked slice: risks joined to the graph through
Risk<->Process, Risk<->Asset, or Vendor<->Risk Link relations (#47) — the
in-app analog of "a 13_Rizika row".
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from datetime import date, timedelta

from app.services._ict_register_reference.parameters import IctWorkbookParameterSet

from .derivation import (
    ANO,
    BCM_GAP,
    CHAIN_BREAK_CHECK,
    CRITICALITY_CLASSES,
    NE,
    RTO_MTPD_GAP,
    TIER_CRITICAL,
    TIER_SIGNIFICANT,
    UNKNOWN_LOOKUP,
    AssetDerivationInput,
    IctRegisterDerivation,
    IctRegisterGraph,
    _date_parameter,
    _int_parameter,
    derive_ict_register,
    process_display_name,
)

DQ_STATUS_OK = "OK"
DQ_STATUS_FINDING = "NÁLEZ"

# 13_Rizika band labels — builder sheets_vendors.py:666-676, formula literals.
RISK_BAND_CRITICAL = "Kritické"
RISK_BAND_HIGH = "Vysoké"
RISK_BAND_MEDIUM = "Střední"
RISK_BAND_LOW = "Nízké"
RISK_OVER_TOLERANCE = "NAD TOLERANCI"
RISK_WITHIN_TOLERANCE = "V toleranci"
RISK_RESPONSE_ACCEPTANCE = "Akceptace"
RISK_STATUS_ACCEPTED = "Akceptováno"
RISK_STATUS_CLOSED = "Uzavřené"

# Formula literals quoted by the DQ rules (builder sheets_out.py:352-547).
_UNDETERMINED = "Neurčeno"
_UNASSESSED = "Neposouzeno"
_REVIEW_PENDING = "K revizi"
_REVIEW_DONE = "Zkontrolováno"
_EXIT_FUNCTIONAL_STATES = ("Schválen", "Testován", "K revizi")  # DQ-17
_EXIT_ORDERLY_STATES = ("Návrh", "Schválen", "Testován", "K revizi")  # DQ-49
_DD_NOT_STARTED_STATES = (None, "Nezahájeno", "Neposouzeno")  # DQ-50
_DATA_CLASS_HIGHLY_CONFIDENTIAL = "Vysoce důvěrná / regulovaná data"  # DQ-47
_DATA_CLASS_CONFLICTS_WITH_GDPR = ("Bez dat / nerelevantní", "Veřejná data")  # DQ-51

_CLASS_CRITICAL = CRITICALITY_CLASSES[3]
_TOP_TIERS = (TIER_CRITICAL, TIER_SIGNIFICANT)


# ---------------------------------------------------------------------------
# Risk-side inputs (13_Rizika slice; loader: derivation_inputs.risk_dq_input).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RiskDqInput:
    """One ICT-linked Risk row — the 13_Rizika columns the DQ checks and the
    committee page (#51) read.

    ``response``/``status_label``/``action_plan_date``/``assessment_date``/
    ``is_material`` are workbook-shaped; the production loader maps them per
    the module docstring (``None`` where the app has no column).

    The committee columns (read only by ``committee.py``, never by the 52
    checks): ``code`` is the register row ID (13!id, app ``risk_id_code``);
    ``probability``/``subject_value``/``gross_score`` are the heatmap and
    gross-side columns (13!pravdep, 13!hodnota_subj, 13!hrube), mapped from
    the production Risk's gross block (``gross_probability``/``gross_impact``/
    ``gross_score``) — the app enters probability × impact directly where the
    workbook derived hodnota_subj from the subject and multiplied in
    ``zranit``.
    """

    id: int
    label: str
    net_score: int | None = None
    response: str | None = None
    status_label: str | None = None
    action_plan_date: date | None = None
    acceptance_approver: str | None = None
    acceptance_justification: str | None = None
    acceptance_date: date | None = None
    assessment_date: date | None = None
    is_material: str | None = None
    # Committee-page columns (#51).
    code: str | None = None
    probability: int | None = None
    subject_value: int | None = None
    gross_score: int | None = None


@dataclass(frozen=True)
class RiskProcessLinkDqInput:
    risk_id: int
    process_id: int


@dataclass(frozen=True)
class RiskAssetLinkDqInput:
    risk_id: int
    asset_id: int


@dataclass(frozen=True)
class RiskVendorLinkDqInput:
    risk_id: int
    vendor_id: int


@dataclass(frozen=True)
class IctRegisterDqGraph:
    """The whole-register graph slice the 52 checks run over."""

    graph: IctRegisterGraph = field(default_factory=IctRegisterGraph)
    risks: tuple[RiskDqInput, ...] = ()
    risk_process_links: tuple[RiskProcessLinkDqInput, ...] = ()
    risk_asset_links: tuple[RiskAssetLinkDqInput, ...] = ()
    risk_vendor_links: tuple[RiskVendorLinkDqInput, ...] = ()


# ---------------------------------------------------------------------------
# Outputs.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DqViolatingRow:
    """One violating row behind a finding, with its drill-down anchor.

    ``entity_type`` names the register row kind; ``route_entity_type``/``id``
    anchor the row on a routable detail page (contracts and sub-outsourcing
    rows anchor on their owning Vendor; link rows anchor on one end).

    ``vendor_scope_ids``/``risk_scope_ids`` list the EXISTING row-scoped
    entities the row references (owning Vendor, linked Vendor/Risk — whether
    by id or by name in the label). The per-viewer filter
    (:func:`visible_dq_result`) hides the row unless every one is visible to
    the caller, so a DQ row never reveals more than the entity's own read
    endpoints would.
    """

    entity_type: str
    entity_id: int
    label: str
    route_entity_type: str
    route_entity_id: int
    vendor_scope_ids: tuple[int, ...] = ()
    risk_scope_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class DqCheckResult:
    """One 15_Kontroly_kvality row: id, area, CZ title verbatim, severity,
    the literal 0 threshold, the violating-row count, and OK/NÁLEZ.

    ``production_inert`` marks checks whose trigger inputs have NO app column
    (the loader maps them ``None`` forever — module docstring): the verbatim
    rule stays golden-covered through direct engine input, but on production
    data the check can never fire, so the UI renders it as "not yet
    measurable" instead of a false OK.
    """

    check_id: str
    area: str
    title_cs: str
    severity: str
    threshold: int
    count: int
    status: str
    violating_rows: tuple[DqViolatingRow, ...]
    production_inert: bool = False
    production_inert_reason: str | None = None


@dataclass(frozen=True)
class IctRegisterDqResult:
    """All 52 checks in workbook order, plus the open-finding tally."""

    checks: tuple[DqCheckResult, ...]
    finding_count: int


# Checks whose trigger input has no app column (the loader maps it None
# forever) — audited across the 13_Rizika slice: DQ-20/21/22 read real app
# columns (net score, archival, the acceptance trio) and can all fire;
# DQ-23's datum_pos/material pair is the only trigger without an app analog.
PRODUCTION_INERT_REASONS: Mapping[str, str] = {
    "DQ-23": (
        "The app Risk register tracks no assessment date or materiality; the "
        "loader maps them empty, so this check cannot fire on production data."
    ),
}


@dataclass(frozen=True)
class DqViewerScope:
    """The caller's per-entity visibility, resolved by the loader
    (``derivation_inputs.load_dq_viewer_scope``) from each entity's CANONICAL
    read predicate — the same permission checks and row-visibility clauses
    the entities' own list/detail endpoints apply.

    ``readable_resources`` holds the permission-only gates (``processes``,
    ``assets``, ``vendor_contracts``); the ``*_unrestricted`` flags are True
    when the row-scoped entity's visibility clause is unrestricted for the
    caller (privileged users), in which case the id sets are ignored.
    """

    readable_resources: frozenset[str] = frozenset()
    vendors_unrestricted: bool = False
    visible_vendor_ids: frozenset[int] = frozenset()
    risks_unrestricted: bool = False
    visible_risk_ids: frozenset[int] = frozenset()


# Permission-only read gates per row/route entity kind: the resources whose
# own endpoints gate reading that kind (link rows follow the #43
# dual-permission precedent; vendors:read is the DQ endpoint's own
# dependency, and Vendor/Risk row visibility rides on the scope id sets).
_DQ_ENTITY_READ_GATES: Mapping[str, frozenset[str]] = {
    "process": frozenset({"processes"}),
    "asset": frozenset({"assets"}),
    "vendor": frozenset(),
    "risk": frozenset(),
    "contract": frozenset({"vendor_contracts"}),
    "sub_outsourcing": frozenset({"vendor_contracts"}),
    "process_asset_link": frozenset({"processes", "assets"}),
    "asset_asset_link": frozenset({"assets"}),
    "asset_vendor_link": frozenset({"assets"}),
    "process_vendor_link": frozenset({"processes"}),
}

_DQ_ROUTE_READ_GATES: Mapping[str, frozenset[str]] = {
    "process": frozenset({"processes"}),
    "asset": frozenset({"assets"}),
    "vendor": frozenset(),
    "risk": frozenset(),
}


def _dq_row_visible(row: DqViolatingRow, scope: DqViewerScope) -> bool:
    gates = _DQ_ENTITY_READ_GATES.get(row.entity_type, frozenset()) | _DQ_ROUTE_READ_GATES.get(
        row.route_entity_type, frozenset()
    )
    if not gates <= scope.readable_resources:
        return False
    if not scope.vendors_unrestricted and any(
        vendor_id not in scope.visible_vendor_ids for vendor_id in row.vendor_scope_ids
    ):
        return False
    if not scope.risks_unrestricted and any(
        risk_id not in scope.visible_risk_ids for risk_id in row.risk_scope_ids
    ):
        return False
    return True


def visible_dq_result(result: IctRegisterDqResult, scope: DqViewerScope) -> IctRegisterDqResult:
    """Filter every check's violating rows to the caller-visible slice.

    Counts, statuses, and the finding tally stay GLOBAL (oversight
    semantics): a scoped user still sees that a check found N rows — they
    just cannot drill into rows their own entity endpoints would not show.
    """
    return IctRegisterDqResult(
        checks=tuple(
            replace(
                check,
                violating_rows=tuple(
                    row for row in check.violating_rows if _dq_row_visible(row, scope)
                ),
            )
            for check in result.checks
        ),
        finding_count=result.finding_count,
    )


# ---------------------------------------------------------------------------
# Check catalog — id, area, CZ title, severity, all verbatim from the builder
# (sheets_out.py:352-547; the spec section 5 table renders the same rows).
# ---------------------------------------------------------------------------

DQ_CHECK_CATALOG: tuple[tuple[str, str, str, str], ...] = (
    ("DQ-01", "Procesy", "Proces bez vlastníka", "Vysoká"),
    ("DQ-02", "Procesy", "GAP: RTO > MTPD", "Vysoká"),
    ("DQ-03", "Procesy", "CIF proces bez navázaného aktiva", "Kritická"),
    ("DQ-04", "Procesy", "Proces bez ohodnocení dopadů (bootstrap)", "Střední"),
    ("DQ-05", "Procesy", "CIF proces bez BCM evidence", "Vysoká"),
    ("DQ-06", "Aktiva", "Aktivum bez jakéhokoli vlastníka", "Vysoká"),
    ("DQ-07", "Aktiva", "Primární proces aktiva chybí ve vazbách (list 05)", "Vysoká"),
    ("DQ-08", "Aktiva", "Kritické aktivum bez identifikovaného rizika", "Kritická"),
    ("DQ-09", "Aktiva", "Záznam aktiva k revizi", "Střední"),
    ("DQ-10", "Aktiva", "Legacy aktivum bez posouzení rizika", "Vysoká"),
    ("DQ-11", "Vazby", "Duplicitní vazba proces–aktivum", "Střední"),
    ("DQ-12", "Vazby", "Duplicitní vazba aktivum–dodavatel", "Střední"),
    ("DQ-13", "Vazby", "Vazba na neexistující ID (05)", "Vysoká"),
    ("DQ-14", "Vazby", "CIF vazba bez míry závislosti (B_02.02.0180)", "Střední"),
    ("DQ-15", "Vazby", "Přímá vazba (list 11) bez revize v 10", "Střední"),
    ("DQ-16", "Dodavatelé", "Kritický/Významný dodavatel bez ID kódu", "Vysoká"),
    ("DQ-17", "Dodavatelé", "Kritický dodavatel bez funkčního exit plánu", "Kritická"),
    ("DQ-18", "Dodavatelé", "Kritický/Významný dodavatel bez ex-ante posouzení", "Vysoká"),
    ("DQ-19", "Dodavatelé", "Kritický dodavatel bez průběžného rizika (čl. 9(3))", "Vysoká"),
    ("DQ-20", "Rizika", "Vysoké/kritické čisté riziko bez akčního plánu", "Kritická"),
    ("DQ-21", "Rizika", "Akceptace nad toleranci bez schválení/odůvodnění", "Kritická"),
    ("DQ-22", "Rizika", "Přezkum akceptace po termínu (> 12 měsíců)", "Vysoká"),
    ("DQ-23", "Rizika", "Posouzení rizika po termínu", "Vysoká"),
    ("DQ-24", "Integrita", "Duplicitní ID v registrech", "Kritická"),
    ("DQ-25", "Integrita", "Konzistence odvozených vazeb (list 11)", "Kritická"),
    ("DQ-26", "Integrita", "Chybové buňky ve vzorcích (#NAME?, #REF!, …)", "Kritická"),
    ("DQ-27", "Aktiva", "GDPR relevance chybí nebo Neurčeno", "Střední"),
    ("DQ-28", "Aktiva", "AI relevance chybí nebo Neurčeno", "Střední"),
    ("DQ-29", "Aktiva", "Neúplné hodnocení CIAA (C/I/A/Au)", "Střední"),
    ("DQ-30", "Aktiva", "Neúplné hodnocení business dopadů", "Střední"),
    ("DQ-31", "Aktiva", "Nekonzistence CIF: odvozeno=Ano, ale počet CIF procesů=0", "Kritická"),
    ("DQ-32", "Dodavatelé", "Kritický/Významný dodavatel bez hlavní smlouvy", "Vysoká"),
    ("DQ-33", "Aktiva", "Aktivum vystavené internetu bez úplného CIAA", "Vysoká"),
    ("DQ-34", "Aktiva", "AI-relevantní aktivum bez vlastníka", "Vysoká"),
    ("DQ-35", "Aktiva", "GDPR aktivum s důvěrností pod prahem (P_GdprMinC)", "Vysoká"),
    ("DQ-36", "Aktiva", "SPOF aktivum bez revize záznamu", "Vysoká"),
    ("DQ-37", "Vazby", "Podezřelý směr závislosti aktiv (úroveň podpůrného < závislého)", "Střední"),
    ("DQ-38", "Vazby", "Chyba v řetězci subdodávek (rank nelze odvodit)", "Vysoká"),
    ("DQ-39", "Smlouvy", "Dodavatel se smlouvami bez právě jedné hlavní", "Vysoká"),
    ("DQ-40", "Vazby", "Vazba na neexistující ID (listy 06/08/09)", "Vysoká"),
    ("DQ-41", "Dodavatelé", "Dodavatel s vazbami bez evidované smlouvy", "Vysoká"),
    ("DQ-42", "Smlouvy", "Subdodávka na smlouvě mimo rozsah RoI", "Střední"),
    ("DQ-43", "Procesy", "Proces bez vlastnického útvaru", "Střední"),
    ("DQ-44", "Aktiva", "Aktivum bez vlastnického útvaru", "Střední"),
    ("DQ-45", "Vazby", "Vazba proces–aktivum bez posouzeného významu", "Střední"),
    ("DQ-46", "Aktiva", "Aktivum bez klasifikace dat", "Střední"),
    ("DQ-47", "Aktiva", "Vysoce důvěrná data s důvěrností C pod prahem", "Vysoká"),
    ("DQ-48", "Aktiva", "Aktivum bez modelu nasazení", "Střední"),
    ("DQ-49", "Dodavatelé", "Kritický/Významný dodavatel bez exit plánu v řádném stavu", "Vysoká"),
    ("DQ-50", "Dodavatelé", "Kritický/Významný dodavatel s nezahájenou due diligence", "Vysoká"),
    ("DQ-51", "Aktiva", "Rozpor: GDPR aktivum s klasifikací „Bez dat“ / „Veřejná data“", "Vysoká"),
    ("DQ-52", "Dodavatelé", "Kritický/Významný dodavatel bez posouzené významnosti outsourcingu", "Vysoká"),
)


# ---------------------------------------------------------------------------
# 13_Rizika deriveds owned by the DQ slice (no other engine block reads them).
# ---------------------------------------------------------------------------


def risk_net_band(net_score: int | None, *, medium_from: int, high_from: int, critical_from: int) -> str | None:
    """13!pasmo_ciste — builder sheets_vendors.py:674-676, verbatim:

        =IF(ciste="","",IF(ciste>=P_RizKrit,"Kritické",
          IF(ciste>=P_RizVys,"Vysoké",IF(ciste>=P_RizStr,"Střední","Nízké"))))
    """
    if net_score is None:
        return None
    if net_score >= critical_from:
        return RISK_BAND_CRITICAL
    if net_score >= high_from:
        return RISK_BAND_HIGH
    if net_score >= medium_from:
        return RISK_BAND_MEDIUM
    return RISK_BAND_LOW


def risk_vs_tolerance(net_score: int | None, *, tolerance: int) -> str | None:
    """13!vs_tolerance — builder sheets_vendors.py:677-679, verbatim:

        =IF(ciste="","",IF(ciste<=P_Tolerance,"V toleranci","NAD TOLERANCI"))
    """
    if net_score is None:
        return None
    return RISK_WITHIN_TOLERANCE if net_score <= tolerance else RISK_OVER_TOLERANCE


def acceptance_review_due(acceptance_date: date | None) -> date | None:
    """13!prezkum_do — builder sheets_vendors.py:684-686, verbatim:

        =IF(akc_datum="","",DATE(YEAR(akc_datum)+1,MONTH(akc_datum),DAY(akc_datum)))

    Excel DATE() overflow semantics (NOT the EDATE clamp used by 03!pristi):
    a day past the target month's end rolls forward, so Feb 29 + 1 year is
    Mar 1, never Feb 28.
    """
    if acceptance_date is None:
        return None
    return date(acceptance_date.year + 1, acceptance_date.month, 1) + timedelta(
        days=acceptance_date.day - 1
    )


def next_assessment_date(assessment_date: date | None, is_material: str | None) -> date | None:
    """13!pristi — builder sheets_vendors.py:698-700, verbatim:

        =IF(datum_pos="","",EDATE(datum_pos,IF(material="Ano",6,12)))

    EDATE clamps to the last day of the target month.
    """
    if assessment_date is None:
        return None
    months = 6 if is_material == ANO else 12
    total = assessment_date.month - 1 + months
    year = assessment_date.year + total // 12
    month = total % 12 + 1
    last_day = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
    return date(year, month, min(assessment_date.day, last_day))


def _asset_level_char(asset_level: str | None, *, row_exists: bool) -> str | None:
    """06!J/K — builder sheets_core.py:520-523, verbatim:

        =IF(src="","",LEFT(IFERROR(XLOOKUP(src,AktivaID,04!$D,""),""),1))

    A missing asset row resolves to "" (no character -> None here); an
    existing row with a BLANK level coerces through LEFT(0,1) to "0" — the
    workbook's blank-cell-as-zero quirk, reproduced verbatim.
    """
    if not row_exists:
        return None
    if asset_level is None or asset_level == "":
        return "0"
    return asset_level[0]


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------


def derive_ict_register_dq(
    dq_graph: IctRegisterDqGraph,
    parameters: IctWorkbookParameterSet,
    *,
    derivation: IctRegisterDerivation | None = None,
) -> IctRegisterDqResult:
    """Compute all 52 checks over the graph, workbook-verbatim, on read.

    ``derivation`` lets a caller that already derived the SAME graph (the
    committee read model, #51/#52) hand its result in — one derivation per
    request instead of two. Behaviour is identical either way.
    """
    graph = dq_graph.graph
    if derivation is None:
        derivation = derive_ict_register(graph, parameters)

    gdpr_min_c = _int_parameter(parameters, "P_GdprMinC")
    reference_date = _date_parameter(parameters, "P_RefDatum")
    risk_medium_from = _int_parameter(parameters, "P_RizStr")
    risk_high_from = _int_parameter(parameters, "P_RizVys")
    risk_critical_from = _int_parameter(parameters, "P_RizKrit")
    risk_tolerance = _int_parameter(parameters, "P_Tolerance")

    processes_by_id = {row.id: row for row in graph.processes}
    assets_by_id = {row.id: row for row in graph.assets}
    vendors_by_id = {row.id: row for row in graph.vendors}
    contracts_by_id = {row.id: row for row in graph.contracts}
    subs_by_id = {sub.id: sub for sub in graph.sub_outsourcing}

    def process_label(process_id: int) -> str:
        row = processes_by_id.get(process_id)
        return process_display_name(row.l1_process, row.l2_subprocess) if row else UNKNOWN_LOOKUP

    def asset_label(asset_id: int) -> str:
        row = assets_by_id.get(asset_id)
        return row.name if row else UNKNOWN_LOOKUP

    def vendor_label(vendor_id: int) -> str:
        row = vendors_by_id.get(vendor_id)
        return row.name if row else UNKNOWN_LOOKUP

    def vendor_scope(*vendor_ids: int) -> tuple[int, ...]:
        """The EXISTING vendors among the row's references (dangling ids scope nothing)."""
        return tuple(vendor_id for vendor_id in vendor_ids if vendor_id in vendors_by_id)

    def process_row(process_id: int, label: str | None = None) -> DqViolatingRow:
        return DqViolatingRow("process", process_id, label or process_label(process_id), "process", process_id)

    def asset_row(asset_id: int, label: str | None = None) -> DqViolatingRow:
        return DqViolatingRow("asset", asset_id, label or asset_label(asset_id), "asset", asset_id)

    def vendor_row(vendor_id: int, label: str | None = None) -> DqViolatingRow:
        return DqViolatingRow(
            "vendor",
            vendor_id,
            label or vendor_label(vendor_id),
            "vendor",
            vendor_id,
            vendor_scope_ids=vendor_scope(vendor_id),
        )

    def risk_row(risk: RiskDqInput) -> DqViolatingRow:
        return DqViolatingRow("risk", risk.id, risk.label, "risk", risk.id, risk_scope_ids=(risk.id,))

    def contract_row(contract_id: int, label: str) -> DqViolatingRow:
        contract = contracts_by_id.get(contract_id)
        vendor_id = contract.vendor_id if contract else 0
        return DqViolatingRow(
            "contract", contract_id, label, "vendor", vendor_id, vendor_scope_ids=vendor_scope(vendor_id)
        )

    def sub_row(sub_id: int, vendor_id: int, label: str) -> DqViolatingRow:
        return DqViolatingRow(
            "sub_outsourcing", sub_id, label, "vendor", vendor_id, vendor_scope_ids=vendor_scope(vendor_id)
        )

    # --- Link tallies the DQ sheet takes from raw columns (plain COUNTIFs).
    risk_count_by_asset = Counter(link.asset_id for link in dq_graph.risk_asset_links)
    risk_count_by_vendor = Counter(link.vendor_id for link in dq_graph.risk_vendor_links)
    av_link_count_by_vendor = Counter(link.vendor_id for link in graph.asset_vendor_links)
    pal_pair_counts = Counter((link.process_id, link.asset_id) for link in graph.process_asset_links)
    avl_triple_counts = Counter(
        (link.asset_id, link.vendor_id, link.ict_service_code) for link in graph.asset_vendor_links
    )

    checks: dict[str, tuple[DqViolatingRow, ...]] = {}

    # ------------------------------------------------------------------ 03 --
    # DQ-01 — =COUNTIFS(03.l1<>"", 03.vlastnik="") (sheets_out.py:360-362).
    checks["DQ-01"] = tuple(
        process_row(row.id) for row in graph.processes if row.l1_process and row.owner is None
    )
    # DQ-02 — =COUNTIF(03.kontrola_rto,"GAP*") (:363-365); engine rto_mtpd_check.
    checks["DQ-02"] = tuple(
        process_row(pid)
        for pid, d in derivation.processes.items()
        if d.rto_mtpd_check == RTO_MTPD_GAP
    )
    # DQ-03 — =SUMPRODUCT((03.cif="Ano")*(03.aktiva_n=0)) (:366-368).
    checks["DQ-03"] = tuple(
        process_row(pid)
        for pid, d in derivation.processes.items()
        if d.cif == ANO and d.linked_asset_count == 0
    )
    # DQ-04 — =SUMPRODUCT((03.l1<>"")*(03.skore="")) (:369-371).
    checks["DQ-04"] = tuple(
        process_row(pid) for pid, d in derivation.processes.items() if d.criticality_score is None
    )
    # DQ-05 — =COUNTIF(03.kontrola_bcm,"GAP*") (:372-374); engine bcm_check.
    checks["DQ-05"] = tuple(
        process_row(pid) for pid, d in derivation.processes.items() if d.bcm_check == BCM_GAP
    )
    # DQ-43 — =SUMPRODUCT((03.l1<>"")*(03.utvar="")) (:510-512).
    checks["DQ-43"] = tuple(
        process_row(row.id)
        for row in graph.processes
        if row.l1_process and row.owner_department is None
    )

    # ------------------------------------------------------------------ 04 --
    # DQ-06 — owner-less asset: both owner cells blank (:375-377).
    checks["DQ-06"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.business_owner is None and row.ict_owner is None
    )
    # DQ-07 — =SUMPRODUCT((04.id<>"")*(h_par=0)) (:378-380): the primary
    # designation lives on the 05-links in-app, so h_par=0 <=> no primary link.
    checks["DQ-07"] = tuple(
        asset_row(aid)
        for aid, d in derivation.assets.items()
        if d.inputs.primary_process_id is None
    )
    # DQ-08 — =(vysledna="Kritická")*(h_rizika=0) (:381-383); h_rizika =
    # COUNTIF over 13_Rizika subjects (sheets_core.py:412-413) -> Risk<->Asset links.
    checks["DQ-08"] = tuple(
        asset_row(aid)
        for aid, d in derivation.assets.items()
        if d.resulting_criticality == _CLASS_CRITICAL and risk_count_by_asset[aid] == 0
    )
    # DQ-09 — =COUNTIF(04.stav_revize,"K revizi") (:384-386).
    checks["DQ-09"] = tuple(
        asset_row(row.id) for row in graph.assets if row.review_state == _REVIEW_PENDING
    )
    # DQ-10 — =(legacy="Ano")*(legacy_posl="") (:387-389); engine legacy.
    checks["DQ-10"] = tuple(
        asset_row(aid)
        for aid, d in derivation.assets.items()
        if d.legacy == ANO
        and assets_by_id[aid].last_legacy_risk_assessment_date is None
    )
    # DQ-27 — gdpr blank/Neurčeno (:453-455); DQ-28 — ai analog (:456-458).
    checks["DQ-27"] = tuple(
        asset_row(row.id) for row in graph.assets if row.gdpr_relevance in (None, _UNDETERMINED)
    )
    checks["DQ-28"] = tuple(
        asset_row(row.id) for row in graph.assets if row.ai_relevance in (None, _UNDETERMINED)
    )

    def _ciaa_incomplete(row: AssetDerivationInput) -> bool:
        return (
            row.confidentiality_rating is None
            or row.integrity_rating is None
            or row.availability_rating is None
            or row.authenticity_rating is None
        )

    # DQ-29 — any of C/I/A/Au blank (:459-461).
    checks["DQ-29"] = tuple(asset_row(row.id) for row in graph.assets if _ciaa_incomplete(row))
    # DQ-30 — any of d_klient/d_reg (entered) or d_provoz/d_fin (inherited
    # from the primary Process — engine outputs) blank (:462-464).
    checks["DQ-30"] = tuple(
        asset_row(aid)
        for aid, d in derivation.assets.items()
        if assets_by_id[aid].impact_client is None
        or assets_by_id[aid].impact_regulatory is None
        or d.inherited_impact_operations is None
        or d.inherited_impact_financial is None
    )
    # DQ-31 — structural: cif="Ano" but cif_pocet=0 (:465-467). The engine
    # derives both from the same links, so this reads 0 unless the engine
    # itself regresses.
    checks["DQ-31"] = tuple(
        asset_row(aid)
        for aid, d in derivation.assets.items()
        if d.cif == ANO and d.cif_process_count == 0
    )
    # DQ-33 — internet="Ano" with incomplete CIAA (:472-474).
    checks["DQ-33"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.internet_exposed == ANO and _ciaa_incomplete(row)
    )
    # DQ-34 — ai="Ano" with no owner of either kind (:475-477).
    checks["DQ-34"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.ai_relevance == ANO and row.business_owner is None and row.ict_owner is None
    )

    def _confidentiality_below(row: AssetDerivationInput) -> bool:
        return row.confidentiality_rating is None or row.confidentiality_rating < gdpr_min_c

    # DQ-35 — gdpr="Ano" and C blank or < P_GdprMinC (:478-480).
    checks["DQ-35"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.gdpr_relevance == ANO and _confidentiality_below(row)
    )
    # DQ-36 — spof="Ano" (engine) and stav_revize<>"Zkontrolováno" (:481-483).
    checks["DQ-36"] = tuple(
        asset_row(aid)
        for aid, d in derivation.assets.items()
        if d.spof == ANO and assets_by_id[aid].review_state != _REVIEW_DONE
    )
    # DQ-44 — utvar blank (:513-515).
    checks["DQ-44"] = tuple(
        asset_row(row.id) for row in graph.assets if row.owner_department is None
    )
    # DQ-46 — klasdat blank/Neposouzeno (:519-521).
    checks["DQ-46"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.data_classification in (None, _UNASSESSED)
    )
    # DQ-47 — highly-confidential data with C blank or < P_GdprMinC (:522-524).
    checks["DQ-47"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.data_classification == _DATA_CLASS_HIGHLY_CONFIDENTIAL and _confidentiality_below(row)
    )
    # DQ-48 — model blank/Neposouzeno (:525-527).
    checks["DQ-48"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.deployment_model in (None, _UNASSESSED)
    )
    # DQ-51 — gdpr="Ano" with a no-data/public data classification (:538-542).
    checks["DQ-51"] = tuple(
        asset_row(row.id)
        for row in graph.assets
        if row.gdpr_relevance == ANO and row.data_classification in _DATA_CLASS_CONFLICTS_WITH_GDPR
    )

    # --------------------------------------------------------------- links --
    # DQ-11 — 05!K DUPLICITA on the (process, asset) pair
    # (sheets_core.py:588-589); every row of a duplicated pair counts.
    checks["DQ-11"] = tuple(
        DqViolatingRow(
            "process_asset_link",
            link.asset_id,
            f"{process_label(link.process_id)} ↔ {asset_label(link.asset_id)}",
            "process",
            link.process_id,
        )
        for link in graph.process_asset_links
        if pal_pair_counts[(link.process_id, link.asset_id)] > 1
    )
    # DQ-12 — 10!N DUPLICITA on the (asset, vendor, S-code) triple
    # (sheets_vendors.py:445-447).
    checks["DQ-12"] = tuple(
        DqViolatingRow(
            "asset_vendor_link",
            link.vendor_id,
            f"{asset_label(link.asset_id)} ↔ {vendor_label(link.vendor_id)} ({link.ict_service_code or ''})",
            "asset",
            link.asset_id,
            vendor_scope_ids=vendor_scope(link.vendor_id),
        )
        for link in graph.asset_vendor_links
        if avl_triple_counts[(link.asset_id, link.vendor_id, link.ict_service_code)] > 1
    )
    # DQ-13 — 05 links referencing missing rows; the workbook sums BOTH end
    # checks, so a row broken on both ends counts twice (:396-399).
    dq13: list[DqViolatingRow] = []
    for link in graph.process_asset_links:
        if link.process_id not in processes_by_id:
            dq13.append(
                DqViolatingRow(
                    "process_asset_link",
                    link.process_id,
                    f"{UNKNOWN_LOOKUP} ↔ {asset_label(link.asset_id)}",
                    "asset",
                    link.asset_id,
                )
            )
        if link.asset_id not in assets_by_id:
            dq13.append(
                DqViolatingRow(
                    "process_asset_link",
                    link.asset_id,
                    f"{process_label(link.process_id)} ↔ {UNKNOWN_LOOKUP}",
                    "process",
                    link.process_id,
                )
            )
    checks["DQ-13"] = tuple(dq13)
    # DQ-14 — 10 links onto a CIF asset (10!M, the engine's asset cif) with a
    # blank Míra závislosti (:400-402). A missing asset row lookups to "" and
    # never counts, exactly as 10!M's XLOOKUP fallback.
    checks["DQ-14"] = tuple(
        DqViolatingRow(
            "asset_vendor_link",
            link.vendor_id,
            f"{asset_label(link.asset_id)} ↔ {vendor_label(link.vendor_id)}",
            "asset",
            link.asset_id,
            vendor_scope_ids=vendor_scope(link.vendor_id),
        )
        for link in graph.asset_vendor_links
        if link.asset_id in derivation.assets
        and derivation.assets[link.asset_id].cif == ANO
        and link.reliance is None
    )
    # DQ-15 — §1 manual pairs whose VENDOR has no sheet-10 link at all: the
    # 11 §1 I helper is =COUNTIF(10!$C:$C, vendor) (sheets_vendors.py:515-516).
    checks["DQ-15"] = tuple(
        DqViolatingRow(
            "process_vendor_link",
            link.vendor_id,
            f"{process_label(link.process_id)} ↔ {vendor_label(link.vendor_id)}",
            "vendor",
            link.vendor_id,
            vendor_scope_ids=vendor_scope(link.vendor_id),
        )
        for link in graph.process_vendor_links
        if av_link_count_by_vendor[link.vendor_id] == 0
    )
    # DQ-37 — 06 rows where the supporting asset's level sorts below the
    # dependent's (:485-487). J/K are LEFT(...,1) chars — including the
    # blank-level "0" coercion (_asset_level_char).
    dq37: list[DqViolatingRow] = []
    for aa_link in graph.asset_asset_links:
        dependent = assets_by_id.get(aa_link.dependent_asset_id)
        supporting = assets_by_id.get(aa_link.supporting_asset_id)
        dependent_char = _asset_level_char(
            dependent.asset_level if dependent else None, row_exists=dependent is not None
        )
        supporting_char = _asset_level_char(
            supporting.asset_level if supporting else None, row_exists=supporting is not None
        )
        if (
            dependent_char is not None
            and supporting_char is not None
            and supporting_char.casefold() < dependent_char.casefold()
        ):
            dq37.append(
                DqViolatingRow(
                    "asset_asset_link",
                    aa_link.dependent_asset_id,
                    f"{asset_label(aa_link.dependent_asset_id)} → {asset_label(aa_link.supporting_asset_id)}",
                    "asset",
                    aa_link.dependent_asset_id,
                )
            )
    checks["DQ-37"] = tuple(dq37)
    # DQ-38 — =COUNTIF(09.K,"CHYBA ŘETĚZCE") (:488-490); engine chain_check.
    checks["DQ-38"] = tuple(
        sub_row(
            sub_id,
            subs_by_id[sub_id].vendor_id,
            subs_by_id[sub_id].sub_provider_name or f"SUB-{sub_id}",
        )
        for sub_id, d in derivation.sub_outsourcing.items()
        if d.chain_check == CHAIN_BREAK_CHECK
    )
    # DQ-40 — the five 06/08/09 existence checks, summed (:494-502).
    dq40: list[DqViolatingRow] = []
    for aa_link in graph.asset_asset_links:
        if aa_link.dependent_asset_id not in assets_by_id:
            dq40.append(
                DqViolatingRow(
                    "asset_asset_link",
                    aa_link.dependent_asset_id,
                    f"{UNKNOWN_LOOKUP} → {asset_label(aa_link.supporting_asset_id)}",
                    "asset",
                    aa_link.supporting_asset_id,
                )
            )
        if aa_link.supporting_asset_id not in assets_by_id:
            dq40.append(
                DqViolatingRow(
                    "asset_asset_link",
                    aa_link.supporting_asset_id,
                    f"{asset_label(aa_link.dependent_asset_id)} → {UNKNOWN_LOOKUP}",
                    "asset",
                    aa_link.dependent_asset_id,
                )
            )
    for contract in graph.contracts:
        if contract.vendor_id not in vendors_by_id:
            dq40.append(
                contract_row(contract.id, f"{contract.contract_reference or f'#{contract.id}'} → {UNKNOWN_LOOKUP}")
            )
    sub_ids = {sub.id for sub in graph.sub_outsourcing}
    for sub in graph.sub_outsourcing:
        if sub.predecessor_id is not None and sub.predecessor_id not in sub_ids:
            dq40.append(
                sub_row(sub.id, sub.vendor_id, f"{sub.sub_provider_name or f'SUB-{sub.id}'} → {UNKNOWN_LOOKUP}")
            )
        if sub.sub_provider_vendor_id is not None and sub.sub_provider_vendor_id not in vendors_by_id:
            dq40.append(
                sub_row(
                    sub.id,
                    sub.vendor_id,
                    f"{sub.sub_provider_name or f'SUB-{sub.id}'} ({UNKNOWN_LOOKUP})",
                )
            )
    checks["DQ-40"] = tuple(dq40)
    # DQ-45 — 05!vyznam blank/Neposouzeno (:516-518).
    checks["DQ-45"] = tuple(
        DqViolatingRow(
            "process_asset_link",
            link.asset_id,
            f"{process_label(link.process_id)} ↔ {asset_label(link.asset_id)}",
            "process",
            link.process_id,
        )
        for link in graph.process_asset_links
        if link.significance in (None, _UNASSESSED)
    )

    # ------------------------------------------------------------------ 07 --
    def vendors_where(predicate: Callable[[int], bool]) -> tuple[DqViolatingRow, ...]:
        return tuple(vendor_row(vid) for vid in derivation.vendors if predicate(vid))

    vendor_results = derivation.vendors
    # DQ-16 — top tier without an ID code (:406-409).
    checks["DQ-16"] = vendors_where(
        lambda vid: vendor_results[vid].tier in _TOP_TIERS
        and vendors_by_id[vid].identifier_value is None
    )
    # DQ-17 — Critical without a FUNCTIONAL exit plan (:410-413): anything but
    # Schválen/Testován/K revizi fires, blank included.
    checks["DQ-17"] = vendors_where(
        lambda vid: vendor_results[vid].tier == TIER_CRITICAL
        and vendors_by_id[vid].exit_plan_state not in _EXIT_FUNCTIONAL_STATES
    )
    # DQ-18 — top tier without an ex-ante assessment date (:414-417).
    checks["DQ-18"] = vendors_where(
        lambda vid: vendor_results[vid].tier in _TOP_TIERS
        and vendors_by_id[vid].ex_ante_assessment_date is None
    )
    # DQ-19 — Critical without an ongoing risk (:418-420); the workbook's
    # h_rizika counts 13_Rizika rows with Fáze="Průběžná"
    # (sheets_vendors.py:157-158) — the app Risk has no Fáze column, so every
    # Vendor<->Risk link counts (loader disposition, module docstring).
    checks["DQ-19"] = vendors_where(
        lambda vid: vendor_results[vid].tier == TIER_CRITICAL and risk_count_by_vendor[vid] == 0
    )
    # DQ-32 — top tier without a main contract (:468-471); the engine's
    # sml_ref lookup (blank when no main contract or a blank reference).
    checks["DQ-32"] = vendors_where(
        lambda vid: vendor_results[vid].tier in _TOP_TIERS
        and vendor_results[vid].main_contract_reference is None
    )
    # DQ-39 — has contracts but not exactly one main (:491-493); engine
    # h_smluv/h_hlavni tallies.
    checks["DQ-39"] = vendors_where(
        lambda vid: vendor_results[vid].contract_count > 0
        and vendor_results[vid].main_contract_count != 1
    )
    # DQ-41 — links but no contract on record (:503-505); engine tallies
    # (proc_n counts §1 + §2, exactly as 07!proc_n does).
    checks["DQ-41"] = vendors_where(
        lambda vid: vendor_results[vid].contract_count == 0
        and (
            vendor_results[vid].linked_asset_count > 0
            or vendor_results[vid].linked_process_count > 0
        )
    )
    # DQ-49 — top tier without an exit plan in an ORDERLY state (:528-532).
    checks["DQ-49"] = vendors_where(
        lambda vid: vendor_results[vid].tier in _TOP_TIERS
        and vendors_by_id[vid].exit_plan_state not in _EXIT_ORDERLY_STATES
    )
    # DQ-50 — top tier with due diligence not started (:533-537).
    checks["DQ-50"] = vendors_where(
        lambda vid: vendor_results[vid].tier in _TOP_TIERS
        and vendors_by_id[vid].due_diligence_state in _DD_NOT_STARTED_STATES
    )
    # DQ-52 — top tier whose significance outcome stayed "Ne" (:543-547);
    # engine vyz_vysledek.
    checks["DQ-52"] = vendors_where(
        lambda vid: vendor_results[vid].tier in _TOP_TIERS
        and vendor_results[vid].significance_outcome == NE
    )

    # ------------------------------------------------------------------ 13 --
    # DQ-20 — high/critical net risk, not accepted or closed, no action plan
    # (:421-424).
    checks["DQ-20"] = tuple(
        risk_row(risk)
        for risk in dq_graph.risks
        if risk_net_band(
            risk.net_score,
            medium_from=risk_medium_from,
            high_from=risk_high_from,
            critical_from=risk_critical_from,
        )
        in (RISK_BAND_HIGH, RISK_BAND_CRITICAL)
        and risk.status_label != RISK_STATUS_ACCEPTED
        and risk.status_label != RISK_STATUS_CLOSED
        and risk.action_plan_date is None
    )
    # DQ-21 — acceptance above tolerance with an incomplete trio (:425-428).
    checks["DQ-21"] = tuple(
        risk_row(risk)
        for risk in dq_graph.risks
        if risk.response == RISK_RESPONSE_ACCEPTANCE
        and risk_vs_tolerance(risk.net_score, tolerance=risk_tolerance) == RISK_OVER_TOLERANCE
        and (
            risk.acceptance_approver is None
            or risk.acceptance_justification is None
            or risk.acceptance_date is None
        )
    )
    # DQ-22 — acceptance review overdue: prezkum_do < P_RefDatum (:429-431).
    checks["DQ-22"] = tuple(
        risk_row(risk)
        for risk in dq_graph.risks
        if (due := acceptance_review_due(risk.acceptance_date)) is not None and due < reference_date
    )
    # DQ-23 — assessment overdue: pristi < P_RefDatum (:432-434). The app Risk
    # has no assessment date, so this stays 0 in production (module docstring).
    checks["DQ-23"] = tuple(
        risk_row(risk)
        for risk in dq_graph.risks
        if (nxt := next_assessment_date(risk.assessment_date, risk.is_material)) is not None
        and nxt < reference_date
    )

    # ----------------------------------------------------------- integrity --
    # DQ-24 — duplicate ids across the 03/04/07 registers (:435-438): every
    # row whose id occurs more than once counts.
    process_id_counts = Counter(row.id for row in graph.processes)
    asset_id_counts = Counter(row.id for row in graph.assets)
    vendor_id_counts = Counter(row.id for row in graph.vendors)
    dq24: list[DqViolatingRow] = []
    dq24.extend(process_row(row.id) for row in graph.processes if process_id_counts[row.id] > 1)
    dq24.extend(asset_row(row.id) for row in graph.assets if asset_id_counts[row.id] > 1)
    dq24.extend(vendor_row(row.id) for row in graph.vendors if vendor_id_counts[row.id] > 1)
    checks["DQ-24"] = tuple(dq24)
    # DQ-25 — §2 expansion consistency (:439-441): expected pairs (the 11!B608
    # total = SUM of 10!P) minus the materialized rows with a resolvable
    # process. In-app the expansion is always complete, so any residue is a
    # pair whose Process row is missing from the graph.
    pal_links_by_asset: dict[int, int] = Counter(
        link.asset_id for link in graph.process_asset_links
    )
    expected_pairs = sum(pal_links_by_asset[link.asset_id] for link in graph.asset_vendor_links)
    materialized_pairs = sum(
        len(d.transitive_vendor_links) for d in derivation.processes.values()
    )
    dq25: list[DqViolatingRow] = []
    if expected_pairs != materialized_pairs:
        seen_processes = set(derivation.processes)
        for av_link in graph.asset_vendor_links:
            for pal_link in graph.process_asset_links:
                if pal_link.asset_id == av_link.asset_id and pal_link.process_id not in seen_processes:
                    dq25.append(
                        DqViolatingRow(
                            "process_vendor_link",
                            pal_link.process_id,
                            f"{UNKNOWN_LOOKUP} ↔ {vendor_label(av_link.vendor_id)}"
                            f" (přes {asset_label(av_link.asset_id)})",
                            "asset",
                            av_link.asset_id,
                            vendor_scope_ids=vendor_scope(av_link.vendor_id),
                        )
                    )
    checks["DQ-25"] = tuple(dq25)
    # DQ-26 — error cells in formulas (:442-451): the in-app analog is the
    # engine's "?" lookup sentinels (spec section 5 reads them as
    # formula-integrity conditions): vendor kat_zeme, contract vendor-name,
    # sub-outsourcing contract/vendor lookups. One row per sentinel occurrence,
    # as the workbook counts cells.
    dq26: list[DqViolatingRow] = []
    for vid, vendor_result in derivation.vendors.items():
        if vendor_result.country_category == UNKNOWN_LOOKUP:
            dq26.append(vendor_row(vid, f"{vendor_label(vid)} (kat_zeme {UNKNOWN_LOOKUP})"))
    for cid, contract_result in derivation.contracts.items():
        if contract_result.vendor_name == UNKNOWN_LOOKUP:
            contract = contracts_by_id[cid]
            dq26.append(
                contract_row(cid, f"{contract.contract_reference or f'#{cid}'} → {UNKNOWN_LOOKUP}")
            )
    for sid, sub_result in derivation.sub_outsourcing.items():
        entry = subs_by_id[sid]
        entry_label = entry.sub_provider_name or f"SUB-{sid}"
        if sub_result.contract_reference == UNKNOWN_LOOKUP:
            dq26.append(sub_row(sid, entry.vendor_id, f"{entry_label} (smlouva {UNKNOWN_LOOKUP})"))
        if sub_result.contract_vendor_name == UNKNOWN_LOOKUP:
            dq26.append(sub_row(sid, entry.vendor_id, f"{entry_label} (dodavatel {UNKNOWN_LOOKUP})"))
    checks["DQ-26"] = tuple(dq26)

    # ------------------------------------------------------- 08/09 (scope) --
    # DQ-42 — =COUNTIF(09.pomocný rozsah RoI,"Ne") (:506-509); engine roi_scope.
    checks["DQ-42"] = tuple(
        sub_row(
            sid,
            subs_by_id[sid].vendor_id,
            subs_by_id[sid].sub_provider_name or f"SUB-{sid}",
        )
        for sid, d in derivation.sub_outsourcing.items()
        if d.roi_scope == NE
    )

    ordered = tuple(
        DqCheckResult(
            check_id=check_id,
            area=area,
            title_cs=title_cs,
            severity=severity,
            threshold=0,
            count=len(checks[check_id]),
            # F — =IF(D="","",IF(D>E,"NÁLEZ","OK")) (sheets_out.py:570).
            status=DQ_STATUS_FINDING if len(checks[check_id]) > 0 else DQ_STATUS_OK,
            violating_rows=checks[check_id],
            production_inert=check_id in PRODUCTION_INERT_REASONS,
            production_inert_reason=PRODUCTION_INERT_REASONS.get(check_id),
        )
        for check_id, area, title_cs, severity in DQ_CHECK_CATALOG
    )
    return IctRegisterDqResult(
        checks=ordered,
        finding_count=sum(1 for check in ordered if check.status == DQ_STATUS_FINDING),
    )
