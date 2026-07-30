from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from app.core.datetime_utils import UtcAwareDatetime
from app.schemas.collection import CollectionGroupRead
from app.services._ict_register_reference import VENDOR_CONTROLLED_CODES_BY_FIELD


class VendorTypeEnum(str, Enum):
    ict = "ict"
    outsourcing = "outsourcing"
    professional_services = "professional_services"
    partner = "partner"
    other = "other"


# Workbook list names remain reference metadata, while runtime writes accept
# only locale-independent codes from ``VENDOR_CONTROLLED_CODES_BY_FIELD``.
_VENDOR_CLOSED_LIST_FIELDS: dict[str, str] = {
    "country": "ZemeList",
    "person_type": "TypOsoby",
    "identifier_type": "TypKodu",
    "data_sensitivity": "CitlivostDat",
    "replaceability": "Substituce",
    "substitutability_reason": "DuvodSubst",
    "exit_plan_state": "ExitPlanStav",
    "reintegration": "Reintegrace",
    "service_disruption_impact": "DopadSluzby",
    "alternative_providers": "AltPosk",
    "ctpp_designation": "AnoNeNeurceno",
    "ex_ante_operational": "ExAnteHodn",
    "ex_ante_legal": "ExAnteHodn",
    "ex_ante_ict": "ExAnteHodn",
    "ex_ante_reputational": "ExAnteHodn",
    "ex_ante_data_confidentiality": "ExAnteHodn",
    "ex_ante_data_availability": "ExAnteHodn",
    "ex_ante_data_location": "ExAnteHodn",
    "ex_ante_provider_location": "ExAnteHodn",
    "ex_ante_ict_concentration": "ExAnteHodn",
    "assessment_phase": "Faze",
    "due_diligence_state": "DueDiligenceStav",
    "significance_authorization_conditions": "AnoNeNerel",
    "significance_regulatory_requirements": "AnoNeNerel",
    "significance_service_quality": "AnoNeNerel",
    "significance_financial_impact": "AnoNeNerel",
    "significance_reputation_continuity": "AnoNeNerel",
    "significance_cumulative_impact": "AnoNeNerel",
}


class VendorRegisterWriteValidators(BaseModel):
    """Closed-list and derived-field enforcement for Vendor WRITE payloads only.

    Deliberately not on ``VendorBase``: read models project rows after the
    forward migration has normalized stored values.

    Vendor writes stay tolerant of unknown keys — a #44 decision locked by
    test (legacy clients still send the dropped ``status``) — so the #49
    derived block is rejected by NAME: the ``derived`` key and every
    ``VendorDerived`` member 422 on write (parent spec #38 user story 31),
    while other unknown keys keep being ignored.
    """

    @model_validator(mode="before")
    @classmethod
    def _reject_engine_derived_fields(cls, data: object) -> object:
        if isinstance(data, dict):
            rejected = sorted(_VENDOR_DERIVED_WRITE_REJECTED.intersection(data))
            if rejected:
                raise ValueError(f"Engine-derived fields are read-only: {', '.join(rejected)}")
        return data

    @field_validator(*_VENDOR_CLOSED_LIST_FIELDS, check_fields=False)
    @classmethod
    def _validate_register_closed_list_fields(cls, value: str | None, info) -> str | None:
        if value is None:
            return value
        if value not in VENDOR_CONTROLLED_CODES_BY_FIELD[info.field_name]:
            raise ValueError(f"Value must be a canonical Vendor {info.field_name} code")
        return value


class VendorRegisterExtension(BaseModel):
    """The entered 07_Dodavatelé register columns added to Vendor (issue #44)."""

    # A·IDENTIFIKACE
    latin_name: str | None = Field(None, max_length=255)
    person_type: str | None = Field(None, max_length=50)
    identifier_type: str | None = Field(None, max_length=20)
    identifier_value: str | None = Field(None, max_length=100)
    address: str | None = Field(None, max_length=255)
    contact_person: str | None = Field(None, max_length=255)
    contact: str | None = Field(None, max_length=255)
    ultimate_parent_name: str | None = Field(None, max_length=255)
    ultimate_parent_lei: str | None = Field(None, max_length=50)

    # C·DATA A LOKACE
    data_storage: str | None = Field(None, max_length=255)
    service_country: str | None = Field(None, max_length=100)
    data_location: str | None = Field(None, max_length=255)
    processing_location: str | None = Field(None, max_length=255)
    data_sensitivity: str | None = Field(None, max_length=20)

    # D·SUBSTITUCE A EXIT
    substitutability_reason: str | None = Field(None, max_length=50)
    last_audit_date: date | None = None
    exit_plan_state: str | None = Field(None, max_length=50)
    reintegration: str | None = Field(None, max_length=20)
    service_disruption_impact: str | None = Field(None, max_length=20)
    alternative_providers: str | None = Field(None, max_length=20)
    alternative_providers_names: str | None = Field(None, max_length=255)

    # F·POSOUZENÍ RIZIKA A VÝZNAMNOSTI
    ctpp_designation: str | None = Field(None, max_length=20)
    ex_ante_operational: str | None = Field(None, max_length=20)
    ex_ante_legal: str | None = Field(None, max_length=20)
    ex_ante_ict: str | None = Field(None, max_length=20)
    ex_ante_reputational: str | None = Field(None, max_length=20)
    ex_ante_data_confidentiality: str | None = Field(None, max_length=20)
    ex_ante_data_availability: str | None = Field(None, max_length=20)
    ex_ante_data_location: str | None = Field(None, max_length=20)
    ex_ante_provider_location: str | None = Field(None, max_length=20)
    ex_ante_ict_concentration: str | None = Field(None, max_length=20)
    ex_ante_assessment_date: date | None = None
    assessment_phase: str | None = Field(None, max_length=20)
    due_diligence_state: str | None = Field(None, max_length=50)
    last_monitoring_date: date | None = None
    significance_authorization_conditions: str | None = Field(None, max_length=20)
    significance_regulatory_requirements: str | None = Field(None, max_length=20)
    significance_service_quality: str | None = Field(None, max_length=20)
    significance_financial_impact: str | None = Field(None, max_length=20)
    significance_reputation_continuity: str | None = Field(None, max_length=20)
    significance_cumulative_impact: str | None = Field(None, max_length=20)
    significance_justification: str | None = None

    # G·STAV A POZNÁMKY
    note: str | None = None
    reference_occurrence_count: int | None = Field(None, ge=0)
    reference_process_count: int | None = Field(None, ge=0)


