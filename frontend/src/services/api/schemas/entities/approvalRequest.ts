import { passthroughObject, z } from '../common';

export const approvalRequestCapabilitiesSchema = passthroughObject({
    can_read: z.boolean(),
    can_approve: z.boolean(),
    can_reject: z.boolean(),
    can_cancel: z.boolean(),
    can_cancel_as_requester: z.boolean(),
    can_cancel_as_resolver: z.boolean(),
    can_view_pending_changes: z.boolean(),
    can_view_resolution_notes: z.boolean(),
    can_inspect_side_effects: z.boolean(),
    is_requester: z.boolean(),
    is_primary_approver: z.boolean(),
    is_privileged_resolver: z.boolean(),
    is_pending: z.boolean(),
    requires_privileged_resolution: z.boolean(),
    would_apply_side_effects_on_approve: z.boolean(),
});
