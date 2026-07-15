"""Internal ICT Register derivation orchestration (issues #48/#49).

One deep module: register graph in, every derived value out. The formulas are
the workbook's, verbatim, per docs/dora-ict-register/dora-excel-functional-spec.md
(referenced below as "spec"): Process score/class/CIF and gap checks
(spec 2.1, 1.1), the Criticality cascade onto Assets — ``hodnota``,
``bus_krit``, the weighted ``skore``, ``h_rank``/``vysledna`` MAX aggregation,
``klas8``, CIF any-true, SPOF, ``ext_zavis``, ``legacy`` (spec 2.2, 2.3(1)) —
plus the count/list aggregates, and the vendor side of the cascade (#49):
Vendor two-path CIF, ``max_krit`` via the MAXIFS ``h_rank``, the tier formula
verbatim (its structurally unreachable "Významný" branch included),
``cif_ret`` chain propagation, chain-position ``uroven_ret``, the
``vyz_vysledek`` significance outcome, completeness flags (03/04/07), the
Contract deriveds (vendor-name lookup, chain display, duplicate check, hidden
CIF), the Sub-outsourcing Rank recursion with its "?" break sentinel, and the
derived-only transitive Process<->Vendor §2 expansion. Czech labels come from
the workbook's closed lists (``TridyKrit``, ``TierDod``), never re-spelled.

Contract:
- **Pure**: no database session, no awaits, no persistence. Derived values are
  computed on read and never stored (parent spec #38: compute-on-read).
- **Parameters**: every threshold/bonus/date is read from the seeded
  :class:`IctWorkbookParameterSet` (ADR-008 overlay), never hardcoded.
- **Emptiness over absence**: rules run verbatim over empty collections. The
  workbook's 09!F "Subdodavatel (ID)" is a Vendor-register reference, while
  the app stores sub-provider identity inline (#45) — production graphs never
  set ``SubOutsourcingInput.sub_provider_vendor_id``, so the vendor-side chain
  paths (``cif_ret``'s second branch, ``uroven_ret`` B/C) are reproduced
  verbatim and exercised by goldens via direct engine input, the same
  disposition as the tier formula's unreachable branch (spec section 8).
- **Explain**: every derived block carries an ``inputs`` object exposing the
  values (and parameter thresholds) that produced it — the "why is this
  critical" story for the committee and auditors (#38 user story 14).

The async graph loader lives in the sibling ``derivation_inputs`` module;
golden tests drive this module directly (tests/backend/pytest/
test_ict_register_derivation.py and test_ict_register_derivation_vendors.py).
"""

from __future__ import annotations

import calendar
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.services._ict_register_reference import closed_list_values
from app.services._ict_register_reference.parameters import IctWorkbookParameterSet

ANO = "Ano"
NE = "Ne"

# TridyKrit, verbatim: ("Nízká", "Střední", "Vysoká", "Kritická"); MATCH rank 1-4.
CRITICALITY_CLASSES: tuple[str, ...] = tuple(str(v) for v in closed_list_values("TridyKrit"))
_CLASS_CRITICAL = CRITICALITY_CLASSES[3]

# TierDod, verbatim: ("Kritický dodavatel", "Významný dodavatel", "Standardní dodavatel").
VENDOR_TIERS: tuple[str, ...] = tuple(str(v) for v in closed_list_values("TierDod"))
TIER_CRITICAL, TIER_SIGNIFICANT, TIER_STANDARD = VENDOR_TIERS

CHECK_OK = "OK"
RTO_MTPD_GAP = "GAP: RTO > MTPD"
BCM_GAP = "GAP: CIF bez BCM"
DUPLICATE_CHECK = "DUPLICITA"
CHAIN_BREAK_CHECK = "CHYBA ŘETĚZCE"
# XLOOKUP's not-found fallback on the workbook's lookup columns.
UNKNOWN_LOOKUP = "?"

ARTICLE8_CRITICAL = "Kritické"
ARTICLE8_NON_CRITICAL = "Nekritické"

