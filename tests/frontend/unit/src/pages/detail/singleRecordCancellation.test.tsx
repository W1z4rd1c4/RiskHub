import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import { AssetDetailPage } from '@/pages/AssetDetailPage';
import { ControlEditPage } from '@/pages/ControlEditPage';
import { ProcessDetailPage } from '@/pages/ProcessDetailPage';
import { RiskEditPage } from '@/pages/RiskEditPage';
import { ThreatDetailPage } from '@/pages/ThreatDetailPage';
import { VendorDetailPage } from '@/pages/VendorDetailPage';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';

const routes = [
    { path: '/assets/:id', endpoint: 'assets', element: <AssetDetailPage /> },
    { path: '/processes/:id', endpoint: 'processes', element: <ProcessDetailPage /> },
    { path: '/threats/:id', endpoint: 'threats', element: <ThreatDetailPage /> },
    { path: '/vendors/:id', endpoint: 'vendors', element: <VendorDetailPage /> },
    { path: '/risks/:id/edit', endpoint: 'risks', element: <RiskEditPage /> },
    { path: '/controls/:id/edit', endpoint: 'controls', element: <ControlEditPage /> },
];

describe.each(routes)('$path request ownership', ({ path, endpoint, element }) => {
    it('aborts the actual pending network read when navigating away', async () => {
        let requestSignal: AbortSignal | undefined;
        let release!: () => void;
        const pending = new Promise<void>((resolve) => { release = resolve; });
        server.use(http.get(`*/api/v1/${endpoint}/7`, async ({ request }) => {
            requestSignal = request.signal;
            await pending;
            return HttpResponse.json({ detail: 'late response' }, { status: 404 });
        }));
        const router = createMemoryRouter([
            { path, element },
            { path: '/away', element: <h1>Destination</h1> },
        ], { initialEntries: [path.replace(':id', '7')] });
        render(<QueryClientProvider client={createTestQueryClient()}><AuthProvider>
            <RouterProvider router={router} />
        </AuthProvider></QueryClientProvider>);

        try {
            await waitFor(() => expect(requestSignal).toBeDefined());
            expect(requestSignal?.aborted).toBe(false);
            await act(() => router.navigate('/away'));
            expect(screen.getByRole('heading', { name: 'Destination' })).toBeInTheDocument();
            await waitFor(() => expect(requestSignal?.aborted).toBe(true));
        } finally {
            release();
            router.dispose();
        }
    });
});
