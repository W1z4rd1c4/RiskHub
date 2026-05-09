import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useResourcePanelQuery } from '@/hooks/useResourcePanelQuery';

interface FakeItem {
    id: number;
    name: string;
}

const def = {
    queryKey: ['fake', 'list'] as const,
    list: vi.fn(async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]),
    create: vi.fn(async (payload: { name: string }) => ({ id: 3, name: payload.name })),
    update: vi.fn(async (id: number, payload: { name: string }) => ({ id, name: payload.name })),
    remove: vi.fn(async () => undefined),
    restore: vi.fn(async (id: number) => ({ id, name: `restored-${id}` })),
};

function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
        defaultOptions: {
            mutations: { retry: false },
            queries: { retry: false },
        },
    });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    (['list', 'create', 'update', 'remove', 'restore'] as const).forEach((key) => def[key].mockClear());
});

describe('useResourcePanelQuery contract', () => {
    it('loads items through the list adapter', async () => {
        const { result } = renderHook(
            () => useResourcePanelQuery<FakeItem, { name: string }, { name: string }>(def),
            { wrapper },
        );
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toHaveLength(2);
    });

    it('handleSave creates then updates', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleSave({ id: undefined, payload: { name: 'C' } });
        });
        expect(def.create).toHaveBeenCalledOnce();

        await act(async () => {
            await result.current.handleSave({ id: 1, payload: { name: 'A2' } });
        });
        expect(def.update).toHaveBeenCalledOnce();
    });

    it('handleDelete invokes remove', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleDelete(1);
        });
        expect(def.remove).toHaveBeenCalledWith(1);
    });

    it('handleRestore invokes restore', async () => {
        const { result } = renderHook(() => useResourcePanelQuery(def), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleRestore(1);
        });
        expect(def.restore).toHaveBeenCalledWith(1);
    });
});
