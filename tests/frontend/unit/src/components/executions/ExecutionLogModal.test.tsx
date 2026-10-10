import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';

const logExecutionMock = vi.fn();

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        logExecution: (...args: unknown[]) => logExecutionMock(...args),
    },
}));

/** The modal's dirty-task guard (PG-22) blocks route changes, so it needs a data router. */
function renderInDataRouter(ui: ReactElement) {
    const router = createMemoryRouter([{ path: '/', element: ui }]);
    return render(<RouterProvider router={router} />);
}

describe('ExecutionLogModal result choice', () => {
    beforeEach(() => {
        logExecutionMock.mockReset();
        logExecutionMock.mockResolvedValue({});
    });

    it('offers the four results as one radiogroup with Passed preselected', () => {
        renderInDataRouter(<ExecutionLogModal isOpen onClose={() => {}} controlId={9} controlName="Access review" />);

        const group = screen.getByRole('radiogroup', { name: /execution result/i });
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(4);
        radios.forEach((radio) => expect(group).toContainElement(radio));
        expect(screen.getByRole('radio', { name: 'Passed' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Failed' })).not.toBeChecked();
    });

    it('submits the chosen result and keeps the group a single selection', async () => {
        const onSuccess = vi.fn();
        const user = userEvent.setup();
        renderInDataRouter(<ExecutionLogModal isOpen onClose={() => {}} controlId={9} controlName="Access review" onSuccess={onSuccess} />);

        await user.click(screen.getByRole('radio', { name: 'Failed' }));
        expect(screen.getByRole('radio', { name: 'Failed' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Passed' })).not.toBeChecked();

        await user.click(screen.getByRole('button', { name: /log execution/i }));

        await waitFor(() => expect(logExecutionMock).toHaveBeenCalledWith(9, expect.objectContaining({ result: 'failed' })));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });
});

describe('ExecutionLogModal dirty-task guard (PG-22)', () => {
    beforeEach(() => {
        logExecutionMock.mockReset();
        logExecutionMock.mockResolvedValue({});
    });

    it('closes a pristine form without asking', () => {
        const onClose = vi.fn();
        renderInDataRouter(<ExecutionLogModal isOpen onClose={onClose} controlId={9} controlName="Access review" />);

        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it.each(['escape', 'cancel'] as const)('asks before discarding typed input on %s', async (path) => {
        const onClose = vi.fn();
        renderInDataRouter(<ExecutionLogModal isOpen onClose={onClose} controlId={9} controlName="Access review" />);

        fireEvent.click(screen.getByRole('radio', { name: 'Failed' }));
        const requestClose = () => (path === 'escape'
            ? fireEvent.keyDown(document, { key: 'Escape' })
            : fireEvent.click(screen.getByRole('button', { name: /^cancel$/i })));

        requestClose();
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /stay/i }));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('radio', { name: 'Failed' })).toBeChecked();

        requestClose();
        fireEvent.click(await screen.findByRole('button', { name: /leave/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('accepts a successful submission and closes once without asking', async () => {
        const onClose = vi.fn();
        renderInDataRouter(<ExecutionLogModal isOpen onClose={onClose} controlId={9} controlName="Access review" />);

        fireEvent.click(screen.getByRole('radio', { name: 'Failed' }));
        fireEvent.click(screen.getByRole('button', { name: /log execution/i }));

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
});
