import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/services/apiClient';
import { combineCapabilityGateStates, useCreateCapabilityGate, type CapabilityState } from '@/pages/shared/useCreateCapabilityGate';

const allowed = { capabilities: { can_create: true } };
const denied = { capabilities: { can_create: false } };
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const options = { logMessage: 'Access check failed.' };

describe('capability read outcomes', () => {
    it.each([true, false, undefined])('only explicit true permits creation (%s)', async can_create => {
        const load = vi.fn().mockResolvedValue({ capabilities: { can_create } });
        const { result } = renderHook(() => useCreateCapabilityGate({ ...options, load }));
        expect(result.current.state).toBe('loading');
        await waitFor(() => expect(result.current.state).toBe(can_create === true ? 'allowed' : 'denied'));
    });
    it.each([401, 403, 404, 500, undefined])('classifies status %s and does not retry authoritative rejection', async status => {
        const load = vi.fn().mockRejectedValue(new ApiClientError({ status, messageKey: 'errors.request_failed' }));
        const { result } = renderHook(() => useCreateCapabilityGate({ ...options, load }));
        const state = status && status < 500 ? 'denied' : 'error';
        await waitFor(() => expect(result.current.state).toBe(state));
        if (state === 'denied') {
            act(() => result.current.retry());
            expect(load).toHaveBeenCalledTimes(1);
        }
    });
    it('prevents overlapping retries, remains closed while pending, and permits another retry after failure', async () => {
        const pending = deferred<typeof allowed>();
        const load = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(allowed);
        const { result } = renderHook(() => useCreateCapabilityGate({ ...options, load }));
        await waitFor(() => expect(result.current.state).toBe('error'));
        act(() => { result.current.retry(); result.current.retry(); });
        expect(result.current.state).toBe('loading');
        expect(load).toHaveBeenCalledTimes(2);
        act(() => result.current.retry());
        expect(load).toHaveBeenCalledTimes(2);
        await act(async () => pending.reject(new Error('still offline')));
        expect(result.current.state).toBe('error');
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.state).toBe('allowed'));
        expect(load).toHaveBeenCalledTimes(3);
    });
    it.each(['success', 'failure'])('ignores a late previous-route %s and withholds stale data', async outcome => {
        const first = deferred<typeof allowed>();
        const second = deferred<typeof denied>();
        const firstLoad = () => first.promise;
        const secondLoad = () => second.promise;
        const { result, rerender } = renderHook(({ load }) => useCreateCapabilityGate({ ...options, load }), { initialProps: { load: firstLoad } });
        rerender({ load: secondLoad });
        await act(async () => outcome === 'success' ? first.resolve(allowed) : first.reject(new Error('old')));
        expect(result.current.state).toBe('loading');
        expect(result.current.data).toBeUndefined();
        await act(async () => second.resolve(denied));
        expect(result.current.state).toBe('denied');
    });
    it('does not render an old allowed decision for a changed or reenabled gate', async () => {
        const load = vi.fn().mockResolvedValue(allowed);
        const next = () => new Promise<typeof allowed>(() => undefined);
        const { result, rerender } = renderHook(({ enabled, loader }) => useCreateCapabilityGate({ ...options, enabled, load: loader }), { initialProps: { enabled: true, loader: load as () => Promise<typeof allowed> } });
        await waitFor(() => expect(result.current.state).toBe('allowed'));
        rerender({ enabled: true, loader: next });
        expect(result.current.state).toBe('loading');
        expect(result.current.data).toBeUndefined();
        rerender({ enabled: false, loader: next });
        expect(result.current.state).toBe('allowed');
        rerender({ enabled: true, loader: next });
        expect(result.current.state).toBe('loading');
    });
});

describe('composed required gates', () => {
    const states: CapabilityState[] = ['allowed', 'error', 'loading', 'denied'];
    for (const left of states) for (const right of states) {
        const expected = states[Math.max(states.indexOf(left), states.indexOf(right))];
        it(`${left} + ${right} = ${expected}`, () => expect(combineCapabilityGateStates([left, right])).toBe(expected));
    }
});
