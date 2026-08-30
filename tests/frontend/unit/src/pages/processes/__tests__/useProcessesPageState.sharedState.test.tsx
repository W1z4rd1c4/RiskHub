import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProcessesPageState } from '@/pages/processes/useProcessesPageState';
import { ApiClientError } from '@/services/apiClient';
import type { Process, ProcessListResponse, ProcessPendingCreationRead } from '@/types/process';

const mocks = vi.hoisted(() => ({
    downloadExport: vi.fn(),
    getProcesses: vi.fn(),
    restoreProcess: vi.fn(),
}));

vi.mock('@/services/processApi', () => ({ processApi: mocks }));

const process = (id: number, name: string) => ({ id, l1_process: name }) as Process;
const pendingCreation = {
    approval_id: 41,
    proposal_id: 'proposal-41',
    proposal_version: 1,
    status: 'pending_creation',
    requested_at: '2026-08-30T08:00:00Z',
    requested_by_name: 'Requester',
    reason: 'Add the payments process',
    proposed: {},
    derived: { cif: 'No' },
    capabilities: { can_view_diff: true, can_cancel: true, is_requester: true, can_resolve: false },
} as ProcessPendingCreationRead;

const page = (id: number, name: string, pending = [] as ProcessPendingCreationRead[]): ProcessListResponse => ({
    items: [process(id, name)],
    total: 1,
    offset: 0,
    limit: 50,
    groups: [{ value: 'department:7', label: 'Operations', count: 1 }],
    facets: {
        criticality: [{ value: 'critical', label: 'critical', count: 1, disabled: false, selected: false }],
    },
    capabilities: { can_create: true, can_export: true },
    pending_creations: pending,
});

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/processes']}>{children}</MemoryRouter>
);

