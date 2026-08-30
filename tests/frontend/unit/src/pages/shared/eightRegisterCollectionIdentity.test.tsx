import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetsPageState } from '@/pages/assets/useAssetsPageState';
import { useControlsPageState } from '@/pages/controls/useControlsPageState';
import { useIssuesPageState } from '@/pages/issues/useIssuesPageState';
import { useKrisPageState } from '@/pages/kris/useKrisPageState';
import { useProcessesPageState } from '@/pages/processes/useProcessesPageState';
import { useRisksPageState } from '@/pages/risks/useRisksPageState';
import { useThreatsPageState } from '@/pages/threats/useThreatsPageState';
import { useVendorsPageState } from '@/pages/vendors/useVendorsPageState';
import { ApiClientError } from '@/services/apiClient';
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
    restoreAsset: vi.fn(),
    restoreControl: vi.fn(),
    restoreKri: vi.fn(),
    restoreProcess: vi.fn(),
    restoreRisk: vi.fn(),
    restoreThreat: vi.fn(),
    restoreVendor: vi.fn(),
}));

vi.mock('@/services/assetApi', () => ({ assetApi: { getAssets: apiMocks.getAssets, restoreAsset: apiMocks.restoreAsset } }));
vi.mock('@/services/controlApi', () => ({ controlApi: { getControls: apiMocks.getControls, restoreControl: apiMocks.restoreControl } }));
vi.mock('@/services/issuesApi', () => ({ issuesApi: { list: apiMocks.getIssues } }));
vi.mock('@/services/kriApi', () => ({ kriApi: { getKRIs: apiMocks.getKris, restoreKRI: apiMocks.restoreKri } }));
vi.mock('@/services/processApi', () => ({ processApi: { getProcesses: apiMocks.getProcesses, restoreProcess: apiMocks.restoreProcess } }));
vi.mock('@/services/riskApi', () => ({ riskApi: { getRisks: apiMocks.getRisks, restoreRisk: apiMocks.restoreRisk } }));
vi.mock('@/services/riskHubApi', () => ({ riskHubApi: { getConfigValue: apiMocks.getConfigValue } }));
vi.mock('@/services/threatApi', () => ({ threatApi: { getThreats: apiMocks.getThreats, restoreThreat: apiMocks.restoreThreat } }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: { getVendors: apiMocks.getVendors, restoreVendor: apiMocks.restoreVendor } }));

interface RegisterCollectionState {
    capabilities: object | null;
    currentPage: number;
    errorKey: string | null;
    facets: object;
    groups: object[];
    hasLoadedOnce: boolean;
    isAccessDenied: boolean;
    isLoading: boolean;
    items: object[];
    pendingCreations?: object[];
    refresh: () => Promise<void>;
    restore?: (id: number) => Promise<void>;
    setCurrentPage: (page: number) => void;
    totalCount: number;
}

const EMPTY_RISK_SEMANTIC_FILTERS = {};

function useRiskCollectionState(): RegisterCollectionState {
    const state = useRisksPageState(EMPTY_RISK_SEMANTIC_FILTERS);
    return { ...state, refresh: state.fetchRisks, restore: state.restoreRisk };
}

function useControlCollectionState(): RegisterCollectionState {
    const state = useControlsPageState();
    return { ...state, refresh: state.fetchControls, restore: state.restoreControl };
}

function useKriCollectionState(): RegisterCollectionState {
    const state = useKrisPageState();
    return { ...state, refresh: state.fetchKris, restore: state.restoreKri };
}

function useIssueCollectionState(): RegisterCollectionState {
    const state = useIssuesPageState();
    return { ...state, refresh: state.fetchIssues };
}

function useProcessCollectionState(): RegisterCollectionState {
    const state = useProcessesPageState();
    return { ...state, refresh: state.fetchProcesses, restore: state.restoreProcess };
}

function useAssetCollectionState(): RegisterCollectionState {
    const state = useAssetsPageState();
    return { ...state, refresh: state.fetchAssets, restore: state.restoreAsset };
}

function useThreatCollectionState(): RegisterCollectionState {
    const state = useThreatsPageState();
    return { ...state, refresh: state.fetchThreats, restore: state.restoreThreat };
}

function useVendorCollectionState(): RegisterCollectionState {
    const state = useVendorsPageState();
    return { ...state, refresh: state.fetchVendors, restore: state.restoreVendor };
}

