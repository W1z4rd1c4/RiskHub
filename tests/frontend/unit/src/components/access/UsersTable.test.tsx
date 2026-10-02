import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersTable } from '@/components/access/UsersTable';
import {
    buildAccessUserActionModel,
    buildAccessUserPresentationModel,
} from '@/components/access/useAccessUsersWorkflow';
import type { AccessUserRead } from '@/types/access';
import type { UserDirectoryEntry } from '@/types/user';

vi.mock('@/i18n/hooks', async () => {
    const formatters = await vi.importActual<typeof import('@/i18n/formatters')>('@/i18n/formatters');
    type FormatDate = Date | string | null | undefined;
    type FormatNumber = number | null | undefined;
    const format = {
        locale: 'en' as const,
        date: (value: FormatDate, options?: Intl.DateTimeFormatOptions) => formatters.formatDateValue(value, 'en', options),
        dateTime: (value: FormatDate, options?: Intl.DateTimeFormatOptions) => formatters.formatDateTimeValue(value, 'en', options),
        time: (value: FormatDate, options?: Intl.DateTimeFormatOptions) => formatters.formatTimeValue(value, 'en', options),
        relative: (value: FormatDate) => formatters.formatRelativeDateValue(value, 'en'),
        number: (value: FormatNumber, options?: Intl.NumberFormatOptions) => formatters.formatNumberValue(value, 'en', options),
        metric: (value: FormatNumber, unit?: string) => formatters.formatMetricNumberValue(value, 'en', unit),
        percent: (value: FormatNumber, fractionDigits?: number) => formatters.formatPercentValue(value, 'en', fractionDigits),
        currency: (value: FormatNumber, currency?: string) => formatters.formatCurrencyValue(value, 'en', currency),
        count: (count: number, key: string) => `${key}:${count}`,
    };
    return {
        useTranslation: () => ({
            t: (key: string, fallbackOrOptions?: string | { defaultValue?: string }) => {
                const translations: Record<string, string> = {
                    'users.break_glass': 'Break-glass',
                    'users.break_glass_enable': 'Break-glass enable',
                    'users.check_directory': 'Check AD',
                    'users.check_directory_status': 'Check directory status',
                };
                if (translations[key]) return translations[key];
                if (typeof fallbackOrOptions === 'string') return fallbackOrOptions;
                return fallbackOrOptions?.defaultValue ?? key;
            },
            i18n: { language: 'en' },
        }),
        useFormat: () => format,
    };
});

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
    const accessUsers = overrides.accessUsers ?? [makeAccessUser()];
    const props: Parameters<typeof UsersTable>[0] = {
        actionModelsByUserId: new Map(accessUsers.map((user) => [
            user.id,
            buildAccessUserActionModel(user, { defaultAllowed: false }),
        ])),
        isAccessMode: true,
        isLoading: false,
        accessUsers,
        directoryUsers: [],
        expandedUserId: null,
        onToggleExpand: vi.fn(),
        onEditAccess: vi.fn(),
        onToggleStatus: vi.fn(),
        presentationModelsByUserId: new Map(accessUsers.map((user) => [
            user.id,
            buildAccessUserPresentationModel(user),
        ])),
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
            accessUsers: [makeAccessUser({ capabilities: { ...makeAccessUser().capabilities!, can_change_active_status: false } })],
        });

        expect(screen.queryByRole('button', { name: 'access.actions.deactivate' })).not.toBeInTheDocument();
    });

    it('shows edit access action only when target-row capabilities allow editable fields', async () => {
        const onEditAccess = vi.fn();
        renderUsersTable({
            onEditAccess,
            accessUsers: [
                makeAccessUser({
                    capabilities: {
                        ...makeAccessUser().capabilities!,
                        can_edit_identity: false,
                        can_edit_business_access: false,
                        can_edit_role: true,
                    },
                }),
            ],
        });

        await userEvent.click(screen.getByRole('button', { name: 'access.actions.edit_access' }));

        expect(onEditAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    });

    it('hides edit access action when target-row edit capabilities are false or missing', () => {
        renderUsersTable({
            accessUsers: [
                makeAccessUser({
                    capabilities: {
                        ...makeAccessUser().capabilities!,
                        can_edit_identity: false,
                        can_edit_business_access: false,
                        can_edit_role: false,
                    },
                }),
                makeAccessUser({ id: 8, email: 'missing@riskhub.test', capabilities: null }),
            ],
        });

        expect(screen.queryByRole('button', { name: 'access.actions.edit_access' })).not.toBeInTheDocument();
    });

    it('hides active-status action when lifecycle capability metadata is absent', () => {
        const onToggleStatus = vi.fn();
        renderUsersTable({
            onToggleStatus,
            accessUsers: [makeAccessUser({ capabilities: null })],
        });

        expect(screen.queryByRole('button', { name: 'access.actions.deactivate' })).not.toBeInTheDocument();
        expect(onToggleStatus).not.toHaveBeenCalled();
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

    it('shows directory checks when both current-user and target capabilities allow them', async () => {
        const onCheckDirectory = vi.fn();
        renderUsersTable({
            canRunDirectoryChecks: true,
            onCheckDirectory,
            accessUsers: [makeAccessUser({ external_id: 'external-7', capabilities: { ...makeAccessUser().capabilities!, can_check_directory: true } })],
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

    it('announces the first load through the shared loading state instead of data rows', () => {
        renderUsersTable({ isLoading: true });

        expect(screen.getByRole('status')).toHaveTextContent('loading.generic');
        expect(screen.queryByText('Access User')).not.toBeInTheDocument();
        expect(screen.queryByText('access.table.no_users_found')).not.toBeInTheDocument();
    });

    it('renders the shared empty state inside the table when there are no users', () => {
        renderUsersTable({ accessUsers: [] });

        expect(screen.getByRole('status')).toHaveTextContent('access.table.no_users_found');
    });

    it('exposes the expand toggle state and the controlled details row (AX-10)', async () => {
        const onToggleExpand = vi.fn();
        renderUsersTable({ onToggleExpand });

        const collapsed = screen.getByRole('button', { name: 'access.matrix.show_all_permissions' });
        expect(collapsed).toHaveAttribute('aria-expanded', 'false');
        expect(collapsed).not.toHaveAttribute('aria-controls');

        await userEvent.click(collapsed);
        expect(onToggleExpand).toHaveBeenCalledWith(7);
    });

    it('links an expanded row to its details through aria-expanded and aria-controls (AX-10)', () => {
        renderUsersTable({ expandedUserId: 7 });

        const toggle = screen.getByRole('button', { name: 'access.matrix.show_all_permissions' });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const controlled = toggle.getAttribute('aria-controls');
        expect(controlled).toBeTruthy();
        expect(document.getElementById(controlled!)).toHaveTextContent('access.capabilities.effective_permissions');
    });

    it('names the table scroll region and uses the shared table header recipe (DS-11)', () => {
        renderUsersTable();

        expect(screen.getByRole('region', { name: 'access.title' })).toBeInTheDocument();
        const headers = screen.getAllByRole('columnheader');
        expect(headers.length).toBeGreaterThan(0);
        for (const header of headers) expect(header).toHaveAttribute('scope', 'col');
    });

    it('shows the directory status as a tone badge, not a hand-rolled pill (GAP-D-27)', () => {
        renderUsersTable({
            isAccessMode: false,
            accessUsers: [],
            directoryUsers: [makeDirectoryUser({ name: 'Žofie Directory' })],
        });

        expect(screen.getByText('access.status.active')).toHaveAttribute('data-tone', 'success');
        // One avatar recipe: a decorative initial next to the visible name.
        expect(screen.getByText('Ž')).toHaveAttribute('aria-hidden', 'true');
    });
});
