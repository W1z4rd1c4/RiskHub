import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetsPageState } from '@/pages/assets/useAssetsPageState';
import { useControlsPageState } from '@/pages/controls/useControlsPageState';
import { useIssuesPageState } from '@/pages/issues/useIssuesPageState';
import { useKrisPageState } from '@/pages/kris/useKrisPageState';
import { useProcessesPageState } from '@/pages/processes/useProcessesPageState';
import { useRisksPageState } from '@/pages/risks/useRisksPageState';
import { useThreatsPageState } from '@/pages/threats/useThreatsPageState';
import { useVendorsPageState } from '@/pages/vendors/useVendorsPageState';
import { createTestQueryClient } from '@test/queryClient';

const apiMocks = vi.hoisted(() => ({
    getAssets: vi.fn(),
    getConfigValue: vi.fn(),
    getControls: vi.fn(),
    getIssues: vi.fn(),
    getKris: vi.fn(),
    getProcesses: vi.fn(),
    getRisks: vi.fn(),
    getThreats: vi.fn(),
    getVendors: vi.fn(),
}));

vi.mock('@/services/assetApi', () => ({ assetApi: { getAssets: apiMocks.getAssets } }));
vi.mock('@/services/controlApi', () => ({ controlApi: { getControls: apiMocks.getControls } }));
vi.mock('@/services/issuesApi', () => ({ issuesApi: { list: apiMocks.getIssues } }));
vi.mock('@/services/kriApi', () => ({ kriApi: { getKRIs: apiMocks.getKris } }));
vi.mock('@/services/processApi', () => ({ processApi: { getProcesses: apiMocks.getProcesses } }));
vi.mock('@/services/riskApi', () => ({ riskApi: { getRisks: apiMocks.getRisks } }));
vi.mock('@/services/riskHubApi', () => ({ riskHubApi: { getConfigValue: apiMocks.getConfigValue } }));
vi.mock('@/services/threatApi', () => ({ threatApi: { getThreats: apiMocks.getThreats } }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: { getVendors: apiMocks.getVendors } }));

interface RegisterRouteState {
    currentPage: number;
    setCurrentPage: (page: number) => void;
}

const REGISTERS: ReadonlyArray<{
    name: string;
    path: string;
    useRouteState: () => RegisterRouteState;
}> = [
    { name: 'Risk', path: '/risks', useRouteState: useRisksPageState },
    { name: 'Control', path: '/controls', useRouteState: useControlsPageState },
    { name: 'KRI', path: '/kris', useRouteState: useKrisPageState },
    { name: 'Issue', path: '/issues', useRouteState: useIssuesPageState },
    { name: 'Process', path: '/processes', useRouteState: useProcessesPageState },
    { name: 'Asset', path: '/assets', useRouteState: useAssetsPageState },
    { name: 'Threat', path: '/threats', useRouteState: useThreatsPageState },
    { name: 'Vendor', path: '/vendors', useRouteState: useVendorsPageState },
];

const emptyPage = {
    capabilities: null,
    facets: {},
    groups: [],
    items: [],
    limit: 20,
    offset: 0,
    total: 0,
};

function routeWrapper(initialEntries: string[]) {
    const queryClient = createTestQueryClient();
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
                    {children}
                </MemoryRouter>
            </QueryClientProvider>
        );
    };
}

describe('eight-register public URL history parity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiMocks.getAssets.mockResolvedValue(emptyPage);
        apiMocks.getConfigValue.mockResolvedValue(null);
        apiMocks.getControls.mockResolvedValue(emptyPage);
        apiMocks.getIssues.mockResolvedValue(emptyPage);
        apiMocks.getKris.mockResolvedValue(emptyPage);
        apiMocks.getProcesses.mockResolvedValue({ ...emptyPage, pending_creations: [] });
        apiMocks.getRisks.mockResolvedValue(emptyPage);
        apiMocks.getThreats.mockResolvedValue(emptyPage);
        apiMocks.getVendors.mockResolvedValue(emptyPage);
    });

    it.each(REGISTERS)(
        '$name replace-normalizes invalid owned state and keeps page navigation in browser history',
        async ({ path, useRouteState }) => {
            const { result } = renderHook(() => ({
                location: useLocation(),
                navigate: useNavigate(),
                state: useRouteState(),
            }), {
                wrapper: routeWrapper([
                    `${path}?marker=before`,
                    `${path}?source=review&view=bogus&sort=unknown:asc&filters=3&group=&page=004&q=`,
                ]),
            });

            await waitFor(() => expect(result.current.location.search).toBe('?source=review&page=4'));
            expect(result.current.state.currentPage).toBe(4);

            act(() => result.current.state.setCurrentPage(6));
            await waitFor(() => expect(result.current.location.search).toBe('?source=review&page=6'));

            act(() => result.current.navigate(-1));
            await waitFor(() => expect(result.current.location.search).toBe('?source=review&page=4'));

            act(() => result.current.navigate(-1));
            await waitFor(() => expect(result.current.location.search).toBe('?marker=before'));
        },
    );
});
