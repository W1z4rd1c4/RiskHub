import type { Risk, RiskControlLink, RiskListResponse, RiskSummary } from '@/types/risk';

import { collectionPaginationSchema, idNameCodeSchema, idNameEmailSchema, passthroughObject, z } from '../common';
import { controlMonitoringFieldsSchema } from './controls';
import { keyRiskIndicatorArraySchema } from './kris';
import { linkedVendorSummaryArraySchema } from './vendors';

export const riskSummarySchema: z.ZodType<RiskSummary> = passthroughObject({
    id: z.number(),
    risk_id_code: z.string(),
    name: z.string(),
    process: z.string(),
    subprocess: z.string().nullable().optional(),
    risk_type: z.string(),
    category: z.string().nullable().optional(),
    description: z.string(),
    gross_score: z.number(),
    gross_probability: z.number(),
    gross_impact: z.number(),
    net_score: z.number(),
    status: z.enum(['active', 'emerging', 'archived']),
    is_priority: z.boolean(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    owner_id: z.number().nullable().optional(),
    owner_name: z.string().nullable().optional(),
    kri_count: z.number().optional(),
    has_breach: z.boolean().optional(),
    control_count: z.number().optional(),
    linked_vendors: linkedVendorSummaryArraySchema.optional(),
});
export const riskListResponseSchema: z.ZodType<RiskListResponse> =
    collectionPaginationSchema(riskSummarySchema);

export const riskSchema: z.ZodType<Risk> = passthroughObject({
    id: z.number(),
    risk_id_code: z.string(),
    name: z.string(),
    process: z.string(),
    subprocess: z.string().nullable().optional(),
    risk_type: z.string(),
    category: z.string().nullable().optional(),
    description: z.string(),
    department_id: z.number().nullable().optional(),
    owner_id: z.number().nullable().optional(),
    gross_probability: z.number(),
    gross_impact: z.number(),
    gross_score: z.number(),
    net_probability: z.number(),
    net_impact: z.number(),
    net_score: z.number(),
    status: z.enum(['active', 'emerging', 'archived']),
    is_priority: z.boolean(),
    kri_indicator: z.string().optional(),
    kri_threshold_green: z.string().optional(),
    kri_threshold_yellow: z.string().optional(),
    kri_threshold_red: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    kris: keyRiskIndicatorArraySchema.optional(),
    owner: idNameEmailSchema.nullable().optional(),
    department: idNameCodeSchema.nullable().optional(),
});

export const riskControlLinkSchema: z.ZodType<RiskControlLink> = passthroughObject({
    id: z.number(),
    control_id: z.number(),
    risk_id: z.number(),
    effectiveness: z.enum(['high', 'medium', 'low']),
    notes: z.string().nullable().optional(),
    created_at: z.string(),
    control: controlMonitoringFieldsSchema
        .extend({
            id: z.number(),
            name: z.string(),
            frequency: z.string(),
            risk_level: z.number(),
            status: z.string(),
        })
        .optional(),
    risk: passthroughObject({
        id: z.number(),
        risk_id_code: z.string(),
        process: z.string(),
        gross_score: z.number(),
        net_score: z.number(),
    }).optional(),
});
export const riskControlLinkArraySchema = z.array(riskControlLinkSchema);
