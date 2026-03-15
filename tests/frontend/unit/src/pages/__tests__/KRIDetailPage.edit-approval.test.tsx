import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KRIDetailPage } from '@/pages/KRIDetailPage';

const mockNavigate = vi.fn();
const mockGetKRI = vi.fn();
const mockGetHistory = vi.fn();
const mockGetRisk = vi.fn();
const mockUpdateKRI = vi.fn();

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

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        user: { id: 2 },
        canRecordKRI: true,
        hasPermission: () => true,
    }),
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRI: (...args: unknown[]) => mockGetKRI(...args),
        getHistory: (...args: unknown[]) => mockGetHistory(...args),
        updateKRI: (...args: unknown[]) => mockUpdateKRI(...args),
        deleteKRI: vi.fn(),
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
        });
        mockGetHistory.mockResolvedValue({ items: [], total: 0 });
        mockGetRisk.mockResolvedValue({ id: 8, name: 'Claims Ops Risk' });
        mockUpdateKRI.mockResolvedValue({
            approval_id: 88,
            message: 'KRI update submitted for approval.',
        });
    });

    it('shows an approval banner and keeps the record unchanged until approval is granted', async () => {
        render(<KRIDetailPage />);

        await screen.findAllByText('Claims Leakage Ratio');
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
});
