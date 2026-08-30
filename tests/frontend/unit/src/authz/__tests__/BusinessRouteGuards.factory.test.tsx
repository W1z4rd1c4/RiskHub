import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuthz = vi.fn();

vi.mock('@/authz/useAuthz', () => ({
    useAuthz: () => mockUseAuthz(),
}));

import {
    ActivityLogRouteGuard,
    AdminConsoleRouteGuard,
    AuditTrailRouteGuard,
    createBusinessRouteGuard,
    GovernanceRouteGuard,
    UserLifecycleRouteGuard,
    UsersRouteGuard,
} from '@/authz/BusinessRouteGuards';

type GuardComponent = typeof GovernanceRouteGuard;

const cases: Array<[string, GuardComponent, string]> = [
    ['GovernanceRouteGuard', GovernanceRouteGuard, 'canViewGovernance'],
    ['ActivityLogRouteGuard', ActivityLogRouteGuard, 'canViewActivityLog'],
    ['UsersRouteGuard', UsersRouteGuard, 'canViewUsersRoute'],
    ['UserLifecycleRouteGuard', UserLifecycleRouteGuard, 'isPlatformAdmin'],
    ['AdminConsoleRouteGuard', AdminConsoleRouteGuard, 'canViewAdminConsole'],
    ['AuditTrailRouteGuard', AuditTrailRouteGuard, 'canReadControls'],
];

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
}

function renderGuard(Guard: GuardComponent, key: string, allowed: boolean) {
    mockUseAuthz.mockReturnValue({ [key]: allowed });

    return render(
        <MemoryRouter initialEntries={['/protected']}>
            <Routes>
                <Route path="/" element={<div>Home</div>} />
                <Route
                    path="/protected"
                    element={
                        <>
                            <Guard>
                                <div>Protected child</div>
                            </Guard>
                            <LocationProbe />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );
}

describe('BusinessRouteGuards factory contract', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('exports the typed route guard factory', () => {
        expect(createBusinessRouteGuard).toBeTypeOf('function');
    });

    it.each(cases)('%s renders children when %s is true', async (_name, Guard, key) => {
        renderGuard(Guard, key, true);

        expect(await screen.findByText('Protected child')).toBeInTheDocument();
        expect(screen.queryByText('Home')).not.toBeInTheDocument();
    });

    it.each(cases)('%s renders a generic denial without changing the URL when %s is false', async (_name, Guard, key) => {
        renderGuard(Guard, key, false);

        expect(await screen.findByText('Access Denied')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/protected');
        expect(screen.queryByText('Home')).not.toBeInTheDocument();
        expect(screen.queryByText('Protected child')).not.toBeInTheDocument();
    });
});
