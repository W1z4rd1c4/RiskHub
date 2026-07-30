import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApprovalScenarios = vi.fn();

vi.mock('@/services/riskHubApi', () => ({
    riskHubApi: {
        getApprovalScenarios: (...args: unknown[]) => getApprovalScenarios(...args),
    },
}));

import { useAccountabilityReassignmentScenario } from '@/hooks/useAccountabilityReassignmentScenario';

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAccountabilityReassignmentScenario', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        [true, true],
        [false, false],
    ])('uses the live backend enabled state (%s)', async (requiresApproval, expected) => {
        getApprovalScenarios.mockResolvedValue([{
            key: 'accountability_reassignment',
            requires_approval: requiresApproval,
        }]);
        const { result } = renderHook(() => useAccountabilityReassignmentScenario(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isEnabled).toBe(expected);
        expect(result.current.isError).toBe(false);
    });

    it('projects independently applicable protected-edit scenarios from the same response', async () => {
        getApprovalScenarios.mockResolvedValue([
            {
                key: 'accountability_reassignment',
                requires_approval: false,
            },
            {
                key: 'protected_asset_edit',
                requires_approval: true,
            },
            {
                key: 'protected_vendor_edit',
                requires_approval: false,
            },
        ]);
        const { result } = renderHook(() => useAccountabilityReassignmentScenario(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.requiresApproval('protected_asset_edit')).toBe(true);
        expect(result.current.requiresApproval('protected_vendor_edit')).toBe(false);
        expect(getApprovalScenarios).toHaveBeenCalledTimes(1);
    });

    it('does not speculate that approval is enabled while the live query is loading', () => {
        getApprovalScenarios.mockReturnValue(new Promise(() => {}));
        const { result } = renderHook(() => useAccountabilityReassignmentScenario(), { wrapper });
        expect(result.current).toMatchObject({
            isEnabled: false,
            isLoading: true,
            isError: false,
        });
    });

    it('does not invent an enabled fallback when the live query fails', async () => {
        getApprovalScenarios.mockRejectedValue(new Error('unavailable'));
        const { result } = renderHook(() => useAccountabilityReassignmentScenario(), { wrapper });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.isEnabled).toBe(false);
        expect(result.current.isLoading).toBe(false);
    });
});
