import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

const trackedClients = new Set<QueryClient>();

export function createTestQueryClient(config: QueryClientConfig = {}): QueryClient {
    const client = new QueryClient({
        ...config,
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: Infinity,
                ...(config.defaultOptions?.queries ?? {}),
            },
            mutations: {
                retry: false,
                ...(config.defaultOptions?.mutations ?? {}),
            },
        },
    });

    trackedClients.add(client);
    return client;
}

export async function cleanupTestQueryClients(): Promise<void> {
    await Promise.all(
        [...trackedClients].map(async (client) => {
            await client.cancelQueries();
            const cancelMutations = (client as QueryClient & {
                cancelMutations?: () => Promise<void>;
            }).cancelMutations;
            if (typeof cancelMutations === 'function') {
                await cancelMutations.call(client);
            }
            client.clear();
        }),
    );
    trackedClients.clear();
}
