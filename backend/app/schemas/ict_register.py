"""Schemas for the ICT Register reference-data surface (read-only)."""

from __future__ import annotations

from pydantic import BaseModel

ClosedListValue = str | int


class IctClosedListRead(BaseModel):
    """One workbook closed list, verbatim (spec section 3.1)."""

    name: str
    values: list[ClosedListValue]


class IctClosedListCollectionRead(BaseModel):
    lists: list[IctClosedListRead]


class IctServiceTypeRead(BaseModel):
    """One S-code of the DORA ICT service taxonomy with its workbook label."""

    code: str
    label: str


class IctServiceTaxonomyRead(BaseModel):
    services: list[IctServiceTypeRead]
    cloud_service_codes: list[str]


class IctCountryCategoryRead(BaseModel):
    """One ZemeList country with its workbook country category."""

    country: str
    category: str


class IctCountryCategoryCollectionRead(BaseModel):
    countries: list[IctCountryCategoryRead]


class IctRoiMapRead(BaseModel):
    """One CZ->EN RoI closed-list conversion map, verbatim."""

    name: str
    entries: dict[str, str]


class IctRoiMapCollectionRead(BaseModel):
    maps: list[IctRoiMapRead]


class IctRoiTranslationRead(BaseModel):
    """Result of one CZ->EN RoI lookup, including the workbook fallback rule."""

    map: str
    source: str
    value: str
    mapped: bool


class IctWorkbookParameterRead(BaseModel):
    """One workbook parameter with its effective value (dates as ISO strings)."""

    name: str
    value: int | str
    value_type: str
    meaning: str


class IctWorkbookParameterSetRead(BaseModel):
    """The versioned workbook parameter set (version = P_Verze)."""

    version: str
    parameters: list[IctWorkbookParameterRead]


class IctDqViolatingRowRead(BaseModel):
    """One violating row behind a DQ finding, with its drill-down anchor."""

    entity_type: str
    entity_id: int
    label: str
    route_entity_type: str
    route_entity_id: int


class IctDqCheckRead(BaseModel):
    """One 15_Kontroly_kvality check: workbook id, area, CZ title verbatim,
    severity, the literal 0 threshold, count, and OK/NÁLEZ status (#50).

    ``production_inert`` marks checks whose trigger input has no app column
    (DQ-23): permanently 0 on production data, rendered "not yet measurable"
    instead of OK. ``count``/``status`` are register-global; ``violating_rows``
    are filtered to the caller's entity visibility.
    """

    check_id: str
    area: str
    title_cs: str
    severity: str
    threshold: int
    count: int
    status: str
    production_inert: bool = False
    production_inert_reason: str | None = None
    violating_rows: list[IctDqViolatingRowRead]


class IctRegisterDqRead(BaseModel):
    """All 52 data-quality checks in workbook order, computed on read."""

    checks: list[IctDqCheckRead]
    finding_count: int


# ---------------------------------------------------------------------------
# ICT Risk Committee page (issue #51) — 16_Dashboard + 18_CRO_přehled.
# ---------------------------------------------------------------------------


class IctCommitteeRegisterStateRead(BaseModel):
    """16_Dashboard "Stav registrů" (tile inventory §1.1), sheet row order."""

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


class IctCommitteeKeyMetricsRead(BaseModel):
    """16_Dashboard "Klíčové metriky" (§1.2) — the live Hodnota column; the
    static Interpretace/Zdroj/Akce texts ship in the frontend i18n."""

    cif_process_count: int
    processes_without_impact_assessment_count: int
    critical_asset_count: int
    critical_vendor_count: int
    risks_above_tolerance_count: int
    open_dq_finding_count: int


class IctCommitteeDashboardRead(BaseModel):
    register_state: IctCommitteeRegisterStateRead
    key_metrics: IctCommitteeKeyMetricsRead


class IctCommitteeCroKpiRead(BaseModel):
    """18_CRO_přehled KPI strip (§2.1), sheet column order."""

    risk_count: int
    material_risk_count: int
    risks_above_tolerance_count: int
    accepted_above_tolerance_count: int
    cif_without_bcm_count: int
    open_dq_finding_count: int


class IctCommitteeHeatmapRowRead(BaseModel):
    """One heatmap row (§2.2): probability, then subject-value 1..5 counts."""

    probability: int
    cells: list[int]


class IctCommitteeHeatmapRead(BaseModel):
    """"Heatmapa hrubého rizika" — rows probability 5 down to 1."""

    rows: list[IctCommitteeHeatmapRowRead]


class IctCommitteeMigrationRowRead(BaseModel):
    """One migration row (§2.3): gross band, then net-band counts in band
    order Nízké/Střední/Vysoké/Kritické."""

    gross_band: str
    cells: list[int]


class IctCommitteeMigrationMatrixRead(BaseModel):
    """"Migrační matice: pásmo hrubého → pásmo čistého rizika"."""

    rows: list[IctCommitteeMigrationRowRead]


class IctCommitteeTopRiskRead(BaseModel):
    """One "Top 10 rizik podle čistého rizika" row (§2.4), the h_zebr order."""

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


class IctCommitteeTopVendorRead(BaseModel):
    """One "Koncentrace: top 5 dodavatelů dle CIF vazeb" row (§2.5)."""

    rank: int
    vendor_id: int
    name: str
    cif_process_count: int
    tier: str


class IctCommitteeNarrativesRead(BaseModel):
    """The five live sentences (§2.6) as values; the frontend composes the
    bilingual copy."""

    cif_process_count: int
    process_count: int
    cif_with_bcm_count: int
    critical_vendor_count: int
    critical_vendors_with_functional_exit_count: int
    critical_vendors_with_identifier_count: int
    tolerance: int
    risks_above_tolerance_count: int
    accepted_above_tolerance_count: int
    sub_outsourcing_link_count: int
    vendors_in_sub_role_count: int


class IctCommitteeBandCountRead(BaseModel):
    """One "Aktiva dle výsledné kritičnosti" staging row (§2.7)."""

    band: str
    count: int


class IctCommitteeRiskBandCountsRead(BaseModel):
    """One "Rizika dle pásem (hrubé vs čisté)" staging row (§2.7)."""

    band: str
    gross_count: int
    net_count: int


class IctCommitteeCroRead(BaseModel):
    kpi: IctCommitteeCroKpiRead
    heatmap: IctCommitteeHeatmapRead
    migration_matrix: IctCommitteeMigrationMatrixRead
    top_risks: list[IctCommitteeTopRiskRead]
    top_vendors: list[IctCommitteeTopVendorRead]
    narratives: IctCommitteeNarrativesRead
    assets_by_criticality: list[IctCommitteeBandCountRead]
    risks_by_band: list[IctCommitteeRiskBandCountsRead]


class IctCommitteeRead(BaseModel):
    """The ICT Risk Committee read model: both workbook output sheets,
    computed on read (issue #51)."""

    dashboard: IctCommitteeDashboardRead
    cro: IctCommitteeCroRead