const REGISTERS: ReadonlyArray<{
    fetchMock: ReturnType<typeof vi.fn>;
    name: string;
    path: string;
    useCollectionState: () => RegisterCollectionState;
}> = [
    { fetchMock: apiMocks.getRisks, name: 'Risk', path: '/risks', useCollectionState: useRiskCollectionState },
    { fetchMock: apiMocks.getControls, name: 'Control', path: '/controls', useCollectionState: useControlCollectionState },
    { fetchMock: apiMocks.getKris, name: 'KRI', path: '/kris', useCollectionState: useKriCollectionState },
    { fetchMock: apiMocks.getIssues, name: 'Issue', path: '/issues', useCollectionState: useIssueCollectionState },
    { fetchMock: apiMocks.getProcesses, name: 'Process', path: '/processes', useCollectionState: useProcessCollectionState },
    { fetchMock: apiMocks.getAssets, name: 'Asset', path: '/assets', useCollectionState: useAssetCollectionState },
    { fetchMock: apiMocks.getThreats, name: 'Threat', path: '/threats', useCollectionState: useThreatCollectionState },
    { fetchMock: apiMocks.getVendors, name: 'Vendor', path: '/vendors', useCollectionState: useVendorCollectionState },
];

const RESTORABLE_REGISTERS = [
    { fetchMock: apiMocks.getRisks, name: 'Risk', path: '/risks', restoreMock: apiMocks.restoreRisk, useCollectionState: useRiskCollectionState },
    { fetchMock: apiMocks.getControls, name: 'Control', path: '/controls', restoreMock: apiMocks.restoreControl, useCollectionState: useControlCollectionState },
    { fetchMock: apiMocks.getKris, name: 'KRI', path: '/kris', restoreMock: apiMocks.restoreKri, useCollectionState: useKriCollectionState },
    { fetchMock: apiMocks.getProcesses, name: 'Process', path: '/processes', restoreMock: apiMocks.restoreProcess, useCollectionState: useProcessCollectionState },
    { fetchMock: apiMocks.getAssets, name: 'Asset', path: '/assets', restoreMock: apiMocks.restoreAsset, useCollectionState: useAssetCollectionState },
    { fetchMock: apiMocks.getThreats, name: 'Threat', path: '/threats', restoreMock: apiMocks.restoreThreat, useCollectionState: useThreatCollectionState },
    { fetchMock: apiMocks.getVendors, name: 'Vendor', path: '/vendors', restoreMock: apiMocks.restoreVendor, useCollectionState: useVendorCollectionState },
] as const;

const populatedPage = {
    capabilities: { can_create: true, can_export: true, can_view_risk_contexts: true, can_view_vendor_contexts: true },
    facets: {
        lifecycle: [{ value: 'active', label: 'Active', count: 1, disabled: false, selected: true }],
    },
    groups: [{ value: 'owner:7', label: 'Owner', count: 1 }],
    items: [{ id: 1, name: 'Query A row' }],
    limit: 20,
    offset: 0,
    pending_creations: [{ approval_id: 41, status: 'pending_creation' }],
    total: 1,
};

const queryBPage = {
    ...populatedPage,
    items: [{ id: 2, name: 'Query B row' }],
};

function deferred<T>() {
    let reject!: (reason: unknown) => void;
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

interface CollectionLayoutSnapshot {
    capabilities: object | null;
    facets: object;
    groups: object[];
    items: object[];
    pendingCreations: object[];
    search: string;
    totalCount: number;
}

function CollectionLayoutProbe({
    onLayout,
    useCollectionState,
}: {
    onLayout: (snapshot: CollectionLayoutSnapshot) => void;
    useCollectionState: () => RegisterCollectionState;
}) {
    const location = useLocation();
    const state = useCollectionState();
    useLayoutEffect(() => {
        onLayout({
            capabilities: state.capabilities,
            facets: state.facets,
            groups: state.groups,
            items: state.items,
            pendingCreations: state.pendingCreations ?? [],
            search: location.search,
            totalCount: state.totalCount,
        });
    });
    return (
        <>
            <output data-testid="collection-row-count">{state.items.length}</output>
            <button type="button" onClick={() => state.setCurrentPage(2)}>page two</button>
            <button type="button" onClick={() => void state.refresh()}>refresh</button>
        </>
    );
}

function routeWrapper(path: string) {
    const queryClient = createTestQueryClient();
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[`${path}?source=review`]}>{children}</MemoryRouter>
            </QueryClientProvider>
        );
    };
}

