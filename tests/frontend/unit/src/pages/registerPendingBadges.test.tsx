import { describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import type { SafeTFunction } from '@/i18n/hooks';
import { buildIssueColumns } from '@/pages/issues/issueColumns';
import { buildKriColumns } from '@/pages/kris/kriColumns';
import type { IssueSummary } from '@/types/issue';
import type { KeyRiskIndicator } from '@/types/kri';
import { renderWithoutProviders, screen } from '@test/render';

const t = ((key: string, options?: Record<string, unknown>) => i18n.t(key, options)) as SafeTFunction;

/** Audit §4.9 / PG-29: the pending-approval badge on the KRI and Issue registers too. */
describe('pending-approval register badges', () => {
    it('marks a KRI with any pending approval', () => {
        const columns = buildKriColumns({ language: 'en', onRestore: vi.fn(), t });
        const name = columns.find((column) => column.key === 'metric_name');
        const kri = {
            id: 4,
            metric_name: 'Loss ratio',
            capabilities: { has_pending_value_submission_approval: true },
        } as unknown as KeyRiskIndicator;
        renderWithoutProviders(<>{name?.render?.(kri)}</>);
        expect(screen.getByTestId('kri-pending-4')).toHaveTextContent('Pending approval');
    });

    it('marks an issue with a pending exception request and translates its badges', () => {
        const columns = buildIssueColumns({ format: { dateTime: () => '' }, t });
        const title = columns.find((column) => column.key === 'title');
        const issue = {
            id: 9,
            title: 'Backup gap',
            status: 'in_progress',
            severity: 'high',
            capabilities: { has_pending_exception_request: true },
        } as unknown as IssueSummary;
        renderWithoutProviders(<>{title?.render?.(issue)}</>);
        expect(screen.getByTestId('issue-pending-9')).toBeInTheDocument();
        expect(screen.getByText('In progress')).toBeInTheDocument();
        expect(screen.queryByText('in_progress')).not.toBeInTheDocument();
    });
});
