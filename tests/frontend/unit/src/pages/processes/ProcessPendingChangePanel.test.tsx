import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { requester?: string }) => options?.requester
            ? `${key}:${options.requester}`
            : key,
        i18n: { language: 'en' },
    }),
}));

import { ProcessPendingChangePanel } from '@/pages/processes/ProcessPendingChangePanel';
import type { ProcessPendingChangeRead } from '@/types/process';

function pendingChange(canViewDiff: boolean, canCancel: boolean): ProcessPendingChangeRead {
    return {
        approval_id: 41,
        proposal_id: 'proposal-41',
        proposal_version: 1,
        status: 'pending',
        requested_at: '2026-07-16T09:00:00Z',
        requested_by_name: 'Alice Requester',
        reason: 'Improve resilience',
        before: { l1_process: 'Payments' },
        after: { l1_process: 'Payments v2' },
        derived_impact: {
            before: { cif: 'yes', criticality_class: 'critical' },
            after: { cif: 'yes', criticality_class: 'critical' },
        },
        capabilities: { can_view_diff: canViewDiff, can_cancel: canCancel },
    };
}

describe('ProcessPendingChangePanel', () => {
    it('keeps pending lifecycle separate and exposes scoped diff/cancel actions', () => {
        const onCancel = vi.fn();
        render(<ProcessPendingChangePanel pendingChange={pendingChange(true, true)} onCancel={onCancel} />);

        expect(screen.getByText('pending_change.badge')).toBeInTheDocument();
        expect(screen.getByText('Payments v2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'pending_change.cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not leak proposed values or cancellation when capabilities deny them', () => {
        render(<ProcessPendingChangePanel pendingChange={pendingChange(false, false)} />);

        expect(screen.getByText('pending_change.diff_restricted')).toBeInTheDocument();
        expect(screen.queryByText('Payments v2')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'pending_change.cancel' })).not.toBeInTheDocument();
    });
});
