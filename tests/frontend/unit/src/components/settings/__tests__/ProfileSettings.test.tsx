import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProfileSettings } from '@/components/settings/ProfileSettings';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            if (key === 'profile.organizational_role') return 'Organizational role';
            if (key === 'profile.your_identity') return 'Your Identity';
            if (key === 'profile.your_permissions') return 'Your Permissions';
            if (key === 'profile.email') return 'Email Address';
            if (key === 'profile.department') return 'Department';
            if (key === 'profile.role') return 'Role';
            if (key === 'profile.access_scope') return 'Access Scope';
            if (key === 'profile.ad_notice') return 'AD notice';
            if (key === 'profile.no_permissions_assigned') return 'No permissions assigned';
            if (key === 'common:fallbacks.unassigned') return 'Unassigned';
            return key;
        },
    }),
}));

function makeUser(overrides: Partial<Parameters<typeof ProfileSettings>[0]['user']> = {}) {
    return {
        id: 1,
        email: 'user@example.com',
        name: 'Example User',
        role: 'employee',
        role_display_name: 'Employee',
        entra_business_role: 'Regional Director',
        department_name: 'Risk',
        permissions: [],
        effective_permissions: [],
        access_scope: 'department' as const,
        scope_label: 'Department',
        ...overrides,
    };
}

describe('ProfileSettings', () => {
    it('renders the Entra business role when present', () => {
        render(<ProfileSettings user={makeUser()} />);

        expect(screen.getByText('Organizational role')).toBeInTheDocument();
        expect(screen.getByText('Regional Director')).toBeInTheDocument();
    });

    it('renders the unassigned fallback when no Entra business role exists', () => {
        render(<ProfileSettings user={makeUser({ entra_business_role: null })} />);

        expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    it('renders malformed permissions without crashing', () => {
        render(<ProfileSettings user={makeUser({ effective_permissions: ['legacy_permission'] })} />);

        expect(screen.getByText('legacy_permission')).toBeInTheDocument();
    });
});
