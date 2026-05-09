import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIValueModal } from '@/components/kri/KRIValueModal';
import type { KRICapabilities, KeyRiskIndicator } from '@/types/kri';

const recordValueMock = vi.fn();

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        recordValue: (...args: unknown[]) => recordValueMock(...args),
    },
}));


vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/i18n/formatters', () => ({
    formatDateValue: (value: string) => value,
}));

function makeKri(capabilities?: KRICapabilities | null): KeyRiskIndicator {
    return {
        id: 7,
        risk_id: 4,
        metric_name: 'Loss Ratio',
        description: 'desc',
        current_value: 12,
        lower_limit: 8,
        upper_limit: 10,
        unit: '%',
        breach_status: 'above',
        last_updated: '2026-04-19T00:00:00Z',
        created_at: '2026-04-19T00:00:00Z',
        frequency: 'monthly',
        capabilities,
    };
}

function makeCapabilities(overrides: Partial<KRICapabilities> = {}): KRICapabilities {
    return {
        can_read: true,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_submit_value: true,
        can_submit_backdated_value: false,
        can_request_value_submission_approval: false,
        can_view_history: true,
        can_request_history_correction: false,
        can_apply_history_correction_immediately: false,
        can_link_vendors: false,
        can_unlink_vendors: false,
        can_view_linked_vendors: false,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        has_pending_value_submission_approval: false,
        has_pending_history_correction_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        ...overrides,
    };
}

describe('KRIValueModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        recordValueMock.mockResolvedValue({
            status: 'approval_required',
            approval_id: 42,
            action_type: 'edit',
            message: 'Value submission requires approval',
            pending_fields: ['current_value', 'period_end', 'recorded_at'],
        });
    });

    it('shows the pending approval state for approval responses', async () => {
        render(
            <KRIValueModal
                kri={makeKri(makeCapabilities({ can_request_value_submission_approval: true }))}
                isOpen
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        fireEvent.click(screen.getAllByRole('button', { name: 'value_modal.title' })[0]);

        await waitFor(() => expect(recordValueMock).toHaveBeenCalledWith(7, { value: 12 }));
        expect(await screen.findByText('value_modal.submitted_for_approval')).toBeInTheDocument();
    });

    it('shows the backdate input only when backend capabilities allow it', () => {
        const { rerender } = render(
            <KRIValueModal
                kri={makeKri(makeCapabilities({ can_submit_backdated_value: true }))}
                isOpen
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.getByText('value_modal.backdate_optional')).toBeInTheDocument();

        rerender(
            <KRIValueModal
                kri={makeKri(makeCapabilities({ can_submit_backdated_value: false }))}
                isOpen
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.queryByText('value_modal.backdate_optional')).not.toBeInTheDocument();
    });

    it('hides the backdate input when capabilities are missing', () => {
        render(
            <KRIValueModal
                kri={makeKri(null)}
                isOpen
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.queryByText('value_modal.backdate_optional')).not.toBeInTheDocument();
    });

    it('shows the approval notice only when backend capabilities say approval submission is available', () => {
        const { rerender } = render(
            <KRIValueModal
                kri={makeKri(makeCapabilities({ can_request_value_submission_approval: true }))}
                isOpen
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.getByText('value_modal.approval_notice')).toBeInTheDocument();

        rerender(
            <KRIValueModal
                kri={makeKri(makeCapabilities({ can_request_value_submission_approval: false }))}
                isOpen
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.queryByText('value_modal.approval_notice')).not.toBeInTheDocument();
    });
});
