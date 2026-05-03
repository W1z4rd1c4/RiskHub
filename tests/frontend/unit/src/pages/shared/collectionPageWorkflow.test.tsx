import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCollectionPageWorkflow } from '@/pages/shared/collectionPageWorkflow';
import type { CollectionListResponse } from '@/types/collection';

interface ExampleItem {
    id: number;
    name: string;
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function WorkflowHarness({
    loadPage,
}: {
    loadPage: () => Promise<CollectionListResponse<ExampleItem>>;
}) {
    const workflow = useCollectionPageWorkflow<ExampleItem>({
        currentPage: 1,
        loadPage,
        fallbackErrorKey: 'errors.load_failed',
    });

    return (
        <div>
            <button type="button" onClick={() => void workflow.fetchCollection()}>
                load
            </button>
            <span data-testid="items">{workflow.items.map((item) => item.name).join(',')}</span>
            <span data-testid="total">{workflow.totalCount}</span>
            <span data-testid="loading">{String(workflow.isLoading)}</span>
            <span data-testid="capability">{String(workflow.capabilities?.can_export === true)}</span>
        </div>
    );
}

describe('useCollectionPageWorkflow', () => {
    it('applies collection success payloads in one place', async () => {
        const loadPage = vi.fn().mockResolvedValue({
            items: [{ id: 1, name: 'Open' }],
            total: 1,
            offset: 0,
            limit: 50,
            groups: [],
            capabilities: { can_export: true },
        });

        render(<WorkflowHarness loadPage={loadPage} />);

        await act(async () => {
            screen.getByRole('button', { name: 'load' }).click();
        });

        await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Open'));
        expect(screen.getByTestId('total')).toHaveTextContent('1');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('capability')).toHaveTextContent('true');
    });

    it('ignores stale responses after a newer request wins', async () => {
        const first = createDeferred<CollectionListResponse<ExampleItem>>();
        const second = createDeferred<CollectionListResponse<ExampleItem>>();
        const loadPage = vi
            .fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise);

        render(<WorkflowHarness loadPage={loadPage} />);

        await act(async () => {
            screen.getByRole('button', { name: 'load' }).click();
            screen.getByRole('button', { name: 'load' }).click();
        });

        second.resolve({
            items: [{ id: 2, name: 'Fresh' }],
            total: 1,
            offset: 0,
            limit: 50,
        });

        await waitFor(() => expect(screen.getByTestId('items')).toHaveTextContent('Fresh'));

        first.resolve({
            items: [{ id: 1, name: 'Stale' }],
            total: 1,
            offset: 0,
            limit: 50,
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByTestId('items')).toHaveTextContent('Fresh');
    });
});
