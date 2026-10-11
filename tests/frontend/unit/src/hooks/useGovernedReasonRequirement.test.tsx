import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGovernedReasonRequirement } from '@/hooks/useGovernedReasonRequirement';
import { assetApi } from '@/services/assetApi';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';

const session = vi.hoisted(() => ({ user: { id: 7 } }));
vi.mock('@/services/session', () => ({ useSessionSnapshot: () => session }));
vi.mock('@/services/assetApi', () => ({ assetApi: { getAsset: vi.fn() } }));
vi.mock('@/services/processApi', () => ({ processApi: { getProcess: vi.fn() } }));
vi.mock('@/services/vendorApi', () => ({ vendorApi: { getVendor: vi.fn() } }));
const no = { capabilities: { protected_change_requires_approval: false } };
const yes = { capabilities: { protected_change_requires_approval: true } };
function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('exact counterpart reason requirements', () => {
    beforeEach(() => { vi.resetAllMocks(); session.user.id = 7; });
    it.each(['asset', 'process', 'vendor'] as const)('loads a missing %s outside the option page without treating it as false', async (kind) => {
        const read = kind === 'asset' ? assetApi.getAsset : kind === 'process' ? processApi.getProcess : vendorApi.getVendor;
        let finish!: (value: never) => void;
        vi.mocked(read).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        const { result } = renderHook(() => useGovernedReasonRequirement([
            { kind: 'asset', id: 1, record: no }, { kind, id: 501 }, { kind, id: 501 },
        ], true), { wrapper: wrapper() });
        expect(result.current).toBe('unavailable');
        expect(read).toHaveBeenCalledExactlyOnceWith(501);
        await act(async () => finish(yes as never));
        await waitFor(() => expect(result.current).toBe('required'));
    });
    it('retains unavailable after a denied exact read and never supplies another permission route', async () => {
        vi.mocked(assetApi.getAsset).mockRejectedValue({ status: 403 });
        const { result } = renderHook(() => useGovernedReasonRequirement([
            { kind: 'vendor', id: 1, record: no }, { kind: 'asset', id: 501 },
        ], true), { wrapper: wrapper() });
        await waitFor(() => expect(assetApi.getAsset).toHaveBeenCalledOnce());
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
        expect(result.current).toBe('unavailable');
        expect(processApi.getProcess).not.toHaveBeenCalled();
        expect(vendorApi.getVendor).not.toHaveBeenCalled();
    });
    it('includes a displaced primary Process and allows known true even while another fact is missing', async () => {
        vi.mocked(processApi.getProcess).mockResolvedValue(yes as never);
        const { result } = renderHook(() => useGovernedReasonRequirement([
            { kind: 'asset', id: 1, record: no },
            { kind: 'process', id: 2, record: no },
            { kind: 'process', id: 3 },
        ], true), { wrapper: wrapper() });
        await waitFor(() => expect(result.current).toBe('required'));
        expect(processApi.getProcess).toHaveBeenCalledExactlyOnceWith(3);
    });
    it('keeps absent identifiers unavailable, avoids reads when closed, and honors known true', () => {
        const { result, rerender } = renderHook(({ record }) => useGovernedReasonRequirement([
            { kind: 'asset', id: 1, record }, { kind: 'process', id: undefined },
        ], false), { initialProps: { record: no }, wrapper: wrapper() });
        expect(result.current).toBe('unavailable');
        rerender({ record: yes });
        expect(result.current).toBe('required');
        expect(processApi.getProcess).not.toHaveBeenCalled();
    });
    it('does not reuse an exact counterpart response across session identities', async () => {
        vi.mocked(assetApi.getAsset).mockResolvedValueOnce(no as never).mockRejectedValueOnce({ status: 404 });
        const { result, rerender } = renderHook(() => useGovernedReasonRequirement([{ kind: 'asset', id: 501 }], true), { wrapper: wrapper() });
        await waitFor(() => expect(result.current).toBe('optional'));
        session.user.id = 8;
        rerender();
        expect(result.current).toBe('unavailable');
        await waitFor(() => expect(assetApi.getAsset).toHaveBeenCalledTimes(2));
    });
});
