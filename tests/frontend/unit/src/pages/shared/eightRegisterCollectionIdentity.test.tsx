import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrincipalQueryBoundary } from '@/contexts/PrincipalQueryBoundary';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';
import { riskHubKeys } from '@/lib/queryKeys';
import { parseAssetSemanticFilters, parseProcessSemanticFilters, parseRiskSemanticFilters, parseVendorSemanticFilters } from '@/pages/shared/ictRegisterSemanticFilters';
import { useIctRegisterSemanticPageState } from '@/pages/shared/useIctRegisterPageState';
import { useAssetsPageState } from '@/pages/assets/useAssetsPageState';
import { useControlsPageState } from '@/pages/controls/useControlsPageState';
import { useIssuesPageState } from '@/pages/issues/useIssuesPageState';
import { useKrisPageState } from '@/pages/kris/useKrisPageState';
import { useProcessesPageState } from '@/pages/processes/useProcessesPageState';
import { useRisksPageState } from '@/pages/risks/useRisksPageState';
import { useThreatsPageState } from '@/pages/threats/useThreatsPageState';
import { useVendorsPageState } from '@/pages/vendors/useVendorsPageState';
import { ApiClientError } from '@/services/apiClient';
import { applyBootstrappedSession } from '@/services/session';
import { mockAuthUser } from '@test/mocks/handlers';
import { createTestQueryClient } from '@test/queryClient';

interface RegisterRequestParams {
    search?: string;
    offset?: number;
    sort?: { field: string; direction: 'asc' | 'desc' };
    department_id?: number;
    department_ids?: number[];
}

type FetchRegister = (params: RegisterRequestParams) => Promise<typeof populatedPage>;

const apiMocks = vi.hoisted(() => ({
    getAssets: vi.fn<FetchRegister>(),
    getConfigValue: vi.fn(),
    getControls: vi.fn<FetchRegister>(),
    getIssues: vi.fn<FetchRegister>(),
    getKris: vi.fn<FetchRegister>(),
    getProcesses: vi.fn<FetchRegister>(),
    getRisks: vi.fn<FetchRegister>(),
    getThreats: vi.fn<FetchRegister>(),
    getVendors: vi.fn<FetchRegister>(),
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
    workingSet: {
        currentPage: number;
        setCurrentPage: (page: number) => void;
        updateSearch: (value: string) => void;
    };
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
    totalCount: number;
}

const EMPTY_RISK_SEMANTIC_FILTERS = {};

function useRiskCollectionState(): RegisterCollectionState {
    const { semanticFilters } = useIctRegisterSemanticPageState(parseRiskSemanticFilters);
    const state = useRisksPageState(semanticFilters);
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
    const { semanticFilters } = useIctRegisterSemanticPageState(parseProcessSemanticFilters);
    const state = useProcessesPageState(semanticFilters);
    return { ...state, refresh: state.fetchProcesses, restore: state.restoreProcess };
}

function useAssetCollectionState(): RegisterCollectionState {
    const { semanticFilters } = useIctRegisterSemanticPageState(parseAssetSemanticFilters);
    const state = useAssetsPageState(semanticFilters);
    return { ...state, refresh: state.fetchAssets, restore: state.restoreAsset };
}

function useThreatCollectionState(): RegisterCollectionState {
    const state = useThreatsPageState();
    return { ...state, refresh: state.fetchThreats, restore: state.restoreThreat };
}

function useVendorCollectionState(): RegisterCollectionState {
    const { semanticFilters } = useIctRegisterSemanticPageState(parseVendorSemanticFilters);
    const state = useVendorsPageState(semanticFilters);
    return { ...state, refresh: state.fetchVendors, restore: state.restoreVendor };
}

const REGISTERS: ReadonlyArray<{
    fetchMock: typeof apiMocks.getRisks;
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

/**
 * Every register's row restore reports through `useFeedback()` toasts (D9,
 * FB-01). Risk keeps its module copy; the rest use `common:outcome.*` with the
 * row's display name (KRI and Process rows here carry no `metric_name` /
 * `l1_process`, so they fall back to the generic title).
 */
const RESTORE_TOAST_TEXT: Readonly<Record<string, { failed: string; restored: string }>> = {
    Risk: { failed: 'The risk could not be restored.', restored: 'Risk restored successfully.' },
    KRI: { failed: 'The record could not be restored.', restored: 'Record restored' },
    Process: { failed: 'The record could not be restored.', restored: 'Record restored' },
};
const DEFAULT_RESTORE_TOAST_TEXT = { failed: 'The record could not be restored.', restored: 'Restored: Query A row' };
const TOAST_RESTORE_REGISTERS = RESTORABLE_REGISTERS.map((register) => ({
    ...register,
    toastText: RESTORE_TOAST_TEXT[register.name] ?? DEFAULT_RESTORE_TOAST_TEXT,
}));

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
            <button type="button" onClick={() => state.workingSet.setCurrentPage(2)}>page two</button>
            <button type="button" onClick={() => void state.refresh()}>refresh</button>
        </>
    );
}

async function actAndFlush(update: () => void) {
    await act(async () => {
        update();
        // Flush pending mocked responses as well as the synchronous state update.
        await Promise.resolve();
    });
}

function routeWrapper(path: string) {
    const queryClient = createTestQueryClient();
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[`${path}${path.includes('?') ? '&' : '?'}source=review`]}>
                    <FeedbackProvider>{children}</FeedbackProvider>
                </MemoryRouter>
            </QueryClientProvider>
        );
    };
}

