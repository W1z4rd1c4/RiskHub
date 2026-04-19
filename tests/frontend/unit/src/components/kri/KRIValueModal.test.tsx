import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIValueModal } from '@/components/kri/KRIValueModal';

const recordValueMock = vi.fn();

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        recordValue: (...args: unknown[]) => recordValueMock(...args),
    },
}));

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        canResolveApprovals: false,
    }),
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
                kri={{
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
                }}
                isOpen
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        fireEvent.click(screen.getAllByRole('button', { name: 'value_modal.title' })[0]);

        await waitFor(() => expect(recordValueMock).toHaveBeenCalledWith(7, { value: 12 }));
        expect(await screen.findByText('value_modal.submitted_for_approval')).toBeInTheDocument();
    });
});