# Chain-position levels (07!uroven_ret) — builder sheets_vendors.py:116-119.
CHAIN_LEVEL_OWN_LINKS = "A"
CHAIN_LEVEL_DIRECT_SUB = "B"
CHAIN_LEVEL_DEEP_SUB = "C"

# The tier formula's two substitutability literals (builder sheets_vendors.py:111-112):
#   subst="Nenahraditelný", subst="Velmi obtížně nahraditelný"
# — the top-2 values of the Substituce closed list, hardcoded in the formula.
_TIER_SUBSTITUTABILITY_TRIGGERS: tuple[str, ...] = (
    "Nenahraditelný",
    "Velmi obtížně nahraditelný",
)

# Weighted asset score (spec 2.2 step 4) — weights verbatim, summing to 1.00.
_ASSET_SCORE_WEIGHTS: tuple[Decimal, ...] = (
    Decimal("0.1"),  # C — confidentiality
    Decimal("0.1"),  # I — integrity
    Decimal("0.2"),  # A — availability
    Decimal("0.1"),  # Au — authenticity
    Decimal("0.2"),  # d_klient — client impact
    Decimal("0.2"),  # d_reg — regulatory impact
    Decimal("0.05"),  # nahr — substitutability rating
    Decimal("0.05"),  # zavis — vendor dependency rating
)

# Process completeness (hotovo, spec 1.1): owner/impacts/mtpd/rto/rpo/
# dopad_prer/datum. The reputational axis is structurally excluded — the
# workbook enters it but no formula reads it (spec section 8 item 10).
_PROCESS_COMPLETENESS_FIELDS: tuple[str, ...] = (
    "owner",
    "impact_client",
    "impact_market_operations",
    "impact_regulatory",
    "impact_financial",
    "mtpd_hours",
    "rto_hours",
    "rpo_hours",
    "interruption_impact",
    "assessment_date",
)

# Asset completeness (04!hotovo) — builder sheets_core.py:400-406, verbatim:
#   =IF($B{r}="","",IF(COUNTBLANK($B:$popis)+COUNTBLANK($umisteni:$model)
#     +COUNTBLANK($bus_vlastnik)+COUNTBLANK($ict_vlastnik:$klasdat)
#     +COUNTBLANK($proc_id)+COUNTBLANK($c:$au)+COUNTBLANK($d_klient:$d_reg)
#     +COUNTBLANK($nahr:$zavis)+COUNTBLANK($internet)+COUNTBLANK($stav)=0,"✓","⚠"))
# Span resolution against the AKT_BLOCKS layout (builder seed.py:505-517): the
# spans deliberately SKIP the derived cells between their endpoints (klas8)
# and the DQ-owned `utvar` (owner department, DQ-44). ``proc_id`` — the
# primary-Process designation — is checked as a pseudo-field over the links.
_ASSET_COMPLETENESS_FIELDS: tuple[str, ...] = (
    "asset_type",
    "asset_level",
    "description",
    "physical_location",
    "deployment_model",
    "business_owner",
    "ict_owner",
    "gdpr_relevance",
    "ai_relevance",
    "data_classification",
    "confidentiality_rating",
    "integrity_rating",
    "availability_rating",
    "authenticity_rating",
    "impact_client",
    "impact_regulatory",
    "substitutability_rating",
    "vendor_dependency_rating",
    "internet_exposed",
    "lifecycle_state",
)
_ASSET_COMPLETENESS_PRIMARY_PROCESS = "primary_process"

# Vendor completeness (07!hotovo) — builder sheets_vendors.py:142-148, verbatim:
#   =IF($B{r}="","",IF(COUNTBLANK($typ_osoby:$zeme)+COUNTBLANK($sml_ref:$typ_ujedn)
#     +COUNTBLANK($zahajeni:$ukonceni)+IF($subst="",1,0)+IF($exit="",1,0)
#     +IF(AND(OR($tier="Kritický dodavatel",$tier="Významný dodavatel"),
#             $ea_datum=""),1,0)=0,"✓","⚠"))
# Span resolution against DOD_BLOCKS (builder seed.py:578-594):
# typ_osoby:zeme = {typ_osoby, idk, typ_idk, zeme}; sml_ref:typ_ujedn and
# zahajeni:ukonceni are the main-contract-derived pairs of block B.
_VENDOR_COMPLETENESS_ENTERED_FIELDS: tuple[str, ...] = (
    "person_type",
    "identifier_value",
    "identifier_type",
    "country",
)
_VENDOR_COMPLETENESS_MAIN_CONTRACT_FIELDS: tuple[str, ...] = (
    "main_contract_reference",
    "main_contract_arrangement_type",
    "main_contract_start_date",
    "main_contract_end_date",
)


