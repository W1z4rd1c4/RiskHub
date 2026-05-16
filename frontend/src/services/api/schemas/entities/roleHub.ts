import { passthroughObject, z } from '../common';

export const roleHubCapabilitiesSchema = passthroughObject({
    can_update: z.boolean(),
    can_delete: z.boolean(),
    can_restore: z.boolean(),
});
