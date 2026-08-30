import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useThreatsPageState } from '@/pages/threats/useThreatsPageState';
import { ApiClientError } from '@/services/apiClient';
import type { ThreatListItem, ThreatListResponse } from '@/types/threat';

const mocks = vi.hoisted(() => ({
    downloadExport: vi.fn(),
    getThreats: vi.fn(),
    restoreThreat: vi.fn(),
}));

vi.mock('@/services/threatApi', () => ({ threatApi: mocks }));

const threat = (id: number, name: string) => ({ id, name, visible_linked_risk_count: 0 }) as ThreatListItem;
const page = (id: number, name: string): ThreatListResponse => ({
    items: [threat(id, name)],
    total: 1,
    offset: 0,
    limit: 50,
    groups: [{ value: 'category:availability', label: 'availability', count: 1 }],
    facets: {
        category: [{ value: 'availability', label: 'availability', count: 1, disabled: false, selected: false }],
    },
    capabilities: { can_create: true, can_export: true },
});

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/threats']}>{children}</MemoryRouter>
);

describe('useThreatsPageState shared collection state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getThreats.mockResolvedValue(page(1, 'Threat one'));
    });

    it('clears rows, groups, facets, and capabilities on a 403 response', async () => {
        const { result } = renderHook(() => useThreatsPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));

        mocks.getThreats.mockRejectedValueOnce(new ApiClientError({
            status: 403,
            messageKey: 'errors.forbidden',
        }));
        await act(async () => {
            await result.current.fetchThreats();
        });

        expect(result.current.isAccessDenied).toBe(true);
        expect(result.current.items).toEqual([]);
        expect(result.current.groups).toEqual([]);
        expect(result.current.facets).toEqual({});
        expect(result.current.capabilities).toBeNull();
        expect(result.current.hasLoadedOnce).toBe(false);
    });

    it('keeps the newest list when an older request resolves last', async () => {
        let resolveFirst: ((value: ThreatListResponse) => void) | undefined;
        mocks.getThreats.mockImplementationOnce(() => new Promise<ThreatListResponse>((resolve) => {
            resolveFirst = resolve;
        }));
        const { result } = renderHook(() => useThreatsPageState(), { wrapper });
        await waitFor(() => expect(mocks.getThreats).toHaveBeenCalledTimes(1));

        mocks.getThreats.mockResolvedValueOnce(page(2, 'Newest threat'));
        await act(async () => {
            await result.current.fetchThreats();
        });
        expect(result.current.items[0]?.name).toBe('Newest threat');

        await act(async () => {
            resolveFirst?.(page(1, 'Stale threat'));
            await Promise.resolve();
        });
        expect(result.current.items[0]?.name).toBe('Newest threat');
    });

    it('propagates export failure without replacing the register outcome', async () => {
        const failure = new ApiClientError({ status: 500, messageKey: 'errorKeys.server' });
        mocks.downloadExport.mockRejectedValueOnce(failure);
        const { result } = renderHook(() => useThreatsPageState(), { wrapper });
        await waitFor(() => expect(result.current.items).toHaveLength(1));

        await act(async () => {
            await expect(result.current.exportThreats()).rejects.toBe(failure);
        });

        expect(result.current.items[0]?.name).toBe('Threat one');
        expect(result.current.errorKey).toBeNull();
        expect(result.current.isExporting).toBe(false);
    });

    it('restores shared URL state, preserves unrelated parameters, and removes page/group on filters', async () => {
        const urlWrapper = ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={[
                '/threats?source=audit&page=9&view=linked_risk&group=risk%3A7&q=weakness',
            ]}>
                {children}
            </MemoryRouter>
        );
        const { result } = renderHook(() => ({
            location: useLocation(),
            state: useThreatsPageState(),
        }), { wrapper: urlWrapper });
        await waitFor(() => expect(result.current.state.viewMode).toBe('linked_risk'));
        expect(result.current.state.search).toBe('weakness');
        expect(result.current.state.selectedGroupValue).toBe('risk:7');

        act(() => {
            result.current.state.updateFilter('categories', ['integrity']);
        });
        await waitFor(() => expect(result.current.location.search).toContain('filters='));
        const params = new URLSearchParams(result.current.location.search);
        expect(params.get('source')).toBe('audit');
        expect(params.has('page')).toBe(false);
        expect(params.has('group')).toBe(false);
        expect(params.get('view')).toBe('linked_risk');
        expect(JSON.parse(params.get('filters') ?? '{}')).toEqual({ categories: ['integrity'] });
    });
});
