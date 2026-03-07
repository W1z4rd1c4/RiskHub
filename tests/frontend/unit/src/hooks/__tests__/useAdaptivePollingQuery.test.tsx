import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAdaptivePollingQuery } from '@/hooks/useAdaptivePollingQuery';

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

function TestHarness({
    pollMs,
    queryFn,
}: {
    pollMs: number;
    queryFn: ({ signal }: { signal?: AbortSignal }) => Promise<{ value: number }>;
}) {
    const query = useAdaptivePollingQuery({
        queryKey: ['adaptivePollingTest'],
        queryFn,
        pollMs,
    });

    return (
        <div>
            <span data-testid="value">{query.data?.value ?? -1}</span>
            <span data-testid="poll-ms">{query.currentPollMs ?? 'stopped'}</span>
            <button onClick={() => { void query.refresh(); }} type="button">
                refresh
            </button>
        </div>
    );
}

describe('useAdaptivePollingQuery', () => {
    beforeEach(() => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
    });

    afterEach(() => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
    });

    it('pauses while hidden and refetches immediately when visible again', async () => {
        const queryFn = async () => ({ value: 1 });

        render(<TestHarness pollMs={20} queryFn={queryFn} />, { wrapper: createWrapper() });

        await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('1'));

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 40));
        });
        expect(screen.getByTestId('poll-ms')).toHaveTextContent('stopped');

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        await waitFor(() => expect(screen.getByTestId('poll-ms')).toHaveTextContent('20'));
    });

    it('backs off after errors and resets the interval after a manual refresh', async () => {
        let shouldFail = true;
        const queryFn = async () => {
            if (shouldFail) {
                throw new Error('boom');
            }
            return { value: 2 };
        };

        render(<TestHarness pollMs={20} queryFn={queryFn} />, { wrapper: createWrapper() });

        await waitFor(() => expect(screen.getByTestId('poll-ms')).toHaveTextContent('40'));

        shouldFail = false;
        fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

        await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('2'));
        expect(screen.getByTestId('poll-ms')).toHaveTextContent('20');
    });

    it('does not overlap requests while a fetch is still running', async () => {
        let resolveFetch: ((value: { value: number }) => void) | null = null;
        let callCount = 0;
        const queryFn = () => {
            callCount += 1;
            return new Promise<{ value: number }>((resolve) => {
                resolveFetch = resolve;
            });
        };

        render(<TestHarness pollMs={20} queryFn={queryFn} />, { wrapper: createWrapper() });

        await waitFor(() => expect(callCount).toBe(1));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
        });
        expect(callCount).toBe(1);

        resolveFetch?.({ value: 3 });
        await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('3'));
    });
});
