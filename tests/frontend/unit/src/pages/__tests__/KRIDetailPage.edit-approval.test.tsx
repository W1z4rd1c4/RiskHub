import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIDetailPage } from '@/pages/KRIDetailPage';

const mockNavigate = vi.fn();
const mockGetKRI = vi.fn();
const mockGetHistory = vi.fn();
const mockGetRisk = vi.fn();
const mockUpdateKRI = vi.fn();
const mockDeleteKRI = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '21' }),
        useNavigate: () => mockNavigate,
    };
});

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ isLoading: false }),
}));


vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRI: (...args: unknown[]) => mockGetKRI(...args),
        getHistory: (...args: unknown[]) => mockGetHistory(...args),
        updateKRI: (...args: unknown[]) => mockUpdateKRI(...args),
        deleteKRI: (...args: unknown[]) => mockDeleteKRI(...args),
        restoreKRI: vi.fn(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: unknown[]) => mockGetRisk(...args),
    },
}));

vi.mock('@/components/kri/KRIModal', () => ({
    KRIModal: ({
        isOpen,
        onSave,
    }: {
        isOpen: boolean;
        onSave: (data: Record<string, unknown>, vendorIds: number[]) => Promise<unknown>;
    }) =>
        isOpen ? (
            <button
                type="button"
                onClick={() => void onSave({ metric_name: 'Adjusted KRI', description: 'Adjusted desc' }, [12, 21])}
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
        mockGetKRI.mockResolvedValue({
            id: 21,
            risk_id: 8,
            metric_name: 'Claims Leakage Ratio',
            description: 'Monitors operational leakage trend.',
            current_value: 12.5,
            lower_limit: 0,
            upper_limit: 10,
            unit: '%',
            breach_status: 'breach',
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
        });
        mockGetHistory.mockResolvedValue({ items: [], total: 0 });
        mockGetRisk.mockResolvedValue({ id: 8, name: 'Claims Ops Risk' });
        mockUpdateKRI.mockResolvedValue({
            status: 'approval_required',
            approval_id: 88,
            action_type: 'edit',
            message: 'KRI update submitted for approval.',
            pending_fields: ['metric_name', 'description', 'linked_vendor_ids'],
        });
        mockDeleteKRI.mockResolvedValue(undefined);
    });

    it('shows an approval banner and keeps the record unchanged until approval is granted', async () => {
        render(<KRIDetailPage />);

        await screen.findAllByText('Claims Leakage Ratio');
        await waitFor(() => {
            expect(mockGetHistory).toHaveBeenCalledWith(21, expect.objectContaining({
                sort_by: 'period',
                sort_direction: 'desc',
            }));
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

        await screen.findByText(/KRI update submitted for approval\./i);
        expect(screen.queryByRole('button', { name: 'trigger-kri-save' })).not.toBeInTheDocument();
        expect(screen.getAllByText('Claims Leakage Ratio').length).toBeGreaterThan(0);
        expect(mockGetKRI).toHaveBeenCalledTimes(1);
    });

    it('shows an approval banner and stays on the detail page when delete requires approval', async () => {
        mockDeleteKRI.mockResolvedValue({
            status: 'approval_required',
            approval_id: 89,
            action_type: 'delete',
            message: 'Deletion request submitted for approval',
            pending_fields: [],
        });

        render(<KRIDetailPage />);

        await screen.findAllByText('Claims Leakage Ratio');
        fireEvent.click(screen.getByRole('button', { name: /Delete|Smazat/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-kri-delete' }));

        await waitFor(() => {
            expect(mockDeleteKRI).toHaveBeenCalledWith(21, 'Delete because threshold is obsolete');
        });

        await screen.findByText(/Deletion request submitted for approval/i);
        expect(screen.getAllByText('Claims Leakage Ratio').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'confirm-kri-delete' })).not.toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalledWith('/kris');
    });
});
