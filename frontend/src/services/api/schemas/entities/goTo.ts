import { z } from 'zod';

import type { GoToRecord } from '@/types/goTo';

const goToDestinationSchema = z.string().regex(
    /^\/(?:risks|controls|kris|issues|vendors|processes|assets|threats)\/\d+$/,
);

export const goToRecordSchema: z.ZodType<GoToRecord> = z.object({
    entity_type: z.enum([
        'risk',
        'control',
        'kri',
        'issue',
        'vendor',
        'process',
        'asset',
        'threat',
    ]),
    business_identifier: z.string().min(1).nullable(),
    display_name: z.string().min(1),
    status: z.string().min(1),
    destination: goToDestinationSchema,
});

export const goToRecordListSchema = z.array(goToRecordSchema).max(20);
