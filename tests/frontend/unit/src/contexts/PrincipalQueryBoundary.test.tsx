import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { PrincipalQueryBoundary } from '@/contexts/PrincipalQueryBoundary';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

interface OverviewProbeProps {
    actor: string;
    response: Promise<string>;
    onClient: (client: QueryClient) => void;
    onAbort?: () => void;
}

function OverviewProbe({ actor, response, onClient, onAbort }: OverviewProbeProps) {
    const client = useQueryClient();
    const overview = useQuery({
        queryKey: ['dashboard', 'overview'],
        queryFn: () => response,
    });

    useQuery({
        queryKey: ['dashboard', 'background'],
        queryFn: ({ signal }) => new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
                onAbort?.();
                reject(new DOMException('cancelled', 'AbortError'));
            }, { once: true });
        }),
        retry: false,
    });

    useEffect(() => {
        onClient(client);
    }, [client, onClient]);

    return <div>{overview.data ?? `${actor} loading`}</div>;
}

describe('PrincipalQueryBoundary', () => {
    it('cancels and discards CRO work before a Department Head protected view mounts', async () => {
        const croResponse = Promise.resolve('CRO-only governance total: 91');
        const departmentResponse = deferred<string>();
        const clients: QueryClient[] = [];
        const priorWorkAborted = vi.fn();
        const onClient = (client: QueryClient) => clients.push(client);

        const view = render(
            <PrincipalQueryBoundary principalId={1}>
                <OverviewProbe
                    actor="CRO"
                    response={croResponse}
                    onClient={onClient}
                    onAbort={priorWorkAborted}
                />
            </PrincipalQueryBoundary>,
        );

        expect(await screen.findByText('CRO-only governance total: 91')).toBeInTheDocument();
        await waitFor(() => expect(clients).toHaveLength(1));

        view.rerender(
            <PrincipalQueryBoundary principalId={2}>
                <OverviewProbe
                    actor="Department Head"
                    response={departmentResponse.promise}
                    onClient={onClient}
                />
            </PrincipalQueryBoundary>,
        );

        expect(screen.queryByText('CRO-only governance total: 91')).not.toBeInTheDocument();
        expect(screen.getByText('Department Head loading')).toBeInTheDocument();
        await waitFor(() => expect(priorWorkAborted).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(clients).toHaveLength(2));
        expect(clients[1]).not.toBe(clients[0]);
        expect(clients[0]?.getQueryData(['dashboard', 'overview'])).toBeUndefined();

        departmentResponse.resolve('Department Head risk total: 7');
        expect(await screen.findByText('Department Head risk total: 7')).toBeInTheDocument();
    });

    it('retains the QueryClient and cached protected data for a same-user token refresh', async () => {
        const clients: QueryClient[] = [];
        const onClient = (client: QueryClient) => clients.push(client);
        const firstResponse = Promise.resolve('Department Head cached total: 7');

        const view = render(
            <PrincipalQueryBoundary principalId={2}>
                <OverviewProbe actor="Department Head" response={firstResponse} onClient={onClient} />
            </PrincipalQueryBoundary>,
        );

        expect(await screen.findByText('Department Head cached total: 7')).toBeInTheDocument();
        await waitFor(() => expect(clients).toHaveLength(1));

        view.rerender(
            <PrincipalQueryBoundary principalId={2}>
                <OverviewProbe actor="Department Head" response={new Promise(() => undefined)} onClient={onClient} />
            </PrincipalQueryBoundary>,
        );

        expect(screen.getByText('Department Head cached total: 7')).toBeInTheDocument();
        expect(clients.at(-1)).toBe(clients[0]);
    });
});
