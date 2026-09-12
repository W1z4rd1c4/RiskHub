import { z } from 'zod';
import { nativeIdentityGet, nativeIdentityPost } from '@/services/nativeAuthApi';
import { accessUserReadSchema } from '@/services/api/schemas';
import { acceptedSchema, completedSchema } from '@/services/api/schemas/nativeAuth';
import type { AssistedRecoveryRequest, InvitationRequest, InvitationResponse, LocalIdentityStatusResponse, ReasonRequest } from '@/types/localAuth.generated';

const invitationSchema: z.ZodType<InvitationResponse> = z.object({
    user_id: z.number().int().positive(), enrollment_state: z.literal('invited'),
    delivery_status: z.enum(['pending', 'sent', 'failed']),
});
const statusSchema: z.ZodType<LocalIdentityStatusResponse> = z.object({
    user_id: z.number().int().positive(), authority_version: z.number().int().nonnegative(),
    enrollment_state: z.enum(['invited', 'password_set', 'enrolled']).nullable(),
    local_suspended: z.boolean(), recovery_pending: z.boolean(), is_active: z.boolean(),
    delivery_status: z.enum(['pending', 'sent', 'failed', 'expired', 'cancelled']).nullable(),
});
interface Options { token: string; signal?: AbortSignal }
export const nativeAdminApi = {
    setActive: (id: number, active: boolean, reason: string, options: Options) => nativeIdentityPost(`/access/users/${id}`, { is_active: active, reason }, accessUserReadSchema, options, 200, 'PATCH'),
    invite: (body: InvitationRequest, options: Options) => nativeIdentityPost('/users/invitations', body, invitationSchema, options, 202),
    status: (id: number, options: Options) => nativeIdentityGet(`/users/${id}/local-auth/status`, statusSchema.refine((value) => value.user_id === id), options),
    resend: (id: number, body: ReasonRequest, options: Options) => nativeIdentityPost(`/users/${id}/invitations/resend`, body, invitationSchema, options, 202),
    cancel: (id: number, body: ReasonRequest, options: Options) => nativeIdentityPost(`/users/${id}/invitations/cancel`, body, completedSchema, options),
    reset: (id: number, body: ReasonRequest, options: Options) => nativeIdentityPost(`/users/${id}/password-reset`, body, acceptedSchema, options, 202),
    recover: (id: number, body: AssistedRecoveryRequest, options: Options) => nativeIdentityPost(`/users/${id}/recovery`, body, acceptedSchema, options, 202),
};
