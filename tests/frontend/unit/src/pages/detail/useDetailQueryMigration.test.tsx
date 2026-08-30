import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import { AssetDetailPage } from '@/pages/AssetDetailPage';
import { ControlDetailPage } from '@/pages/ControlDetailPage';
import { IssueDetailPage } from '@/pages/IssueDetailPage';
import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ProcessDetailPage } from '@/pages/ProcessDetailPage';
import { RiskDetailPage } from '@/pages/RiskDetailPage';
import { ThreatDetailPage } from '@/pages/ThreatDetailPage';
import { VendorDetailPage } from '@/pages/VendorDetailPage';
import { createTestQueryClient } from '@test/queryClient';

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

const detailPages: Array<{
    basePath: string;
    element: ReactElement;
}> = [
    { basePath: '/risks', element: <RiskDetailPage /> },
    { basePath: '/controls', element: <ControlDetailPage /> },
    { basePath: '/kris', element: <KRIDetailPage /> },
    { basePath: '/issues', element: <IssueDetailPage /> },
    { basePath: '/vendors', element: <VendorDetailPage /> },
    { basePath: '/processes', element: <ProcessDetailPage /> },
    { basePath: '/assets', element: <AssetDetailPage /> },
    { basePath: '/threats', element: <ThreatDetailPage /> },
];

describe.each(detailPages)('$basePath detail route', ({ basePath, element }) => {
    it('shows generic Back-only recovery for a malformed id and preserves the register URL', async () => {
        const returnTo = `${basePath}?q=payments&page=3#group-heading`;
        const router = createMemoryRouter([
            { path: `${basePath}/:id`, element },
            { path: basePath, element: <LocationProbe /> },
        ], {
            initialEntries: [`${basePath}/13junk?return_to=${encodeURIComponent(returnTo)}`],
        });

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <AuthProvider>
                    <RouterProvider router={router} />
                </AuthProvider>
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('heading', { name: /record unavailable/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button'));
        expect(await screen.findByTestId('location')).toHaveTextContent(returnTo);
    });
});
