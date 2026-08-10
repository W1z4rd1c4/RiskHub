import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProcessDetailState } from '@/pages/processes/useProcessDetailState';
import type { Process } from '@/types/process';

const originalProcess: Process = {
    id: 7,
    f_code: 'F7',
    l0_area: 'Operations',
    l1_process: 'Claims',
    process_owner_user_id: 4,
    process_owner: {
        name: 'Clara Owner',
        email: 'clara@example.test',
        role_name: 'user',
        department_name: 'Operations',
    },
    owning_department_id: 2,
    owning_department: { name: 'Operations', code: 'OPS' },
    owner_orphaned: false,
    ownership_status: 'assigned',
    is_archived: false,
    capabilities: {
        can_read: true,
        can_update: true,
        can_archive: true,
        can_restore: false,
    },
    created_at: '2026-07-15T10:00:00Z',
    updated_at: '2026-07-15T10:00:00Z',
};

const mockGetProcess = vi.fn();

vi.mock('@/services/processApi', () => ({
    processApi: {
        getProcess: (...args: unknown[]) => mockGetProcess(...args),
        restoreProcess: vi.fn(),
    },
}));

function createWrapper(client: QueryClient) {
    return function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                <MemoryRouter initialEntries={['/processes/7/edit']}>
                    <Routes>
                        <Route path="/processes/:id/edit" element={children} />
                    </Routes>
                </MemoryRouter>
            </QueryClientProvider>
        );
    };
}

describe('useProcessDetailState edit cache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetProcess.mockResolvedValue(originalProcess);
    });

    it('replaces the pre-edit detail snapshot with the saved Process', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const { result } = renderHook(
            () => useProcessDetailState({ mode: 'edit', notFoundMessage: 'not found' }),
            { wrapper: createWrapper(client) },
        );

        await waitFor(() => expect(result.current.process?.preliminary_criticality).toBeUndefined());

        const savedProcess: Process = {
            ...originalProcess,
            preliminary_criticality: 'critical',
            updated_at: '2026-07-15T10:05:00Z',
        };
        act(() => result.current.setProcess(savedProcess));

        await waitFor(() => expect(result.current.process?.preliminary_criticality).toBe('critical'));
        expect(mockGetProcess).toHaveBeenCalledTimes(1);
    });
});
