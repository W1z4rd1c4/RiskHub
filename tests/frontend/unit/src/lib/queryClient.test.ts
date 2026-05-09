import { describe, expect, it } from 'vitest';

import { APP_QUERY_CLIENT_DEFAULTS, createAppQueryClient } from '@/lib/queryClient';

describe('app QueryClient defaults', () => {
    it('exposes a 60s staleTime and retry=1', () => {
        const queries = APP_QUERY_CLIENT_DEFAULTS.defaultOptions?.queries;
        expect(queries?.staleTime).toBe(60_000);
        expect(queries?.retry).toBe(1);
    });

    it('createAppQueryClient builds a QueryClient with those defaults', () => {
        const qc = createAppQueryClient();
        const opts = qc.getDefaultOptions();
        expect(opts.queries?.staleTime).toBe(60_000);
        expect(opts.queries?.retry).toBe(1);
    });
});
