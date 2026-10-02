import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';

const logExecutionMock = vi.fn();

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        logExecution: (...args: unknown[]) => logExecutionMock(...args),
    },
}));

describe('ExecutionLogModal result choice', () => {
    beforeEach(() => {
        logExecutionMock.mockReset();
        logExecutionMock.mockResolvedValue({});
    });

    it('offers the four results as one radiogroup with Passed preselected', () => {
        render(<ExecutionLogModal isOpen onClose={() => {}} controlId={9} controlName="Access review" />);

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
        render(<ExecutionLogModal isOpen onClose={() => {}} controlId={9} controlName="Access review" onSuccess={onSuccess} />);

        await user.click(screen.getByRole('radio', { name: 'Failed' }));
        expect(screen.getByRole('radio', { name: 'Failed' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Passed' })).not.toBeChecked();

        await user.click(screen.getByRole('button', { name: /log execution/i }));

        await waitFor(() => expect(logExecutionMock).toHaveBeenCalledWith(9, expect.objectContaining({ result: 'failed' })));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });
});
