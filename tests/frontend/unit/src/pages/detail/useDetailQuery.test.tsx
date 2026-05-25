import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { createTestQueryClient } from '@test/queryClient';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;

function readFrontendSource(relativePath: string): string {
    return readFileSync(path.join(repoRoot, 'frontend', relativePath), 'utf8');
}

function createWrapper() {
    const queryClient = createTestQueryClient();

    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
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
        toErrorKey: () => 'errorKeys.load_failed',
    });

    return (
        <div>
            <p data-testid="loading">{String(state.isLoading)}</p>
            <p data-testid="error">{state.errorKey ?? 'none'}</p>
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
        expect(screen.getByTestId('error')).toHaveTextContent('none');
        expect(screen.getByTestId('resource-id')).toHaveTextContent('13');
    });

    it('stores the mapped error key on load failure', async () => {
        const load = vi.fn().mockRejectedValue(new Error('boom'));

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createWrapper() });

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
        expect(screen.getByTestId('error')).toHaveTextContent('errorKeys.load_failed');
        expect(screen.getByTestId('resource')).toHaveTextContent('none');
    });

    it('surfaces refetch errors instead of stale cached resource data', async () => {
        const load = vi
            .fn()
            .mockResolvedValueOnce({ name: 'Initial detail' })
            .mockRejectedValueOnce(new Error('refetch failed'));

        render(<DetailQueryHarness rawId="13" load={load} />, { wrapper: createWrapper() });

        await screen.findByText('Initial detail');

        fireEvent.click(screen.getByRole('button', { name: 'refetch' }));

        await waitFor(() => {
            expect(screen.getByTestId('error')).toHaveTextContent('errorKeys.load_failed');
        });
        expect(screen.getByTestId('resource')).toHaveTextContent('none');
    });

    it('does not call the loader for an invalid id', async () => {
        const load = vi.fn();

        render(<DetailQueryHarness rawId="oops" load={load} />, { wrapper: createWrapper() });

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
        expect(load).not.toHaveBeenCalled();
        expect(screen.getByTestId('error')).toHaveTextContent('errorKeys.not_found');
    });

    it('fully replaces the legacy detail resource hook in production detail surfaces', () => {
        expect(existsSync(path.join(repoRoot, 'frontend/src/pages/detail/useDetailResource.ts'))).toBe(false);

        for (const relativePath of [
            'src/pages/ControlDetailPage.tsx',
            'src/pages/detail/useKriDetailState.ts',
            'src/pages/detail/useRiskDetailState.ts',
            'src/pages/vendors/useVendorDetailState.ts',
        ]) {
            const source = readFrontendSource(relativePath);

            expect(source).toContain('useDetailQuery');
            expect(source).not.toContain('useDetailResource');
        }
    });
});
