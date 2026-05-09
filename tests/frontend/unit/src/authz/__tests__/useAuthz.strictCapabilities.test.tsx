import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeCapabilities } from '@/services/authApi';
import { setStrictCapabilitiesEnabled } from '@/services/capabilityFlags';

const mockUseAuth = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => mockUseAuth(),
}));

import { useAuthz } from '@/authz/useAuthz';

const meCapabilities: MeCapabilities = {
    can_view_user_directory: false,
    can_view_access_users: false,
    can_view_department_access_users: false,
    can_view_users_route: false,
    can_manage_access: false,
    can_view_department_access: false,
    can_view_admin_console: false,
    can_view_riskhub: false,
    can_view_governance: false,
    can_view_activity_log: false,
    can_view_committee: false,
    can_view_users_page: false,
    is_second_line: false,
    can_read_risks: false,
    can_read_controls: false,
    can_read_vendors: false,
    can_read_departments: false,
    resource_permissions: {
        'risks:read': false,
    },
};

describe('useAuthz strict capability flag subscription', () => {
    beforeEach(() => {
        setStrictCapabilitiesEnabled(false);
        mockUseAuth.mockReturnValue({
            user: {
                role: 'employee',
                access_scope: 'department',
                me_capabilities: meCapabilities,
            },
            hasPermission: vi.fn(() => true),
        });
    });

    afterEach(() => {
        mockUseAuth.mockReturnValue({
            user: null,
            hasPermission: vi.fn(() => false),
        });
        setStrictCapabilitiesEnabled(false);
        mockUseAuth.mockClear();
    });

    it('recomputes authorization when strict capabilities flips mid-session', () => {
        const { result } = renderHook(() => useAuthz());

        expect(result.current.can('read', 'risks')).toBe(true);

        act(() => {
            setStrictCapabilitiesEnabled(true);
        });

        expect(result.current.can('read', 'risks')).toBe(false);
    });
});
