import { z } from 'zod';

export { z };

export function passthroughObject<T extends z.ZodRawShape>(shape: T) {
    return z.object(shape).passthrough();
}

export const stringArraySchema = z.array(z.string());
export const numberArraySchema = z.array(z.number());
export const unknownRecordSchema = z.record(z.string(), z.unknown());
export const numberRecordSchema = z.record(z.string(), z.number());
export const stringRecordSchema = z.record(z.string(), z.string());
export const voidSchema = z.void();

export const oldNewValueSchema = passthroughObject({
    old: z.unknown(),
    new: z.unknown(),
});
export const changeMapSchema = z.record(z.string(), oldNewValueSchema);

export const countSchema = passthroughObject({
    count: z.number(),
});
export const unreadCountSchema = passthroughObject({
    unread_count: z.number(),
});
export const statusIdSchema = passthroughObject({
    status: z.string(),
    id: z.number(),
});
export const statusMessageSchema = passthroughObject({
    status: z.string(),
    message: z.string(),
});
export const linkStatusSchema = passthroughObject({
    status: z.literal('linked'),
});
export const statusIdAffectedRisksSchema = passthroughObject({
    status: z.string(),
    id: z.number(),
    affected_risks: z.number(),
});
export const approvalIdMessageSchema = passthroughObject({
    message: z.string(),
    approval_id: z.number(),
});

export const idNameSchema = passthroughObject({
    id: z.number(),
    name: z.string(),
});
export const idNameEmailSchema = passthroughObject({
    id: z.number(),
    name: z.string(),
    email: z.string(),
});
export const idNameCodeSchema = passthroughObject({
    id: z.number(),
    name: z.string(),
    code: z.string(),
});

export const collectionGroupSchema = passthroughObject({
    value: z.string(),
    label: z.string(),
    count: z.number(),
    active_count: z.number().nullable().optional(),
    highlighted_count: z.number().nullable().optional(),
    meta: unknownRecordSchema.optional(),
});

export function collectionPaginationSchema<T extends z.ZodTypeAny>(itemSchema: T) {
    return passthroughObject({
        items: z.array(itemSchema),
        total: z.number(),
        offset: z.number(),
        limit: z.number(),
        groups: z.array(collectionGroupSchema).nullable().optional(),
    });
}

export function offsetPaginationSchema<T extends z.ZodTypeAny>(itemSchema: T) {
    return passthroughObject({
        items: z.array(itemSchema),
        total: z.number(),
        skip: z.number(),
        limit: z.number(),
    });
}

export function pageSizePaginationSchema<T extends z.ZodTypeAny>(itemSchema: T) {
    return passthroughObject({
        items: z.array(itemSchema),
        total: z.number(),
        page: z.number(),
        size: z.number(),
    });
}
