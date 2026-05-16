import { passthroughObject, z } from '../common';

export const approvalScenarioCapabilitiesSchema = passthroughObject({
    can_update: z.boolean(),
});
