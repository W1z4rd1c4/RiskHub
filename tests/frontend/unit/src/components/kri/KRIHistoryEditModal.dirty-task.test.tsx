import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIHistoryEditModal } from '@/components/kri/KRIHistoryEditModal';
import type { KRIHistoryEntry } from '@/types/kri';

const requestHistoryEditMock = vi.fn();

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        requestHistoryEdit: (...args: unknown[]) => requestHistoryEditMock(...args),
    },
}));

const entry = {
    id: 3,
    kri_id: 7,
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    recorded_at: '2026-02-01T00:00:00Z',
    value: 95,
    lower_limit: 90,
    upper_limit: 100,
    unit: '%',
    breach_status: 'within',
} as KRIHistoryEntry;

/** PG-22: the dirty-task guard blocks route changes, so the modal needs a data router. */
function renderModal(onClose = vi.fn()) {
    const router = createMemoryRouter([{
        path: '/',
        element: <KRIHistoryEditModal isOpen onClose={onClose} kriId={7} entry={entry} onSuccess={vi.fn()} />,
    }]);
    render(<RouterProvider router={router} />);
    return { onClose };
}

describe('KRIHistoryEditModal dirty-task guard (PG-22)', () => {
    beforeEach(() => {
        requestHistoryEditMock.mockReset();
        requestHistoryEditMock.mockResolvedValue({ id: 3, value: 97 });
    });

    it('closes an untouched correction without asking', () => {
        const { onClose } = renderModal();

        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it.each(['escape', 'cancel'] as const)('asks before discarding a typed reason on %s', async (path) => {
        const { onClose } = renderModal();
        const reason = screen.getByRole('textbox', { name: /reason/i });
        fireEvent.change(reason, { target: { value: 'Source system corrected' } });
        const requestClose = () => (path === 'escape'
            ? fireEvent.keyDown(document, { key: 'Escape' })
            : fireEvent.click(screen.getByRole('button', { name: /^cancel$/i })));

        requestClose();
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /stay/i }));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox', { name: /reason/i })).toHaveValue('Source system corrected');

        requestClose();
        fireEvent.click(await screen.findByRole('button', { name: /leave/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('treats a submitted correction as saved: closing afterwards does not ask', async () => {
        const { onClose } = renderModal();
        fireEvent.change(screen.getByRole('textbox', { name: /reason/i }), { target: { value: 'Source system corrected' } });
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));

        await waitFor(() => expect(requestHistoryEditMock).toHaveBeenCalledWith(7, 3, { value: 95, reason: 'Source system corrected' }));
        // The outcome message renders once the request settled (the dialog is no longer busy).
        expect(await screen.findByText('Correction submitted for approval')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
});
