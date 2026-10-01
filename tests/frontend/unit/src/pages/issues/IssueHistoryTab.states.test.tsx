import { describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { IssueHistoryTab } from '@/pages/issues/issue-detail/IssueHistoryTab';
import type { ActivityLogEntry } from '@/types/activityLog';
import { renderWithoutProviders, screen } from '@test/render';

const t = ((key: string, options?: Record<string, unknown>) =>
    i18n.t(key, { ns: 'issues', ...(options ?? {}) })) as never;

const entry = {
    id: 1,
    action: 'status_change',
    description: 'Moved to triaged',
    actor_name: 'Ava',
    created_at: '2026-09-30T10:00:00Z',
} as unknown as ActivityLogEntry;

describe('IssueHistoryTab states (GAP-C-11, PG-21)', () => {
    it('renders a load failure as an error with retry, never as "no history"', () => {
        const onRetry = vi.fn();
        renderWithoutProviders(
            <IssueHistoryTab
                canViewActivityHistory
                historyItems={[]}
                isHistoryLoading={false}
                historyLoadFailed
                onRetryHistory={onRetry}
                t={t}
            />,
        );

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('No activity log entries found for this issue.')).not.toBeInTheDocument();
        screen.getByRole('button', { name: 'Retry' }).click();
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('announces loading and shows the empty state only after a successful empty load', () => {
        const { rerender } = renderWithoutProviders(
            <IssueHistoryTab canViewActivityHistory historyItems={[]} isHistoryLoading t={t} />,
        );
        expect(screen.getByRole('status')).toHaveTextContent('Loading history...');

        rerender(<IssueHistoryTab canViewActivityHistory historyItems={[]} isHistoryLoading={false} t={t} />);
        expect(screen.getByRole('status')).toHaveTextContent('No activity log entries found for this issue.');
    });

    it('translates the action instead of showing the raw enum', () => {
        renderWithoutProviders(
            <IssueHistoryTab canViewActivityHistory historyItems={[entry]} isHistoryLoading={false} t={t} />,
        );
        expect(screen.getByText('Status changed')).toBeInTheDocument();
        expect(screen.queryByText('status change')).not.toBeInTheDocument();
    });

    it('uses the shared access-denied state when history is not viewable', () => {
        renderWithoutProviders(
            <IssueHistoryTab canViewActivityHistory={false} historyItems={[]} isHistoryLoading={false} t={t} />,
        );
        expect(
            screen.getByText('You do not have permission to view activity history for this issue.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
});
