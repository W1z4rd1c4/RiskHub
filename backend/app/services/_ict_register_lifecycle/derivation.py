"""ICT Register derivation engine — the pure compute-on-read core (issues #48/#49).

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
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.services._ict_register_reference import (
    CLOUD_SERVICE_S_CODES,
    COUNTRY_CATEGORIES,
    closed_list_values,
)
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
# Process rules (spec 2.1 + the derived 1.1 fields).
# ---------------------------------------------------------------------------


def _derive_process(
    row: ProcessDerivationInput,
    params: _EffectiveParameters,
    *,
    linked_asset_count: int,
    manual_vendor_link_count: int,
    transitive_vendor_pair_count: int,
    is_duplicate: bool,
) -> ProcessDerivation:
    impact_axes = (
        row.impact_client,
        row.impact_market_operations,
        row.impact_regulatory,
        row.impact_financial,
    )

    # skore: SUM of the four axes + MTPD speed bonus; blank unless all present.
    mtpd_bonus: int | None = None
    criticality_score: int | None = None
    if all(axis is not None for axis in impact_axes) and row.mtpd_hours is not None:
        if row.mtpd_hours <= params.mtpd_critical_hours:
            mtpd_bonus = params.bonus_critical
        elif row.mtpd_hours <= params.mtpd_medium_hours:
            mtpd_bonus = params.bonus_medium
        else:
            mtpd_bonus = params.bonus_default
        criticality_score = sum(axis for axis in impact_axes if axis is not None) + mtpd_bonus

    # trida: banding on the live score, else the entered preliminary class.
    if criticality_score is not None:
        if criticality_score >= params.critical_score:
            criticality_class: str | None = CRITICALITY_CLASSES[3]
        elif criticality_score >= params.high_score:
            criticality_class = CRITICALITY_CLASSES[2]
        elif criticality_score >= params.medium_score:
            criticality_class = CRITICALITY_CLASSES[1]
        else:
            criticality_class = CRITICALITY_CLASSES[0]
        criticality_class_source = "score"
    else:
        criticality_class = row.preliminary_criticality
        criticality_class_source = "preliminary"

    # CIF: override precedence, then OR of the three independent triggers.
    # The class trigger reads the derived trida INCLUDING its fallback.
    cif_class_critical = criticality_class == _CLASS_CRITICAL
    cif_mtpd_within_critical = row.mtpd_hours is not None and row.mtpd_hours <= params.mtpd_critical_hours
    entered_axes = [axis for axis in impact_axes if axis is not None]
    cif_any_impact_maximal = max(entered_axes, default=0) == 5
    if row.cif_override is not None:
        cif = row.cif_override
    elif cif_class_critical or cif_mtpd_within_critical or cif_any_impact_maximal:
        cif = ANO
    else:
        cif = NE

    # kontrola_rto — builder sheets_core.py:186, verbatim:
    #   =IF(OR(rto="",mtpd=""),"",IF(rto>mtpd,"GAP: RTO > MTPD","OK"))
    # A half-entered pair is BLANK, never "OK".
    rto_mtpd_check: str | None
    if row.rto_hours is None or row.mtpd_hours is None:
        rto_mtpd_check = None
    elif row.rto_hours > row.mtpd_hours:
        rto_mtpd_check = RTO_MTPD_GAP
    else:
        rto_mtpd_check = CHECK_OK
    # kontrola_bcm — builder sheets_core.py:190 (row-existence guard aside,
    # which database identity supersedes):
    #   =IF(AND(cif="Ano",bcm<>"Ano"),"GAP: CIF bez BCM","OK")
    bcm_check = BCM_GAP if cif == ANO and row.bcm_link != ANO else CHECK_OK

    next_review_date = _add_one_year(row.assessment_date) if row.assessment_date is not None else None

    missing_for_completeness = tuple(
        field_name for field_name in _PROCESS_COMPLETENESS_FIELDS if getattr(row, field_name) is None
    )

    return ProcessDerivation(
        criticality_score=criticality_score,
        criticality_class=criticality_class,
        cif=cif,
        rto_mtpd_check=rto_mtpd_check,
        bcm_check=bcm_check,
        next_review_date=next_review_date,
        linked_asset_count=linked_asset_count,
        # dod_n = COUNTIF(11§1) + COUNTIF(11§2) — the §2 triples count per
        # occurrence, never deduplicated by vendor (spec 1.1 ~137, 1.8 §2).
        linked_vendor_count=manual_vendor_link_count + transitive_vendor_pair_count,
        is_complete=not missing_for_completeness,
        is_duplicate=is_duplicate,
        inputs=ProcessDerivedInputs(
            impact_client=row.impact_client,
            impact_market_operations=row.impact_market_operations,
            impact_regulatory=row.impact_regulatory,
            impact_financial=row.impact_financial,
            mtpd_hours=row.mtpd_hours,
            mtpd_bonus=mtpd_bonus,
            threshold_critical_score=params.critical_score,
            threshold_high_score=params.high_score,
            threshold_medium_score=params.medium_score,
            mtpd_critical_hours=params.mtpd_critical_hours,
            mtpd_medium_hours=params.mtpd_medium_hours,
            preliminary_criticality=row.preliminary_criticality,
            criticality_class_source=criticality_class_source,
            cif_override=row.cif_override,
            cif_class_critical=cif_class_critical,
            cif_mtpd_within_critical=cif_mtpd_within_critical,
            cif_any_impact_maximal=cif_any_impact_maximal,
            rto_hours=row.rto_hours,
            bcm_link=row.bcm_link,
            assessment_date=row.assessment_date,
            missing_for_completeness=missing_for_completeness,
            manual_vendor_link_count=manual_vendor_link_count,
            transitive_vendor_pair_count=transitive_vendor_pair_count,
        ),
    )


# ---------------------------------------------------------------------------
# Asset rules (spec 2.2 "MAX princip" + the 2.3(1) cascade + derived 1.2 fields).
# ---------------------------------------------------------------------------


def _asset_score_class(score: int | Decimal, params: _EffectiveParameters) -> str:
    """Band a value on P_AktNizka/P_AktStredni/P_AktVysoka (<= each, else Kritická)."""
    if score <= params.asset_low_score:
        return CRITICALITY_CLASSES[0]
    if score <= params.asset_medium_score:
        return CRITICALITY_CLASSES[1]
    if score <= params.asset_high_score:
        return CRITICALITY_CLASSES[2]
    return CRITICALITY_CLASSES[3]


def _derive_asset(
    row: AssetDerivationInput,
    params: _EffectiveParameters,
    *,
    links: tuple[ProcessAssetLinkInput, ...],
    processes_by_id: Mapping[int, ProcessDerivationInput],
    process_results: Mapping[int, ProcessDerivation],
    asset_names_by_id: Mapping[int, str],
    asset_asset_links: tuple[AssetAssetLinkInput, ...],
    vendor_links: tuple[AssetVendorLinkInput, ...],
) -> AssetDerivation:
    # --- Primary-process lookups: single XLOOKUPs, never aggregates (spec 2.3(1)).
    primary_link = next((link for link in links if link.is_primary), None)
    primary_process = processes_by_id.get(primary_link.process_id) if primary_link else None
    primary_result = process_results.get(primary_link.process_id) if primary_link else None
    primary_process_id = primary_process.id if primary_process is not None else None
    primary_process_name = (
        process_display_name(primary_process.l1_process, primary_process.l2_subprocess)
        if primary_process is not None
        else None
    )
    primary_process_criticality = primary_result.criticality_class if primary_result is not None else None
    inherited_impact_operations = (
        primary_process.impact_market_operations if primary_process is not None else None
    )
    inherited_impact_financial = primary_process.impact_financial if primary_process is not None else None
    inherited_rto_hours = primary_process.rto_hours if primary_process is not None else None

    # --- hodnota: MAX(C,I,A,Au), blank unless all four scored (spec 2.2 step 1).
    ratings = (
        row.confidentiality_rating,
        row.integrity_rating,
        row.availability_rating,
        row.authenticity_rating,
    )
    ciaa_value = max(r for r in ratings if r is not None) if all(r is not None for r in ratings) else None

    # --- bus_krit: class of MAX over the present business impacts (spec 2.2 step 3).
    business_impacts = [
        value
        for value in (
            row.impact_client,
            row.impact_regulatory,
            inherited_impact_operations,
            inherited_impact_financial,
        )
        if value is not None
    ]
    business_criticality = _asset_score_class(max(business_impacts), params) if business_impacts else None

    # --- skore: the exact weighted sum, all 8 inputs required (spec 2.2 step 4).
    weighted_inputs = (
        row.confidentiality_rating,
        row.integrity_rating,
        row.availability_rating,
        row.authenticity_rating,
        row.impact_client,
        row.impact_regulatory,
        row.substitutability_rating,
        row.vendor_dependency_rating,
    )
    weighted_score_decimal: Decimal | None = None
    if all(value is not None for value in weighted_inputs):
        total = sum(
            (
                Decimal(value) * weight
                for value, weight in zip(weighted_inputs, _ASSET_SCORE_WEIGHTS)
                if value is not None
            ),
            Decimal(0),
        )
        # Excel ROUND(...,2) — half away from zero.
        weighted_score_decimal = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    score_criticality = (
        _asset_score_class(weighted_score_decimal, params) if weighted_score_decimal is not None else None
    )

    # --- CIF: ANY-true over every linked process's derived CIF (spec 2.3(1)).
    cif_processes = [
        processes_by_id[link.process_id]
        for link in links
        if link.process_id in process_results and process_results[link.process_id].cif == ANO
    ]
    cif = ANO if cif_processes else NE
    cif_process_names = tuple(
        process_display_name(process.l1_process, process.l2_subprocess) for process in cif_processes
    )

    # --- h_rank: the MAX aggregation over the row's own class signals plus the
    # CIF floor of "Střední" (spec 2.2 step 5). IFERROR(MATCH(...),0) -> rank 0.
    rank_primary = _criticality_rank(primary_process_criticality)
    rank_score = _criticality_rank(score_criticality)
    rank_preliminary = _criticality_rank(row.preliminary_criticality)
    rank_business = _criticality_rank(business_criticality)
    rank_cif_floor = 2 if cif == ANO else 0
    h_rank = max(rank_primary, rank_score, rank_preliminary, rank_business, rank_cif_floor)

    # --- vysledna: CHOOSE(h_rank, TridyKrit...) — blank at rank 0 (spec 2.2 step 6).
    resulting_criticality = CRITICALITY_CLASSES[h_rank - 1] if h_rank > 0 else None

    # --- klas8: Kritické iff vysledna in the top two classes (spec 1.2).
    article8_classification = (
        ARTICLE8_CRITICAL
        if resulting_criticality in (CRITICALITY_CLASSES[2], CRITICALITY_CLASSES[3])
        else ARTICLE8_NON_CRITICAL
    )

    # --- SPOF: ANY-true over the asset's 05-links (spec 2.2).
    spof = ANO if any(link.spof == ANO for link in links) else NE

    # --- Vendor-side aggregates run verbatim over the (empty until #46) input.
    external_dependency = ANO if vendor_links else NE
    vendor_names = tuple(link.vendor_name for link in vendor_links if link.vendor_name is not None)
    ict_service_codes = tuple(
        link.ict_service_code for link in vendor_links if link.ict_service_code is not None
    )
    contract_references = tuple(
        link.contract_reference for link in vendor_links if link.contract_reference is not None
    )

    # --- legacy: state or standard-support end before P_RefDatum (spec 1.2).
    legacy = (
        ANO
        if row.lifecycle_state == "Legacy"
        or (row.standard_support_end_date is not None and row.standard_support_end_date < params.reference_date)
        else NE
    )

    # --- vazby_aktiv — builder sheets_core.py:388-389, verbatim:
    #   =TEXTJOIN(", ",TRUE,IF(06!B=$A{r},06!E,""))
    # 06!B is the DEPENDENT asset id, 06!E the SUPPORTING asset name: the list
    # is the assets THIS asset depends on — single direction, never both ends.
    linked_asset_names = tuple(
        asset_names_by_id[link.supporting_asset_id]
        for link in asset_asset_links
        if link.dependent_asset_id == row.id and link.supporting_asset_id in asset_names_by_id
    )

    # --- hotovo — builder sheets_core.py:400-406 (span constant above): every
    # entered completeness cell filled AND a primary Process designated. The
    # proc_id pseudo-field sits between the klasdat and c:au spans, as in the
    # formula's COUNTBLANK order.
    missing: list[str] = []
    for field_name in _ASSET_COMPLETENESS_FIELDS:
        if getattr(row, field_name) is None:
            missing.append(field_name)
        if field_name == "data_classification" and primary_link is None:
            missing.append(_ASSET_COMPLETENESS_PRIMARY_PROCESS)
    missing_for_completeness = tuple(missing)

    return AssetDerivation(
        ciaa_value=ciaa_value,
        primary_process_name=primary_process_name,
        primary_process_criticality=primary_process_criticality,
        inherited_impact_operations=inherited_impact_operations,
        inherited_impact_financial=inherited_impact_financial,
        inherited_rto_hours=inherited_rto_hours,
        business_criticality=business_criticality,
        weighted_score=float(weighted_score_decimal) if weighted_score_decimal is not None else None,
        score_criticality=score_criticality,
        h_rank=h_rank,
        resulting_criticality=resulting_criticality,
        article8_classification=article8_classification,
        cif=cif,
        cif_process_count=len(cif_processes),
        cif_process_names=cif_process_names,
        spof=spof,
        external_dependency=external_dependency,
        legacy=legacy,
        linked_process_count=len(links),
        linked_vendor_count=len(vendor_links),
        linked_asset_names=linked_asset_names,
        vendor_names=vendor_names,
        ict_service_codes=ict_service_codes,
        contract_references=contract_references,
        is_complete=not missing_for_completeness,
        inputs=AssetDerivedInputs(
            confidentiality_rating=row.confidentiality_rating,
            integrity_rating=row.integrity_rating,
            availability_rating=row.availability_rating,
            authenticity_rating=row.authenticity_rating,
            impact_client=row.impact_client,
            impact_regulatory=row.impact_regulatory,
            substitutability_rating=row.substitutability_rating,
            vendor_dependency_rating=row.vendor_dependency_rating,
            preliminary_criticality=row.preliminary_criticality,
            lifecycle_state=row.lifecycle_state,
            standard_support_end_date=row.standard_support_end_date,
            reference_date=params.reference_date,
            threshold_low_score=params.asset_low_score,
            threshold_medium_score=params.asset_medium_score,
            threshold_high_score=params.asset_high_score,
            primary_process_id=primary_process_id,
            rank_primary_process_criticality=rank_primary,
            rank_score_criticality=rank_score,
            rank_preliminary_criticality=rank_preliminary,
            rank_business_criticality=rank_business,
            rank_cif_floor=rank_cif_floor,
            missing_for_completeness=missing_for_completeness,
        ),
    )


# ---------------------------------------------------------------------------
# Vendor-side rules (#49): chain walk, Sub-outsourcing, Vendor, Contract.
# ---------------------------------------------------------------------------


def _resolve_sub_outsourcing_ranks(rows: tuple[SubOutsourcingInput, ...]) -> dict[int, int | None]:
    """09!I "Rank (odvozeno)" — builder sheets_vendors.py:362-365, verbatim:

        =IF(OR($B="",$F="",$E=""),"",IF($E=$D,2,
          IFERROR(INDEX($I,MATCH($B&"|"&$E,$M,0))+1,"?")))

    A linked-list walk, not an aggregation: a direct sub-outsourcer (the
    workbook's "parent = the contract's prime vendor", our predecessor None)
    is rank 2; a deeper row takes its predecessor's rank + 1. A missing or
    cross-contract predecessor breaks the chain (the MATCH finds no row under
    the same contract), a broken predecessor propagates ("?"+1 is an Excel
    error -> IFERROR -> "?"), and a cycle can never resolve — all three yield
    the None sentinel rendered as "?".
    """
    rows_by_id = {row.id: row for row in rows}
    ranks: dict[int, int | None] = {}

    def resolve(row: SubOutsourcingInput, trail: frozenset[int]) -> int | None:
        if row.id in ranks:
            return ranks[row.id]
        if row.predecessor_id is None:
            ranks[row.id] = 2
            return 2
        predecessor = rows_by_id.get(row.predecessor_id)
        if predecessor is None or predecessor.contract_id != row.contract_id or predecessor.id in trail:
            ranks[row.id] = None
            return None
        predecessor_rank = resolve(predecessor, trail | {row.id})
        ranks[row.id] = None if predecessor_rank is None else predecessor_rank + 1
        return ranks[row.id]

    for row in rows:
        resolve(row, frozenset({row.id}))
    return ranks


def _derive_sub_outsourcing(
    row: SubOutsourcingInput,
    *,
    contracts_by_id: Mapping[int, VendorContractInput],
    contract_cif: Mapping[int, str],
    vendor_names_by_id: Mapping[int, str],
    ranks: Mapping[int, int | None],
    duplicate_key_counts: Mapping[tuple[int, str], int],
) -> SubOutsourcingDerivation:
    contract = contracts_by_id.get(row.contract_id)

    # C — =IFERROR(XLOOKUP($B,SmlouvyID,SmlouvyRef,"?"),"?") (builder :354-355).
    contract_reference = contract.contract_reference if contract is not None else UNKNOWN_LOOKUP
    # D — the contract's own prime vendor (builder :356-358), name via 07!B.
    contract_vendor_id = contract.vendor_id if contract is not None else None
    contract_vendor_name = (
        vendor_names_by_id.get(contract.vendor_id, UNKNOWN_LOOKUP)
        if contract is not None
        else UNKNOWN_LOOKUP
    )

    rank = ranks[row.id]
    # J — =IFERROR(XLOOKUP($B, 08!A, 08!W, "Ne"),"Ne") (builder :366-368): the
    # contract's hidden CIF, identical for EVERY row of the chain (spec 2.3(3a)).
    critical_service = contract_cif.get(row.contract_id, NE)
    # O — =IFERROR(XLOOKUP($B, 08!A, 08!K, ""),"") (builder :375-377).
    roi_scope = contract.roi_scope if contract is not None else None

    # K — =IF(N($N)>1,"DUPLICITA",IF($I="?","CHYBA ŘETĚZCE","OK")) (builder
    # :369-370). The M key is contract|subcontractor; with inline sub-provider
    # identity (#45) the closest analog is the entered name; blank names never
    # participate (M="" when F="").
    duplicate_key_count = (
        duplicate_key_counts.get((row.contract_id, row.sub_provider_name), 0)
        if row.sub_provider_name is not None
        else 0
    )
    if duplicate_key_count > 1:
        chain_check = DUPLICATE_CHECK
    elif rank is None:
        chain_check = CHAIN_BREAK_CHECK
    else:
        chain_check = CHECK_OK

    predecessor_rank = ranks.get(row.predecessor_id) if row.predecessor_id is not None else None
    return SubOutsourcingDerivation(
        contract_reference=contract_reference,
        contract_vendor_id=contract_vendor_id,
        contract_vendor_name=contract_vendor_name,
        rank=rank,
        critical_service=critical_service,
        chain_check=chain_check,
        roi_scope=roi_scope,
        inputs=SubOutsourcingDerivedInputs(
            contract_id=row.contract_id,
            predecessor_id=row.predecessor_id,
            predecessor_rank=predecessor_rank,
            is_direct=row.predecessor_id is None,
            duplicate_key_count=duplicate_key_count,
        ),
    )


def _vendor_cif(
    *,
    vendor_asset_links: tuple[AssetVendorLinkInput, ...],
    vendor_process_links: tuple[ProcessVendorLinkInput, ...],
    asset_results: Mapping[int, AssetDerivation],
    process_results: Mapping[int, ProcessDerivation],
) -> tuple[str, int, int]:
    """07!cif — builder sheets_vendors.py:96-98, verbatim:

        =IF(COUNTIFS(10.vendorID,this,10.assetCIF,"Ano")
           +COUNTIFS(11§1.vendorID,this,11§1.processCIF,"Ano")>0,"Ano","Ne")

    Two independent any-true paths at once: via the Asset cascade and via the
    direct §1 Process pairs (NEVER the derived §2 section). Links whose
    counterpart row is absent contribute nothing (the per-link XLOOKUP columns
    default to blank). Returns (cif, asset-path hits, process-path hits).
    """
    cif_asset_hits = sum(
        1
        for link in vendor_asset_links
        if link.asset_id in asset_results and asset_results[link.asset_id].cif == ANO
    )
    cif_process_hits = sum(
        1
        for link in vendor_process_links
        if link.process_id in process_results and process_results[link.process_id].cif == ANO
    )
    cif = ANO if cif_asset_hits + cif_process_hits > 0 else NE
    return cif, cif_asset_hits, cif_process_hits


def _derive_vendor(
    row: VendorDerivationInput,
    *,
    cif: str,
    cif_asset_link_count: int,
    cif_process_link_count: int,
    vendor_asset_links: tuple[AssetVendorLinkInput, ...],
    manual_process_link_count: int,
    manual_cif_process_link_count: int,
    transitive_links: tuple[TransitiveProcessVendorLink, ...],
    asset_results: Mapping[int, AssetDerivation],
    contracts: tuple[VendorContractInput, ...],
    contract_cif: Mapping[int, str],
    sub_rows: tuple[SubOutsourcingInput, ...],
    sub_ranks: Mapping[int, int | None],
    contract_vendor_ids: Mapping[int, int],
) -> VendorDerivation:
    # kat_zeme — =IF(zeme="","",IFERROR(INDEX(ZemeKategorie,MATCH(zeme,
    # ZemeList,0)),"?")) (builder sheets_vendors.py:65-67).
    country_category = (
        None if row.country is None else COUNTRY_CATEGORIES.get(row.country, UNKNOWN_LOOKUP)
    )

    # aktiva_n / proc_n / cif_proc_n — builder :99-105: plain link tallies;
    # proc_n and cif_proc_n count BOTH the §1 pairs and the §2 triples.
    linked_asset_count = len(vendor_asset_links)
    transitive_pair_count = len(transitive_links)
    linked_process_count = manual_process_link_count + transitive_pair_count
    transitive_cif_count = sum(1 for link in transitive_links if link.process_cif == ANO)
    cif_process_count = manual_cif_process_link_count + transitive_cif_count

    # h_rank — =IFERROR(MAXIFS(10.assetCriticalityRank,10.vendorID,this),0)
    # (builder :153-154); the per-link rank is MATCH(04!vysledna, TridyKrit)
    # (builder :440-441), so this is the MAX-of-MAX over linked assets. No
    # matching links (or no ranked assets) resolve to 0.
    h_rank = max(
        (
            _criticality_rank(asset_results[link.asset_id].resulting_criticality)
            for link in vendor_asset_links
            if link.asset_id in asset_results
        ),
        default=0,
    )
    # max_krit — =IF(h_rank=0,"",CHOOSE(h_rank,...)) (builder :106-108).
    max_criticality = CRITICALITY_CLASSES[h_rank - 1] if h_rank > 0 else None

    # Contract tallies — h_smluv/h_hlavni (builder :161-164) and the block-B
    # main-contract lookups: XLOOKUP over the hidden vendor-if-main column
    # takes the FIRST main contract in row order (builder :70-84).
    contract_count = len(contracts)
    main_contracts = [contract for contract in contracts if contract.main_contract == ANO]
    main_contract_count = len(main_contracts)
    main_contract = main_contracts[0] if main_contracts else None

    # Chain memberships: rows whose SUBCONTRACTOR is this vendor (09!F=this).
    # Production-inert with inline sub-provider identity — see module docstring.
    rows_as_subcontractor = tuple(
        sub for sub in sub_rows if sub.sub_provider_vendor_id == row.id
    )
    # cif_ret — builder :124-126, verbatim:
    #   =IF(cif="Ano","Ano",IF(COUNTIFS(09.F,this,09.J,"Ano")>0,"Ano","Ne"))
    # 09!J carries the contract's prime-vendor CIF propagated uniformly.
    chain_cif_hit = any(
        contract_cif.get(sub.contract_id, NE) == ANO for sub in rows_as_subcontractor
    )
    cif_chain = ANO if cif == ANO or chain_cif_hit else NE

    # tier — builder :109-115, verbatim (spec 2.3(3)):
    #   =IF(cif_ret="Ano","Kritický dodavatel",
    #     IF(OR(N(h_rank)>=3,subst="Nenahraditelný",
    #           subst="Velmi obtížně nahraditelný",
    #           COUNTIFS(S17)+COUNTIFS(S18)+COUNTIFS(S19)>0),
    #        "Významný dodavatel","Standardní dodavatel"))
    # Reproduced with the "Významný" branch included even where structurally
    # unreachable under seed-shaped data (spec section 8 item 3).
    cloud_service_link_count = sum(
        1 for link in vendor_asset_links if link.ict_service_code in CLOUD_SERVICE_S_CODES
    )
    tier_max_rank_at_least_high = h_rank >= 3
    tier_substitutability_match = row.substitutability in _TIER_SUBSTITUTABILITY_TRIGGERS
    if cif_chain == ANO:
        tier = TIER_CRITICAL
    elif tier_max_rank_at_least_high or tier_substitutability_match or cloud_service_link_count > 0:
        tier = TIER_SIGNIFICANT
    else:
        tier = TIER_STANDARD

    # uroven_ret — builder :116-119, verbatim:
    #   =IF(N(h_smluv)+N(aktiva_n)+N(proc_n)>0,"A",
    #     IF(COUNTIFS(09.F,this,09.I,2)>0,"B",IF(COUNTIF(09.F,this)>0,"C","")))
    if contract_count + linked_asset_count + linked_process_count > 0:
        chain_level: str | None = CHAIN_LEVEL_OWN_LINKS
    elif any(sub_ranks.get(sub.id) == 2 for sub in rows_as_subcontractor):
        chain_level = CHAIN_LEVEL_DIRECT_SUB
    elif rows_as_subcontractor:
        chain_level = CHAIN_LEVEL_DEEP_SUB
    else:
        chain_level = None

    # subdod / subdod_n — builder :120-123: rows whose PARENT provider (09!E)
    # is this vendor — the direct rows under its contracts (parent = prime
    # vendor) plus rows whose predecessor's subcontractor is this vendor.
    direct_sub_rows = tuple(
        sub
        for sub in sub_rows
        if (
            sub.predecessor_id is None
            and contract_vendor_ids.get(sub.contract_id) == row.id
        )
        or (
            sub.predecessor_id is not None
            and any(
                parent.id == sub.predecessor_id and parent.sub_provider_vendor_id == row.id
                for parent in sub_rows
            )
        )
    )
    direct_sub_provider_names = tuple(
        sub.sub_provider_name for sub in direct_sub_rows if sub.sub_provider_name
    )
    direct_sub_provider_count = len(direct_sub_rows)

    # vyz_vysledek — =IF(COUNTIF(vyz_povoleni:vyz_kumul,"Ano")>0,"Ano","Ne")
    # (builder :134-136): any-true over the 6 EBA/GL significance criteria;
    # "Nerelevantní" never counts.
    significance_answers = (
        row.significance_authorization_conditions,
        row.significance_regulatory_requirements,
        row.significance_service_quality,
        row.significance_financial_impact,
        row.significance_reputation_continuity,
        row.significance_cumulative_impact,
    )
    significance_outcome = ANO if ANO in significance_answers else NE

    # hotovo — builder :142-148 (span constant above): identity block, the
    # main-contract pair spans, substitutability, exit plan, and the ex-ante
    # date REQUIRED only for the Kritický/Významný tiers.
    main_contract_reference = main_contract.contract_reference if main_contract else None
    main_contract_arrangement_type = main_contract.arrangement_type if main_contract else None
    main_contract_start_date = main_contract.start_date if main_contract else None
    main_contract_end_date = main_contract.end_date if main_contract else None
    main_contract_blank = {
        "main_contract_reference": main_contract_reference is None,
        "main_contract_arrangement_type": main_contract_arrangement_type is None,
        "main_contract_start_date": main_contract_start_date is None,
        "main_contract_end_date": main_contract_end_date is None,
    }
    missing: list[str] = [
        field_name
        for field_name in _VENDOR_COMPLETENESS_ENTERED_FIELDS
        if getattr(row, field_name) is None
    ]
    missing.extend(
        field_name
        for field_name in _VENDOR_COMPLETENESS_MAIN_CONTRACT_FIELDS
        if main_contract_blank[field_name]
    )
    if row.substitutability is None:
        missing.append("substitutability")
    if row.exit_plan_state is None:
        missing.append("exit_plan_state")
    if tier in (TIER_CRITICAL, TIER_SIGNIFICANT) and row.ex_ante_assessment_date is None:
        missing.append("ex_ante_assessment_date")
    missing_for_completeness = tuple(missing)

    return VendorDerivation(
        country_category=country_category,
        cif=cif,
        linked_asset_count=linked_asset_count,
        linked_process_count=linked_process_count,
        cif_process_count=cif_process_count,
        h_rank=h_rank,
        max_criticality=max_criticality,
        tier=tier,
        cif_chain=cif_chain,
        chain_level=chain_level,
        direct_sub_provider_names=direct_sub_provider_names,
        direct_sub_provider_count=direct_sub_provider_count,
        significance_outcome=significance_outcome,
        main_contract_reference=main_contract_reference,
        main_contract_arrangement_type=main_contract_arrangement_type,
        main_contract_start_date=main_contract_start_date,
        main_contract_end_date=main_contract_end_date,
        contract_count=contract_count,
        main_contract_count=main_contract_count,
        is_complete=not missing_for_completeness,
        inputs=VendorDerivedInputs(
            country=row.country,
            substitutability=row.substitutability,
            exit_plan_state=row.exit_plan_state,
            ex_ante_assessment_date=row.ex_ante_assessment_date,
            significance_authorization_conditions=row.significance_authorization_conditions,
            significance_regulatory_requirements=row.significance_regulatory_requirements,
            significance_service_quality=row.significance_service_quality,
            significance_financial_impact=row.significance_financial_impact,
            significance_reputation_continuity=row.significance_reputation_continuity,
            significance_cumulative_impact=row.significance_cumulative_impact,
            cif_asset_link_count=cif_asset_link_count,
            cif_process_link_count=cif_process_link_count,
            tier_cif_chain=cif_chain == ANO,
            tier_max_rank_at_least_high=tier_max_rank_at_least_high,
            tier_substitutability_match=tier_substitutability_match,
            cloud_service_link_count=cloud_service_link_count,
            manual_process_link_count=manual_process_link_count,
            transitive_process_pair_count=transitive_pair_count,
            missing_for_completeness=missing_for_completeness,
        ),
        transitive_process_links=transitive_links,
    )


def _derive_contract(
    contract: VendorContractInput,
    *,
    vendor_names_by_id: Mapping[int, str],
    prime_vendor_cif: str,
    reference_counts: Mapping[str, int],
    contract_sub_rows: tuple[SubOutsourcingInput, ...],
    sub_ranks: Mapping[int, int | None],
) -> VendorContractDerivation:
    # F — =IFERROR(XLOOKUP($E, 07!A, 07!B, "?"),"?") (builder :267-269).
    vendor_name = vendor_names_by_id.get(contract.vendor_id, UNKNOWN_LOOKUP)

    # S — builder :276-282: the prime vendor's name, then one " → " segment
    # per rank tier joining that tier's sub-provider names with ", ". The
    # workbook display hardcodes tiers 2 and 3 (spec section 8 item 7); the
    # app renders the FULL depth — the recorded display-only deviation. A
    # broken row (rank "?") appears at no tier, exactly as in the workbook.
    chain_parts = [vendor_name]
    ranked_tiers = sorted(
        {rank for sub in contract_sub_rows if (rank := sub_ranks[sub.id]) is not None}
    )
    for tier in ranked_tiers:
        tier_names = [
            sub.sub_provider_name
            for sub in contract_sub_rows
            if sub_ranks[sub.id] == tier and sub.sub_provider_name
        ]
        chain_parts.append(", ".join(tier_names))
    sub_outsourcing_chain = " → ".join(chain_parts)

    # U — =IF(COUNTIF($B,$B{r})>1,"DUPLICITA","OK") (builder :283-284): the
    # Ref. smlouvy is compared across the WHOLE register, not per vendor.
    duplicate_count = (
        reference_counts.get(contract.contract_reference, 0)
        if contract.contract_reference is not None
        else 0
    )
    duplicate_check = DUPLICATE_CHECK if duplicate_count > 1 else CHECK_OK

    return VendorContractDerivation(
        vendor_name=vendor_name,
        sub_outsourcing_chain=sub_outsourcing_chain,
        duplicate_check=duplicate_check,
        # W — =IFERROR(XLOOKUP($E, 07!A, 07!cif, "Ne"),"Ne") (builder
        # :287-289): the prime vendor's own CIF (NOT cif_ret), read by every
        # subcontracting row under this contract.
        cif=prime_vendor_cif,
        inputs=VendorContractDerivedInputs(
            vendor_id=contract.vendor_id,
            prime_vendor_cif=prime_vendor_cif,
            reference_duplicate_count=duplicate_count,
            sub_outsourcing_count=len(contract_sub_rows),
        ),
    )


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------


def derive_ict_register(graph: IctRegisterGraph, parameters: IctWorkbookParameterSet) -> IctRegisterDerivation:
    """Derive every in-scope value for every row of the graph, workbook-verbatim.

    Order follows the cascade's data flow: Processes (row-local) -> Assets ->
    the derived §2 transitive expansion -> per-Vendor CIF -> the Contracts'
    hidden CIF -> Sub-outsourcing ranks -> full Vendor and Contract blocks.
    Counts and aggregates are relative to the links present in the graph — the
    loader in ``derivation_inputs`` guarantees a complete link closure for the
    rows a caller consumes.
    """
    params = _effective_parameters(parameters)

    process_id_counts: dict[int, int] = {}
    for row in graph.processes:
        process_id_counts[row.id] = process_id_counts.get(row.id, 0) + 1

    process_link_counts: dict[int, int] = {}
    for link in graph.process_asset_links:
        process_link_counts[link.process_id] = process_link_counts.get(link.process_id, 0) + 1

    process_vendor_counts: dict[int, int] = {}
    for vendor_link in graph.process_vendor_links:
        process_vendor_counts[vendor_link.process_id] = process_vendor_counts.get(vendor_link.process_id, 0) + 1

    asset_links: dict[int, list[ProcessAssetLinkInput]] = {}
    for link in graph.process_asset_links:
        asset_links.setdefault(link.asset_id, []).append(link)

    # The raw §2 join (spec 1.8): for every sheet-10 link, one row per
    # sheet-05 link of that Asset, in VAD-major then VPA order — never
    # deduplicated (the workbook's pairs_total counts occurrences).
    raw_transitive_pairs: list[tuple[AssetVendorLinkInput, ProcessAssetLinkInput]] = [
        (av_link, pal_link)
        for av_link in graph.asset_vendor_links
        for pal_link in asset_links.get(av_link.asset_id, ())
    ]
    transitive_counts_by_process: dict[int, int] = {}
    for _, pal_link in raw_transitive_pairs:
        transitive_counts_by_process[pal_link.process_id] = (
            transitive_counts_by_process.get(pal_link.process_id, 0) + 1
        )

    processes: dict[int, ProcessDerivation] = {}
    for row in graph.processes:
        processes[row.id] = _derive_process(
            row,
            params,
            linked_asset_count=process_link_counts.get(row.id, 0),
            manual_vendor_link_count=process_vendor_counts.get(row.id, 0),
            transitive_vendor_pair_count=transitive_counts_by_process.get(row.id, 0),
            is_duplicate=process_id_counts[row.id] > 1,
        )

    processes_by_id = {row.id: row for row in graph.processes}
    asset_names_by_id = {asset.id: asset.name for asset in graph.assets}

    # vazby_aktiv reads sheet-06 links from the DEPENDENT side only (the
    # builder's TEXTJOIN matches 06!B, the dependent asset id).
    asset_asset_links: dict[int, list[AssetAssetLinkInput]] = {}
    for aa_link in graph.asset_asset_links:
        asset_asset_links.setdefault(aa_link.dependent_asset_id, []).append(aa_link)

    asset_vendor_links: dict[int, list[AssetVendorLinkInput]] = {}
    for av_link in graph.asset_vendor_links:
        asset_vendor_links.setdefault(av_link.asset_id, []).append(av_link)

    assets: dict[int, AssetDerivation] = {}
    for asset in graph.assets:
        assets[asset.id] = _derive_asset(
            asset,
            params,
            links=tuple(asset_links.get(asset.id, ())),
            processes_by_id=processes_by_id,
            process_results=processes,
            asset_names_by_id=asset_names_by_id,
            asset_asset_links=tuple(asset_asset_links.get(asset.id, ())),
            vendor_links=tuple(asset_vendor_links.get(asset.id, ())),
        )

    # --- The derived §2 records (11 §2 columns), from the row-local results.
    vendor_names_by_id = {vendor.id: vendor.name for vendor in graph.vendors}
    transitive_records: list[TransitiveProcessVendorLink] = []
    for av_link, pal_link in raw_transitive_pairs:
        process_row = processes_by_id.get(pal_link.process_id)
        process_result = processes.get(pal_link.process_id)
        transitive_records.append(
            TransitiveProcessVendorLink(
                process_id=pal_link.process_id,
                process_name=(
                    process_display_name(process_row.l1_process, process_row.l2_subprocess)
                    if process_row is not None
                    else UNKNOWN_LOOKUP
                ),
                process_cif=process_result.cif if process_result is not None else None,
                process_criticality=(
                    process_result.criticality_class if process_result is not None else None
                ),
                vendor_id=av_link.vendor_id,
                vendor_name=(
                    av_link.vendor_name
                    or vendor_names_by_id.get(av_link.vendor_id, UNKNOWN_LOOKUP)
                ),
                via_asset_id=av_link.asset_id,
                via_asset_name=asset_names_by_id.get(av_link.asset_id, UNKNOWN_LOOKUP),
            )
        )
    for process_id, result in processes.items():
        records = tuple(r for r in transitive_records if r.process_id == process_id)
        if records:
            processes[process_id] = replace(result, transitive_vendor_links=records)

    # --- Vendor-side maps.
    vendor_asset_link_map: dict[int, list[AssetVendorLinkInput]] = {}
    for av_link in graph.asset_vendor_links:
        vendor_asset_link_map.setdefault(av_link.vendor_id, []).append(av_link)
    vendor_process_link_map: dict[int, list[ProcessVendorLinkInput]] = {}
    for pv_link in graph.process_vendor_links:
        vendor_process_link_map.setdefault(pv_link.vendor_id, []).append(pv_link)
    vendor_contract_map: dict[int, list[VendorContractInput]] = {}
    for contract in graph.contracts:
        vendor_contract_map.setdefault(contract.vendor_id, []).append(contract)
    contracts_by_id = {contract.id: contract for contract in graph.contracts}
    contract_vendor_ids = {contract.id: contract.vendor_id for contract in graph.contracts}
    contract_sub_map: dict[int, list[SubOutsourcingInput]] = {}
    for sub in graph.sub_outsourcing:
        contract_sub_map.setdefault(sub.contract_id, []).append(sub)

    # Per-vendor CIF first: 08!W (the contracts' hidden CIF column) reads the
    # prime vendor's cif, and the chain rows read 08!W — never the tier.
    vendor_cif_results: dict[int, tuple[str, int, int]] = {
        vendor.id: _vendor_cif(
            vendor_asset_links=tuple(vendor_asset_link_map.get(vendor.id, ())),
            vendor_process_links=tuple(vendor_process_link_map.get(vendor.id, ())),
            asset_results=assets,
            process_results=processes,
        )
        for vendor in graph.vendors
    }
    contract_cif: dict[int, str] = {
        contract.id: vendor_cif_results.get(contract.vendor_id, (NE, 0, 0))[0]
        for contract in graph.contracts
    }

    # --- Sub-outsourcing rows: ranks, then the derived columns.
    sub_ranks = _resolve_sub_outsourcing_ranks(graph.sub_outsourcing)
    duplicate_key_counts = Counter(
        (sub.contract_id, sub.sub_provider_name)
        for sub in graph.sub_outsourcing
        if sub.sub_provider_name is not None
    )
    sub_outsourcing: dict[int, SubOutsourcingDerivation] = {
        sub.id: _derive_sub_outsourcing(
            sub,
            contracts_by_id=contracts_by_id,
            contract_cif=contract_cif,
            vendor_names_by_id=vendor_names_by_id,
            ranks=sub_ranks,
            duplicate_key_counts=duplicate_key_counts,
        )
        for sub in graph.sub_outsourcing
    }

    # --- Full Vendor blocks.
    vendors: dict[int, VendorDerivation] = {}
    for vendor in graph.vendors:
        cif, cif_asset_hits, cif_process_hits = vendor_cif_results[vendor.id]
        manual_links = tuple(vendor_process_link_map.get(vendor.id, ()))
        manual_cif_hits = sum(
            1
            for link in manual_links
            if link.process_id in processes and processes[link.process_id].cif == ANO
        )
        vendors[vendor.id] = _derive_vendor(
            vendor,
            cif=cif,
            cif_asset_link_count=cif_asset_hits,
            cif_process_link_count=cif_process_hits,
            vendor_asset_links=tuple(vendor_asset_link_map.get(vendor.id, ())),
            manual_process_link_count=len(manual_links),
            manual_cif_process_link_count=manual_cif_hits,
            transitive_links=tuple(
                record for record in transitive_records if record.vendor_id == vendor.id
            ),
            asset_results=assets,
            contracts=tuple(vendor_contract_map.get(vendor.id, ())),
            contract_cif=contract_cif,
            sub_rows=graph.sub_outsourcing,
            sub_ranks=sub_ranks,
            contract_vendor_ids=contract_vendor_ids,
        )

    # --- Contract blocks (need the chain ranks for the S display).
    reference_counts = Counter(
        contract.contract_reference
        for contract in graph.contracts
        if contract.contract_reference is not None
    )
    contracts: dict[int, VendorContractDerivation] = {
        contract.id: _derive_contract(
            contract,
            vendor_names_by_id=vendor_names_by_id,
            prime_vendor_cif=contract_cif[contract.id],
            reference_counts=reference_counts,
            contract_sub_rows=tuple(contract_sub_map.get(contract.id, ())),
            sub_ranks=sub_ranks,
        )
        for contract in graph.contracts
    }

    return IctRegisterDerivation(
        processes=processes,
        assets=assets,
        vendors=vendors,
        contracts=contracts,
        sub_outsourcing=sub_outsourcing,
    )