# ---------------------------------------------------------------------------
# Graph inputs — plain rows, entered fields only.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProcessDerivationInput:
    """One 03_Procesy row — the entered fields the engine reads (spec 1.1).

    ``impact_reputational`` is deliberately absent: it sits outside the summed
    ``d_klient:d_fin`` range and is read by no workbook formula (spec 2.1,
    section 8 item 10).
    """

    id: int
    l1_process: str
    l2_subprocess: str | None = None
    owner: str | None = None
    # utvar — entered, read only by DQ-43 (issue #50); no derivation consumes it.
    owner_department: str | None = None
    impact_client: int | None = None
    impact_market_operations: int | None = None
    impact_regulatory: int | None = None
    impact_financial: int | None = None
    mtpd_hours: int | None = None
    preliminary_criticality: str | None = None
    cif_override: str | None = None
    rto_hours: int | None = None
    rpo_hours: int | None = None
    bcm_link: str | None = None
    interruption_impact: str | None = None
    assessment_date: date | None = None


@dataclass(frozen=True)
class AssetDerivationInput:
    """One 04_Aktiva row — the entered fields the engine reads (spec 1.2)."""

    id: int
    name: str
    confidentiality_rating: int | None = None
    integrity_rating: int | None = None
    availability_rating: int | None = None
    authenticity_rating: int | None = None
    impact_client: int | None = None
    impact_regulatory: int | None = None
    substitutability_rating: int | None = None
    vendor_dependency_rating: int | None = None
    preliminary_criticality: str | None = None
    lifecycle_state: str | None = None
    standard_support_end_date: date | None = None
    # Entered fields read only by the completeness flag (04!hotovo, #49).
    asset_type: str | None = None
    asset_level: str | None = None
    description: str | None = None
    physical_location: str | None = None
    deployment_model: str | None = None
    business_owner: str | None = None
    ict_owner: str | None = None
    gdpr_relevance: str | None = None
    ai_relevance: str | None = None
    data_classification: str | None = None
    internet_exposed: str | None = None
    # Entered fields read only by the DQ checks (issue #50): utvar (DQ-44),
    # stav_revize (DQ-09/36), legacy_posl (DQ-10). No derivation consumes them.
    owner_department: str | None = None
    review_state: str | None = None
    last_legacy_risk_assessment_date: date | None = None


@dataclass(frozen=True)
class ProcessAssetLinkInput:
    """One sheet-05 link (Process<->Asset): SPOF and the primary designation."""

    process_id: int
    asset_id: int
    spof: str | None = None
    is_primary: bool = False
    # 05!vyznam — entered, read only by DQ-45 (issue #50).
    significance: str | None = None


@dataclass(frozen=True)
class AssetAssetLinkInput:
    """One sheet-06 link (Asset<->Asset), directional: dependent -> supporting."""

    dependent_asset_id: int
    supporting_asset_id: int


@dataclass(frozen=True)
class AssetVendorLinkInput:
    """One sheet-10 link (Asset<->Vendor) — fed by ticket #46; empty until then."""

    asset_id: int
    vendor_id: int
    vendor_name: str | None = None
    ict_service_code: str | None = None
    contract_reference: str | None = None
    # 10!mira "Míra závislosti (u CIF)" — entered, read only by DQ-14 (issue #50).
    reliance: str | None = None


@dataclass(frozen=True)
class ProcessVendorLinkInput:
    """One sheet-11 §1 manual Process<->Vendor pair (issue #46)."""

    process_id: int
    vendor_id: int


