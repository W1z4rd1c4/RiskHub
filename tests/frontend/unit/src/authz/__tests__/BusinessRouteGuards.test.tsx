import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockUseAuthz = vi.fn();

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

import {
    ActivityLogRouteGuard,
    AuditTrailRouteGuard,
    GovernanceRouteGuard,
    RiskWriteRouteGuard,
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

function renderRiskWriteRoute() {
    return render(
        <MemoryRouter initialEntries={['/risks/new']}>
            <Routes>
                <Route path="/" element={<div>Home</div>} />
                <Route
                    path="/risks/new"
                    element={
                        <RiskWriteRouteGuard>
                            <div>Risk Write</div>
                        </RiskWriteRouteGuard>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

function renderAuditTrailRoute() {
    return render(
        <MemoryRouter initialEntries={['/audit-trail']}>
            <Routes>
                <Route path="/" element={<div>Home</div>} />
                <Route
                    path="/audit-trail"
                    element={
                        <AuditTrailRouteGuard>
                            <div>Audit Trail</div>
                        </AuditTrailRouteGuard>
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
            canWriteRisks: false,
            canReadControls: false,
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
            canWriteRisks: false,
            canReadControls: false,
        });

        renderActivityLogRoute();

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Activity Log')).not.toBeInTheDocument();
    });

    it('redirects users without risk write away from risk write routes', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: false,
            canViewGovernance: false,
            canViewActivityLog: false,
            canWriteRisks: false,
            canReadControls: true,
        });

        renderRiskWriteRoute();

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Risk Write')).not.toBeInTheDocument();
    });

    it('allows risk write routes when risk write access is present', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: false,
            canViewGovernance: false,
            canViewActivityLog: false,
            canWriteRisks: true,
            canReadControls: true,
        });

        renderRiskWriteRoute();

        expect(await screen.findByText('Risk Write')).toBeInTheDocument();
    });

    it('redirects users without controls read away from audit trail', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: false,
            canViewGovernance: false,
            canViewActivityLog: false,
            canWriteRisks: true,
            canReadControls: false,
        });

        renderAuditTrailRoute();

        expect(await screen.findByText('Home')).toBeInTheDocument();
        expect(screen.queryByText('Audit Trail')).not.toBeInTheDocument();
    });

    it('allows audit trail when controls read access is present', async () => {
        mockUseAuthz.mockReturnValue({
            isPlatformAdmin: false,
            canViewGovernance: false,
            canViewActivityLog: false,
            canWriteRisks: false,
            canReadControls: true,
        });

        renderAuditTrailRoute();

        expect(await screen.findByText('Audit Trail')).toBeInTheDocument();
    });
});
