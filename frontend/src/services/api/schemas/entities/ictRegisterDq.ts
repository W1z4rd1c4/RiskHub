import type { IctDqCheck, IctDqViolatingRow, IctRegisterDq } from '@/types/ictRegisterDq';

import { passthroughObject, z } from '../common';

// ICT Register data-quality read model (issue #50): the workbook's 52 checks
// with threshold 0, OK/NÁLEZ status, and violating-row drill-downs.
export const ictDqViolatingRowSchema: z.ZodType<IctDqViolatingRow> = passthroughObject({
    entity_type: z.string(),
    entity_id: z.number(),
    label: z.string(),
    route_entity_type: z.string(),
    route_entity_id: z.number(),
});

export const ictDqCheckSchema: z.ZodType<IctDqCheck> = passthroughObject({
    check_id: z.string(),
    area: z.string(),
    title_cs: z.string(),
    severity: z.string(),
    threshold: z.number(),
    count: z.number(),
    status: z.string(),
    production_inert: z.boolean().optional(),
    production_inert_reason: z.string().nullable().optional(),
    violating_rows: z.array(ictDqViolatingRowSchema),
});

export const ictRegisterDqSchema: z.ZodType<IctRegisterDq> = passthroughObject({
    checks: z.array(ictDqCheckSchema),
    finding_count: z.number(),
});