@dataclass(frozen=True)
class VendorDerivationInput:
    """One 07_Dodavatelé row — the entered fields the engine reads (spec 1.3).

    ``substitutability`` is the register's Substituce input (the Vendor
    entity's ``replaceability`` column, issue #44).
    """

    id: int
    name: str
    country: str | None = None
    person_type: str | None = None
    identifier_type: str | None = None
    identifier_value: str | None = None
    substitutability: str | None = None
    exit_plan_state: str | None = None
    ex_ante_assessment_date: date | None = None
    # dd_stav — entered, read only by DQ-50 (issue #50).
    due_diligence_state: str | None = None
    significance_authorization_conditions: str | None = None
    significance_regulatory_requirements: str | None = None
    significance_service_quality: str | None = None
    significance_financial_impact: str | None = None
    significance_reputation_continuity: str | None = None
    significance_cumulative_impact: str | None = None


@dataclass(frozen=True)
class VendorContractInput:
    """One 08_Smlouvy row — the entered columns the engine reads (spec 1.4)."""

    id: int
    vendor_id: int
    contract_reference: str | None = None
    arrangement_type: str | None = None
    main_contract: str | None = None
    roi_scope: str | None = None
    start_date: date | None = None
    end_date: date | None = None


@dataclass(frozen=True)
class SubOutsourcingInput:
    """One 09_Subdodávky row — the entered columns the engine reads (spec 1.5).

    ``predecessor_id`` None marks a direct sub-outsourcer of the Contract (the
    workbook's ``E = D`` case); non-None points at the predecessor row in the
    same chain. ``sub_provider_vendor_id`` is the engine-level analog of the
    workbook's 09!F Vendor-register reference — the app stores sub-provider
    identity inline (#45), so the production loader never resolves it; the
    verbatim ``cif_ret``/``uroven_ret``/``subdod`` chain paths stay covered by
    goldens through direct engine input (module docstring).
    """

    id: int
    vendor_id: int
    contract_id: int
    predecessor_id: int | None = None
    sub_provider_name: str | None = None
    sub_provider_vendor_id: int | None = None


@dataclass(frozen=True)
class IctRegisterGraph:
    """The register graph slice the engine derives over."""

    processes: tuple[ProcessDerivationInput, ...] = ()
    assets: tuple[AssetDerivationInput, ...] = ()
    process_asset_links: tuple[ProcessAssetLinkInput, ...] = ()
    asset_asset_links: tuple[AssetAssetLinkInput, ...] = ()
    asset_vendor_links: tuple[AssetVendorLinkInput, ...] = ()
    process_vendor_links: tuple[ProcessVendorLinkInput, ...] = ()
    vendors: tuple[VendorDerivationInput, ...] = ()
    contracts: tuple[VendorContractInput, ...] = ()
    sub_outsourcing: tuple[SubOutsourcingInput, ...] = ()


# ---------------------------------------------------------------------------
# Derived outputs, each with its explain-inputs block.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TransitiveProcessVendorLink:
    """One derived 11 §2 row: a (Process, Vendor) pair implied via an Asset.

    The full transitive expansion (spec 1.8 §2, ~428-429): every
    (process, asset, vendor) triple from joining the sheet-05 links with the
    sheet-10 links — derived on read, browsable, never persisted. Name lookups
    fall back to the workbook's "?" when the referenced row is absent.
    """

    process_id: int
    process_name: str
    process_cif: str | None
    process_criticality: str | None
    vendor_id: int
    vendor_name: str
    via_asset_id: int
    via_asset_name: str


@dataclass(frozen=True)
class ProcessDerivedInputs:
    """The inputs (and parameter values) behind one Process's derived block."""

    impact_client: int | None
    impact_market_operations: int | None
    impact_regulatory: int | None
    impact_financial: int | None
    mtpd_hours: int | None
    mtpd_bonus: int | None
    threshold_critical_score: int
    threshold_high_score: int
    threshold_medium_score: int
    mtpd_critical_hours: int
    mtpd_medium_hours: int
    preliminary_criticality: str | None
    criticality_class_source: str
    cif_override: str | None
    cif_class_critical: bool
    cif_mtpd_within_critical: bool
    cif_any_impact_maximal: bool
    rto_hours: int | None
    bcm_link: str | None
    assessment_date: date | None
    missing_for_completeness: tuple[str, ...]
    # dod_n breakdown (spec 1.1 ~137): manual §1 pairs + derived §2 triples.
    manual_vendor_link_count: int = 0
    transitive_vendor_pair_count: int = 0


