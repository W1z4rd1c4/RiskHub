import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDetailResource } from '@/pages/detail/useDetailResource';

function DetailResourceHarness({
    load,
    rawId,
}: {
    load: (id: number) => Promise<{ name: string }>;
    rawId: string | undefined;
}) {
    const state = useDetailResource({
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

describe('useDetailResource', () => {
    it('loads a resource for a valid route id', async () => {
        const load = vi.fn().mockResolvedValue({ name: 'Quarterly Access Review' });

        render(<DetailResourceHarness rawId="13" load={load} />);

        await screen.findByText('Quarterly Access Review');
        expect(load).toHaveBeenCalledWith(13);
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('error')).toHaveTextContent('none');
        expect(screen.getByTestId('resource-id')).toHaveTextContent('13');
    });

    it('stores the mapped error key on load failure', async () => {
        const load = vi.fn().mockRejectedValue(new Error('boom'));

        render(<DetailResourceHarness rawId="13" load={load} />);

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
        expect(screen.getByTestId('error')).toHaveTextContent('errorKeys.load_failed');
        expect(screen.getByTestId('resource')).toHaveTextContent('none');
    });

    it('does not call the loader for an invalid id', async () => {
        const load = vi.fn();

        render(<DetailResourceHarness rawId="oops" load={load} />);

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
        expect(load).not.toHaveBeenCalled();
        expect(screen.getByTestId('error')).toHaveTextContent('errorKeys.not_found');
    });
});
