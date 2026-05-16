import { passthroughObject, z } from '../common';

export const departmentHubCapabilitiesSchema = passthroughObject({
    can_update: z.boolean(),
    can_delete: z.boolean(),
    can_restore: z.boolean(),
});
