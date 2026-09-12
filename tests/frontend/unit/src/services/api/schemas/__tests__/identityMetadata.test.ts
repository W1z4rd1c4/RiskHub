import { describe, expect, it } from 'vitest';
import { authConfigResponseSchema } from '@/services/api/schemas/auth';
import { accessUserCapabilitiesSchema } from '@/services/api/schemas/entities/identity';

describe('identity metadata wire validation', () => {
    const identity = {
        mode: 'native', external_directory: 'disabled', local_enrollment_enabled: true,
        password_reset_enabled: true, factor_management_enabled: true, recovery_method: 'governed_local',
    };
    const config = {
        auth_mode: 'password', demo_login_enabled: false, password_login_enabled: true,
        local_mfa_policy: 'optional', identity,
        sso: { enabled: false, provider: 'entra', scopes: [], tenant_id: null, client_id: null, authority: null },
    };
    it('preserves native mode and optional MFA without adding Microsoft configuration', () => {
        const parsed = authConfigResponseSchema.parse(config);
        expect(parsed.identity).toEqual(identity);
        expect(parsed.local_mfa_policy).toBe('optional');
        expect(parsed.sso.authority).toBeNull();
        expect(authConfigResponseSchema.safeParse({ ...config, identity: { ...identity, mode: 'auto' } }).success).toBe(false);
    });
    it('rejects non-boolean identity actions and preserves verified field ownership', () => {
        const actions = {
            can_edit_identity: true, can_edit_business_access: false, can_edit_role: true,
            can_deactivate: true, can_change_active_status: true, can_break_glass_enable: false,
            can_revoke_sessions: true, can_initiate_recovery: false, recovery_offline_required: true,
            can_request_password_reset: true, can_check_directory: false, verified_identity_fields: ['email'],
        };
        expect(accessUserCapabilitiesSchema.parse(actions)).toEqual(actions);
        expect(accessUserCapabilitiesSchema.safeParse({ ...actions, can_initiate_recovery: 'true' }).success).toBe(false);
    });
});
