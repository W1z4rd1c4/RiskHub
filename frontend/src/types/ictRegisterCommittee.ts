// ICT Risk Committee read model (issue #51) — the workbook's 16_Dashboard +
// 18_CRO_přehled computed on read, per the tile inventory contract
// (docs/dora-ict-register/dashboard-cro-tile-inventory.md).

export interface IctCommitteeRegisterState {
    process_count: number;
    asset_count: number;
    process_asset_link_count: number;
    vendor_count: number;
    assets_pending_review_count: number;
    direct_process_vendor_link_count: number;
    contracts_in_roi_scope_count: number;
    sub_outsourcing_link_count: number;
    assets_without_data_classification_count: number;
    top_tier_vendors_without_orderly_exit_count: number;
}

export interface IctCommitteeKeyMetrics {
    cif_process_count: number;
    processes_without_impact_assessment_count: number;
    critical_asset_count: number;
    critical_vendor_count: number;
    risks_above_tolerance_count: number;
    open_dq_finding_count: number;
}

export interface IctCommitteeDashboard {
    register_state: IctCommitteeRegisterState;
    key_metrics: IctCommitteeKeyMetrics;
}

export interface IctCommitteeCroKpi {
    risk_count: number;
    material_risk_count: number;
    risks_above_tolerance_count: number;
    accepted_above_tolerance_count: number;
    cif_without_bcm_count: number;
    open_dq_finding_count: number;
}

export interface IctCommitteeHeatmapRow {
    probability: number;
    cells: number[];
}

export interface IctCommitteeHeatmap {
    rows: IctCommitteeHeatmapRow[];
}

export interface IctCommitteeMigrationRow {
    gross_band: string;
    cells: number[];
}

export interface IctCommitteeMigrationMatrix {
    rows: IctCommitteeMigrationRow[];
}

export interface IctCommitteeTopRisk {
    rank: number;
    risk_id: number;
    code: string | null;
    subject_label: string | null;
    threat_label: string | null;
    gross_score: number | null;
    net_score: number | null;
    net_band: string | null;
    vs_tolerance: string | null;
    status_label: string | null;
}

export interface IctCommitteeTopVendor {
    rank: number;
    vendor_id: number;
    name: string;
    cif_process_count: number;
    tier: string;
}

export interface IctCommitteeNarratives {
    cif_process_count: number;
    process_count: number;
    cif_with_bcm_count: number;
    critical_vendor_count: number;
    critical_vendors_with_functional_exit_count: number;
    critical_vendors_with_identifier_count: number;
    tolerance: number;
    risks_above_tolerance_count: number;
    accepted_above_tolerance_count: number;
    sub_outsourcing_link_count: number;
    vendors_in_sub_role_count: number;
}

export interface IctCommitteeBandCount {
    band: string;
    count: number;
}

export interface IctCommitteeRiskBandCounts {
    band: string;
    gross_count: number;
    net_count: number;
}

export interface IctCommitteeCro {
    kpi: IctCommitteeCroKpi;
    heatmap: IctCommitteeHeatmap;
    migration_matrix: IctCommitteeMigrationMatrix;
    top_risks: IctCommitteeTopRisk[];
    top_vendors: IctCommitteeTopVendor[];
    narratives: IctCommitteeNarratives;
    assets_by_criticality: IctCommitteeBandCount[];
    risks_by_band: IctCommitteeRiskBandCounts[];
}

export interface IctCommittee {
    dashboard: IctCommitteeDashboard;
    cro: IctCommitteeCro;
}
