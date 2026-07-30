import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAccountabilityReassignmentScenario } from '@/hooks/useAccountabilityReassignmentScenario';
import { setApiRuntimeOrigin } from '@/services/api/apiConfig';
import { riskHubApi } from '@/services/riskHubApi';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('accountability reassignment scenario API contract', () => {
    afterEach(() => {
        clearAccessToken();
        setApiRuntimeOrigin(window.location.origin);
        vi.restoreAllMocks();
    });

    it('loads form state through authenticated GET while scenario mutation remains denied to a non-CRO', async () => {
        setAccessToken('non-cro-user-token');
        setApiRuntimeOrigin('https://riskhub.example.test');

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = new URL(String(input));
            const method = init?.method ?? 'GET';
            const authorization = new Headers(init?.headers).get('Authorization');

            expect(authorization).toBe('Bearer non-cro-user-token');
            if (url.pathname === '/api/v1/riskhub/approval-scenarios' && method === 'GET') {
                return Promise.resolve(new Response(JSON.stringify([{
                    id: 4,
                    key: 'accountability_reassignment',
                    display_name: 'Accountability reassignment',
                    description: 'Protected accountability changes',
                    requires_approval: true,
                    approver_roles: ['CRO'],
                    fixed_policy: true,
                    fixed_policy_definition: {
                        threshold: 'accountable_user_or_owning_department_change',
                        covered_actions: ['edit'],
                        allow_self_approval: false,
                    },
                    updated_at: '2026-07-30T10:00:00Z',
                    updated_by_name: null,
                    capabilities: { can_update: false },
                }] satisfies unknown[]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }

            if (
                url.pathname === '/api/v1/riskhub/approval-scenarios/accountability_reassignment'
                && method === 'PATCH'
            ) {
                return Promise.resolve(new Response(JSON.stringify({ detail: 'Forbidden' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' },
                }));
            }

            throw new Error(`Unexpected request: ${method} ${url.pathname}`);
        });

        const { result } = renderHook(() => useAccountabilityReassignmentScenario(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current).toMatchObject({
            isEnabled: true,
            isError: false,
        });
        await expect(riskHubApi.updateApprovalScenario('accountability_reassignment', {
            requires_approval: false,
            approver_roles: ['CRO'],
        })).rejects.toMatchObject({ status: 403 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