class VendorBase(VendorRegisterExtension):
    name: str = Field(..., max_length=255)
    legal_name: str | None = Field(None, max_length=255)
    registration_id: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=2)
    website: str | None = Field(None, max_length=255)
    description: str | None = None

    process: str = Field(..., max_length=255)
    subprocess: str | None = Field(None, max_length=255)
    department_id: int | None = None

    outsourcing_owner_user_id: int

    vendor_type: VendorTypeEnum = VendorTypeEnum.other
    risk_score_1_5: int = Field(3, ge=1, le=5)
    supports_important_core_insurance_function: bool = False
    dora_relevant: bool = False
    is_significant_vendor: bool = False
    materiality_assessed_max_impact_pct_own_funds: Decimal | None = Field(None, ge=0)
    replaceability: str | None = Field(None, max_length=50)
    has_alternative_providers: bool = False


class VendorCreate(VendorRegisterWriteValidators, VendorBase):
    request_reason: str | None = Field(None, max_length=1000)


class VendorUpdate(VendorRegisterWriteValidators, VendorRegisterExtension):
    request_reason: str | None = Field(None, max_length=1000)
    name: str | None = Field(None, max_length=255)
    legal_name: str | None = Field(None, max_length=255)
    registration_id: str | None = Field(None, max_length=100)
    country: str | None = Field(None, max_length=2)
    website: str | None = Field(None, max_length=255)
    description: str | None = None

    process: str | None = Field(None, max_length=255)
    subprocess: str | None = Field(None, max_length=255)
    department_id: int | None = None

    outsourcing_owner_user_id: int | None = None

    vendor_type: VendorTypeEnum | None = None
    risk_score_1_5: int | None = Field(None, ge=1, le=5)
    supports_important_core_insurance_function: bool | None = None
    dora_relevant: bool | None = None
    is_significant_vendor: bool | None = None
    materiality_assessed_max_impact_pct_own_funds: Decimal | None = Field(None, ge=0)
    replaceability: str | None = Field(None, max_length=50)
    has_alternative_providers: bool | None = None


class VendorArchiveRequest(BaseModel):
    model_config = {"extra": "forbid"}

    request_reason: str | None = Field(None, max_length=1000)


class VendorLinkedRiskSummary(BaseModel):
    risk_id: int
    risk_id_code: str
    risk_name: str


class VendorTransitiveProcessLink(BaseModel):
    """One derived 11 §2 row: a (Process, Vendor) pair implied via an Asset.

    Derived on read, browsable, never persisted (#49; spec 1.8 §2).
    """

    process_id: int
    process_name: str
    process_cif: str | None = None
    process_criticality: str | None = None
    vendor_id: int
    vendor_name: str
    via_asset_id: int
    via_asset_name: str

    model_config = {"from_attributes": True}


class VendorDerivedInputs(BaseModel):
    """The inputs, link tallies, and triggers behind the derived block."""

    country: str | None = None
    substitutability: str | None = None
    exit_plan_state: str | None = None
    ex_ante_assessment_date: date | None = None
    significance_authorization_conditions: str | None = None
    significance_regulatory_requirements: str | None = None
    significance_service_quality: str | None = None
    significance_financial_impact: str | None = None
    significance_reputation_continuity: str | None = None
    significance_cumulative_impact: str | None = None
    cif_asset_link_count: int
    cif_process_link_count: int
    tier_cif_chain: bool
    tier_max_rank_at_least_high: bool
    tier_substitutability_match: bool
    cloud_service_link_count: int
    manual_process_link_count: int
    transitive_process_pair_count: int
    missing_for_completeness: list[str]

    model_config = {"from_attributes": True}


