import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
    buildRiskHubConfigActionModel,
    useRiskHubConfigResource,
} from '@/components/riskhub/useRiskHubConfigResource';

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        toUiMessageKey: () => 'errors.failed',
    },
}));

type TestItem = {
    id: number;
    name: string;
};

function renderResourceHarness(deleteResource: (id: number) => Promise<void>) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    function Harness() {
        const resource = useRiskHubConfigResource<TestItem, TestItem, TestItem>({
            queryKey: ['testResource'],
            load: async () => [{ id: 7, name: 'Retained item' }],
            create: async (item) => item,
            update: async (_id, item) => item,
            delete: deleteResource,
            itemId: (item) => item.id,
        });
        const item = resource.items[0];

        return (
            <div>
                <div data-testid="confirm-name">{resource.deleteConfirm?.name ?? ''}</div>
                <div data-testid="action-error">{resource.actionErrorKey ?? ''}</div>
                {item ? (
                    <button type="button" onClick={() => resource.requestDelete(item)}>
                        Request delete
                    </button>
                ) : null}
                <button type="button" onClick={() => void resource.handleDelete()}>
                    Confirm delete
                </button>
            </div>
        );
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    return render(<Harness />, { wrapper });
}

describe('useRiskHubConfigResource', () => {
    it('builds shared action models with create authority and disabled reasons', () => {
        expect(buildRiskHubConfigActionModel({
            can_create: false,
            can_delete: true,
            can_restore: false,
            can_update: true,
        })).toMatchObject({
            canCreate: false,
            canDelete: true,
            canRestore: false,
            canUpdate: true,
            disabledReason: 'create_disabled',
        });
    });

    it('keeps delete confirmation open and sets the UI error key when delete fails', async () => {
        const deleteResource = vi.fn().mockRejectedValue(new Error('delete failed'));
        renderResourceHarness(deleteResource);

        await screen.findByRole('button', { name: 'Request delete' });
        fireEvent.click(screen.getByRole('button', { name: 'Request delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

        await waitFor(() => {
            expect(screen.getByTestId('action-error')).toHaveTextContent('errors.failed');
        });
        expect(screen.getByTestId('confirm-name')).toHaveTextContent('Retained item');
        expect(deleteResource).toHaveBeenCalledWith(7);
    });
});
