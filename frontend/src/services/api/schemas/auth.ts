import type {
    AuthConfigResponse,
    AuthUser,
    DemoPersona,
    TokenResponse,
} from '@/services/authApi';

import { passthroughObject, stringArraySchema, z } from './common';

export const demoPersonaSchema: z.ZodType<DemoPersona> = passthroughObject({
    section: z.enum(['privileged', 'department_heads', 'employees']),
    name: z.string(),
    email: z.string(),
    role_key: z.string(),
    dept_key: z.string().nullable().optional(),
    color: z.enum([
        'rose',
        'purple',
        'violet',
        'amber',
        'emerald',
        'sky',
        'teal',
        'indigo',
        'pink',
    ]),
});

export const authUserSchema: z.ZodType<AuthUser> = passthroughObject({
    id: z.number(),
    email: z.string(),
    name: z.string(),
    role: z.string(),
    role_display_name: z.string(),
    entra_business_role: z.string().nullable().optional(),
    department_id: z.number().nullable().optional(),
    department_name: z.string().nullable().optional(),
    permissions: stringArraySchema,
    effective_permissions: stringArraySchema,
    access_scope: z.enum(['global', 'department', 'manager']),
    scope_label: z.string(),
});

export const tokenResponseSchema: z.ZodType<TokenResponse> = passthroughObject({
    access_token: z.string(),
    token_type: z.string(),
    post_login_redirect_to: z.string().nullable().optional(),
    user: authUserSchema,
});

export const authConfigResponseSchema: z.ZodType<AuthConfigResponse> = passthroughObject({
    auth_mode: z.enum(['password', 'microsoft_sso', 'hybrid_dev']),
    demo_login_enabled: z.boolean(),
    password_login_enabled: z.boolean(),
    sso: passthroughObject({
        enabled: z.boolean(),
        provider: z.literal('entra'),
        tenant_id: z.string().nullable().optional(),
        client_id: z.string().nullable().optional(),
        authority: z.string().nullable().optional(),
        scopes: stringArraySchema,
    }),
    sso_error: z.string().nullable().optional(),
    demo_personas: z.array(demoPersonaSchema).optional(),
});

export const ssoStartResponseSchema = passthroughObject({
    nonce: z.string(),
    state: z.string(),
    expires_in: z.number(),
});

export const logoutSuccessSchema = passthroughObject({
    message: z.string(),
    revoked_sessions: z.number().optional(),
});
