import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@test/queryClient';

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => mockUseAuth(),
}));

const mockUseAuthz = vi.fn();
vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/components/notifications/NotificationBell', () => ({
    NotificationBell: () => null,
}));

const getShellSummary = vi.fn();
vi.mock('@/services/userApi', () => ({
    userApi: {
        getShellSummary: () => getShellSummary(),
    },
}));

import { Sidebar } from '@/components/layout/Sidebar';

function createWrapper() {
    const queryClient = createTestQueryClient();

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('Sidebar badge polling', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        getShellSummary.mockResolvedValue({
            unread_notifications_count: 2,
            pending_approvals_count: 2,
            questionnaire_inbox_count: 2,
            orphan_total_count: 5,
            can_view_governance: true,
            generated_at: '2026-03-07T10:00:00Z',
        });

        mockUseAuth.mockReturnValue({
            user: { id: 123, name: 'User', role_display_name: 'Role', department_id: 7, access_scope: 'global' },
            hasPermission: () => true,
            logout: vi.fn(),
        });

        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: false,
            can: () => true,
            canViewUsersRoute: false,
            canViewRiskHub: false,
            canViewAdminConsole: false,
        });
    });

    it('polls the aggregate shell summary for business users', async () => {
        const { unmount } = render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(getShellSummary).toHaveBeenCalledTimes(1));

        unmount();
    });

    it('does not poll any badge endpoints for admin console users', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: true,
            can: () => true,
            canViewUsersRoute: true,
            canViewRiskHub: false,
            canViewAdminConsole: true,
        });

        const { unmount } = render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        // Effects should short-circuit immediately
        await new Promise((r) => setTimeout(r, 0));
        expect(getShellSummary).not.toHaveBeenCalled();

        unmount();
    });

    it('still uses the aggregate shell summary when governance access is unavailable', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: false,
            can: () => true,
            canViewUsersRoute: false,
            canViewRiskHub: false,
            canViewAdminConsole: false,
            canViewGovernance: false,
        });

        const { unmount } = render(
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>,
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(getShellSummary).toHaveBeenCalledTimes(1));

        unmount();
    });
});
