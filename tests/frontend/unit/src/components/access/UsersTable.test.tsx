import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersTable } from '@/components/access/UsersTable';
import type { AccessUserRead } from '@/types/access';
import type { UserDirectoryEntry } from '@/types/user';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, fallbackOrOptions?: string | { defaultValue?: string }) => {
            if (typeof fallbackOrOptions === 'string') return fallbackOrOptions;
            return fallbackOrOptions?.defaultValue ?? key;
        },
        i18n: { language: 'en' },
    }),
}));

function makeAccessUser(overrides: Partial<AccessUserRead> = {}): AccessUserRead {
    return {
        id: 7,
        email: 'user@riskhub.test',
        name: 'Access User',
        is_active: true,
        role_id: 2,
        role: {
            id: 2,
            name: 'employee',
            display_name: 'Employee',
            description: null,
        },
        department_id: 3,
        department_name: 'Operations',
        manager_id: null,
        manager_name: null,
        access_scope: 'department',
        scope_label: 'Department',
        effective_permissions: ['risks:read'],
        capabilities: {
            can_edit_identity: true,
            can_edit_business_access: true,
            can_edit_role: true,
            can_deactivate: false,
            can_change_active_status: false,
            can_break_glass_enable: false,
            can_revoke_sessions: false,
        },
        ...overrides,
    };
}

function makeDirectoryUser(overrides: Partial<UserDirectoryEntry> = {}): UserDirectoryEntry {
    return {
        id: 12,
        email: 'directory.user@riskhub.test',
        name: 'Directory User',
        role_name: 'employee',
        role_display_name: 'Employee',
        department_id: 4,
        department_name: 'Claims',
        ...overrides,
    };
}

function renderUsersTable(overrides: Partial<Parameters<typeof UsersTable>[0]> = {}) {
    const props: Parameters<typeof UsersTable>[0] = {
        isAccessMode: true,
        isLoading: false,
        accessUsers: [makeAccessUser()],
        directoryUsers: [],
        expandedUserId: null,
        onToggleExpand: vi.fn(),
        canEditAccess: false,
        canManageUsers: true,
        onEditAccess: vi.fn(),
        onToggleStatus: vi.fn(),
        ...overrides,
    };

    render(<UsersTable {...props} />);
    return props;
}

describe('UsersTable', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prefers backend active-status capability over local manage-users fallback', () => {
        renderUsersTable({
            canManageUsers: true,
            accessUsers: [makeAccessUser({ capabilities: { ...makeAccessUser().capabilities!, can_change_active_status: false } })],
        });

        expect(screen.queryByRole('button', { name: 'access.actions.deactivate' })).not.toBeInTheDocument();
    });

    it('falls back to local manage-users permission when lifecycle capability metadata is absent', async () => {
        const onToggleStatus = vi.fn();
        renderUsersTable({
            onToggleStatus,
            canManageUsers: true,
            accessUsers: [makeAccessUser({ capabilities: null })],
        });

        await userEvent.click(screen.getByRole('button', { name: 'access.actions.deactivate' }));

        expect(onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    });

    it('shows break-glass action only when backend capability allows it', async () => {
        const onBreakGlassEnable = vi.fn();
        renderUsersTable({
            onBreakGlassEnable,
            accessUsers: [
                makeAccessUser({
                    capabilities: {
                        ...makeAccessUser().capabilities!,
                        can_break_glass_enable: true,
                    },
                }),
            ],
        });

        await userEvent.click(screen.getByRole('button', { name: /break-glass/i }));

        expect(onBreakGlassEnable).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    });

    it('shows directory checks only for linked external users when enabled', async () => {
        const onCheckDirectory = vi.fn();
        renderUsersTable({
            canRunDirectoryChecks: true,
            onCheckDirectory,
            accessUsers: [makeAccessUser({ external_id: 'external-7' })],
        });

        await userEvent.click(screen.getByRole('button', { name: 'Check AD' }));

        expect(onCheckDirectory).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    });

    it('renders directory mode as view-only rows', () => {
        renderUsersTable({
            isAccessMode: false,
            accessUsers: [],
            directoryUsers: [makeDirectoryUser()],
        });

        expect(screen.getByText('Directory User')).toBeInTheDocument();
        expect(screen.getByText('access.table.view_only')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'access.actions.deactivate' })).not.toBeInTheDocument();
    });
});