class VendorDerived(BaseModel):
    """Engine-derived 07_Dodavatelé values (spec 1.3/2.3) — read-only, computed on read."""

    country_category: str | None = None
    cif: str
    linked_asset_count: int
    linked_process_count: int
    cif_process_count: int
    h_rank: int
    max_criticality: str | None = None
    tier: str
    cif_chain: str
    chain_level: str | None = None
    direct_sub_provider_names: list[str]
    direct_sub_provider_count: int
    significance_outcome: str
    main_contract_reference: str | None = None
    main_contract_arrangement_type: str | None = None
    main_contract_start_date: date | None = None
    main_contract_end_date: date | None = None
    contract_count: int
    main_contract_count: int
    is_complete: bool
    inputs: VendorDerivedInputs
    transitive_process_links: list[VendorTransitiveProcessLink]

    model_config = {"from_attributes": True}


# The Vendor write-rejection set: the ``derived`` block key plus every one of
# its member names. Resolved lazily by the model validator above (the class
# is defined first; validation always runs after module import completes).
_VENDOR_DERIVED_WRITE_REJECTED: frozenset[str] = frozenset({"derived", *VendorDerived.model_fields})


class VendorCapabilities(BaseModel):
    can_read: bool
    can_update: bool
    can_manage_accountability: bool
    can_archive: bool
    can_restore: bool
    can_create_linked_risk: bool
    can_create_linked_control: bool
    can_create_linked_kri: bool
    can_link_risk: bool
    can_link_control: bool
    can_link_kri: bool
    can_view_linked_risks: bool
    can_view_linked_controls: bool
    can_view_linked_kris: bool
    can_create_issue: bool
    can_view_contracts: bool
    can_manage_contracts: bool
    can_view_sub_outsourcing: bool
    can_manage_sub_outsourcing: bool
    can_view_asset_links: bool
    can_manage_asset_links: bool
    can_manage_process_links: bool
    protected_change_requires_approval: bool = False
    can_request_change: bool = False
    can_cancel_pending_change: bool = False
    has_pending_change: bool = False
    business_edit_blocked: bool = False


class VendorPendingChangeCapabilities(BaseModel):
    can_view_diff: bool
    can_cancel: bool


class VendorPendingChange(BaseModel):
    approval_id: int | None
    proposal_id: str | None
    proposal_version: int | None
    status: Literal["pending"] = "pending"
    requested_at: UtcAwareDatetime
    requested_by_name: str | None = None
    reason: str
    generic_label: Literal["protected_vendor_change"] = "protected_vendor_change"
    mutation_kind: str | None
    before: dict[str, object]
    after: dict[str, object]
    derived_impact: dict[str, object]
    impacted_resources: list[dict[str, str]]
    relationship_change: dict[str, object] | None = None
    capabilities: VendorPendingChangeCapabilities


class VendorOwnerRead(BaseModel):
    """Safe Outsourcing Owner projection; raw ids are never display labels."""

    name: str
    email: str
    role_name: str
    department_name: str | None = None


class VendorDepartmentLookup(BaseModel):
    """Safe active Department option for Vendor accountability assignment."""

    id: int
    name: str
    code: str

    model_config = {"from_attributes": True}


class VendorRead(VendorBase):
    id: int
    governance_version: int = 1
    is_archived: bool = False
    archived_at: UtcAwareDatetime | None = None
    archived_by_id: int | None = None
    department_name: str | None = None
    outsourcing_owner_name: str | None = None
    outsourcing_owner: VendorOwnerRead | None = None
    owner_orphaned: bool = False
    ownership_status: Literal[
        "assigned",
        "legacy_unassigned",
        "pending_governance",
        "invalid_assignment",
    ] = "legacy_unassigned"
    linked_risks: list[VendorLinkedRiskSummary] = Field(default_factory=list)
    capabilities: VendorCapabilities | None = None
    pending_change: VendorPendingChange | None = None
    # Engine-derived block (ticket #49): populated by the vendor projection on
    # the detail surface, absent from the persistence model, rejected on write.
    derived: VendorDerived | None = None
    created_at: UtcAwareDatetime
    updated_at: UtcAwareDatetime

    model_config = {"from_attributes": True}


class VendorListCapabilities(BaseModel):
    """Collection-level vendor list action capabilities."""

    can_export: bool
    can_create: bool
    can_view_risk_contexts: bool


class VendorFacetOption(BaseModel):
    """One permission-scoped Vendor facet option."""

    value: str
    label: str
    count: int
    disabled: bool = False
    selected: bool = False


class VendorLookupOption(BaseModel):
    """Safe remote Vendor-filter lookup; labels are never raw identifiers."""

    id: int
    label: str
    secondary_label: str | None = None
    disabled: bool = False
    count: int | None = None


class VendorListResponse(BaseModel):
    items: list[VendorRead]
    total: int
    offset: int
    limit: int
    groups: list[CollectionGroupRead] | None = None
    capabilities: VendorListCapabilities | None = None
    facets: dict[str, list[VendorFacetOption]] = Field(default_factory=dict)

    @computed_field
    def skip(self) -> int:
        return self.offset
