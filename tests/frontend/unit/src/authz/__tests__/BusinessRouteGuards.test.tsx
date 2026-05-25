import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockUseAuthz = vi.fn();

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

import {
    ActivityLogRouteGuard,
    AdminConsoleRouteGuard,
    AuditTrailRouteGuard,
    GovernanceRouteGuard,
} from '@/authz/BusinessRouteGuards';

function renderGovernanceRoute() {
    return render(
        <MemoryRouter initialEntries={['/governance']}>
            <Routes>
                <Route path="/" element={<div>Home</div>} />
                <Route
                    path="/governance"
                    element={
                        <GovernanceRouteGuard>
                            <div>Governance</div>
                        </GovernanceRouteGuard>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

function renderActivityLogRoute() {
    return render(
        <MemoryRouter initialEntries={['/activity-log']}>
            <Routes>
                <Route path="/" element={<div>Home</div>} />
                <Route
                    path="/activity-log"
                    element={
                        <ActivityLogRouteGuard>
                            <div>Activity Log</div>
                        </ActivityLogRouteGuard>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

function renderGuardedRoute(
    Guard: typeof GovernanceRouteGuard,
    path: string,
    protectedLabel: string,
    authz: Record<string, boolean>,
) {
    mockUseAuthz.mockReturnValue(authz);

    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/" element={<div>Home</div>} />
                <Route
                    path={path}
                    element={
                        <Guard>
                            <div>{protectedLabel}</div>
                        </Guard>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

describe('Business route guards', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('redirects platform admin away from /governance', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: true,
            canViewGovernance: false,
            canViewActivityLog: false,
        });

        renderGovernanceRoute();

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Governance')).not.toBeInTheDocument();
    });

    it('redirects platform admin away from /activity-log', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: true,
            canViewGovernance: false,
            canViewActivityLog: false,
        });

        renderActivityLogRoute();

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Activity Log')).not.toBeInTheDocument();
    });

    it('redirects users without control read access away from /audit-trail', async () => {
        renderGuardedRoute(
            AuditTrailRouteGuard,
            '/audit-trail',
            'Audit Trail',
            {
                canReadControls: false,
            },
        );

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Audit Trail')).not.toBeInTheDocument();
    });

    it('redirects users without admin console access away from /admin', async () => {
        renderGuardedRoute(
            AdminConsoleRouteGuard,
            '/admin',
            'Admin Console',
            {
                canViewAdminConsole: false,
            },
        );

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Admin Console')).not.toBeInTheDocument();
    });

    it('redirects users without admin console access away from /admin/docs', async () => {
        renderGuardedRoute(
            AdminConsoleRouteGuard,
            '/admin/docs',
            'Admin Docs',
            {
                canViewAdminConsole: false,
            },
        );

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Admin Docs')).not.toBeInTheDocument();
    });
});