@dataclass(frozen=True)
class ProcessDerivation:
    """Every derived 03_Procesy value in #48/#49 scope (spec 1.1, 2.1)."""

    criticality_score: int | None
    criticality_class: str | None
    cif: str
    # Blank (None) when RTO or MTPD is missing — the workbook formula's
    # OR(rto="",mtpd="") guard, verified against the builder source.
    rto_mtpd_check: str | None
    bcm_check: str
    next_review_date: date | None
    linked_asset_count: int
    # dod_n — builder sheets_core.py:202-204, verbatim:
    #   =COUNTIF(11§1.ID procesu,this) + COUNTIF(11§2.ID procesu,this)
    linked_vendor_count: int
    is_complete: bool
    is_duplicate: bool
    inputs: ProcessDerivedInputs
    # The §2 rows for this Process — derived-only, never persisted (#49).
    transitive_vendor_links: tuple[TransitiveProcessVendorLink, ...] = ()


@dataclass(frozen=True)
class AssetDerivedInputs:
    """The inputs (signals, ranks, and parameters) behind one Asset's block."""

    confidentiality_rating: int | None
    integrity_rating: int | None
    availability_rating: int | None
    authenticity_rating: int | None
    impact_client: int | None
    impact_regulatory: int | None
    substitutability_rating: int | None
    vendor_dependency_rating: int | None
    preliminary_criticality: str | None
    lifecycle_state: str | None
    standard_support_end_date: date | None
    reference_date: date
    threshold_low_score: int
    threshold_medium_score: int
    threshold_high_score: int
    primary_process_id: int | None
    rank_primary_process_criticality: int
    rank_score_criticality: int
    rank_preliminary_criticality: int
    rank_business_criticality: int
    rank_cif_floor: int
    # 04!hotovo ingredients (#49): the blank entered cells, span order.
    missing_for_completeness: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssetDerivation:
    """Every derived 04_Aktiva value in #48/#49 scope (spec 1.2, 2.2, 2.3(1))."""

    ciaa_value: int | None
    primary_process_name: str | None
    primary_process_criticality: str | None
    inherited_impact_operations: int | None
    inherited_impact_financial: int | None
    inherited_rto_hours: int | None
    business_criticality: str | None
    weighted_score: float | None
    score_criticality: str | None
    h_rank: int
    resulting_criticality: str | None
    article8_classification: str
    cif: str
    cif_process_count: int
    cif_process_names: tuple[str, ...]
    spof: str
    external_dependency: str
    legacy: str
    linked_process_count: int
    linked_vendor_count: int
    linked_asset_names: tuple[str, ...]
    vendor_names: tuple[str, ...]
    ict_service_codes: tuple[str, ...]
    contract_references: tuple[str, ...]
    inputs: AssetDerivedInputs
    # 04!hotovo (#49): "✓" iff every completeness span is filled.
    is_complete: bool = False


@dataclass(frozen=True)
class VendorDerivedInputs:
    """The inputs, link tallies, and triggers behind one Vendor's block."""

    country: str | None
    substitutability: str | None
    exit_plan_state: str | None
    ex_ante_assessment_date: date | None
    significance_authorization_conditions: str | None
    significance_regulatory_requirements: str | None
    significance_service_quality: str | None
    significance_financial_impact: str | None
    significance_reputation_continuity: str | None
    significance_cumulative_impact: str | None
    # 07!cif ingredients: the CIF-flagged link tallies of the two paths.
    cif_asset_link_count: int
    cif_process_link_count: int
    # 07!tier triggers, in formula order (builder sheets_vendors.py:109-115).
    tier_cif_chain: bool
    tier_max_rank_at_least_high: bool
    tier_substitutability_match: bool
    cloud_service_link_count: int
    # 07!proc_n breakdown: manual §1 pairs + derived §2 triples.
    manual_process_link_count: int
    transitive_process_pair_count: int
    missing_for_completeness: tuple[str, ...]


