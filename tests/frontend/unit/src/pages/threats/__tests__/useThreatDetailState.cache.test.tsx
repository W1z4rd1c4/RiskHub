import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useThreatDetailState } from '@/pages/threats/useThreatDetailState';
import type { Threat } from '@/types/threat';

const originalThreat: Threat = {
    id: 7,
    name: 'Credential theft',
    threat_steward_user_id: 10,
    stewardship_status: 'assigned',
    category: null,
    description: null,
    typical_weaknesses: null,
    relevant_subject: null,
    notes: null,
    is_archived: false,
    archived_at: null,
    archived_by_id: null,
    capabilities: {
        can_read: true,
        can_update: true,
        can_archive: true,
        can_restore: false,
    },
    created_at: '2026-07-15T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
};

const mockGetThreat = vi.fn();

vi.mock('@/services/threatApi', () => ({
    threatApi: {
        getThreat: (...args: unknown[]) => mockGetThreat(...args),
        restoreThreat: vi.fn(),
    },
}));

function createWrapper(client: QueryClient) {
    return function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                <MemoryRouter initialEntries={['/threats/7/edit']}>
                    <Routes>
                        <Route path="/threats/:id/edit" element={children} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );
    };
}

describe('useThreatDetailState edit cache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetThreat.mockResolvedValue(originalThreat);
    });

    it('replaces the pre-edit detail snapshot with the saved Threat', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const { result } = renderHook(
            () => useThreatDetailState({ mode: 'edit', notFoundMessage: 'not found' }),
            { wrapper: createWrapper(client) },
        );

        await waitFor(() => expect(result.current.threat?.category).toBeNull());

        const savedThreat: Threat = {
            ...originalThreat,
            category: 'integrity',
            relevant_subject: 'CISO-owned ICT service',
            updated_at: '2026-07-15T10:05:00Z',
        };
        act(() => result.current.setThreat(savedThreat));

        await waitFor(() => {
            expect(result.current.threat?.category).toBe('integrity');
            expect(result.current.threat?.relevant_subject).toBe('CISO-owned ICT service');
        });
        expect(mockGetThreat).toHaveBeenCalledTimes(1);
    });
});
