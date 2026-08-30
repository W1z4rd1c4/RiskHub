import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { ApiClientError } from '@/services/apiClient';
import { createTestQueryClient } from '@test/queryClient';

function createWrapper() {
    const queryClient = createTestQueryClient({
        defaultOptions: {
            queries: { retryDelay: 0 },
        },
    });

    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

function createProductionRetryWrapper() {
    const queryClient = createTestQueryClient({
        defaultOptions: {
            queries: {
                retry: 1,
                retryDelay: 0,
            },
        },
    });

    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
}

function DetailQueryHarness({
    load,
    rawId,
}: {
    load: (id: number) => Promise<{ name: string }>;
    rawId: string | undefined;
}) {
    const state = useDetailQuery({
        entity: 'test-detail',
        rawId,
        load,
    });

    return (
        <div>
            <p data-testid="loading">{String(state.isLoading)}</p>
            <p data-testid="outcome">{state.loadOutcome}</p>
            <p data-testid="resource">{state.resource?.name ?? 'none'}</p>
            <p data-testid="resource-id">{state.resourceId ?? 'none'}</p>
            <button type="button" onClick={() => void state.refetch()}>refetch</button>
        </div>
    );
}

describe('useDetailQuery', () => {
    it('loads a resource for a valid route id', async () => {
        const load = vi.fn().mockResolvedValue({ name: 'Quarterly Access Review' });

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createWrapper() });

        await screen.findByText('Quarterly Access Review');
        expect(load).toHaveBeenCalledWith(13, expect.any(AbortSignal));
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('outcome')).toHaveTextContent('content');
        expect(screen.getByTestId('resource-id')).toHaveTextContent('13');
    });

    it('reports an unavailable outcome when the initial request fails', async () => {
        const load = vi.fn().mockRejectedValue(new ApiClientError({
            status: 500,
            messageKey: 'errorKeys.server',
            rawMessage: 'internal record name must not be rendered',
        }));

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createWrapper() });

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
        expect(screen.getByTestId('outcome')).toHaveTextContent('unavailable');
        expect(screen.getByTestId('resource')).toHaveTextContent('none');
    });

    it.each([403, 404])('classifies a probed %i response as the same unavailable outcome', async (status) => {
        const load = vi.fn().mockRejectedValue(new ApiClientError({
            status,
            messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
            rawMessage: `protected record ${status}`,
        }));

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createWrapper() });

        await waitFor(() => {
            expect(screen.getByTestId('outcome')).toHaveTextContent('unavailable');
        });
        expect(screen.getByTestId('resource')).toHaveTextContent('none');
    });

    it.each([
        ['network', new Error('network unavailable')],
        ['server', new ApiClientError({ status: 500, messageKey: 'errorKeys.server' })],
    ])('retains safe cached data when a %s refetch fails', async (_kind, failure) => {
        const load = vi.fn()
            .mockResolvedValueOnce({ name: 'Initial detail' })
            .mockRejectedValue(failure);

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createWrapper() });

        await screen.findByText('Initial detail');

        fireEvent.click(screen.getByRole('button', { name: 'refetch' }));

        await waitFor(() => {
            expect(screen.getByTestId('outcome')).toHaveTextContent('stale-with-error');
        });
        expect(screen.getByTestId('resource')).toHaveTextContent('Initial detail');
    });

    it.each([403, 404])('clears cached detail after a protected %i refetch', async (status) => {
        const load = vi.fn()
            .mockResolvedValueOnce({ name: 'Protected detail' })
            .mockRejectedValueOnce(new ApiClientError({
                status,
                messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
                rawMessage: 'Protected detail must no longer remain visible',
            }));

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createWrapper() });

        await screen.findByText('Protected detail');
        fireEvent.click(screen.getByRole('button', { name: 'refetch' }));

        await waitFor(() => {
            expect(screen.getByTestId('outcome')).toHaveTextContent('unavailable');
        });
        expect(screen.getByTestId('resource')).toHaveTextContent('none');
        expect(screen.queryByText('Protected detail')).not.toBeInTheDocument();
    });

    it.each([403, 404])('hides cached detail on the first protected %i response without retrying it', async (status) => {
        const firstRefetch = createDeferred<{ name: string }>();
        const load = vi.fn()
            .mockResolvedValueOnce({ name: 'Protected detail' })
            .mockImplementationOnce(() => firstRefetch.promise)
            .mockImplementation(() => new Promise(() => undefined));

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createProductionRetryWrapper() });

        await screen.findByText('Protected detail');
        fireEvent.click(screen.getByRole('button', { name: 'refetch' }));
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

        firstRefetch.reject(new ApiClientError({
            status,
            messageKey: status === 403 ? 'errorKeys.forbidden' : 'errorKeys.not_found',
        }));

        await waitFor(() => {
            expect(screen.getByTestId('outcome')).toHaveTextContent('unavailable');
        });
        expect(screen.getByTestId('resource')).toHaveTextContent('none');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['network', new Error('network unavailable')],
        ['server', new ApiClientError({ status: 500, messageKey: 'errorKeys.server' })],
    ])('retries a cached %s failure once before keeping the prior detail stale', async (_kind, failure) => {
        const load = vi.fn()
            .mockResolvedValueOnce({ name: 'Initial detail' })
            .mockRejectedValue(failure);

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createProductionRetryWrapper() });

        await screen.findByText('Initial detail');
        fireEvent.click(screen.getByRole('button', { name: 'refetch' }));

        await waitFor(() => {
            expect(screen.getByTestId('outcome')).toHaveTextContent('stale-with-error');
        });
        expect(screen.getByTestId('resource')).toHaveTextContent('Initial detail');
        expect(load).toHaveBeenCalledTimes(3);
    });

    it.each([
        undefined,
        '',
        '0',
        '-1',
        '13junk',
        '13.0',
        '+13',
        ' 13',
        '9007199254740992',
    ])('does not call the loader for invalid route id %s', async (rawId) => {
        const load = vi.fn();

        render(<DetailQueryHarness rawId={rawId} load={load} />, { wrapper: createWrapper() });

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
        expect(load).not.toHaveBeenCalled();
        expect(screen.getByTestId('outcome')).toHaveTextContent('unavailable');
    });
});
