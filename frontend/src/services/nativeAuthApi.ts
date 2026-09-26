import type { z } from 'zod';
import { authApi, type LoginRequest } from '@/services/authApi';
import { AuthRequestError, fetchAuthResponse } from '@/services/authRequest';
import { getCsrfToken } from '@/services/csrfToken';
import { tokenResponseSchema } from '@/services/api/schemas/auth';
import {
    acceptedSchema, accountSecuritySchema, actionProofSchema, completedSchema, enrollmentSchema,
    factorEnrollmentSchema, factorSetupSchema, localAuthChallengeSchema,
} from '@/services/api/schemas/nativeAuth';
import type {
    ChallengeRequest, EmailChangeCompleteRequest, EmailChangeRequest, EnrollmentStartRequest,
    FactorReplacementRequest, FactorVerifyRequest, PasswordChangeRequest, RecentAuthenticationRequest,
    RecoveryStartRequest, ResetCompleteRequest, ResetRequest,
} from '@/types/localAuth.generated';

export type NativeErrorKind = 'invalid' | 'limited' | 'unavailable' | 'uncertain' | 'forbidden';
export class NativeAuthError extends Error {
    readonly kind: NativeErrorKind;
    constructor(kind: NativeErrorKind) {
        super(kind);
        this.kind = kind;
        this.name = 'NativeAuthError';
    }
}

// Do not retain server bodies, validation inputs or network exceptions in errors.
// Mutations deliberately have no automatic retry: a lost response can follow a commit.
function sanitizedError(error: unknown): NativeAuthError {
    if (error instanceof NativeAuthError) return error;
    if (error instanceof AuthRequestError && error.status) {
        if (error.status === 429) return new NativeAuthError('limited');
        if (error.status >= 500) return new NativeAuthError('unavailable');
        if (error.status === 403) return new NativeAuthError('forbidden');
        return new NativeAuthError('invalid');
    }
    return new NativeAuthError('uncertain');
}

interface RequestOptions { token?: string; signal?: AbortSignal }
async function post<S extends z.ZodType>(
    path: string, body: unknown, schema: S, options: RequestOptions = {}, expectedStatus = 200,
): Promise<z.output<S>> {
    try {
        if (!getCsrfToken()) await authApi.ensureCsrf();
        if (options.signal?.aborted) throw new NativeAuthError('uncertain');
        const headers = new Headers({ 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() ?? '' });
        if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
        const response = await fetchAuthResponse(`/api/v1/auth/local${path}`, {
            method: 'POST', headers, body: JSON.stringify(body), credentials: 'include',
            cache: 'no-store', signal: options.signal,
        });
        if (!response.ok) throw new AuthRequestError({ code: 'AUTH_REQUEST_FAILED', message: 'Native request failed', status: response.status });
        if (response.status !== expectedStatus) throw new NativeAuthError('uncertain');
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) throw new NativeAuthError('uncertain');
        return parsed.data;
    } catch (error) {
        throw sanitizedError(error);
    }
}

export const nativeAuthApi = {
    async account(token: string, signal?: AbortSignal) {
        try {
            const response = await fetchAuthResponse('/api/v1/auth/local/account', {
                headers: { Authorization: `Bearer ${token}` }, credentials: 'include', cache: 'no-store', signal,
            });
            if (!response.ok) throw new AuthRequestError({ code: 'AUTH_REQUEST_FAILED', message: 'Account unavailable', status: response.status });
            return accountSecuritySchema.parse(await response.json());
        } catch (error) { throw sanitizedError(error); }
    },
    async login(body: LoginRequest, signal?: AbortSignal) {
        try { return await authApi.login(body, signal); } catch (error) { throw sanitizedError(error); }
    },
    verify: (body: FactorVerifyRequest, options?: RequestOptions) => post('/mfa/verify', body, tokenResponseSchema, options),
    enrollment: (body: EnrollmentStartRequest, options?: RequestOptions) => post('/enrollment/start', body, enrollmentSchema, options, 202),
    setup: (body: ChallengeRequest, options?: RequestOptions) => post('/mfa/setup', body, factorSetupSchema, options),
    confirmEnrollment: (body: FactorVerifyRequest, options?: RequestOptions) => post('/mfa/confirm', body, factorEnrollmentSchema, options),
    resetRequest: (body: ResetRequest, options?: RequestOptions) => post('/password/reset/request', body, acceptedSchema, options, 202),
    resetComplete: (body: ResetCompleteRequest, options?: RequestOptions) => post('/password/reset/complete', body, completedSchema, options),
    recentAuth: (body: RecentAuthenticationRequest, options?: RequestOptions) => post('/recent-auth', body, actionProofSchema, options),
    changePassword: (body: PasswordChangeRequest, options?: RequestOptions) => post('/password/change', body, completedSchema, options),
    changeEmail: (body: EmailChangeRequest, options?: RequestOptions) => post('/email/change', body, acceptedSchema, options, 202),
    confirmEmail: (body: EmailChangeCompleteRequest, options?: RequestOptions) => post('/email/confirm', body, completedSchema, options),
    enrollFactor: (body: FactorReplacementRequest, options?: RequestOptions) => post('/mfa/enroll', body, localAuthChallengeSchema, options, 202),
    replaceFactor: (body: FactorReplacementRequest, options?: RequestOptions) => post('/factor/replace', body, factorSetupSchema, options),
    confirmReplacement: (body: FactorVerifyRequest, options?: RequestOptions) => post('/factor/confirm', body, factorEnrollmentSchema, options),
    regenerateCodes: (body: FactorReplacementRequest, options?: RequestOptions) => post('/recovery-codes/regenerate', body, factorEnrollmentSchema, options),
    recoveryStart: (body: RecoveryStartRequest, options?: RequestOptions) => post('/recovery/start', body, factorSetupSchema, options),
    recoveryConfirm: (body: FactorVerifyRequest, options?: RequestOptions) => post('/recovery/confirm', body, factorEnrollmentSchema, options),
};
