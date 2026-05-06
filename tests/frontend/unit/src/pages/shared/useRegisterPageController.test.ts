import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const debouncedSearchState = vi.hoisted(() => ({ value: '' }));

vi.mock('@/hooks/useDebouncedValue', () => ({
    useDebouncedValue: () => debouncedSearchState.value,
}));

import { resolveRegisterFilterPatch, useRegisterPageController } from '@/pages/shared/useRegisterPageController';

interface IssueLikeFilters {
    includeClosed: boolean;
    ownerId: string;
    statusFilter: string;
}

const initialFilters: IssueLikeFilters = {
    includeClosed: false,
    ownerId: '',
    statusFilter: '',
};

describe('resolveRegisterFilterPatch', () => {
    it('applies filter reactions with the explicit changed field', () => {
        const patch = resolveRegisterFilterPatch<IssueLikeFilters>({
            currentFilters: initialFilters,
            key: 'statusFilter',
            resolveFilterPatch: ({ key, value }) => (
                key === 'statusFilter' && value === 'closed' ? { includeClosed: true } : {}
            ),
            value: 'closed',
        });

        expect(patch).toEqual({
            includeClosed: true,
            statusFilter: 'closed',
        });
    });

    it('lets reactions clear coupled filters from current state', () => {
        const patch = resolveRegisterFilterPatch<IssueLikeFilters>({
            currentFilters: {
                ...initialFilters,
                includeClosed: true,
                statusFilter: 'closed',
            },
            key: 'includeClosed',
            resolveFilterPatch: ({ currentFilters, key, value }) => (
                key === 'includeClosed' && value === false && currentFilters.statusFilter === 'closed'
                    ? { statusFilter: '' }
                    : {}
            ),
            value: false,
        });

        expect(patch).toEqual({
            includeClosed: false,
            statusFilter: '',
        });
    });
});

describe('useRegisterPageController', () => {
    it('loads from debounced search only while preserving raw search for export', async () => {
        debouncedSearchState.value = '';
        const loadPage = vi.fn().mockResolvedValue({
            capabilities: null,
            groups: [],
            items: [],
            total: 0,
        });
        const submitExport = vi.fn().mockResolvedValue(undefined);

        const { result, rerender } = renderHook(() => useRegisterPageController({
            fallbackErrorKey: 'errors.load_failed',
            getGroupBy: () => null,
            initialFilters: { statusFilter: '' },
            initialViewMode: 'all',
            loadPage,
            submitExport,
        }));

        await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
        expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ debouncedSearch: '' }));

        await act(async () => {
            result.current.updateSearch('vendor');
        });

        expect(result.current.search).toBe('vendor');
        expect(loadPage).toHaveBeenCalledTimes(1);

        debouncedSearchState.value = 'vendor';
        rerender();

        await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
        expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ debouncedSearch: 'vendor' }));

        await act(async () => {
            await result.current.handleExport({ format: 'csv', asOfDate: '2026-05-06' });
        });

        expect(submitExport).toHaveBeenCalledWith(expect.objectContaining({
            debouncedSearch: 'vendor',
            search: 'vendor',
        }));
    });
});
