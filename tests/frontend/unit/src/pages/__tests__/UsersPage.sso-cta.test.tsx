import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UsersPage } from '@/pages/UsersPage';

const mockNavigate = vi.fn();
const mockGetAuthConfig = vi.fn();
const mockListAccessUsers = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    }),
}));

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        canManageUsers: true,
        user: { id: 1, name: 'Admin' },
    }),
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        canManageAccess: true,
        canEditAccessUsers: true,
        isDepartmentHead: false,
        isPlatformAdmin: false,
    }),
}));

vi.mock('@/services/authConfig', () => ({
    getAuthConfig: (...args: unknown[]) => mockGetAuthConfig(...args),
    clearAuthConfigCache: vi.fn(),
}));

vi.mock('@/services/accessApi', () => ({
    accessApi: {
        listAccessUsers: (...args: unknown[]) => mockListAccessUsers(...args),
        listDepartmentAccessUsers: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/adminApi', () => ({
    adminApi: {
        checkAllDirectoryUsers: vi.fn(),
        checkDirectoryUser: vi.fn(),
    },
}));

vi.mock('@/services/userApi', () => ({
    userApi: {
        listVisibleUsers: vi.fn().mockResolvedValue([]),
        updateUser: vi.fn(),
    },
}));

vi.mock('@/components/access/UsersFilterBar', () => ({
    UsersFilterBar: () => <div data-testid="users-filter-bar" />,
}));

vi.mock('@/components/access/UsersTable', () => ({
    UsersTable: () => <div data-testid="users-table" />,
}));

vi.mock('@/components/access/AccessEditModal', () => ({
    AccessEditModal: () => null,
}));

vi.mock('@/components/ConfirmDialog', () => ({
    ConfirmDialog: () => null,
}));

vi.mock('@/components/users/ADUserPicker', () => ({
    ADUserPicker: () => null,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('UsersPage SSO add CTA', () => {
    beforeEach(() => {
        mockNavigate.mockReset();
        mockGetAuthConfig.mockReset();
        mockListAccessUsers.mockReset();
        mockListAccessUsers.mockResolvedValue([]);
    });

    it('shows a single SSO add flow CTA to /users/new without duplicate add options', async () => {
        mockGetAuthConfig.mockResolvedValue({ auth_mode: 'microsoft_sso' });

        render(<UsersPage />);

        await waitFor(() => {
            expect(mockListAccessUsers).toHaveBeenCalled();
        });

        const ssoAddButton = await screen.findByRole('button', { name: 'Add from AD' });
        fireEvent.click(ssoAddButton);

        expect(mockNavigate).toHaveBeenCalledWith('/users/new');
        expect(screen.queryByRole('button', { name: 'access.add_user' })).not.toBeInTheDocument();
    });
});
