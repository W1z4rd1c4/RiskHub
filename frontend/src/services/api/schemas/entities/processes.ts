import type { Process, ProcessListResponse } from '@/types/process';

import { collectionPaginationSchema, passthroughObject, z } from '../common';

export const processCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_update: z.boolean(),
    can_archive: z.boolean(),
    can_restore: z.boolean(),
});

export const processListCapabilitiesSchema = passthroughObject({
    can_create: z.boolean().optional(),
});

export const processSchema: z.ZodType<Process> = passthroughObject({
    id: z.number(),
    f_code: z.string(),

    l0_area: z.string(),
    l1_process: z.string(),
    l2_subprocess: z.string().nullable().optional(),

    owner: z.string().nullable().optional(),
    owner_department: z.string().nullable().optional(),

    impact_client: z.number().nullable().optional(),
    impact_market_operations: z.number().nullable().optional(),
    impact_regulatory: z.number().nullable().optional(),
    impact_financial: z.number().nullable().optional(),
    impact_reputational: z.number().nullable().optional(),
    mtpd_hours: z.number().nullable().optional(),

    preliminary_criticality: z.string().nullable().optional(),
    cif_override: z.string().nullable().optional(),

    licensed_activity: z.string().nullable().optional(),

    rto_hours: z.number().nullable().optional(),
    rpo_hours: z.number().nullable().optional(),
    bcm_link: z.string().nullable().optional(),
    last_dr_test_date: z.string().nullable().optional(),
    dr_test_result: z.string().nullable().optional(),

    interruption_impact: z.string().nullable().optional(),
    assessment_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),

    is_archived: z.boolean(),
    archived_at: z.string().nullable().optional(),
    archived_by_id: z.number().nullable().optional(),
    capabilities: processCapabilitiesSchema.nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const processListResponseSchema: z.ZodType<ProcessListResponse> =
    collectionPaginationSchema(processSchema).extend({
        capabilities: processListCapabilitiesSchema.nullable().optional(),
    });

export const ictClosedListSchema = passthroughObject({
    name: z.string(),
    values: z.array(z.union([z.string(), z.number()])),
});

export const ictClosedListCollectionSchema = passthroughObject({
    lists: z.array(ictClosedListSchema),
});
