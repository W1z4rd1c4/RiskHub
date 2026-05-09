import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

export const APP_QUERY_CLIENT_DEFAULTS: QueryClientConfig = {
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60,
            retry: 1,
        },
    },
};

export function createAppQueryClient(): QueryClient {
    return new QueryClient(APP_QUERY_CLIENT_DEFAULTS);
}
