const abortSignalMatcher: unknown = expect.any(AbortSignal);
import { kriFixture, riskFixture } from './pageFixtures';
import type * as MockkriApiModule from '@/services/kriApi';
import type * as MockriskApiModule from '@/services/riskApi';
import type * as Actualreactrouterdom from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackProvider } from '@/contexts/FeedbackContext';
import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { renderInRouter as render } from '@test/render';

const mockNavigate = vi.fn();
const mockGetKRI = vi.fn<typeof MockkriApiModule.kriApi.getKRI>();
const mockGetHistory = vi.fn<typeof MockkriApiModule.kriApi.getHistory>();
const mockGetRisk = vi.fn<typeof MockriskApiModule.riskApi.getRisk>();
const mockUpdateKRI = vi.fn<typeof MockkriApiModule.kriApi.updateKRI>();
const mockDeleteKRI = vi.fn<typeof MockkriApiModule.kriApi.deleteKRI>();
let mockSearchParams = new URLSearchParams();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof Actualreactrouterdom>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '21' }),
        useNavigate: () => mockNavigate,
        // D12: the approval-queued notice reads router state.
        useLocation: () => ({ pathname: '/kris/21', search: '', hash: '', state: null, key: 'test' }),
        useSearchParams: () => [mockSearchParams],
    };
});

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ isLoading: false }),
}));


vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRI: (...args: Parameters<typeof mockGetKRI>) => mockGetKRI(...args),
        getHistory: (...args: Parameters<typeof mockGetHistory>) => mockGetHistory(...args),
        updateKRI: (...args: Parameters<typeof mockUpdateKRI>) => mockUpdateKRI(...args),
        deleteKRI: (...args: Parameters<typeof mockDeleteKRI>) => mockDeleteKRI(...args),
        restoreKRI: vi.fn(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: Parameters<typeof mockGetRisk>) => mockGetRisk(...args),
    },
}));

vi.mock('@/components/kri/KRIModal', () => ({
    KRIModal: ({
        isOpen,
        onClose,
        onSave,
    }: {
        isOpen: boolean;
        onClose: () => void;
        onSave: (data: Record<string, unknown>, vendorIds: number[]) => Promise<unknown>;
    }) =>
        isOpen ? (
            <button
                type="button"
                onClick={() => void onSave(
                    { metric_name: 'Adjusted KRI', description: 'Adjusted desc' },
                    [12, 21],
                ).then(onClose)}
            >
                trigger-kri-save
            </button>
        ) : null,
}));

vi.mock('@/components/kri/KRIValueModal', () => ({
    KRIValueModal: () => null,
}));

vi.mock('@/components/kri/KRIHistoryEditModal', () => ({
    KRIHistoryEditModal: () => null,
}));

vi.mock('@/components/kris/KRIDetailOverviewTab', () => ({
    KRIDetailOverviewTab: () => <div>KRI overview</div>,
}));

vi.mock('@/components/kris/KRIDetailHistoryTab', () => ({
    KRIDetailHistoryTab: () => <div>KRI history</div>,
}));

vi.mock('@/components/issues/IssueQuickCreateModal', () => ({
    IssueQuickCreateModal: () => null,
}));

vi.mock('@/components/ConfirmDialog', () => ({
    ConfirmDialog: ({
        isOpen,
        onConfirm,
    }: {
        isOpen: boolean;
        onConfirm: (inputValue?: string) => void;
    }) =>
        isOpen ? (
            <button
                type="button"
                onClick={() => onConfirm('Delete because threshold is obsolete')}
            >
                confirm-kri-delete
            </button>
        ) : null,
}));

