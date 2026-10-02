import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIValueModal } from '@/components/kri/KRIValueModal';
import type { KRICapabilities, KeyRiskIndicator } from '@/types/kri';

const recordValueMock = vi.fn();

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        recordValue: (...args: unknown[]) => recordValueMock(...args),
    },
}));


vi.mock('@/i18n/hooks', async (importOriginal) => ({
    // `useFormat` stays real (en in tests); only `useTranslation` is stubbed.
    ...(await importOriginal<typeof import('@/i18n/hooks')>()),
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/i18n/formatters', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/i18n/formatters')>()),
    formatDateValue: (value: string) => value,
}));

/** The modal's dirty-task guard (PG-22) blocks route changes, so it needs a data router. */
function DataRouterWrapper({ children }: { children: ReactNode }) {
    const router = createMemoryRouter([{ path: '/', element: children }]);
    return <RouterProvider router={router} />;
}

function renderModal(ui: ReactElement) {
    return render(ui, { wrapper: DataRouterWrapper });
}

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
        renderModal(
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
        const { rerender } = renderModal(
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
        renderModal(
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
        const { rerender } = renderModal(
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
    it('asks before discarding a typed value and keeps it on Stay (PG-22)', async () => {
        const onClose = vi.fn();
        renderModal(
            <KRIValueModal
                kri={makeKri(makeCapabilities())}
                isOpen
                onClose={onClose}
                onSuccess={vi.fn()}
            />
        );

        fireEvent.change(screen.getByDisplayValue('12'), { target: { value: '15' } });
        fireEvent.click(screen.getByRole('button', { name: 'common:actions.cancel' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /stay/i }));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue('15')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.click(await screen.findByRole('button', { name: /leave/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes an untouched value form without asking', () => {
        const onClose = vi.fn();
        renderModal(
            <KRIValueModal
                kri={makeKri(makeCapabilities())}
                isOpen
                onClose={onClose}
                onSuccess={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'common:actions.cancel' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('treats a submitted value as saved: closing the pending state does not ask', async () => {
        const onClose = vi.fn();
        renderModal(
            <KRIValueModal
                kri={makeKri(makeCapabilities({ can_request_value_submission_approval: true }))}
                isOpen
                onClose={onClose}
                onSuccess={vi.fn()}
            />
        );

        fireEvent.change(screen.getByDisplayValue('12'), { target: { value: '15' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'value_modal.title' })[0]);
        expect(await screen.findByText('value_modal.submitted_for_approval')).toBeInTheDocument();

        // Footer "Close" (the header close button carries the same name).
        const closeButtons = screen.getAllByRole('button', { name: 'common:actions.close' });
        fireEvent.click(closeButtons[closeButtons.length - 1]);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
});
