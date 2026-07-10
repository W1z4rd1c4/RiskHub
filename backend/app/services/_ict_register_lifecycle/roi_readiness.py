"""RoI-readiness — per-template completeness across the 15 RoI templates (issue #52).

Computes, for the ICT Risk Committee page, how far the register is from being
able to populate the Register of Information of CIR 2024/2956: for each of the
15 Annex I templates (Article 5(1)(a)-(o) order), the row set that would feed
it after the workbook's gates (functional spec section 4), the percentage of
required fields populated across those rows, and the concrete gaps — row
identity plus the missing field codes — capped per template with a total count.

Contract:
- **Pure and engine-fed**: consumed alongside :func:`~.derivation.derive_ict_register`
  outputs — derived values (Process CIF for B_06.01.0050, Asset CIF for the
  B_02.02 CIF-gated block, the main-contract lookups, Sub-outsourcing ranks
  and reference lookups, the primary-process designation) come from the
  engine, never recomputed here. Entered fields the engine graph does not
  carry (F-codes, licensed activity, the Vendor B_07.01 assessment block, the
  Contract monetary/notice/law columns, the Sub-outsourcing S-code and
  identifier) ride in on :class:`RoiRegisterSupplement`, loaded by the
  committee loader from the same register rows.
- **Post-corrigendum field codes** (legal spec addendum, ticket #40): B_06.01
  is the verified contiguous 0010-0100 table — the criticality flag is
  B_06.01.0050 and B_06.01.0110 no longer exists. The addendum's other
  primary-verified codes (B_05.01.0020, B_05.01.0070, B_07.01.0110) and the
  workbook's own B_02.02.0180 (DQ-14's reliance column) pin their fields;
  every other field keeps ``code=None`` — the pre-corrigendum annex detail in
  the legal spec is paraphrase-grade, and codes are never fabricated.
- **Gates, workbook-verbatim** (spec section 4 + the documented asymmetry):
  the per-arrangement templates (B_02.01, B_03.01, B_03.02, B_04.01) feed only
  from Contracts whose RoI-scope flag is "Ano"; the per-service templates
  (B_02.02, B_05.02 rank-1, B_07.01) feed from EVERY Asset<->Vendor link
  unconditionally; B_05.02 rank-2+ feeds from every Sub-outsourcing row;
  B_05.01/B_06.01 feed on row presence (the workbook's ``A<>""`` empty-row
  guard has no in-app analog — register rows exist or they don't).
- **Sentinel honesty** (addendum A.6.4): '0' RTO/RPO is a reported value, not
  a gap; B_06.01.0070 and the B_07.01 audit date carry the workbook's
  '9999-12-31' fallback, so they are emittable by construction and never
  gap; the B_06.01.0050 flag is always emittable (the engine's Process CIF is
  never blank in-app, so the "Assessment not performed" branch cannot occur).
- **Coverage honesty**: ``full`` means every column of the template is
  emittable from the register (B_06.01's verified 10-column table; the small
  signatory/usage templates the workbook emits whole). ``partial`` records
  that the annex carries columns the register does not (B_02.01 renewal
  terms; B_02.02's provider-side notice/law columns — carried per Contract,
  surfaced on B_02.01 instead; B_05.01's monetary columns 0090/0100, which
  are per-Contract in-app and not vendor-aggregable without inventing a rule;
  B_05.02/B_07.01 identifier-type and assessment columns beyond the workbook
  mapping). ``documentary`` templates are note-only per the workbook: the
  B_01.x entity block (workbook parameters + manual cells), the intra-group
  B_02.03/B_03.03 notes ("solo entity"), and the B_99.01 narrative — whose
  legal-text row R0070 targets B_06.01.0100 post-corrigendum (the OJ text
  still prints the stale 0110 cross-reference; addendum A.5.3/A.6.5).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.services._ict_register_reference.parameters import (
    ICT_WORKBOOK_PARAMETERS_BY_NAME,
    IctWorkbookParameterSet,
)

from .derivation import (
    ANO,
    UNKNOWN_LOOKUP,
    IctRegisterDerivation,
    IctRegisterGraph,
    process_display_name,
)

ROI_COVERAGE_FULL = "full"
ROI_COVERAGE_PARTIAL = "partial"
ROI_COVERAGE_DOCUMENTARY = "documentary"

ROI_GATE_PRESENCE = "presence"
ROI_GATE_ROI_SCOPE = "roi_scope"
ROI_GATE_UNCONDITIONAL = "unconditional"
ROI_GATE_DOCUMENTARY = "documentary"

ROI_REQUIRED = "required"
ROI_OPTIONAL = "optional"
# Required only where the row's CIF flag is "Ano" — the workbook populates the
# B_02.02 detail block IF(CIF="Ano") only (spec section 4); blank otherwise is
# correct, not a gap. Same trigger as DQ-14's reliance rule.
ROI_REQUIRED_WHEN_CIF = "required_when_cif"

# Listed gap rows are capped per template; ``gap_row_count`` carries the total.
ROI_GAP_ROW_CAP = 20

# Display fallbacks — FRONTEND_DISPLAY_GUARDRAILS (docs/agent/FRONTEND_DISPLAY_GUARDRAILS.md):
# a gap row whose OWN business label (contract reference, vendor/sub-provider
# name) is genuinely absent emits a localizable ``{{key}}`` token the client
# resolves to ``common:fallbacks.<entity>`` ("Unknown <entity>"), never a raw
# ``#<pk>``/``SUB-<pk>`` string. The workbook "?" (UNKNOWN_LOOKUP) for a
# DANGLING target is a separate, allowed signal.
UNKNOWN_CONTRACT_LABEL = "{{unknown_contract}}"
UNKNOWN_VENDOR_LABEL = "{{unknown_vendor}}"
UNKNOWN_SUB_OUTSOURCING_LABEL = "{{unknown_sub_outsourcing}}"


# ---------------------------------------------------------------------------
# Template registry — data, not logic.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RoiTemplateField:
    """One template column the register carries.

    ``code`` is the post-corrigendum field code where the addendum (or the
    workbook itself, for B_02.02.0180) verifies it — ``None`` otherwise.
    ``source`` documents the app column / engine output / parameter feeding it.
    """

    key: str
    code: str | None
    source: str
    requirement: str = ROI_REQUIRED


@dataclass(frozen=True)
class RoiTemplate:
    """One RoI template: code, bilingual name, feed, gate, coverage, fields."""

    code: str
    name_en: str
    name_cs: str
    feed: str
    gate: str
    coverage: str
    fields: tuple[RoiTemplateField, ...] = ()


def _field(key: str, code: str | None, source: str, requirement: str = ROI_REQUIRED) -> RoiTemplateField:
    return RoiTemplateField(key=key, code=code, source=source, requirement=requirement)


ROI_TEMPLATE_REGISTRY: tuple[RoiTemplate, ...] = (
    RoiTemplate(
        code="B_01.01",
        name_en="Entity maintaining the register",
        name_cs="Entita vedoucí registr",
        feed="entity",
        gate=ROI_GATE_DOCUMENTARY,
        coverage=ROI_COVERAGE_DOCUMENTARY,
    ),
    RoiTemplate(
        code="B_01.02",
        name_en="List of entities within the scope of consolidation",
        name_cs="Finanční subjekty",
        feed="entity",
        gate=ROI_GATE_DOCUMENTARY,
        coverage=ROI_COVERAGE_DOCUMENTARY,
    ),
    RoiTemplate(
        code="B_01.03",
        name_en="List of branches",
        name_cs="Pobočky",
        feed="entity",
        gate=ROI_GATE_DOCUMENTARY,
        coverage=ROI_COVERAGE_DOCUMENTARY,
    ),
    RoiTemplate(
        code="B_02.01",
        name_en="Contractual arrangements — general information",
        name_cs="Smluvní ujednání",
        feed="contracts",
        gate=ROI_GATE_ROI_SCOPE,
        coverage=ROI_COVERAGE_PARTIAL,
        fields=(
            _field("contractual_arrangement_reference", None, "contract.contract_reference"),
            _field("arrangement_type", None, "contract.arrangement_type"),
            _field(
                "overarching_reference",
                None,
                "contract.overarching_arrangement_reference",
                ROI_OPTIONAL,
            ),
            _field("currency", None, "contract.currency"),
            _field("annual_expense", None, "contract.annual_cost"),
            _field("start_date", None, "contract.start_date"),
            # Open-ended arrangements legitimately have no end date; the app
            # has no open-ended flag, so a blank end date is never a gap.
            _field("end_date", None, "contract.end_date", ROI_OPTIONAL),
            _field("notice_period_entity", None, "contract.notice_period_entity_days", ROI_OPTIONAL),
            _field(
                "notice_period_provider", None, "contract.notice_period_provider_days", ROI_OPTIONAL
            ),
            _field("governing_law_country", None, "contract.governing_law_country", ROI_OPTIONAL),
        ),
    ),
    RoiTemplate(
        code="B_02.02",
        name_en="Contractual arrangements — specific information",
        name_cs="Smluvní ujednání (služba)",
        feed="asset_vendor_links",
        gate=ROI_GATE_UNCONDITIONAL,
        coverage=ROI_COVERAGE_PARTIAL,
        fields=(
            _field("contractual_arrangement_reference", None, "link.contract_reference"),
            _field("entity_lei", None, "parameter.P_LEI"),
            _field("provider_identification_code", None, "vendor.identifier_value"),
            _field("provider_identification_type", None, "vendor.identifier_type"),
            _field(
                "function_identifier",
                None,
                "engine.asset.primary_process_id -> process.f_code",
            ),
            _field("ict_service_type", None, "link.ict_service_code"),
            _field("start_date", None, "engine.vendor.main_contract_start_date"),
            _field("end_date", None, "engine.vendor.main_contract_end_date", ROI_OPTIONAL),
            _field("cif_support", None, "engine.asset.cif"),
            _field("provisioning_country", None, "vendor.service_country", ROI_REQUIRED_WHEN_CIF),
            _field("data_storage", None, "vendor.data_storage", ROI_REQUIRED_WHEN_CIF),
            _field("data_location", None, "vendor.data_location", ROI_REQUIRED_WHEN_CIF),
            _field("data_sensitiveness", None, "vendor.data_sensitivity", ROI_REQUIRED_WHEN_CIF),
            _field("reliance_level", "B_02.02.0180", "link.reliance", ROI_REQUIRED_WHEN_CIF),
        ),
    ),
    RoiTemplate(
        code="B_02.03",
        name_en="List of intra-group contractual arrangements",
        name_cs="Skupinové ujednání",
        feed="none",
        gate=ROI_GATE_DOCUMENTARY,
        coverage=ROI_COVERAGE_DOCUMENTARY,
    ),
    RoiTemplate(
        code="B_03.01",
        name_en="Entities signing the arrangement, for receiving ICT services",
        name_cs="Podepisující subjekt",
        feed="contracts",
        gate=ROI_GATE_ROI_SCOPE,
        coverage=ROI_COVERAGE_FULL,
        fields=(
            _field("contractual_arrangement_reference", None, "contract.contract_reference"),
            _field("entity_lei", None, "parameter.P_LEI"),
        ),
    ),
    RoiTemplate(
        code="B_03.02",
        name_en="ICT third-party service providers signing the arrangement",
        name_cs="Podepisující poskytovatel",
        feed="contracts",
        gate=ROI_GATE_ROI_SCOPE,
        coverage=ROI_COVERAGE_FULL,
        fields=(
            _field("contractual_arrangement_reference", None, "contract.contract_reference"),
            _field("provider_identification_code", None, "vendor.identifier_value"),
            _field("provider_identification_type", None, "vendor.identifier_type"),
        ),
    ),
    RoiTemplate(
        code="B_03.03",
        name_en="Entities signing the arrangement, for providing ICT services (intra-group)",
        name_cs="Skupinové poskytování",
        feed="none",
        gate=ROI_GATE_DOCUMENTARY,
        coverage=ROI_COVERAGE_DOCUMENTARY,
    ),
    RoiTemplate(
        code="B_04.01",
        name_en="Entities making use of the ICT services",
        name_cs="Subjekty využívající službu",
        feed="contracts",
        gate=ROI_GATE_ROI_SCOPE,
        coverage=ROI_COVERAGE_FULL,
        fields=(
            _field("contractual_arrangement_reference", None, "contract.contract_reference"),
            _field("entity_lei", None, "parameter.P_LEI"),
            # The workbook emits "not a branch" (branch code legitimately blank).
            _field("usage_nature", None, "constant.not_a_branch"),
        ),
    ),
    RoiTemplate(
        code="B_05.01",
        name_en="ICT third-party service providers",
        name_cs="Poskytovatelé",
        feed="vendors",
        gate=ROI_GATE_PRESENCE,
        coverage=ROI_COVERAGE_PARTIAL,
        fields=(
            _field("provider_identification_code", None, "vendor.identifier_value"),
            _field("provider_identification_type", "B_05.01.0020", "vendor.identifier_type"),
            _field("legal_name", None, "vendor.name"),
            _field("latin_name", None, "vendor.latin_name"),
            _field("person_type", "B_05.01.0070", "vendor.person_type"),
            _field("headquarters_country", None, "vendor.country"),
        ),
    ),
    RoiTemplate(
        code="B_05.02",
        name_en="ICT service supply chains",
        name_cs="Dodavatelský řetězec",
        feed="supply_chain",
        gate=ROI_GATE_UNCONDITIONAL,
        coverage=ROI_COVERAGE_PARTIAL,
        fields=(
            _field(
                "contractual_arrangement_reference",
                None,
                "link.contract_reference | engine.sub.contract_reference",
            ),
            _field("ict_service_type", None, "link.ict_service_code | sub.ict_service_code"),
            _field("provider_name", None, "vendor.name | sub.sub_provider_name"),
            _field(
                "provider_identification_code",
                None,
                "vendor.identifier_value | sub.identifier_value",
            ),
            _field("rank", None, "constant.rank_1 | engine.sub.rank"),
            _field("recipient", None, "constant.blank_at_rank_1 | sub.predecessor_provider"),
        ),
    ),
    RoiTemplate(
        code="B_06.01",
        name_en="Functions identification",
        name_cs="Určení funkcí",
        feed="processes",
        gate=ROI_GATE_PRESENCE,
        coverage=ROI_COVERAGE_FULL,
        fields=(
            _field("function_identifier", "B_06.01.0010", "process.f_code"),
            _field("licensed_activity", "B_06.01.0020", "process.licensed_activity"),
            _field("function_name", "B_06.01.0030", "process.l1_process"),
            _field("entity_lei", "B_06.01.0040", "parameter.P_LEI"),
            _field("criticality_assessment", "B_06.01.0050", "engine.process.cif"),
            _field(
                "criticality_reasons",
                "B_06.01.0060",
                "engine.process.criticality_class",
                ROI_OPTIONAL,
            ),
            # Sentinel-backed: the workbook writes '9999-12-31' when blank.
            _field("last_assessment_date", "B_06.01.0070", "process.assessment_date"),
            _field("rto_hours", "B_06.01.0080", "process.rto_hours"),
            _field("rpo_hours", "B_06.01.0090", "process.rpo_hours"),
            _field("discontinuation_impact", "B_06.01.0100", "process.interruption_impact"),
        ),
    ),
    RoiTemplate(
        code="B_07.01",
        name_en="Assessment of ICT services supporting critical or important functions",
        name_cs="Posouzení služeb IKT",
        feed="asset_vendor_links",
        gate=ROI_GATE_UNCONDITIONAL,
        coverage=ROI_COVERAGE_PARTIAL,
        fields=(
            _field("contractual_arrangement_reference", None, "link.contract_reference"),
            _field("ict_service_type", None, "link.ict_service_code"),
            _field("substitutability", None, "vendor.substitutability"),
            _field("substitutability_reason", None, "vendor.substitutability_reason"),
            # Sentinel-backed: the workbook writes '9999-12-31' when blank.
            _field("last_audit_date", None, "vendor.last_audit_date"),
            # Derived Yes/No over the exit-plan state (the DQ-17 functional set).
            _field("exit_plan", None, "vendor.exit_plan_state"),
            _field("reintegration", None, "vendor.reintegration"),
            _field("discontinuation_impact", None, "vendor.service_disruption_impact"),
            _field("alternative_providers", "B_07.01.0110", "vendor.alternative_providers"),
            _field(
                "alternative_providers_names",
                None,
                "vendor.alternative_providers_names",
                ROI_OPTIONAL,
            ),
        ),
    ),
    RoiTemplate(
        code="B_99.01",
        name_en="Definitions used by the entity",
        name_cs="Definice používané subjektem",
        feed="entity",
        gate=ROI_GATE_DOCUMENTARY,
        coverage=ROI_COVERAGE_DOCUMENTARY,
    ),
)

_REGISTRY_BY_CODE: Mapping[str, RoiTemplate] = {
    template.code: template for template in ROI_TEMPLATE_REGISTRY
}


# ---------------------------------------------------------------------------
# Supplementary feed — entered register columns the engine graph omits.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RoiProcessSupplement:
    f_code: str | None = None
    licensed_activity: str | None = None


@dataclass(frozen=True)
class RoiVendorSupplement:
    latin_name: str | None = None
    substitutability_reason: str | None = None
    last_audit_date: date | None = None
    reintegration: str | None = None
    service_disruption_impact: str | None = None
    alternative_providers: str | None = None
    alternative_providers_names: str | None = None
    service_country: str | None = None
    data_storage: str | None = None
    data_location: str | None = None
    data_sensitivity: str | None = None


@dataclass(frozen=True)
class RoiContractSupplement:
    overarching_reference: str | None = None
    notice_period_entity_days: int | None = None
    notice_period_provider_days: int | None = None
    governing_law_country: str | None = None
    annual_cost: Decimal | None = None
    currency: str | None = None


@dataclass(frozen=True)
class RoiSubOutsourcingSupplement:
    ict_service_code: str | None = None
    identifier_value: str | None = None


@dataclass(frozen=True)
class RoiRegisterSupplement:
    """Entered fields keyed by register row id, loaded with the committee graph."""

    processes: Mapping[int, RoiProcessSupplement] = field(default_factory=dict)
    vendors: Mapping[int, RoiVendorSupplement] = field(default_factory=dict)
    contracts: Mapping[int, RoiContractSupplement] = field(default_factory=dict)
    sub_outsourcing: Mapping[int, RoiSubOutsourcingSupplement] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Outputs.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RoiMissingField:
    """One missing required column on a gap row: stable key + verified code."""

    key: str
    code: str | None


@dataclass(frozen=True)
class RoiRowGap:
    """One feeding row with at least one missing required field, with the same
    drill-down anchor shape as the DQ violating rows (#50)."""

    entity_type: str
    entity_id: int
    label: str
    route_entity_type: str
    route_entity_id: int
    missing: tuple[RoiMissingField, ...]


@dataclass(frozen=True)
class RoiTemplateReadiness:
    """One template's readiness: registry identity + the computed counts."""

    code: str
    name_en: str
    name_cs: str
    feed: str
    gate: str
    coverage: str
    row_count: int
    required_field_count: int
    populated_field_count: int
    # None for documentary templates and when no rows feed the template.
    readiness_pct: float | None
    gap_row_count: int
    gap_rows: tuple[RoiRowGap, ...]


@dataclass(frozen=True)
class RoiReadiness:
    """All 15 templates in annex order plus the overall summary."""

    templates: tuple[RoiTemplateReadiness, ...]
    overall_readiness_pct: float | None
    total_gap_row_count: int


# ---------------------------------------------------------------------------
# Computation.
# ---------------------------------------------------------------------------

# The B_07.01 exit-plan "Yes" set — the workbook's own literals (functional
# spec section 4), identical to DQ-17's functional-exit set.
_EXIT_PLAN_YES_STATES: tuple[str, ...] = ("Schválen", "Testován", "K revizi")


def _filled(value: object) -> bool:
    """A cell is populated unless blank or the engine's "?" lookup sentinel.

    ``0`` is a reported value, never a gap (addendum A.6.4: RTO/RPO '0' means
    "not defined" as a VALUE; blank is the gap).
    """
    if value is None:
        return False
    if isinstance(value, str):
        return value != "" and value != UNKNOWN_LOOKUP
    return True


def _lei_is_filled(parameters: IctWorkbookParameterSet) -> bool:
    """The entity LEI (B_06.01.0040 and the B_02.02/B_03.01/B_04.01 signatory
    templates) counts as populated only once the workbook placeholder default
    has been REPLACED with a real value.

    The P_LEI registry default is the spec's 'fill me in' placeholder
    (``LEI-DOPLNIT``; functional spec section 6 / the RoI notes at
    docs/dora-ict-register/dora-excel-functional-spec.md:960) — sourced here
    from the parameter registry, never hardcoded in this module — so a fresh
    DB reads every LEI-bearing required field as a GAP until a real value is
    configured through the ADR-008 overlay. P_LEI is the only placeholder-
    defaulted parameter this element consumes.
    """
    value = parameters.value("P_LEI")
    stripped = value.strip() if isinstance(value, str) else value
    placeholder = ICT_WORKBOOK_PARAMETERS_BY_NAME["P_LEI"].default
    placeholder = placeholder.strip() if isinstance(placeholder, str) else placeholder
    return _filled(stripped) and stripped != placeholder


@dataclass(frozen=True)
class _RowAnchor:
    entity_type: str
    entity_id: int
    label: str
    route_entity_type: str
    route_entity_id: int


# One feeding row: its anchor plus {field key -> populated} for every field
# REQUIRED for that row (per-row resolution of ROI_REQUIRED_WHEN_CIF).
_TemplateRow = tuple[_RowAnchor, dict[str, bool]]


def _round_pct(populated: int, required: int) -> float | None:
    if required == 0:
        return None
    return round(100 * populated / required, 1)


def derive_roi_readiness(
    graph: IctRegisterGraph,
    supplement: RoiRegisterSupplement,
    derivation: IctRegisterDerivation,
    parameters: IctWorkbookParameterSet,
) -> RoiReadiness:
    """Compute per-template readiness over the gated row sets, on read."""
    lei_filled = _lei_is_filled(parameters)

    processes_by_id = {row.id: row for row in graph.processes}
    vendors_by_id = {row.id: row for row in graph.vendors}
    subs_by_id = {row.id: row for row in graph.sub_outsourcing}

    def process_supplement(process_id: int) -> RoiProcessSupplement:
        return supplement.processes.get(process_id, RoiProcessSupplement())

    def vendor_supplement(vendor_id: int) -> RoiVendorSupplement:
        return supplement.vendors.get(vendor_id, RoiVendorSupplement())

    def contract_supplement(contract_id: int) -> RoiContractSupplement:
        return supplement.contracts.get(contract_id, RoiContractSupplement())

    def sub_supplement(sub_id: int) -> RoiSubOutsourcingSupplement:
        return supplement.sub_outsourcing.get(sub_id, RoiSubOutsourcingSupplement())

    def process_label(process_id: int) -> str:
        row = processes_by_id.get(process_id)
        if row is None:
            return UNKNOWN_LOOKUP
        name = process_display_name(row.l1_process, row.l2_subprocess)
        f_code = process_supplement(process_id).f_code
        return f"{f_code} — {name}" if f_code else name

    def asset_label(asset_id: int) -> str:
        row = next((asset for asset in graph.assets if asset.id == asset_id), None)
        return row.name if row else UNKNOWN_LOOKUP

    def vendor_label(vendor_id: int) -> str:
        row = vendors_by_id.get(vendor_id)
        return row.name if row else UNKNOWN_LOOKUP

    def contract_anchor(contract_id: int, vendor_id: int, reference: str | None) -> _RowAnchor:
        return _RowAnchor(
            "contract", contract_id, reference or UNKNOWN_CONTRACT_LABEL, "vendor", vendor_id
        )

    def link_anchor(asset_id: int, vendor_id: int, ict_service_code: str | None) -> _RowAnchor:
        label = f"{asset_label(asset_id)} ↔ {vendor_label(vendor_id)}"
        if ict_service_code:
            label = f"{label} ({ict_service_code})"
        return _RowAnchor("asset_vendor_link", vendor_id, label, "asset", asset_id)

    roi_contracts = tuple(contract for contract in graph.contracts if contract.roi_scope == ANO)

    # --- B_06.01 — one row per Process (spec section 4).
    def b_06_01_rows() -> list[_TemplateRow]:
        rows: list[_TemplateRow] = []
        for row in graph.processes:
            extra = process_supplement(row.id)
            rows.append(
                (
                    _RowAnchor("process", row.id, process_label(row.id), "process", row.id),
                    {
                        "function_identifier": _filled(extra.f_code),
                        "licensed_activity": _filled(extra.licensed_activity),
                        "function_name": _filled(row.l1_process),
                        "entity_lei": lei_filled,
                        # Engine CIF is always Ano/Ne -> the flag always emits.
                        "criticality_assessment": row.id in derivation.processes,
                        # Sentinel-backed '9999-12-31' when blank.
                        "last_assessment_date": True,
                        "rto_hours": row.rto_hours is not None,
                        "rpo_hours": row.rpo_hours is not None,
                        "discontinuation_impact": _filled(row.interruption_impact),
                    },
                )
            )
        return rows

    # --- B_05.01 — one row per Vendor.
    def b_05_01_rows() -> list[_TemplateRow]:
        rows: list[_TemplateRow] = []
        for row in graph.vendors:
            extra = vendor_supplement(row.id)
            rows.append(
                (
                    _RowAnchor("vendor", row.id, row.name or UNKNOWN_VENDOR_LABEL, "vendor", row.id),
                    {
                        "provider_identification_code": _filled(row.identifier_value),
                        "provider_identification_type": _filled(row.identifier_type),
                        "legal_name": _filled(row.name),
                        "latin_name": _filled(extra.latin_name),
                        "person_type": _filled(row.person_type),
                        "headquarters_country": _filled(row.country),
                    },
                )
            )
        return rows

    # --- B_02.01 / B_03.01 / B_03.02 / B_04.01 — one row per RoI-scope Contract.
    def b_02_01_rows() -> list[_TemplateRow]:
        rows: list[_TemplateRow] = []
        for contract in roi_contracts:
            extra = contract_supplement(contract.id)
            rows.append(
                (
                    contract_anchor(contract.id, contract.vendor_id, contract.contract_reference),
                    {
                        "contractual_arrangement_reference": _filled(contract.contract_reference),
                        "arrangement_type": _filled(contract.arrangement_type),
                        "currency": _filled(extra.currency),
                        "annual_expense": extra.annual_cost is not None,
                        "start_date": contract.start_date is not None,
                    },
                )
            )
        return rows

    def b_03_01_rows() -> list[_TemplateRow]:
        return [
            (
                contract_anchor(contract.id, contract.vendor_id, contract.contract_reference),
                {
                    "contractual_arrangement_reference": _filled(contract.contract_reference),
                    "entity_lei": lei_filled,
                },
            )
            for contract in roi_contracts
        ]

    def b_03_02_rows() -> list[_TemplateRow]:
        rows: list[_TemplateRow] = []
        for contract in roi_contracts:
            vendor = vendors_by_id.get(contract.vendor_id)
            rows.append(
                (
                    contract_anchor(contract.id, contract.vendor_id, contract.contract_reference),
                    {
                        "contractual_arrangement_reference": _filled(contract.contract_reference),
                        "provider_identification_code": _filled(
                            vendor.identifier_value if vendor else None
                        ),
                        "provider_identification_type": _filled(
                            vendor.identifier_type if vendor else None
                        ),
                    },
                )
            )
        return rows

    def b_04_01_rows() -> list[_TemplateRow]:
        return [
            (
                contract_anchor(contract.id, contract.vendor_id, contract.contract_reference),
                {
                    "contractual_arrangement_reference": _filled(contract.contract_reference),
                    "entity_lei": lei_filled,
                    "usage_nature": True,  # constant "not a branch"
                },
            )
            for contract in roi_contracts
        ]

    # --- B_02.02 — one row per Asset<->Vendor link, unconditional.
    def b_02_02_rows() -> list[_TemplateRow]:
        rows: list[_TemplateRow] = []
        for link in graph.asset_vendor_links:
            vendor = vendors_by_id.get(link.vendor_id)
            vendor_extra = vendor_supplement(link.vendor_id)
            vendor_result = derivation.vendors.get(link.vendor_id)
            asset_result = derivation.assets.get(link.asset_id)
            primary_process_id = (
                asset_result.inputs.primary_process_id if asset_result is not None else None
            )
            function_identifier_filled = primary_process_id is not None and _filled(
                process_supplement(primary_process_id).f_code
            )
            fields: dict[str, bool] = {
                "contractual_arrangement_reference": _filled(link.contract_reference),
                "entity_lei": lei_filled,
                "provider_identification_code": _filled(vendor.identifier_value if vendor else None),
                "provider_identification_type": _filled(vendor.identifier_type if vendor else None),
                "function_identifier": function_identifier_filled,
                "ict_service_type": _filled(link.ict_service_code),
                "start_date": (
                    vendor_result.main_contract_start_date is not None
                    if vendor_result is not None
                    else False
                ),
                # 10!M's XLOOKUP falls blank on a missing asset row.
                "cif_support": asset_result is not None,
            }
            if asset_result is not None and asset_result.cif == ANO:
                fields.update(
                    {
                        "provisioning_country": _filled(vendor_extra.service_country),
                        "data_storage": _filled(vendor_extra.data_storage),
                        "data_location": _filled(vendor_extra.data_location),
                        "data_sensitiveness": _filled(vendor_extra.data_sensitivity),
                        "reliance_level": _filled(link.reliance),
                    }
                )
            rows.append((link_anchor(link.asset_id, link.vendor_id, link.ict_service_code), fields))
        return rows

    # --- B_05.02 — rank-1 per Asset<->Vendor link + rank-2+ per Sub-outsourcing row.
    def b_05_02_rows() -> list[_TemplateRow]:
        rows: list[_TemplateRow] = []
        for link in graph.asset_vendor_links:
            vendor = vendors_by_id.get(link.vendor_id)
            rows.append(
                (
                    link_anchor(link.asset_id, link.vendor_id, link.ict_service_code),
                    {
                        "contractual_arrangement_reference": _filled(link.contract_reference),
                        "ict_service_type": _filled(link.ict_service_code),
                        "provider_name": _filled(vendor.name if vendor else None),
                        "provider_identification_code": _filled(
                            vendor.identifier_value if vendor else None
                        ),
                        "rank": True,  # constant rank 1
                        "recipient": True,  # legitimately blank at rank 1
                    },
                )
            )
        for sub in graph.sub_outsourcing:
            sub_result = derivation.sub_outsourcing.get(sub.id)
            extra = sub_supplement(sub.id)
            if sub.predecessor_id is None:
                # Direct sub-outsourcer: the recipient is the contract's prime
                # vendor (the engine's own lookup, "?" on a missing contract).
                recipient_filled = sub_result is not None and _filled(
                    sub_result.contract_vendor_name
                )
            else:
                predecessor = subs_by_id.get(sub.predecessor_id)
                recipient_filled = predecessor is not None and _filled(
                    predecessor.sub_provider_name
                )
            rows.append(
                (
                    _RowAnchor(
                        "sub_outsourcing",
                        sub.id,
                        sub.sub_provider_name or UNKNOWN_SUB_OUTSOURCING_LABEL,
                        "vendor",
                        sub.vendor_id,
                    ),
                    {
                        "contractual_arrangement_reference": (
                            _filled(sub_result.contract_reference) if sub_result else False
                        ),
                        "ict_service_type": _filled(extra.ict_service_code),
                        "provider_name": _filled(sub.sub_provider_name),
                        "provider_identification_code": _filled(extra.identifier_value),
                        # A broken chain derives no rank (the "?" sentinel).
                        "rank": sub_result is not None and sub_result.rank is not None,
                        "recipient": recipient_filled,
                    },
                )
            )
        return rows

    # --- B_07.01 — one row per Asset<->Vendor link, unconditional (the
    # documented asymmetry: never gated on the contract RoI-scope flag).
    def b_07_01_rows() -> list[_TemplateRow]:
        rows: list[_TemplateRow] = []
        for link in graph.asset_vendor_links:
            vendor = vendors_by_id.get(link.vendor_id)
            extra = vendor_supplement(link.vendor_id)
            rows.append(
                (
                    link_anchor(link.asset_id, link.vendor_id, link.ict_service_code),
                    {
                        "contractual_arrangement_reference": _filled(link.contract_reference),
                        "ict_service_type": _filled(link.ict_service_code),
                        "substitutability": _filled(vendor.substitutability if vendor else None),
                        "substitutability_reason": _filled(extra.substitutability_reason),
                        # Sentinel-backed on an existing vendor row.
                        "last_audit_date": vendor is not None,
                        # Derived Yes/No over the state (blank state -> "No").
                        "exit_plan": vendor is not None,
                        "reintegration": _filled(extra.reintegration),
                        "discontinuation_impact": _filled(extra.service_disruption_impact),
                        "alternative_providers": _filled(extra.alternative_providers),
                    },
                )
            )
        return rows

    row_builders = {
        "B_02.01": b_02_01_rows,
        "B_02.02": b_02_02_rows,
        "B_03.01": b_03_01_rows,
        "B_03.02": b_03_02_rows,
        "B_04.01": b_04_01_rows,
        "B_05.01": b_05_01_rows,
        "B_05.02": b_05_02_rows,
        "B_06.01": b_06_01_rows,
        "B_07.01": b_07_01_rows,
    }

    templates: list[RoiTemplateReadiness] = []
    overall_required = 0
    overall_populated = 0
    total_gap_row_count = 0
    for template in ROI_TEMPLATE_REGISTRY:
        builder = row_builders.get(template.code)
        rows = builder() if builder is not None else []
        field_order = [f.key for f in template.fields]
        fields_by_key = {f.key: f for f in template.fields}

        required_field_count = 0
        populated_field_count = 0
        gap_rows: list[RoiRowGap] = []
        gap_row_count = 0
        for anchor, populated_by_key in rows:
            required_field_count += len(populated_by_key)
            populated_field_count += sum(populated_by_key.values())
            missing = tuple(
                RoiMissingField(key=key, code=fields_by_key[key].code)
                for key in field_order
                if key in populated_by_key and not populated_by_key[key]
            )
            if missing:
                gap_row_count += 1
                if len(gap_rows) < ROI_GAP_ROW_CAP:
                    gap_rows.append(
                        RoiRowGap(
                            entity_type=anchor.entity_type,
                            entity_id=anchor.entity_id,
                            label=anchor.label,
                            route_entity_type=anchor.route_entity_type,
                            route_entity_id=anchor.route_entity_id,
                            missing=missing,
                        )
                    )

        overall_required += required_field_count
        overall_populated += populated_field_count
        total_gap_row_count += gap_row_count
        templates.append(
            RoiTemplateReadiness(
                code=template.code,
                name_en=template.name_en,
                name_cs=template.name_cs,
                feed=template.feed,
                gate=template.gate,
                coverage=template.coverage,
                row_count=len(rows),
                required_field_count=required_field_count,
                populated_field_count=populated_field_count,
                readiness_pct=_round_pct(populated_field_count, required_field_count),
                gap_row_count=gap_row_count,
                gap_rows=tuple(gap_rows),
            )
        )

    return RoiReadiness(
        templates=tuple(templates),
        overall_readiness_pct=_round_pct(overall_populated, overall_required),
        total_gap_row_count=total_gap_row_count,
    )
