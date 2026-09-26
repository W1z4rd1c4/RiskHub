import { z } from 'zod';
import type {
    LocalAuthChallenge, FactorSetupResponse, FactorEnrollmentResponse,
    ActionProofResponse, CompletedResponse, LocalAccountSecurityResponse,
} from '@/types/localAuth.generated';

export const localAuthChallengeSchema: z.ZodType<LocalAuthChallenge> = z.object({
    status: z.enum(['mfa_required', 'enrollment_required']),
    challenge: z.string().min(1),
    expires_in: z.literal(300).optional(),
});
export const accountSecuritySchema: z.ZodType<LocalAccountSecurityResponse> = z.object({
    mfa_enabled: z.boolean(),
    factor_required: z.boolean(),
    mfa_policy: z.enum(['required', 'optional']),
});
export const factorSetupSchema: z.ZodType<FactorSetupResponse> = z.object({
    challenge: z.string().min(1),
    provisioning_uri: z.string().startsWith('otpauth://totp/').refine((value) => {
        try { return /^[A-Z2-7]+$/.test(new URL(value).searchParams.get('secret') ?? ''); } catch { return false; }
    }),
    expires_in: z.literal(300).optional(),
});
export const factorEnrollmentSchema: z.ZodType<FactorEnrollmentResponse> = z.object({
    status: z.literal('enrolled').optional(),
    recovery_codes: z.array(z.string().min(1)).min(1),
    notification_status: z.enum(['pending', 'failed']).nullable().optional(),
});
export const completedSchema: z.ZodType<CompletedResponse> = z.object({
    status: z.literal('completed').default('completed'),
    reauthentication_required: z.boolean().optional(),
});
export const actionProofSchema: z.ZodType<ActionProofResponse> = z.object({
    proof: z.string().min(1),
    expires_in: z.literal(300).optional(),
});
export const acceptedSchema = z.object({ status: z.literal('accepted').default('accepted') });
export const enrollmentSchema = z.union([localAuthChallengeSchema, completedSchema]);
