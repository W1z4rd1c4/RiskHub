import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AssetsPage } from '@/pages/AssetsPage';
import { ControlsPage } from '@/pages/ControlsPage';
import { IssuesPage } from '@/pages/IssuesPage';
import { KRIsPage } from '@/pages/KRIsPage';
import { ProcessesPage } from '@/pages/ProcessesPage';
import { RisksPage } from '@/pages/RisksPage';
import { ThreatsPage } from '@/pages/ThreatsPage';
import { VendorsPage } from '@/pages/VendorsPage';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';

const registers = [
    { name: 'assets', element: <AssetsPage /> },
    { name: 'controls', element: <ControlsPage /> },
    { name: 'issues', element: <IssuesPage /> },
    { name: 'kris', element: <KRIsPage /> },
    { name: 'processes', element: <ProcessesPage /> },
    { name: 'risks', element: <RisksPage /> },
    { name: 'threats', element: <ThreatsPage /> },
    { name: 'vendors', element: <VendorsPage /> },
];

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function requestSearch(url: URL | undefined) {
    return url?.searchParams.get('search') ?? JSON.parse(url?.searchParams.get('filters') ?? '{}').search;
}

describe.each(registers.filter(({ name }) => ['assets', 'controls'].includes(name)))('$name rendered current-view export', ({ name, element }) => {
    it('exports settled A while B is being typed, then exports B after the debounce', async () => {
        const listRequests: URL[] = [];
        const exportRequests: URL[] = [];
        let exported!: () => void;
        const nextExport = () => new Promise<void>((resolve) => { exported = resolve; });
        server.use(
            http.get(`*/api/v1/${name}`, ({ request }) => {
                listRequests.push(new URL(request.url));
                return HttpResponse.json({ items: [], total: 0, offset: 0, limit: 20,
                    facets: {}, groups: [], pending_creations: [],
                    capabilities: { can_create: false, can_export: true, can_view_risk_contexts: true, can_view_vendor_contexts: true },
                });
            }),
            http.get(`*/api/v1/${name}/export`, ({ request }) => {
                exportRequests.push(new URL(request.url));
                exported();
                return new HttpResponse('name\nExported\n', { headers: { 'Content-Type': 'text/csv' } });
            }),
        );
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() }));
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const router = createMemoryRouter([{ path: `/${name}`, element }], { initialEntries: [`/${name}?q=queryA&source=review`] });
        render(<QueryClientProvider client={createTestQueryClient()}><AuthProvider><LanguageProvider>
            <RouterProvider router={router} />
        </LanguageProvider></AuthProvider></QueryClientProvider>);
        const exportButton = await screen.findByTestId(`${name}-export-button`);
        await waitFor(() => expect(exportButton).toBeEnabled());
        expect(requestSearch(listRequests.at(-1))).toBe('queryA');

        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        fireEvent.change(screen.getByTestId(`${name}-search-input`), { target: { value: 'queryB' } });
        const firstExport = nextExport();
        fireEvent.click(exportButton);
        await act(async () => {
            fireEvent.click(screen.getByTestId('export-submit-button'));
            await firstExport;
        });
        expect(requestSearch(listRequests.at(-1))).toBe('queryA');
        expect(requestSearch(exportRequests[0])).toBe('queryA');
        expect(exportRequests[0].searchParams.has('offset')).toBe(false);
        expect(exportRequests[0].searchParams.has('limit')).toBe(false);

        await act(async () => { await vi.advanceTimersByTimeAsync(300); });
        vi.useRealTimers();
        await waitFor(() => expect(requestSearch(listRequests.at(-1))).toBe('queryB'));
        await waitFor(() => expect(screen.queryByTestId('export-submit-button')).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByTestId(`${name}-export-button`)).toBeEnabled());
        const secondExport = nextExport();
        fireEvent.click(screen.getByTestId(`${name}-export-button`));
        await act(async () => {
            fireEvent.click(screen.getByTestId('export-submit-button'));
            await secondExport;
        });
        expect(requestSearch(exportRequests[1])).toBe('queryB');
        expect(router.state.location.search).toContain('source=review');
        router.dispose();
    });
});