describe('eight-register collection query identity', () => {
    afterEach(() => vi.useRealTimers());

    beforeEach(() => {
        vi.clearAllMocks();
        applyBootstrappedSession({ token: 'register-session', user: mockAuthUser });
        apiMocks.getConfigValue.mockResolvedValue(null);
        for (const register of REGISTERS) register.fetchMock.mockResolvedValue(populatedPage);
        for (const register of RESTORABLE_REGISTERS) register.restoreMock.mockResolvedValue(undefined);
    });

    it.each(REGISTERS)('$name sends only the final debounced search request', async ({ fetchMock, path, useCollectionState }) => {
        const { result } = renderHook(useCollectionState, { wrapper: routeWrapper(path) });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const initialRefresh = result.current.refresh;
        vi.useFakeTimers();

        const search = 'abcdefghijkl';
        for (let length = 1; length <= search.length; length += 1) {
            await actAndFlush(() => result.current.workingSet.updateSearch(search.slice(0, length)));
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(result.current.refresh).toBe(initialRefresh);
        }
        await act(async () => vi.advanceTimersByTimeAsync(299));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => vi.advanceTimersByTimeAsync(1));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.lastCall?.[0].search).toBe(search);
        expect(result.current.items).toHaveLength(1);

        await act(async () => result.current.refresh());
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.lastCall?.[0].search).toBe(search);
    });

    it.each(REGISTERS)('$name resets page once while typing and keeps Back/Forward live', async ({ fetchMock, path, useCollectionState }) => {
        const { result } = renderHook(() => ({ state: useCollectionState(), navigate: useNavigate() }), {
            wrapper: routeWrapper(path),
        });
        await waitFor(() => expect(result.current.state.isLoading).toBe(false));
        await actAndFlush(() => result.current.state.workingSet.setCurrentPage(2));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.lastCall?.[0].offset).toBe(DEFAULT_LIST_PAGE_SIZE);
        await act(async () => result.current.navigate(-1));
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.lastCall?.[0].offset).toBe(0);
        await act(async () => result.current.navigate(1));
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(fetchMock.mock.lastCall?.[0].offset).toBe(DEFAULT_LIST_PAGE_SIZE);

        vi.useFakeTimers();
        await actAndFlush(() => result.current.state.workingSet.updateSearch('a'));
        expect(result.current.state.workingSet.currentPage).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(5);
        expect(fetchMock.mock.lastCall?.[0].offset).toBe(0);
        await actAndFlush(() => result.current.state.workingSet.updateSearch('ab'));
        expect(fetchMock).toHaveBeenCalledTimes(5);
        await act(async () => vi.advanceTimersByTimeAsync(300));
        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(fetchMock.mock.lastCall?.[0]).toEqual(expect.objectContaining({ offset: 0, search: 'ab' }));
    });

    it.each(REGISTERS)('$name ignores unrelated URL changes but refreshes identical requests explicitly', async ({ fetchMock, path, useCollectionState }) => {
        const { result } = renderHook(() => ({ state: useCollectionState(), navigate: useNavigate() }), {
            wrapper: routeWrapper(path),
        });
        await waitFor(() => expect(result.current.state.isLoading).toBe(false));
        await act(async () => result.current.navigate(`${path}?source=other&filters={}`));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => result.current.state.refresh());
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toEqual(fetchMock.mock.calls[1][0]);
    });

    it.each(REGISTERS)('$name fetches changed sort criteria once and ignores recreated equivalent sort objects', async ({ fetchMock, name, path, useCollectionState }) => {
        const sortFields: Record<string, string> = { KRI: 'metric_name', Issue: 'title', Process: 'l1_process' };
        const sortField = sortFields[name] ?? 'name';
        const { result } = renderHook(() => ({ state: useCollectionState(), navigate: useNavigate() }), {
            wrapper: routeWrapper(path),
        });
        await waitFor(() => expect(result.current.state.isLoading).toBe(false));
        await act(async () => result.current.navigate(`${path}?sort=${sortField}:asc`));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.lastCall?.[0].sort).toEqual({ field: sortField, direction: 'asc' });
        await act(async () => result.current.navigate(`${path}?sort=${sortField}:asc&source=other`));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await act(async () => result.current.navigate(`${path}?sort=${sortField}:desc`));
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.lastCall?.[0].sort).toEqual({ field: sortField, direction: 'desc' });
    });

    it.each(REGISTERS)('$name ignores superseded success and denial after A to B to A navigation', async ({ fetchMock, path, useCollectionState }) => {
        const { result } = renderHook(useCollectionState, { wrapper: routeWrapper(path) });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const oldA = deferred<typeof populatedPage>();
        const oldB = deferred<typeof populatedPage>();
        fetchMock.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(oldB.promise).mockResolvedValueOnce(queryBPage);
        act(() => { void result.current.refresh(); });
        await actAndFlush(() => result.current.workingSet.setCurrentPage(2));
        await actAndFlush(() => result.current.workingSet.setCurrentPage(1));
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(result.current.items).toEqual([expect.objectContaining({ id: 2 })]);
        await actAndFlush(() => {
            oldA.resolve(populatedPage);
            oldB.reject(new ApiClientError({ status: 403, messageKey: 'errors.forbidden' }));
        });
        expect(result.current.items).toEqual([expect.objectContaining({ id: 2 })]);
        expect(result.current.isAccessDenied).toBe(false);
        expect(result.current.errorKey).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it.each(REGISTERS)('$name isolates the same request across principal remounts and late responses', async ({ fetchMock, path, useCollectionState }) => {
        const priorPrincipal = deferred<typeof populatedPage>();
        const currentPrincipal = deferred<typeof populatedPage>();
        fetchMock.mockReturnValueOnce(priorPrincipal.promise).mockReturnValueOnce(currentPrincipal.promise);
        const snapshots: CollectionLayoutSnapshot[] = [];
        const content = (principalId: number) => (
            <PrincipalQueryBoundary principalId={principalId}>
                <MemoryRouter initialEntries={[path]}>
                    <FeedbackProvider>
                        <CollectionLayoutProbe useCollectionState={useCollectionState} onLayout={(snapshot) => snapshots.push(snapshot)} />
                    </FeedbackProvider>
                </MemoryRouter>
            </PrincipalQueryBoundary>
        );
        const view = render(content(1));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        view.rerender(content(2));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        await actAndFlush(() => priorPrincipal.resolve(populatedPage));
        expect(screen.getByTestId('collection-row-count')).toHaveTextContent('0');
        await actAndFlush(() => currentPrincipal.resolve(queryBPage));
        expect(snapshots.at(-1)?.items).toEqual([expect.objectContaining(queryBPage.items[0])]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each(REGISTERS.filter(({ name }) => name !== 'Threat'))('$name responds only to effective department scope changes', async ({ fetchMock, path, useCollectionState }) => {
        const Wrapper = routeWrapper(path);
        const content = (departmentId: number, departmentName: string) => (
            <Wrapper>
                <DepartmentRegisterScopeProvider value={{ departmentId, departmentName }}>
                    <CollectionLayoutProbe useCollectionState={useCollectionState} onLayout={() => undefined} />
                </DepartmentRegisterScopeProvider>
            </Wrapper>
        );
        const view = render(content(7, 'Finance'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        await actAndFlush(() => view.rerender(content(7, 'Renamed department')));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await actAndFlush(() => view.rerender(content(8, 'Operations')));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const params = fetchMock.mock.lastCall?.[0];
        expect(params?.department_id ?? params?.department_ids).toEqual(params?.department_id ? 8 : [8]);
    });

    it.each(REGISTERS.filter(({ name }) => ['Risk', 'Asset', 'Process', 'Vendor'].includes(name)))('$name refetches changed semantic scope once', async ({ fetchMock, name, path, useCollectionState }) => {
        const scopes: Record<string, { query: string; expected: object }> = {
            Risk: { query: 'ict_linked=true&committee_scope=true', expected: { ict_linked: true, lifecycle: 'all' } },
            Asset: { query: 'has_process_link=true&committee_scope=true', expected: { has_process_link: true, lifecycle: ['active', 'archived'] } },
            Process: { query: 'cif=true', expected: { cif: true } },
            Vendor: { query: 'has_roi_contract=true&committee_scope=true', expected: { has_roi_contract: true, lifecycle: ['active', 'archived'] } },
        };
        const scope = scopes[name];
        const { result } = renderHook(() => ({ state: useCollectionState(), navigate: useNavigate() }), {
            wrapper: routeWrapper(path),
        });
        await waitFor(() => expect(result.current.state.isLoading).toBe(false));
        await act(async () => result.current.navigate(`${path}?${scope.query}`));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.lastCall?.[0]).toEqual(expect.objectContaining(scope.expected));
        await act(async () => result.current.navigate(`${path}?source=other&${scope.query}`));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([false, true])('Risk preserves threshold-context refresh semantics (filtered: %s)', async (filtered) => {
        const queryClient = createTestQueryClient();
        queryClient.setQueryData(riskHubKeys.thresholdsPublic(), { critical: 16, high: 10, medium: 5 });
        const path = filtered ? '/risks?filters={"critical":true}' : '/risks';
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[path]}><FeedbackProvider>{children}</FeedbackProvider></MemoryRouter>
            </QueryClientProvider>
        );
        const { result } = renderHook(useRiskCollectionState, { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(apiMocks.getRisks).toHaveBeenCalledTimes(1);
        await act(async () => {
            queryClient.setQueryData(riskHubKeys.thresholdsPublic(), { critical: 17, high: 11, medium: 6 });
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await waitFor(() => expect(apiMocks.getRisks).toHaveBeenCalledTimes(filtered ? 2 : 1));
        // Thresholds own the classified response even though the request stays critical=true.
        if (filtered) expect(apiMocks.getRisks.mock.calls[1][0]).toEqual(apiMocks.getRisks.mock.calls[0][0]);
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

            act(() => result.current.workingSet.setCurrentPage(2));
            await waitFor(() => expect(result.current.workingSet.currentPage).toBe(2));
            await waitFor(() => expect(result.current.isLoading).toBe(true));
            await act(async () => {
                restore.resolve();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.items).toEqual([]);
            expect(result.current.errorKey).toBeNull();
            expect(result.current.isLoading).toBe(true);
            await actAndFlush(() => { queryB.resolve(queryBPage); });
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

            act(() => result.current.workingSet.setCurrentPage(2));
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

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect((result.current.items[0] as { id?: number } | undefined)?.id).toBe(3);
            expect(result.current.errorKey).toBeNull();
        },
    );

    it.each(TOAST_RESTORE_REGISTERS)(
        '$name reports a restore failure as an error toast and keeps the register usable',
        async ({ fetchMock, path, restoreMock, toastText, useCollectionState }) => {
            restoreMock.mockRejectedValueOnce(new ApiClientError({ status: 500, messageKey: 'errorKeys.server' }));
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));
            const fetchesBeforeRestore = fetchMock.mock.calls.length;

            await act(async () => { await result.current.restore?.(1); });

            expect(result.current.items).toHaveLength(1);
            expect(result.current.errorKey).toBeNull();
            expect(fetchMock.mock.calls).toHaveLength(fetchesBeforeRestore);
            const toast = (await screen.findByText(toastText.failed)).closest('li');
            expect(toast).toHaveAttribute('data-tone', 'danger');
            expect(toast).toHaveTextContent('Server error. Please try again later.');
        },
    );

    it.each(TOAST_RESTORE_REGISTERS)(
        '$name confirms a successful restore with a success toast',
        async ({ path, toastText, useCollectionState }) => {
            const { result } = renderHook(() => useCollectionState(), { wrapper: routeWrapper(path) });
            await waitFor(() => expect(result.current.items).toHaveLength(1));

            await act(async () => { await result.current.restore?.(1); });

            const toast = (await screen.findByText(toastText.restored)).closest('li');
            expect(toast).toHaveAttribute('data-tone', 'success');
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

            act(() => result.current.state.workingSet.setCurrentPage(2));

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
            change: (state: ReturnType<typeof useRisksPageState>) => state.workingSet.updateSearch('claims'),
            name: 'search',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.updateFilter('lifecycle', 'archived'),
            name: 'filter',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.workingSet.updateSort('name', 'asc'),
            name: 'sort',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.workingSet.updateViewMode('department'),
            name: 'view',
            path: '/risks?source=review',
        },
        {
            change: (state: ReturnType<typeof useRisksPageState>) => state.workingSet.selectGroup('department:7'),
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