describe('KRIDetailPage approval-aware edit flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSearchParams = new URLSearchParams();
        mockGetKRI.mockResolvedValue(kriFixture({
            id: 21,
            risk_id: 8,
            metric_name: 'Claims Leakage Ratio',
            description: 'Monitors operational leakage trend.',
            current_value: 12.5,
            lower_limit: 0,
            upper_limit: 10,
            unit: '%',
            breach_status: 'above',
            reporting_owner_id: 2,
            is_archived: false,
            last_period_end: '2026-02-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            last_updated: '2026-03-01T00:00:00Z',
            linked_vendors: [{ id: 12, name: 'Vendor Twelve' }],
            frequency: 'quarterly',
            capabilities: {
                can_update: true,
                can_archive_immediately: false,
                can_request_archive_approval: true,
                can_restore: false,
                can_submit_value: true,
                can_request_history_correction: true,
                can_create_issue: false,
            },
        }));
        mockGetHistory.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 });
        mockGetRisk.mockResolvedValue(riskFixture({ id: 8, name: 'Claims Ops Risk' }));
        mockUpdateKRI.mockResolvedValue({
            status: 'approval_required',
            approval_id: 88,
            action_type: 'edit',
            message: 'KRI update submitted for approval.',
            pending_fields: ['metric_name', 'description', 'linked_vendor_ids'],
        });
        mockDeleteKRI.mockResolvedValue(undefined);
    });

    it('keeps the user on the KRI with the pending notice and a toast; the record stays unchanged (D12)', async () => {
        render(<FeedbackProvider><KRIDetailPage /></FeedbackProvider>);

        await screen.findAllByText('Claims Leakage Ratio');
        await waitFor(() => {
            expect(mockGetHistory).toHaveBeenCalledWith(
                21,
                expect.objectContaining({
                    sort_by: 'period',
                    sort_direction: 'desc',
                }),
                { signal: abortSignalMatcher },
            );
        });
        fireEvent.click(screen.getByRole('button', { name: /Edit|Upravit/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'trigger-kri-save' }));

        await waitFor(() => {
            expect(mockUpdateKRI).toHaveBeenCalledWith(21, expect.objectContaining({
                metric_name: 'Adjusted KRI',
                description: 'Adjusted desc',
                linked_vendor_ids: [12, 21],
            }));
        });

        const toast = (await screen.findByText('Submitted for approval')).closest('li');
        expect(toast).toHaveAttribute('data-tone', 'success');
        expect(mockNavigate).toHaveBeenCalledWith(
            { pathname: '/kris/21', search: '', hash: '' },
            { replace: true, state: { approvalQueued: { approvalId: 88 } } },
        );
        expect(screen.queryByRole('button', { name: 'trigger-kri-save' })).not.toBeInTheDocument();
        expect(screen.getAllByText('Claims Leakage Ratio').length).toBeGreaterThan(0);
        expect(mockGetKRI).toHaveBeenCalledTimes(1);
    });

    it('stays on the detail page with the pending notice and a toast when archive requires approval (D12)', async () => {
        mockDeleteKRI.mockResolvedValue({
            status: 'approval_required',
            approval_id: 89,
            action_type: 'delete',
            message: 'Deletion request submitted for approval',
            pending_fields: [],
        });

        render(<FeedbackProvider><KRIDetailPage /></FeedbackProvider>);

        await screen.findAllByText('Claims Leakage Ratio');
        fireEvent.click(screen.getByRole('button', { name: /^(Archive|Archivovat)$/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-kri-delete' }));

        await waitFor(() => {
            expect(mockDeleteKRI).toHaveBeenCalledWith(21, 'Delete because threshold is obsolete');
        });

        await screen.findByText('Submitted for approval');
        expect(mockNavigate).toHaveBeenCalledWith(
            { pathname: '/kris/21', search: '', hash: '' },
            { replace: true, state: { approvalQueued: { approvalId: 89 } } },
        );
        expect(screen.getAllByText('Claims Leakage Ratio').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'confirm-kri-delete' })).not.toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalledWith('/kris');
    });

    it('returns an immediately deleted KRI to its exact validated list working set', async () => {
        const returnTo = '/kris?q=threshold&page=4#group-heading';
        mockSearchParams = new URLSearchParams({ return_to: returnTo });

        render(<KRIDetailPage />);

        await screen.findAllByText('Claims Leakage Ratio');
        fireEvent.click(screen.getByRole('button', { name: /^(Archive|Archivovat)$/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-kri-delete' }));

        await waitFor(() => expect(mockDeleteKRI).toHaveBeenCalled());
        expect(mockNavigate).toHaveBeenCalledWith(returnTo);
    });
});
