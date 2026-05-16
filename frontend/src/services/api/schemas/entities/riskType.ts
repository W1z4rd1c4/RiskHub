import { passthroughObject, z } from '../common';

export const riskTypeCapabilitiesSchema = passthroughObject({
    can_create: z.boolean(),
    can_update: z.boolean(),
    can_delete: z.boolean(),
    can_restore: z.boolean(),
});
