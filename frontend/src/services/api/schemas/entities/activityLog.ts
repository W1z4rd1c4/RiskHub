import { passthroughObject, z } from '../common';

export const activityLogCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_filter_by_department: z.boolean(),
    can_view_entity_filters: z.boolean(),
    can_export_csv: z.boolean(),
});
