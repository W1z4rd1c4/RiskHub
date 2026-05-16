import type { DashboardOverview, DashboardSummary, DepartmentMetrics, IssueAgingResponse, IssueDashboardSummary, IssueSeverityBreakdownResponse, KRIBreachTrendPoint, RiskDistribution, RiskTrendPoint, ControlTrend } from '@/types/dashboard';
import type {
    ControlStats,
    DepartmentDetail,
    DepartmentSummary,
    RecentExecution,
} from '@/services/departmentApi';
import type {
    DashboardCommitteeSummary,
    DashboardMetricChange,
    DashboardQuarterlyComparison,
    DashboardRiskByCellItem,
} from '@/services/dashboardApi';

import {
    numberRecordSchema,
    passthroughObject,
    z,
} from '../common';

export const departmentSummarySchema: z.ZodType<DepartmentSummary> = passthroughObject({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    user_count: z.number(),
    risk_count: z.number(),
    high_risk_count: z.number(),
    control_count: z.number(),
    kri_count: z.number(),
    breaching_kri_count: z.number(),
    total_net_score: z.number(),
});
export const departmentSummaryArraySchema = z.array(departmentSummarySchema);
const riskDistributionBucketSchema: z.ZodType<RiskDistribution> = passthroughObject({
    distribution: z.array(
        passthroughObject({
            probability: z.number(),
            impact: z.number(),
            count: z.number(),
        }),
    ),
});
const controlStatsSchema: z.ZodType<ControlStats> = passthroughObject({
    total: z.number(),
    active: z.number(),
    inactive: z.number(),
    by_form: numberRecordSchema,
    by_frequency: numberRecordSchema,
});
const recentExecutionSchema: z.ZodType<RecentExecution> = passthroughObject({
    id: z.number(),
    control_id: z.number(),
    control_name: z.string(),
    result: z.string(),
    executed_at: z.string(),
    executed_by: z.string(),
});
export const departmentDetailSchema: z.ZodType<DepartmentDetail> = passthroughObject({
    id: z.number(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    user_count: z.number(),
    risk_count: z.number(),
    high_risk_count: z.number(),
    control_count: z.number(),
    kri_count: z.number(),
    kri_monitoring_counts: numberRecordSchema,
    risk_distribution: passthroughObject({
        low: z.number(),
        medium: z.number(),
        high: z.number(),
        critical: z.number(),
    }),
    risk_by_status: numberRecordSchema,
    control_stats: controlStatsSchema,
    recent_executions: z.array(recentExecutionSchema),
});

export const dashboardSummarySchema: z.ZodType<DashboardSummary> = passthroughObject({
    total_controls: z.number(),
    controls_by_status: numberRecordSchema,
    controls_by_form: numberRecordSchema,
    controls_by_frequency: numberRecordSchema,
    total_risks: z.number(),
    risks_by_status: numberRecordSchema,
    critical_risks_count: z.number(),
    average_net_risk_score: z.number(),
    total_vendors: z.number().optional(),
    high_risk_vendors_count: z.number().optional(),
});
export const departmentMetricsSchema: z.ZodType<DepartmentMetrics> = passthroughObject({
    department_id: z.number(),
    department_name: z.string(),
    control_count: z.number(),
    risk_count: z.number(),
    high_risk_count: z.number(),
    audited_control_count: z.number(),
    breaching_kri_count: z.number(),
    total_kri_count: z.number(),
    compliance_rate: z.number(),
});
export const riskDistributionSchema: z.ZodType<RiskDistribution> = riskDistributionBucketSchema;
export const controlTrendSchema: z.ZodType<ControlTrend> = passthroughObject({
    period: z.string(),
    execution_count: z.number(),
});
export const riskTrendPointSchema: z.ZodType<RiskTrendPoint> = passthroughObject({
    period: z.string(),
    total_new: z.number(),
    critical_new: z.number(),
});
export const kriBreachTrendPointSchema: z.ZodType<KRIBreachTrendPoint> = passthroughObject({
    period: z.string(),
    total_entries: z.number(),
    breached_entries: z.number(),
});
export const issueDashboardSummarySchema: z.ZodType<IssueDashboardSummary> = passthroughObject({
    open_issues: z.number(),
    overdue_issues: z.number(),
    high_severity_open: z.number(),
    median_days_open: z.number(),
});
export const issueAgingResponseSchema: z.ZodType<IssueAgingResponse> = passthroughObject({
    buckets: z.array(
        passthroughObject({
            bucket: z.string(),
            count: z.number(),
        }),
    ),
});
export const issueSeverityBreakdownResponseSchema: z.ZodType<IssueSeverityBreakdownResponse> =
    passthroughObject({
        items: z.array(
            passthroughObject({
                severity: z.string(),
                count: z.number(),
            }),
        ),
    });
export const dashboardOverviewCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_view_issue_metrics: z.boolean(),
    can_view_committee: z.boolean(),
    can_view_vendor_metrics: z.boolean(),
    can_use_department_filter: z.boolean(),
    can_export_or_report: z.boolean(),
});
export const dashboardOverviewSchema: z.ZodType<DashboardOverview> = passthroughObject({
    summary: dashboardSummarySchema,
    department_metrics: z.array(departmentMetricsSchema),
    gross_distribution: riskDistributionSchema,
    net_distribution: riskDistributionSchema,
    control_trends: z.array(controlTrendSchema),
    risk_trends: z.array(riskTrendPointSchema),
    kri_breach_trends: z.array(kriBreachTrendPointSchema),
    issue_summary: issueDashboardSummarySchema.nullable().optional(),
    issue_aging: issueAgingResponseSchema.nullable().optional(),
    issue_severity: issueSeverityBreakdownResponseSchema.nullable().optional(),
    generated_at: z.string(),
    capabilities: dashboardOverviewCapabilitiesSchema.nullable().optional(),
});

