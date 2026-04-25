import type {
    DueSoonKRI,
    KeyRiskIndicator,
    KRIHistoryEntry,
    KRIHistoryListResponse,
    KRIListResponse,
    KRIMonitoringFields,
    OverdueKRI,
} from '@/types/kri';
import type { LinkedKRI } from '@/types/vendorLink';

import { collectionPaginationSchema, passthroughObject, z } from '../common';
import { linkedVendorSummaryArraySchema } from './vendors';

export const kriMonitoringFieldsSchema = passthroughObject({
    monitoring_status: z.enum(['new', 'not_submitted', 'breach', 'warning', 'optimal']).optional(),
    monitoring_status_reason: z
        .enum([
            'no_submission_history_within_window',
            'required_period_missing_submission',
            'latest_measurement_breach',
            'latest_measurement_warning_upper_margin',
            'latest_measurement_optimal',
        ])
        .optional(),
    is_submitted_for_required_period: z.boolean().optional(),
    required_period_end: z.string().optional(),
    required_due_date: z.string().optional(),
    days_overdue: z.number().optional(),
    warning_upper_margin_ratio: z.number().optional(),
}) satisfies z.ZodType<KRIMonitoringFields>;

export const linkedKRISchema: z.ZodType<LinkedKRI> = kriMonitoringFieldsSchema.extend({
    id: z.number(),
    risk_id: z.number(),
    metric_name: z.string(),
    description: z.string(),
    current_value: z.number(),
    lower_limit: z.number(),
    upper_limit: z.number(),
    unit: z.string(),
    frequency: z.string(),
    risk_name: z.string().nullable().optional(),
    risk_process: z.string().nullable().optional(),
    risk_department_name: z.string().nullable().optional(),
    is_archived: z.boolean().optional(),
});
export const linkedKRIArraySchema = z.array(linkedKRISchema);

export const keyRiskIndicatorSchema: z.ZodType<KeyRiskIndicator> = kriMonitoringFieldsSchema.extend({
    id: z.number(),
    risk_id: z.number(),
    is_archived: z.boolean().optional(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    metric_name: z.string(),
    description: z.string(),
    current_value: z.number(),
    lower_limit: z.number(),
    upper_limit: z.number(),
    unit: z.string(),
    breach_status: z.enum(['above', 'below', 'within']),
    last_updated: z.string(),
    created_at: z.string(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
    reporting_owner_id: z.number().nullable().optional(),
    reporting_owner_name: z.string().nullable().optional(),
    last_period_end: z.string().nullable().optional(),
    last_reported_at: z.string().nullable().optional(),
    risk_category: z.string().nullable().optional(),
    risk_process: z.string().nullable().optional(),
    risk_name: z.string().nullable().optional(),
    risk_description: z.string().nullable().optional(),
    risk_type: z.string().nullable().optional(),
    risk_id_code: z.string().nullable().optional(),
    risk_owner_name: z.string().nullable().optional(),
    risk_department_name: z.string().nullable().optional(),
    department_name: z.string().nullable().optional(),
    linked_vendors: linkedVendorSummaryArraySchema.optional(),
});
export const keyRiskIndicatorArraySchema = z.array(keyRiskIndicatorSchema);
export const kriListResponseSchema: z.ZodType<KRIListResponse> =
    collectionPaginationSchema(keyRiskIndicatorSchema);

export const kriHistoryEntrySchema: z.ZodType<KRIHistoryEntry> = passthroughObject({
    id: z.number(),
    kri_id: z.number(),
    period_start: z.string(),
    period_end: z.string(),
    recorded_at: z.string(),
    value: z.number(),
    lower_limit: z.number(),
    upper_limit: z.number(),
    unit: z.string(),
    breach_status: z.string(),
    recorded_by_id: z.number().nullable().optional(),
    recorded_by_name: z.string().nullable().optional(),
});
const kriHistoryCapabilitiesSchema = passthroughObject({
    can_request_correction: z.boolean(),
});
export const kriHistoryListResponseSchema: z.ZodType<KRIHistoryListResponse> =
    z.union([
        passthroughObject({
            items: z.array(kriHistoryEntrySchema),
            total: z.number(),
            offset: z.number(),
            limit: z.number(),
            capabilities: kriHistoryCapabilitiesSchema.nullable().optional(),
        }),
        passthroughObject({
            items: z.array(kriHistoryEntrySchema),
            total: z.number(),
            page: z.number(),
            size: z.number(),
            capabilities: kriHistoryCapabilitiesSchema.nullable().optional(),
        }),
    ]).transform((response): KRIHistoryListResponse => {
        const pagination = response as {
            offset?: unknown;
            limit?: unknown;
            page?: unknown;
            size?: unknown;
        };
        if (typeof pagination.offset === 'number' && typeof pagination.limit === 'number') {
            return {
                items: response.items,
                total: response.total,
                offset: pagination.offset,
                limit: pagination.limit,
                capabilities: response.capabilities,
            };
        }
        const page = pagination.page as number;
        const size = pagination.size as number;
        return {
            items: response.items,
            total: response.total,
            offset: (page - 1) * size,
            limit: size,
            capabilities: response.capabilities,
        };
    });
export const overdueKRISchema: z.ZodType<OverdueKRI> = passthroughObject({
    kri_id: z.number(),
    metric_name: z.string(),
    frequency: z.string(),
    period_end: z.string(),
    due_date: z.string(),
    days_overdue: z.number(),
    reporting_owner_id: z.number().nullable().optional(),
    reporting_owner_name: z.string().nullable().optional(),
    risk_id: z.number(),
});
export const overdueKRIArraySchema = z.array(overdueKRISchema);
export const dueSoonKRISchema: z.ZodType<DueSoonKRI> = passthroughObject({
    kri_id: z.number(),
    metric_name: z.string(),
    frequency: z.string(),
    period_end: z.string(),
    due_date: z.string(),
    days_until_due: z.number(),
    reporting_owner_id: z.number().nullable().optional(),
    reporting_owner_name: z.string().nullable().optional(),
    risk_id: z.number(),
});
export const dueSoonKRIArraySchema = z.array(dueSoonKRISchema);
