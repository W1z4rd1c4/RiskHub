import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '@test/queryClient';
import { Sidebar } from '@/components/layout/Sidebar';

const mocks = vi.hoisted(() => ({
    hasPermission: vi.fn(),
    logout: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 123,
            email: 'manager@example.com',
            name: 'Manager Example',
            role: 'risk_manager',
            role_display_name: 'Risk Manager',
            department_id: 7,
            permissions: [],
            effective_permissions: [],
            access_scope: 'global',
            scope_label: 'Global',
        },
        hasPermission: mocks.hasPermission,
        logout: mocks.logout,
        logoutPending: false,
        logoutErrorKey: null,
    }),
}));

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => ({
        isPlatformAdmin: false,
        can: () => true,
        canViewAdminConsole: false,
        canViewGovernance: false,
        canViewRiskHub: false,
        canViewUsersRoute: false,
    }),
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

vi.mock('@/services/userApi', () => ({
    userApi: {
        getShellSummary: vi.fn().mockResolvedValue({
            generated_at: '2026-03-07T10:00:00Z',
            orphan_total_count: 0,
            pending_approvals_count: 0,
            questionnaire_inbox_count: 0,
            unread_notifications_count: 0,
        }),
    },
}));

vi.mock('@/routing', () => {
    function RouteIcon() {
        return <span />;
    }

    return {
        getSidebarNavRoutes: ({ hasPermission }: { hasPermission: (resource: string, action: string) => boolean }) => [
            {
                nav: {
                    href: '/settings',
                    icon: RouteIcon,
                    labelKey: 'settings',
                },
            },
            ...(hasPermission('risks', 'read')
                ? [
                    {
                        nav: {
                            href: '/risks',
                            icon: RouteIcon,
                            labelKey: 'risks',
                        },
                    },
                ]
                : []),
        ],
    };
});

function renderSidebar() {
    const queryClient = createTestQueryClient();

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Sidebar />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('Sidebar usePermissions replacement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses AuthContext.hasPermission directly for route visibility', () => {
        const repoRoot = resolve(__dirname, '../../../../../../../');
        expect(existsSync(resolve(repoRoot, 'frontend/src/hooks/usePermissions.ts'))).toBe(false);

        mocks.hasPermission.mockImplementation((resource: string, action: string) =>
            resource === 'risks' && action === 'read',
        );

        renderSidebar();

        expect(screen.getByRole('link', { name: 'sidebar.settings' })).toBeVisible();
        expect(screen.getByRole('link', { name: 'sidebar.risks' })).toHaveAttribute('href', '/risks');
        expect(mocks.hasPermission).toHaveBeenCalledWith('risks', 'read');
    });

    it('hides permission-gated links when AuthContext.hasPermission denies access', () => {
        mocks.hasPermission.mockReturnValue(false);

        renderSidebar();

        expect(screen.getByRole('link', { name: 'sidebar.settings' })).toBeVisible();
        expect(screen.queryByRole('link', { name: 'sidebar.risks' })).not.toBeInTheDocument();
    });
});
