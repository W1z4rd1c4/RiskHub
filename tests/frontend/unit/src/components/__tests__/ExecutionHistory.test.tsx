import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getExecutionsMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getExecutions: (...args: unknown[]) => getExecutionsMock(...args),
    },
}));

vi.mock('@/components/issues/IssueQuickCreateModal', () => ({
    IssueQuickCreateModal: ({
        contextEntityId,
        contextEntityLabel,
        contextEntityType,
        isOpen,
    }: {
        contextEntityId: number;
        contextEntityLabel: string;
        contextEntityType: string;
        isOpen: boolean;
    }) =>
        isOpen ? (
            <div data-testid="execution-issue-context">
                {contextEntityType}:{contextEntityId}:{contextEntityLabel}
            </div>
        ) : null,
}));

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

import { ExecutionHistory } from '@/components/executions/ExecutionHistory';

describe('ExecutionHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders canonical execution result states with the correct status styling', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 1,
                control_id: 1,
                result: 'failed',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            },
            {
                id: 2,
                control_id: 1,
                result: 'warning',
                executed_at: '2026-03-06T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-06T10:00:00Z',
            },
            {
                id: 3,
                control_id: 1,
                result: 'passed',
                executed_at: '2026-03-05T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-05T10:00:00Z',
            },
            {
                id: 4,
                control_id: 1,
                result: 'not_applicable',
                executed_at: '2026-03-04T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-04T10:00:00Z',
            },
        ]);

        render(<ExecutionHistory controlId={1} />);

        await waitFor(() => {
            expect(screen.queryByText('common:loading.history')).not.toBeInTheDocument();
        });

        expect(screen.getByText('controls:results.failed')).toHaveClass('text-rose-400');
        expect(screen.getByText('controls:executions.issues_found')).toHaveClass('text-amber-400');
        expect(screen.getByText('controls:results.passed')).toHaveClass('text-emerald-400');
        expect(screen.getByText('controls:results.not_applicable')).toHaveClass('text-slate-400');

        const failedCard = screen.getByText('controls:results.failed').closest('.glass-card');
        expect(failedCard).not.toBeNull();
        expect(within(failedCard as HTMLElement).queryByText('controls:results.passed')).toBeNull();
    });

    it('renders unknown results as neutral instead of passed', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 9,
                control_id: 1,
                result: 'unexpected_result',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            } as any,
        ]);

        render(<ExecutionHistory controlId={1} />);

        await screen.findByText('common:labels.not_available');
        expect(screen.queryByText('controls:results.passed')).not.toBeInTheDocument();
        expect(screen.getByText('common:labels.not_available')).toHaveClass('text-slate-300');
    });

    it('shows execution-specific issue actions only for failed or warning rows when allowed', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 11,
                control_id: 1,
                result: 'failed',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            },
            {
                id: 12,
                control_id: 1,
                result: 'passed',
                executed_at: '2026-03-06T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-06T10:00:00Z',
            },
            {
                id: 13,
                control_id: 1,
                result: 'warning',
                executed_at: '2026-03-05T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-05T10:00:00Z',
            },
        ]);

        render(
            <ExecutionHistory
                controlId={1}
                controlName="Access Review"
                canCreateIssue
                createIssueLabel="New Issue"
            />
        );

        await screen.findByText('controls:results.failed');
        fireEvent.click(screen.getByText('controls:results.failed'));
        fireEvent.click(screen.getByText('controls:executions.issues_found'));

        expect(screen.getAllByRole('button', { name: 'New Issue' })).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'New Issue' })[0]);
        expect(screen.getByTestId('execution-issue-context')).toHaveTextContent('execution:11:Access Review');
    });

    it('hides execution-specific issue actions when backend capability is false', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 21,
                control_id: 1,
                result: 'failed',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            },
        ]);

        render(
            <ExecutionHistory
                controlId={1}
                controlName="Access Review"
                canCreateIssue={false}
                createIssueLabel="New Issue"
            />
        );

        await screen.findByText('controls:results.failed');
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('renders a retryable error state instead of empty history when loading fails', async () => {
        getExecutionsMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([]);

        render(<ExecutionHistory controlId={1} />);

        await screen.findByText('errors.load_history_failed');
        expect(screen.queryByText('empty_state.no_executions')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'errors.try_again' }));

        await waitFor(() => expect(getExecutionsMock).toHaveBeenCalledTimes(2));
        await screen.findByText('empty_state.no_executions');
    });
});
