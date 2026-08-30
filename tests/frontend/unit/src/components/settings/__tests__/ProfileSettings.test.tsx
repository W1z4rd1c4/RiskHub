import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
            if (key === 'permissions.risks_write') return 'Can manage risks';
            if (key === 'permissions.approvals_write') return 'Can resolve approvals';
            if (key === 'permissions.activity_log_read') return 'Can view activity log';
            if (key === 'permissions.restricted') return 'Restricted permission';
            if (key === 'permissions.technical_details') return 'Technical details';
            if (key === 'permissions.super_admin') return 'Can access all RiskHub business features';
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

    it('uses task language and keeps raw tokens inside the technical disclosure', async () => {
        const user = userEvent.setup();
        render(<ProfileSettings user={makeUser({
            effective_permissions: [
                'risks:write',
                'approvals:write',
                'activity_log:read',
                'legacy_permission',
                '*:*',
            ],
        })} />);

        expect(screen.getByText('Can manage risks')).toBeVisible();
        expect(screen.getByText('Can resolve approvals')).toBeVisible();
        expect(screen.getByText('Can view activity log')).toBeVisible();
        expect(screen.getByText('Restricted permission')).toBeVisible();
        expect(screen.getByText('Can access all RiskHub business features')).toBeVisible();

        for (const token of ['risks:write', 'approvals:write', 'activity_log:read', 'legacy_permission', '*:*']) {
            expect(screen.getByText(token)).not.toBeVisible();
            expect(screen.queryByTitle(token)).not.toBeInTheDocument();
        }

        await user.click(screen.getByText('Technical details'));
        for (const token of ['risks:write', 'approvals:write', 'activity_log:read', 'legacy_permission', '*:*']) {
            expect(screen.getByText(token)).toBeVisible();
        }
    });
});