@dataclass(frozen=True)
class VendorDerivation:
    """Every derived 07_Dodavatelé value in ticket-#49 scope (spec 1.3, 2.3)."""

    # kat_zeme: INDEX(ZemeKategorie, MATCH(zeme, ZemeList)) else "?" (spec 3.4).
    country_category: str | None
    # Two-path any-true CIF (builder sheets_vendors.py:96-98).
    cif: str
    linked_asset_count: int
    linked_process_count: int
    cif_process_count: int
    # h_rank: IFERROR(MAXIFS(10.assetCriticalityRank, 10.vendorID=this), 0).
    h_rank: int
    # max_krit: CHOOSE(h_rank, TridyKrit...) — blank at rank 0 ("empty means none").
    max_criticality: str | None
    # The tier formula, verbatim — unreachable branch included (spec 2.3(3)).
    tier: str
    # cif_ret: own CIF, else any chain contract-CIF propagation (spec 2.3(3a)).
    cif_chain: str
    # uroven_ret: A (own links) / B (sub at rank 2) / C (sub anywhere) / blank.
    chain_level: str | None
    # subdod / subdod_n: direct sub-providers (rows whose parent is this Vendor).
    direct_sub_provider_names: tuple[str, ...]
    direct_sub_provider_count: int
    # vyz_vysledek: any-true over the 6 significance criteria (spec 1.3 ~267).
    significance_outcome: str
    # The main-contract lookups (block B essentials; consumed by hotovo).
    main_contract_reference: str | None
    main_contract_arrangement_type: str | None
    main_contract_start_date: date | None
    main_contract_end_date: date | None
    # h_smluv / h_hlavni: contract tallies (DQ-39/41 feed later).
    contract_count: int
    main_contract_count: int
    # 07!hotovo incl. the ex-ante-date rule for Kritický/Významný (~268).
    is_complete: bool
    inputs: VendorDerivedInputs
    # The §2 rows for this Vendor — derived-only, never persisted (#49).
    transitive_process_links: tuple[TransitiveProcessVendorLink, ...] = ()


@dataclass(frozen=True)
class VendorContractDerivedInputs:
    """The lookups and tallies behind one Contract's derived block."""

    vendor_id: int
    prime_vendor_cif: str
    reference_duplicate_count: int
    sub_outsourcing_count: int


@dataclass(frozen=True)
class VendorContractDerivation:
    """Every derived 08_Smlouvy column in ticket-#49 scope (spec 1.4)."""

    # F: XLOOKUP(vendor id -> 07!nazev, "?").
    vendor_name: str
    # S: vendor & " → " & TEXTJOIN(per rank tier) — the workbook capped the
    # STRING at 2 tiers (ranks 2-3, builder sheets_vendors.py:276-282); our
    # display is full-depth, the recorded display-only deviation (spec §8-7).
    sub_outsourcing_chain: str
    # U: DUPLICITA if >1 row shares the same Ref. smlouvy, else OK.
    duplicate_check: str
    # W (hidden): the contract's prime vendor's own CIF flag, default "Ne".
    cif: str
    inputs: VendorContractDerivedInputs


@dataclass(frozen=True)
class SubOutsourcingDerivedInputs:
    """The chain-walk ingredients behind one Sub-outsourcing row's block."""

    contract_id: int
    predecessor_id: int | None
    predecessor_rank: int | None
    is_direct: bool
    duplicate_key_count: int


