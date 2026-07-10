import type {
    IctCommittee,
    IctCommitteeBandCount,
    IctCommitteeCro,
    IctCommitteeCroKpi,
    IctCommitteeDashboard,
    IctCommitteeHeatmap,
    IctCommitteeHeatmapRow,
    IctCommitteeKeyMetrics,
    IctCommitteeMigrationMatrix,
    IctCommitteeMigrationRow,
    IctCommitteeNarratives,
    IctCommitteeRegisterState,
    IctCommitteeRiskBandCounts,
    IctCommitteeTopRisk,
    IctCommitteeTopVendor,
    IctRoiGapRow,
    IctRoiMissingField,
    IctRoiReadiness,
    IctRoiTemplateReadiness,
} from '@/types/ictRegisterCommittee';

import { passthroughObject, z } from '../common';

// ICT Risk Committee read model (issue #51): both workbook output sheets per
// the tile inventory contract, computed on read.

export const ictCommitteeRegisterStateSchema: z.ZodType<IctCommitteeRegisterState> = passthroughObject({
    process_count: z.number(),
    asset_count: z.number(),
    process_asset_link_count: z.number(),
    vendor_count: z.number(),
    assets_pending_review_count: z.number(),
    direct_process_vendor_link_count: z.number(),
    contracts_in_roi_scope_count: z.number(),
    sub_outsourcing_link_count: z.number(),
    assets_without_data_classification_count: z.number(),
    top_tier_vendors_without_orderly_exit_count: z.number(),
});

export const ictCommitteeKeyMetricsSchema: z.ZodType<IctCommitteeKeyMetrics> = passthroughObject({
    cif_process_count: z.number(),
    processes_without_impact_assessment_count: z.number(),
    critical_asset_count: z.number(),
    critical_vendor_count: z.number(),
    risks_above_tolerance_count: z.number(),
    open_dq_finding_count: z.number(),
});

export const ictCommitteeDashboardSchema: z.ZodType<IctCommitteeDashboard> = passthroughObject({
    register_state: ictCommitteeRegisterStateSchema,
    key_metrics: ictCommitteeKeyMetricsSchema,
});

export const ictCommitteeCroKpiSchema: z.ZodType<IctCommitteeCroKpi> = passthroughObject({
    risk_count: z.number(),
    material_risk_count: z.number(),
    risks_above_tolerance_count: z.number(),
    accepted_above_tolerance_count: z.number(),
    cif_without_bcm_count: z.number(),
    open_dq_finding_count: z.number(),
    material_risk_count_production_inert: z.boolean().optional(),
    material_risk_count_production_inert_reason: z.string().nullable().optional(),
});

export const ictCommitteeHeatmapRowSchema: z.ZodType<IctCommitteeHeatmapRow> = passthroughObject({
    probability: z.number(),
    cells: z.array(z.number()),
});

export const ictCommitteeHeatmapSchema: z.ZodType<IctCommitteeHeatmap> = passthroughObject({
    rows: z.array(ictCommitteeHeatmapRowSchema),
});

export const ictCommitteeMigrationRowSchema: z.ZodType<IctCommitteeMigrationRow> = passthroughObject({
    gross_band: z.string(),
    cells: z.array(z.number()),
});

export const ictCommitteeMigrationMatrixSchema: z.ZodType<IctCommitteeMigrationMatrix> = passthroughObject({
    rows: z.array(ictCommitteeMigrationRowSchema),
});

export const ictCommitteeTopRiskSchema: z.ZodType<IctCommitteeTopRisk> = passthroughObject({
    rank: z.number(),
    risk_id: z.number(),
    code: z.string().nullable(),
    subject_label: z.string().nullable(),
    threat_label: z.string().nullable(),
    gross_score: z.number().nullable(),
    net_score: z.number().nullable(),
    net_band: z.string().nullable(),
    vs_tolerance: z.string().nullable(),
    status_label: z.string().nullable(),
});

export const ictCommitteeTopVendorSchema: z.ZodType<IctCommitteeTopVendor> = passthroughObject({
    rank: z.number(),
    vendor_id: z.number(),
    name: z.string(),
    cif_process_count: z.number(),
    tier: z.string(),
});

export const ictCommitteeNarrativesSchema: z.ZodType<IctCommitteeNarratives> = passthroughObject({
    cif_process_count: z.number(),
    process_count: z.number(),
    cif_with_bcm_count: z.number(),
    critical_vendor_count: z.number(),
    critical_vendors_with_functional_exit_count: z.number(),
    critical_vendors_with_identifier_count: z.number(),
    tolerance: z.number(),
    risks_above_tolerance_count: z.number(),
    accepted_above_tolerance_count: z.number(),
    sub_outsourcing_link_count: z.number(),
    vendors_in_sub_role_count: z.number(),
});

export const ictCommitteeBandCountSchema: z.ZodType<IctCommitteeBandCount> = passthroughObject({
    band: z.string(),
    count: z.number(),
});

export const ictCommitteeRiskBandCountsSchema: z.ZodType<IctCommitteeRiskBandCounts> = passthroughObject({
    band: z.string(),
    gross_count: z.number(),
    net_count: z.number(),
});

export const ictCommitteeCroSchema: z.ZodType<IctCommitteeCro> = passthroughObject({
    kpi: ictCommitteeCroKpiSchema,
    heatmap: ictCommitteeHeatmapSchema,
    migration_matrix: ictCommitteeMigrationMatrixSchema,
    top_risks: z.array(ictCommitteeTopRiskSchema),
    top_vendors: z.array(ictCommitteeTopVendorSchema),
    narratives: ictCommitteeNarrativesSchema,
    assets_by_criticality: z.array(ictCommitteeBandCountSchema),
    risks_by_band: z.array(ictCommitteeRiskBandCountsSchema),
});

// RoI-readiness element (issue #52): 15 templates, post-corrigendum codes.

export const ictRoiMissingFieldSchema: z.ZodType<IctRoiMissingField> = passthroughObject({
    key: z.string(),
    code: z.string().nullable(),
});

export const ictRoiGapRowSchema: z.ZodType<IctRoiGapRow> = passthroughObject({
    entity_type: z.string(),
    entity_id: z.number(),
    label: z.string(),
    route_entity_type: z.string(),
    route_entity_id: z.number(),
    missing: z.array(ictRoiMissingFieldSchema),
});

export const ictRoiTemplateReadinessSchema: z.ZodType<IctRoiTemplateReadiness> = passthroughObject({
    code: z.string(),
    name_en: z.string(),
    name_cs: z.string(),
    feed: z.string(),
    gate: z.string(),
    coverage: z.string(),
    row_count: z.number(),
    required_field_count: z.number(),
    populated_field_count: z.number(),
    readiness_pct: z.number().nullable(),
    gap_row_count: z.number(),
    gap_rows: z.array(ictRoiGapRowSchema),
});

export const ictRoiReadinessSchema: z.ZodType<IctRoiReadiness> = passthroughObject({
    templates: z.array(ictRoiTemplateReadinessSchema),
    overall_readiness_pct: z.number().nullable(),
    total_gap_row_count: z.number(),
});

export const ictCommitteeSchema: z.ZodType<IctCommittee> = passthroughObject({
    dashboard: ictCommitteeDashboardSchema,
    cro: ictCommitteeCroSchema,
    roi_readiness: ictRoiReadinessSchema,
});