describe('eight-register collection query identity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiMocks.getConfigValue.mockResolvedValue(null);
        for (const register of REGISTERS) register.fetchMock.mockResolvedValue(populatedPage);
        for (const register of RESTORABLE_REGISTERS) register.restoreMock.mockResolvedValue(undefined);
    });

    it.each(RESTORABLE_REGISTERS)(
        '$name ignores a completed restore from query A while query B is loading',
        async ({ fetchMock, path, restoreMock, useCollectionState }) => {
            const restore = deferred<void>();
            restoreMock.mockReturnValueOnce(restore.promise);
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));
            act(() => { void result.current.restore?.(1); });
            const queryB = deferred<typeof queryBPage>();
            fetchMock.mockReturnValueOnce(queryB.promise);

            act(() => result.current.setCurrentPage(2));
            await waitFor(() => expect(result.current.currentPage).toBe(2));
            await waitFor(() => expect(result.current.isLoading).toBe(true));
            await act(async () => {
                restore.resolve();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.items).toEqual([]);
            expect(result.current.errorKey).toBeNull();
            expect(result.current.isLoading).toBe(true);
            await act(async () => { queryB.resolve(queryBPage); });
            await waitFor(() => expect((result.current.items[0] as { id?: number } | undefined)?.id).toBe(2));
            expect(result.current.errorKey).toBeNull();
            expect(result.current.isLoading).toBe(false);
        },
    );

    it.each(RESTORABLE_REGISTERS)(
        '$name ignores a failed restore from query A after query B succeeds',
        async ({ fetchMock, path, restoreMock, useCollectionState }) => {
            const restore = deferred<void>();
            restoreMock.mockReturnValueOnce(restore.promise);
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));
            let restorePromise: Promise<void> | undefined;
            act(() => { restorePromise = result.current.restore?.(1); });
            fetchMock.mockResolvedValueOnce(queryBPage);

            act(() => result.current.setCurrentPage(2));
            await waitFor(() => expect((result.current.items[0] as { id?: number } | undefined)?.id).toBe(2));
            await act(async () => {
                restore.reject(new ApiClientError({ status: 500, messageKey: 'errors.server' }));
                await restorePromise;
            });

            expect((result.current.items[0] as { id?: number } | undefined)?.id).toBe(2);
            expect(result.current.errorKey).toBeNull();
            expect(result.current.isLoading).toBe(false);
        },
    );

    it.each(RESTORABLE_REGISTERS)(
        '$name refreshes after a same-query restore succeeds',
        async ({ fetchMock, path, useCollectionState }) => {
            const refreshedPage = { ...populatedPage, items: [{ id: 3, name: 'Restored row' }] };
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));
            fetchMock.mockResolvedValueOnce(refreshedPage);

            await act(async () => { await result.current.restore?.(1); });

            expect((result.current.items[0] as { id?: number } | undefined)?.id).toBe(3);
            expect(result.current.errorKey).toBeNull();
        },
    );

    it.each(RESTORABLE_REGISTERS)(
        '$name applies a same-query restore failure without clearing safe rows',
        async ({ path, restoreMock, useCollectionState }) => {
            restoreMock.mockRejectedValueOnce(new ApiClientError({ status: 500, messageKey: 'errors.server' }));
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));

            await act(async () => { await result.current.restore?.(1); });

            expect(result.current.items).toHaveLength(1);
            expect(result.current.errorKey).not.toBeNull();
        },
    );

    it.each(REGISTERS)(
        '$name exposes no query A collection data in the query B layout phase',
        async ({ fetchMock, name, path, useCollectionState }) => {
            const layoutSnapshots: CollectionLayoutSnapshot[] = [];
            render(
                <CollectionLayoutProbe
                    onLayout={(snapshot) => layoutSnapshots.push(snapshot)}
                    useCollectionState={useCollectionState}
                />,
                { wrapper: routeWrapper(path) },
            );
            await waitFor(() => expect(screen.getByTestId('collection-row-count')).toHaveTextContent('1'));
            fetchMock.mockImplementation(() => new Promise(() => undefined));

            fireEvent.click(screen.getByRole('button', { name: 'page two' }));

            const firstQueryBLayout = layoutSnapshots.find(({ search }) => search.includes('page=2'));
            expect(firstQueryBLayout).toBeDefined();
            expect(firstQueryBLayout?.items).toEqual([]);
            expect(firstQueryBLayout?.groups).toEqual([]);
            expect(firstQueryBLayout?.totalCount).toBe(0);
            expect(firstQueryBLayout?.capabilities).toBeNull();
            expect(firstQueryBLayout?.facets).toEqual({});
            if (name === 'Process') expect(firstQueryBLayout?.pendingCreations).toEqual([]);
        },
    );

    it('does not expose an older Risk query response after the URL already owns query B', async () => {
        const layoutSnapshots: CollectionLayoutSnapshot[] = [];
        let resolveOlderQuery: ((value: typeof populatedPage) => void) | undefined;
        render(
            <CollectionLayoutProbe
                onLayout={(snapshot) => layoutSnapshots.push(snapshot)}
                useCollectionState={useRiskCollectionState}
            />,
            { wrapper: routeWrapper('/risks') },
        );
        await waitFor(() => expect(screen.getByTestId('collection-row-count')).toHaveTextContent('1'));
        apiMocks.getRisks.mockImplementationOnce(() => new Promise((resolve) => {
            resolveOlderQuery = resolve;
        }));
        fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
        await waitFor(() => expect(resolveOlderQuery).toBeDefined());
        apiMocks.getRisks.mockImplementationOnce(() => new Promise(() => undefined));

        fireEvent.click(screen.getByRole('button', { name: 'page two' }));
        await act(async () => {
            resolveOlderQuery?.({
                ...populatedPage,
                items: [{ id: 99, name: 'Late query A row' }],
            });
            await Promise.resolve();
        });

        expect(screen.getByTestId('collection-row-count')).toHaveTextContent('0');
        const queryBLayouts = layoutSnapshots.filter(({ search }) => search.includes('page=2'));
        expect(queryBLayouts.length).toBeGreaterThan(0);
        expect(queryBLayouts.every(({ items }) => items.length === 0)).toBe(true);
    });

    it.each(REGISTERS)(
        '$name clears query A rows, count, groups, and capabilities when query B fails',
        async ({ fetchMock, path, useCollectionState }) => {
            const { result } = renderHook(() => ({
                location: useLocation(),
                state: useCollectionState(),
            }), { wrapper: routeWrapper(path) });

            await waitFor(() => expect(result.current.state.items).toHaveLength(1));
            fetchMock.mockRejectedValueOnce(new ApiClientError({
                status: 500,
                messageKey: 'errors.server',
            }));

            act(() => result.current.state.setCurrentPage(2));

            await waitFor(() => expect(result.current.state.errorKey).not.toBeNull());
            expect(result.current.location.search).toContain('source=review');
            expect(result.current.location.search).toContain('page=2');
            expect(result.current.state.items).toEqual([]);
            expect(result.current.state.groups).toEqual([]);
            expect(result.current.state.totalCount).toBe(0);
            expect(result.current.state.capabilities).toBeNull();
            expect(result.current.state.hasLoadedOnce).toBe(false);
        },
    );

    it.each(REGISTERS)(
        '$name retains safe data when the same query transiently fails',
        async ({ fetchMock, path, useCollectionState }) => {
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));
            fetchMock.mockRejectedValueOnce(new ApiClientError({
                status: 500,
                messageKey: 'errors.server',
            }));

            await act(async () => { await result.current.refresh(); });

            expect(result.current.errorKey).not.toBeNull();
            expect(result.current.items).toHaveLength(1);
            expect(result.current.groups).toHaveLength(1);
            expect(result.current.totalCount).toBe(1);
            expect(result.current.capabilities).toEqual(expect.objectContaining({ can_create: true }));
            expect(result.current.hasLoadedOnce).toBe(true);
        },
    );

    it.each(REGISTERS)(
        '$name clears safe data when the same query is denied',
        async ({ fetchMock, path, useCollectionState }) => {
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));
            fetchMock.mockRejectedValueOnce(new ApiClientError({
                status: 403,
                messageKey: 'errors.forbidden',
            }));

            await act(async () => { await result.current.refresh(); });

            expect(result.current.isAccessDenied).toBe(true);
            expect(result.current.items).toEqual([]);
            expect(result.current.groups).toEqual([]);
            expect(result.current.totalCount).toBe(0);
            expect(result.current.capabilities).toBeNull();
            expect(result.current.hasLoadedOnce).toBe(false);
        },
    );

    it.each([
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.updateSearch('claims'),
            name: 'search',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.updateStatusFilter('archived'),
            name: 'filter',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.updateSort('name', 'asc'),
            name: 'sort',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.updateViewMode('department'),
            name: 'view',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.selectGroup('department:7'),
            name: 'group',
            path: '/risks?source=review&view=department',
        },
    ])('Risk treats a changed $name as a different collection query', async ({ change, name, path }) => {
        const queryClient = createTestQueryClient();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
            </QueryClientProvider>
        );
        const { result } = renderHook(
            () => useRisksPageState(EMPTY_RISK_SEMANTIC_FILTERS),
            { wrapper },
        );
        await waitFor(() => expect(result.current.items).toHaveLength(1));
        const failure = new ApiClientError({
            status: 500,
            messageKey: 'errors.server',
        });
        if (name === 'search') {
            apiMocks.getRisks.mockImplementation((params: { search?: string }) => (
                params.search === 'claims' ? Promise.reject(failure) : Promise.resolve(populatedPage)
            ));
        } else {
            apiMocks.getRisks.mockRejectedValueOnce(failure);
        }

        act(() => change(result.current));

        await waitFor(() => expect(result.current.errorKey).not.toBeNull());
        expect(result.current.items).toEqual([]);
        expect(result.current.totalCount).toBe(0);
        expect(result.current.capabilities).toBeNull();
        expect(result.current.hasLoadedOnce).toBe(false);
    });
});
