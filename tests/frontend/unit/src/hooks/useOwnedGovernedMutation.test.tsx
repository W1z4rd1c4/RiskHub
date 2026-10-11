import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOwnedGovernedMutation } from '@/hooks/useOwnedGovernedMutation';
import { logError } from '@/services/logger';

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function wrapper() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
    return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('owned governed mutation continuation contract', () => {
    beforeEach(() => vi.clearAllMocks());
    it('captures nested payload and submitted callbacks before any await', async () => {
        const response = deferred<{ id: number }>();
        const first = vi.fn().mockReturnValue(response.promise);
        const later = vi.fn();
        const firstSuccess = vi.fn();
        const laterSuccess = vi.fn();
        const { result, rerender } = renderHook(({ execute, success }) => useOwnedGovernedMutation(1, {
            mutationFn: execute, onSuccess: success,
        }), { initialProps: { execute: first, success: firstSuccess }, wrapper: wrapper() });
        const payload = { target: 7, nested: { reason: 'submitted reason' } };
        let pending!: ReturnType<typeof result.current.mutateAsync>;
        act(() => { pending = result.current.mutateAsync(payload); });
        payload.target = 99;
        payload.nested.reason = 'later draft';
        rerender({ execute: later, success: laterSuccess });
        await waitFor(() => expect(first).toHaveBeenCalledExactlyOnceWith({ target: 7, nested: { reason: 'submitted reason' } }));
        await act(async () => { response.resolve({ id: 5 }); await pending; });
        expect(later).not.toHaveBeenCalled();
        expect(firstSuccess).toHaveBeenCalledOnce();
        expect(laterSuccess).not.toHaveBeenCalled();
    });
    it.each(['return', 'unmount'] as const)('discards old rejection after owner %s', async (change) => {
        const response = deferred<unknown>();
        const onError = vi.fn();
        const onSuccess = vi.fn();
        const { result, rerender, unmount } = renderHook(({ owner }) => useOwnedGovernedMutation(owner, {
            mutationFn: () => response.promise, onError, onSuccess,
        }), { initialProps: { owner: 1 }, wrapper: wrapper() });
        let pending!: ReturnType<typeof result.current.mutateAsync>;
        act(() => { pending = result.current.mutateAsync(); });
        if (change === 'return') { rerender({ owner: 2 }); rerender({ owner: 1 }); } else unmount();
        await act(async () => { response.reject(new Error('old rejection')); expect(await pending).toEqual({ kind: 'superseded' }); });
        expect(onError).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
    });
    it('preserves current rejection and reports it once to the current caller', async () => {
        const failure = new Error('current backend rejection');
        const onError = vi.fn();
        const onSuccess = vi.fn();
        const { result } = renderHook(() => useOwnedGovernedMutation(1, {
            mutationFn: async () => { throw failure; }, onError, onSuccess,
        }), { wrapper: wrapper() });
        await act(async () => { await expect(result.current.mutateAsync()).rejects.toBe(failure); });
        expect(onError).toHaveBeenCalledExactlyOnceWith(failure, undefined);
        expect(onSuccess).not.toHaveBeenCalled();
    });
    it('isolates a presentation exception after applied success from backend rejection', async () => {
        const failure = new Error('refresh failed after commit');
        const onError = vi.fn();
        const { result } = renderHook(() => useOwnedGovernedMutation(1, {
            mutationFn: async () => ({ id: 5 }),
            onSuccess: async () => { throw failure; }, onError,
        }), { wrapper: wrapper() });
        await act(async () => { await expect(result.current.mutateAsync()).resolves.toEqual({ kind: 'applied', response: { id: 5 } }); });
        expect(onError).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledExactlyOnceWith('Link outcome continuation failed:', failure);
    });
    it('fences post-refresh effects and keeps the new owner busy when the old continuation completes', async () => {
        const refresh = deferred<void>();
        const second = deferred<{ id: number }>();
        const afterRefresh = vi.fn();
        const refreshing = vi.fn();
        const { result, rerender } = renderHook(({ owner }) => useOwnedGovernedMutation(owner, {
            mutationFn: async () => owner === 1 ? { id: 1 } : second.promise,
            onSuccess: async (_outcome, _variables, isCurrent) => {
                if (owner === 1) { refreshing(); await refresh.promise; }
                if (isCurrent()) afterRefresh(owner);
            },
        }), { initialProps: { owner: 1 }, wrapper: wrapper() });
        let old!: ReturnType<typeof result.current.mutateAsync>;
        act(() => { old = result.current.mutateAsync(); });
        await waitFor(() => expect(refreshing).toHaveBeenCalledOnce());
        rerender({ owner: 2 });
        let current!: ReturnType<typeof result.current.mutateAsync>;
        act(() => { current = result.current.mutateAsync(); });
        await waitFor(() => expect(result.current.isPending).toBe(true));
        await act(async () => { refresh.resolve(); expect(await old).toEqual({ kind: 'superseded' }); });
        expect(afterRefresh).not.toHaveBeenCalled();
        expect(result.current.isPending).toBe(true);
        await act(async () => { second.resolve({ id: 2 }); await current; });
        expect(afterRefresh).toHaveBeenCalledExactlyOnceWith(2);
        await waitFor(() => expect(result.current.isPending).toBe(false));
    });
});
