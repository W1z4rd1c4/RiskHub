import type {
    ControlExecution,
    ExecutionActor,
    ExecutionAuditItem,
    ExecutionControlRef,
    ExecutionListCapabilities,
    ExecutionListResponse,
} from '@/types/execution';

import {
    offsetPaginationSchema,
    passthroughObject,
    z,
} from '../common';

export const executionActorSchema: z.ZodType<ExecutionActor> = passthroughObject({
    id: z.number(),
    name: z.string(),
    email: z.string().optional(),
});
export const executionControlRefSchema: z.ZodType<ExecutionControlRef> = passthroughObject({
    id: z.number(),
    name: z.string(),
});
export const controlExecutionSchema = passthroughObject({
    id: z.number(),
    control_id: z.number(),
    executed_by_id: z.number(),
    executed_at: z.string(),
    result: z.enum(['passed', 'failed', 'warning', 'not_applicable']),
    findings: z.string().nullable().optional(),
    evidence_reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    next_scheduled: z.string().nullable().optional(),
    created_at: z.string(),
    executed_by: executionActorSchema.nullable().optional(),
}) satisfies z.ZodType<ControlExecution>;
export const controlExecutionArraySchema = z.array(controlExecutionSchema);
export const executionAuditItemSchema: z.ZodType<ExecutionAuditItem> = controlExecutionSchema.extend({
    control: executionControlRefSchema.optional(),
    control_name: z.string().optional(),
    executed_by_name: z.string().optional(),
    control_owner_name: z.string().optional(),
    linked_risks: z.array(z.string()).optional(),
});
export const executionListCapabilitiesSchema: z.ZodType<ExecutionListCapabilities> = passthroughObject({
    can_export_csv: z.boolean().optional(),
});
export const executionListResponseSchema: z.ZodType<ExecutionListResponse> =
    offsetPaginationSchema(executionAuditItemSchema).extend({
        capabilities: executionListCapabilitiesSchema.nullable().optional(),
    });