@dataclass(frozen=True)
class SubOutsourcingDerivation:
    """Every derived 09_Subdodávky column in ticket-#49 scope (spec 1.5)."""

    # C: XLOOKUP(contract -> ref, "?").
    contract_reference: str | None
    # D: the contract's own prime Vendor (id + name lookup).
    contract_vendor_id: int | None
    contract_vendor_name: str
    # I: the linked-list walk — direct = 2, deeper = predecessor + 1;
    # missing/broken predecessor -> None (the workbook's "?" sentinel).
    rank: int | None
    # J: XLOOKUP(contract -> 08!W) — the prime vendor's CIF, propagated
    # UNIFORMLY down the chain (spec 2.3(3a)), never re-derived per tier.
    critical_service: str
    # K: DUPLICITA | CHYBA ŘETĚZCE | OK (duplicates win, builder :369-370).
    chain_check: str
    # O (hidden): XLOOKUP(contract -> 08!K "v rozsahu RoI", "").
    roi_scope: str | None
    inputs: SubOutsourcingDerivedInputs


@dataclass(frozen=True)
class IctRegisterDerivation:
    """Derivations for every row in the graph, keyed by row id."""

    processes: Mapping[int, ProcessDerivation] = field(default_factory=dict)
    assets: Mapping[int, AssetDerivation] = field(default_factory=dict)
    vendors: Mapping[int, VendorDerivation] = field(default_factory=dict)
    contracts: Mapping[int, VendorContractDerivation] = field(default_factory=dict)
    sub_outsourcing: Mapping[int, SubOutsourcingDerivation] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Parameter unpacking — typed once, used everywhere.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _EffectiveParameters:
    critical_score: int
    high_score: int
    medium_score: int
    mtpd_critical_hours: int
    mtpd_medium_hours: int
    bonus_critical: int
    bonus_medium: int
    bonus_default: int
    asset_low_score: int
    asset_medium_score: int
    asset_high_score: int
    reference_date: date


def _int_parameter(parameters: IctWorkbookParameterSet, name: str) -> int:
    value = parameters.value(name)
    if not isinstance(value, int):
        raise TypeError(f"ICT Register workbook parameter '{name}' must be an int, got {value!r}")
    return value


def _date_parameter(parameters: IctWorkbookParameterSet, name: str) -> date:
    value = parameters.value(name)
    if not isinstance(value, date):
        raise TypeError(f"ICT Register workbook parameter '{name}' must be a date, got {value!r}")
    return value


def _effective_parameters(parameters: IctWorkbookParameterSet) -> _EffectiveParameters:
    return _EffectiveParameters(
        critical_score=_int_parameter(parameters, "P_KritSkore"),
        high_score=_int_parameter(parameters, "P_VysSkore"),
        medium_score=_int_parameter(parameters, "P_StrSkore"),
        mtpd_critical_hours=_int_parameter(parameters, "P_MTPDKrit"),
        mtpd_medium_hours=_int_parameter(parameters, "P_MTPDStr"),
        bonus_critical=_int_parameter(parameters, "P_BonusKrit"),
        bonus_medium=_int_parameter(parameters, "P_BonusStr"),
        bonus_default=_int_parameter(parameters, "P_BonusDef"),
        asset_low_score=_int_parameter(parameters, "P_AktNizka"),
        asset_medium_score=_int_parameter(parameters, "P_AktStredni"),
        asset_high_score=_int_parameter(parameters, "P_AktVysoka"),
        reference_date=_date_parameter(parameters, "P_RefDatum"),
    )


# ---------------------------------------------------------------------------
# Shared rule helpers.
# ---------------------------------------------------------------------------


def _criticality_rank(label: str | None) -> int:
    """MATCH(label, TridyKrit, 0) with IFERROR(...,0): 1-4, blank/unknown -> 0."""
    if label is None:
        return 0
    canonical_ranks = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    if label in canonical_ranks:
        return canonical_ranks[label]
    try:
        return CRITICALITY_CLASSES.index(label) + 1
    except ValueError:
        return 0


def _add_one_year(anchor: date) -> date:
    """EDATE-style + 12 months: day clamped to the target month's last day."""
    year = anchor.year + 1
    day = min(anchor.day, calendar.monthrange(year, anchor.month)[1])
    return date(year, anchor.month, day)


def process_display_name(l1_process: str, l2_subprocess: str | None) -> str:
    """The workbook's process name lookup: l1 [& " – " & l2] (spec 1.2)."""
    if l2_subprocess:
        return f"{l1_process} – {l2_subprocess}"
    return l1_process


# ---------------------------------------------------------------------------
