import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => mockUseAuth(),
}));

const mockUsePermissions = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => mockUsePermissions(),
}));

const mockUseAuthz = vi.fn();
vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
    NotificationBell: () => null,
}));

const approvalsGetPendingCount = vi.fn();
vi.mock('@/services/approvalsApi', () => ({
    approvalsApi: {
        getPendingCount: () => approvalsGetPendingCount(),
    },
}));

const getOrphanStats = vi.fn();
vi.mock('@/services/orphanedItemsApi', () => ({
    orphanedItemsApi: {
        getOrphanStats: () => getOrphanStats(),
    },
}));

const inbox = vi.fn();
vi.mock('@/services/riskQuestionnairesApi', () => ({
    riskQuestionnairesApi: {
        inbox: () => inbox(),
    },
}));

import { Sidebar } from '../Sidebar';

describe('Sidebar badge polling', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        approvalsGetPendingCount.mockResolvedValue({ count: 2 });
        getOrphanStats.mockResolvedValue({ total_count: 5 });
        inbox.mockResolvedValue([{ id: 1 }, { id: 2 }]);

        mockUseAuth.mockReturnValue({
            user: { id: 123, name: 'User', role_display_name: 'Role' },
            logout: vi.fn(),
        });

        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: false,
            canViewUsersPage: false,
            canViewRiskHub: false,
            canViewAdminConsole: false,
        });
    });

    it('does not call questionnaire inbox without risks:read', async () => {
        mockUsePermissions.mockReturnValue({
            canManageAccess: false,
            canViewActivityLog: false,
            hasPermission: (resource: string, action: string) => {
                if (resource === 'risks' && action === 'read') return false;
                if (resource === 'vendors' && action === 'read') return true;
                return true;
            },
        });

        const { unmount } = render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>
        );

        await waitFor(() => expect(approvalsGetPendingCount).toHaveBeenCalledTimes(1));
        expect(inbox).not.toHaveBeenCalled();
        expect(getOrphanStats).not.toHaveBeenCalled();

        unmount();
    });

    it('does not poll any badge endpoints for admin console users', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: true,
            canViewUsersPage: true,
            canViewRiskHub: false,
            canViewAdminConsole: true,
        });

        mockUsePermissions.mockReturnValue({
            canManageAccess: true,
            canViewActivityLog: false,
            hasPermission: () => true,
        });

        const { unmount } = render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>
        );

        // Effects should short-circuit immediately
        await new Promise((r) => setTimeout(r, 0));
        expect(approvalsGetPendingCount).not.toHaveBeenCalled();
        expect(getOrphanStats).not.toHaveBeenCalled();
        expect(inbox).not.toHaveBeenCalled();

        unmount();
    });

    it('does not call orphan stats when user cannot manage access', async () => {
        mockUsePermissions.mockReturnValue({
            canManageAccess: false,
            canViewActivityLog: false,
            hasPermission: (resource: string, action: string) => {
                if (resource === 'risks' && action === 'read') return true;
                return true;
            },
        });

        const { unmount } = render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>
        );

        await waitFor(() => expect(approvalsGetPendingCount).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(inbox).toHaveBeenCalledTimes(1));
        expect(getOrphanStats).not.toHaveBeenCalled();

        unmount();
    });
});