describe('useProcessesPageState shared collection state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getProcesses.mockResolvedValue(page(1, 'Process one'));
    });

    it('clears rows, groups, facets, and capabilities after access is denied', async () => {
        mocks.getProcesses.mockResolvedValueOnce(page(1, 'Process one', [pendingCreation]));
        const { result } = renderHook(() => useProcessesPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));
        expect(result.current.pendingCreations).toEqual([pendingCreation]);

        mocks.getProcesses.mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errors.forbidden',
        }));
        await act(async () => {
            await result.current.fetchProcesses();
        });

        expect(result.current.isAccessDenied).toBe(true);
        expect(result.current.items).toEqual([]);
        expect(result.current.groups).toEqual([]);
        expect(result.current.facets).toEqual({});
        expect(result.current.capabilities).toBeNull();
        expect(result.current.hasLoadedOnce).toBe(false);
        expect(result.current.pendingCreations).toEqual([]);
    });

    it('keeps the newest result when an older request completes last', async () => {
        let resolveFirst: ((value: ProcessListResponse) => void) | undefined;
        mocks.getProcesses.mockImplementationOnce(() => new Promise<ProcessListResponse>((resolve) => {
            resolveFirst = resolve;
        }));
        const { result } = renderHook(() => useProcessesPageState(), { wrapper });
        await waitFor(() => expect(mocks.getProcesses).toHaveBeenCalledTimes(1));

        mocks.getProcesses.mockResolvedValueOnce(page(2, 'Newest process'));
        await act(async () => {
            await result.current.fetchProcesses();
        });
        expect(result.current.items[0]?.l1_process).toBe('Newest process');

        await act(async () => {
            resolveFirst?.(page(1, 'Stale process'));
            await Promise.resolve();
        });
        expect(result.current.items[0]?.l1_process).toBe('Newest process');
    });

    it('keeps pending creations when the same query transiently fails', async () => {
        mocks.getProcesses.mockResolvedValueOnce(page(1, 'Process one', [pendingCreation]));
        const { result } = renderHook(() => useProcessesPageState(), { wrapper });
        await waitFor(() => expect(result.current.pendingCreations).toEqual([pendingCreation]));

        mocks.getProcesses.mockRejectedValueOnce(new ApiClientError({
            status: 500,
            messageKey: 'errors.server',
        }));
        await act(async () => { await result.current.fetchProcesses(); });

        expect(result.current.pendingCreations).toEqual([pendingCreation]);
        expect(result.current.items[0]?.l1_process).toBe('Process one');
    });

    it('clears pending creations when a different query fails', async () => {
        mocks.getProcesses.mockResolvedValueOnce(page(1, 'Process one', [pendingCreation]));
        const urlWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={['/processes?source=review']}>{children}</MemoryRouter>
        );
        const { result } = renderHook(() => useProcessesPageState(), { wrapper: urlWrapper });
        await waitFor(() => expect(result.current.pendingCreations).toEqual([pendingCreation]));

        mocks.getProcesses.mockRejectedValueOnce(new ApiClientError({
            status: 500,
            messageKey: 'errors.server',
        }));
        act(() => result.current.setCurrentPage(2));

        await waitFor(() => expect(result.current.errorKey).not.toBeNull());
        expect(result.current.pendingCreations).toEqual([]);
    });

    it('propagates export failure without replacing the register outcome', async () => {
        const failure = new ApiClientError({ status: 500, messageKey: 'errorKeys.server' });
        mocks.downloadExport.mockRejectedValueOnce(failure);
        const { result } = renderHook(() => useProcessesPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));

        await act(async () => {
            await expect(result.current.exportProcesses()).rejects.toBe(failure);
        });

        expect(result.current.items[0]?.l1_process).toBe('Process one');
        expect(result.current.errorKey).toBeNull();
        expect(result.current.isExporting).toBe(false);
    });

    it('restores shared URL state and clears page/group when a filter changes', async () => {
        const urlWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={[
                '/processes?source=audit&page=9&view=department&group=department%3A7&q=payments',
            ]}>
                {children}
            </MemoryRouter>
        );
        const { result } = renderHook(() => ({
            location: useLocation(),
            state: useProcessesPageState(),
        }), { wrapper: urlWrapper });
        await waitFor(() => expect(result.current.state.viewMode).toBe('department'));
        expect(result.current.state.currentPage).toBe(9);
        expect(result.current.state.search).toBe('payments');
        expect(result.current.state.selectedGroupValue).toBe('department:7');

        act(() => {
            result.current.state.updateFilter('criticality', ['critical']);
        });
        await waitFor(() => expect(result.current.location.search).toContain('filters='));
        const params = new URLSearchParams(result.current.location.search);
        expect(params.get('source')).toBe('audit');
        expect(params.has('page')).toBe(false);
        expect(params.has('group')).toBe(false);
        expect(params.get('view')).toBe('department');
        expect(JSON.parse(params.get('filters') ?? '{}')).toEqual({ criticality: ['critical'] });
    });

    it('pushes page choices so browser Back and Forward restore the prior page', async () => {
        const urlWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={['/processes?page=2&source=audit']}>{children}</MemoryRouter>
        );
        const { result } = renderHook(() => ({
            location: useLocation(),
            navigate: useNavigate(),
            state: useProcessesPageState(),
        }), { wrapper: urlWrapper });
        await waitFor(() => expect(result.current.state.currentPage).toBe(2));

        act(() => result.current.state.setCurrentPage(4));
        await waitFor(() => expect(result.current.location.search).toContain('page=4'));
        expect(result.current.location.search).toContain('source=audit');

        act(() => result.current.navigate(-1));
        await waitFor(() => expect(result.current.state.currentPage).toBe(2));
        act(() => result.current.navigate(1));
        await waitFor(() => expect(result.current.state.currentPage).toBe(4));
    });

    it('replaces an invalid page without adding a Back entry', async () => {
        const urlWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter
                initialEntries={['/processes?marker=before', '/processes?page=oops&source=audit']}
                initialIndex={1}
            >
                {children}
            </MemoryRouter>
        );
        const { result } = renderHook(() => ({
            location: useLocation(),
            navigate: useNavigate(),
            state: useProcessesPageState(),
        }), { wrapper: urlWrapper });
        await waitFor(() => expect(result.current.location.search).toBe('?source=audit'));
        expect(result.current.state.currentPage).toBe(1);

        act(() => result.current.navigate(-1));
        await waitFor(() => expect(result.current.location.search).toBe('?marker=before'));
    });

    it('pushes a discrete filter change and resets its page', async () => {
        const urlWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter
                initialEntries={['/processes?marker=before', '/processes?page=3&source=audit']}
                initialIndex={1}
            >
                {children}
            </MemoryRouter>
        );
        const { result } = renderHook(() => ({
            location: useLocation(),
            navigate: useNavigate(),
            state: useProcessesPageState(),
        }), { wrapper: urlWrapper });
        await waitFor(() => expect(result.current.state.currentPage).toBe(3));

        act(() => result.current.state.updateFilter('criticality', ['critical']));
        await waitFor(() => expect(result.current.location.search).toContain('filters='));
        expect(result.current.location.search).not.toContain('page=');

        act(() => result.current.navigate(-1));
        await waitFor(() => expect(result.current.location.search).toContain('page=3'));
    });

    it('replaces a search change and resets its page without adding a Back entry', async () => {
        const urlWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter
                initialEntries={['/processes?marker=before', '/processes?page=3&source=audit']}
                initialIndex={1}
            >
                {children}
            </MemoryRouter>
        );
        const { result } = renderHook(() => ({
            location: useLocation(),
            navigate: useNavigate(),
            state: useProcessesPageState(),
        }), { wrapper: urlWrapper });
        await waitFor(() => expect(result.current.state.currentPage).toBe(3));

        act(() => result.current.state.updateSearch('payments'));
        await waitFor(() => expect(result.current.location.search).toBe('?source=audit&q=payments'));

        act(() => result.current.navigate(-1));
        await waitFor(() => expect(result.current.location.search).toBe('?marker=before'));
    });
});