export const dashboardRiskByCellItemSchema: z.ZodType<DashboardRiskByCellItem> = passthroughObject({
    id: z.number(),
    risk_id_code: z.string(),
    name: z.string(),
    description: z.string(),
    net_score: z.number(),
    department_name: z.string(),
    owner_name: z.string().optional(),
});
export const dashboardRiskByCellItemArraySchema = z.array(dashboardRiskByCellItemSchema);

const dashboardMetricChangeSchema: z.ZodType<DashboardMetricChange> = passthroughObject({
    absolute: z.number(),
    percentage: z.number(),
    direction: z.enum(['up', 'down', 'same', 'unknown']),
    note: z.string().optional(),
});
export const dashboardQuarterlyComparisonSchema: z.ZodType<DashboardQuarterlyComparison> =
    passthroughObject({
        this_quarter: numberRecordSchema,
        last_quarter: numberRecordSchema,
        changes: z.record(z.string(), dashboardMetricChangeSchema),
        period: passthroughObject({
            this_start: z.string(),
            this_end: z.string(),
            last_start: z.string(),
            last_end: z.string(),
        }),
        snapshot_info: passthroughObject({
            current_quarter: z.string(),
            last_quarter: z.string(),
            last_quarter_snapshot_available: z.boolean(),
            current_quarter_snapshot_available: z.boolean().optional(),
            missing_snapshot_quarters: z.array(z.string()).optional(),
            snapshot_sources: passthroughObject({
                current: z.enum(['live', 'stored', 'missing']),
                compare: z.enum(['stored', 'missing']),
            }).optional(),
            missing_snapshot_metrics: passthroughObject({
                current: z.array(z.string()),
                compare: z.array(z.string()),
            }).optional(),
            period_metrics: z.array(z.string()),
            snapshot_metrics: z.array(z.string()),
        }).optional(),
    });

export const dashboardCommitteeSummarySchema: z.ZodType<DashboardCommitteeSummary> =
    passthroughObject({
        critical_risks: z.array(
            passthroughObject({
                id: z.number(),
                risk_id_code: z.string(),
                name: z.string(),
                process: z.string(),
                description: z.string(),
                net_score: z.number(),
                is_priority: z.boolean(),
                owner_name: z.string(),
                department_name: z.string(),
            }),
        ),
        recent_activity: z.array(
            passthroughObject({
                id: z.number(),
                action: z.string(),
                entity_type: z.string(),
                entity_name: z.string(),
                description: z.string(),
                created_at: z.string(),
            }),
        ),
        department_exposure: z.array(
            passthroughObject({
                id: z.number(),
                name: z.string(),
                total_exposure: z.number(),
                risk_count: z.number(),
            }),
        ),
        critical_vendors: z.array(
            passthroughObject({
                id: z.number(),
                name: z.string(),
                process: z.string(),
                subprocess: z.string().nullable().optional(),
                risk_score_1_5: z.number(),
                supports_important_core_insurance_function: z.boolean(),
                dora_relevant: z.boolean(),
                is_significant_vendor: z.boolean(),
                outsourcing_owner_name: z.string(),
                department_name: z.string(),
            }),
        ).optional().default([]),
    });
