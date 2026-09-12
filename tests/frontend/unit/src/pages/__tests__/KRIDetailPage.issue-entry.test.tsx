import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KRIDetailPage } from '@/pages/KRIDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { renderWithQueryClient as render } from '@test/render';

const mockNavigate = vi.fn();
const mockGetKRI = vi.fn();
const mockGetHistory = vi.fn();
const mockGetRisk = vi.fn();
const mockDeleteKRI = vi.fn();
let canIssueWrite = true;

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '21' }),
        useNavigate: () => mockNavigate,
        useSearchParams: () => [new URLSearchParams()],
    };
});

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ isLoading: false }),
}));


vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getKRI: (...args: unknown[]) => mockGetKRI(...args),
        getHistory: (...args: unknown[]) => mockGetHistory(...args),
        deleteKRI: (...args: unknown[]) => mockDeleteKRI(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: unknown[]) => mockGetRisk(...args),
    },
}));

vi.mock('@/components/kri/KRIModal', () => ({
    KRIModal: () => null,
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
    IssueQuickCreateModal: ({
        isOpen,
        contextEntityLabel,
    }: {
        isOpen: boolean;
        contextEntityLabel: string;
    }) => (isOpen ? <div data-testid="issue-modal-context">{contextEntityLabel}</div> : null),
}));

describe('KRIDetailPage issue entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canIssueWrite = true;
        mockGetKRI.mockImplementation(async () => ({
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
            capabilities: {
                can_create_issue: canIssueWrite,
                can_archive_immediately: true,
            },
        }));
        mockGetHistory.mockResolvedValue({ items: [], total: 0 });
        mockGetRisk.mockResolvedValue({ id: 8, name: 'Claims Ops Risk' });
        mockDeleteKRI.mockResolvedValue(undefined);
    });

    it('shows create-issue action and opens contextual modal with KRI metric name', async () => {
        render(<KRIDetailPage />);

        const metricHeadings = await screen.findAllByText('Claims Leakage Ratio');
        expect(metricHeadings.length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: 'New Issue' }));

        expect(screen.getByTestId('issue-modal-context')).toHaveTextContent('Claims Leakage Ratio');
        expect(screen.queryByText('#21')).not.toBeInTheDocument();
    });

    it('hides create-issue action when user lacks issues:write', async () => {
        canIssueWrite = false;
        render(<KRIDetailPage />);

        const metricHeadings = await screen.findAllByText('Claims Leakage Ratio');
        expect(metricHeadings.length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('renders the non-leaky unavailable state when KRI detail is forbidden', async () => {
        mockGetKRI.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        render(<KRIDetailPage />);

        await screen.findByRole('heading', { name: /record unavailable/i });
        expect(screen.queryByRole('heading', { name: /access denied/i })).not.toBeInTheDocument();
        expect(screen.queryByText('KRI Not Found')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('keeps the KRI archive rationale and error inside the dialog after rejection', async () => {
        mockDeleteKRI.mockRejectedValueOnce(new Error('rejected'));
        render(<KRIDetailPage />);
        await screen.findAllByText('Claims Leakage Ratio');

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        const dialog = screen.getByRole('alertdialog');
        const reason = within(dialog).getByRole('textbox', { name: /reason/i });
        fireEvent.change(reason, { target: { value: 'Exact KRI rationale' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete KRI' }));

        expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
        expect(reason).toHaveValue('Exact KRI rationale');
        expect(mockDeleteKRI).toHaveBeenCalledWith(21, 'Exact KRI rationale');

        fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        const reopenedDialog = screen.getByRole('alertdialog');
        expect(within(reopenedDialog).queryByRole('alert')).not.toBeInTheDocument();
        expect(within(reopenedDialog).getByRole('textbox', { name: /reason/i })).toHaveValue('');
    });
});
