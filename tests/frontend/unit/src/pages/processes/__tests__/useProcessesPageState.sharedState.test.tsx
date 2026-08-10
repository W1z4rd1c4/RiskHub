import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProcessesPageState } from '@/pages/processes/useProcessesPageState';
import { ApiClientError } from '@/services/apiClient';
import type { Process, ProcessListResponse } from '@/types/process';

const mocks = vi.hoisted(() => ({
    downloadExport: vi.fn(),
    getProcesses: vi.fn(),
    restoreProcess: vi.fn(),
}));

vi.mock('@/services/processApi', () => ({ processApi: mocks }));

const process = (id: number, name: string) => ({ id, l1_process: name }) as Process;
const page = (id: number, name: string): ProcessListResponse => ({
    items: [process(id, name)],
    total: 1,
    offset: 0,
    limit: 50,
    groups: [{ value: 'department:7', label: 'Operations', count: 1 }],
    facets: {
        criticality: [{ value: 'critical', label: 'critical', count: 1, disabled: false, selected: false }],
    },
    capabilities: { can_create: true, can_export: true },
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
        const { result } = renderHook(() => useProcessesPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));

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
});
