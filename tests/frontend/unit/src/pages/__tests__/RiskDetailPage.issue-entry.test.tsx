import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RiskDetailPage } from '@/pages/RiskDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { renderWithQueryClient as render } from '@test/render';
import { createTestQueryClient } from '@test/queryClient';

const mockNavigate = vi.fn();
const mockGetRisk = vi.fn();
const mockGetLinkedControls = vi.fn();
const mockGetLinkedVendors = vi.fn();
const mockGetOverdue = vi.fn();
const mockLinkControl = vi.fn();
const mockDeleteRisk = vi.fn();
let canIssueWrite = true;
let mockSearchParams = new URLSearchParams();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '7' }),
        useNavigate: () => mockNavigate,
        useSearchParams: () => [mockSearchParams],
    };
});

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ isLoading: false }),
}));


vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: (...args: unknown[]) => mockGetRisk(...args),
        getLinkedControls: (...args: unknown[]) => mockGetLinkedControls(...args),
        getLinkedVendors: (...args: unknown[]) => mockGetLinkedVendors(...args),
        linkControl: (...args: unknown[]) => mockLinkControl(...args),
        deleteRisk: (...args: unknown[]) => mockDeleteRisk(...args),
    },
}));

vi.mock('@/services/kriApi', () => ({
    kriApi: {
        getOverdue: (...args: unknown[]) => mockGetOverdue(...args),
    },
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskTypes: () => ({
        getColor: () => 'text-white',
        getDisplayName: () => 'Operational',
    }),
}));

vi.mock('@/components/ConfirmDialog', () => ({
    ConfirmDialog: ({
        isOpen,
        onConfirm,
    }: {
        isOpen: boolean;
        onConfirm: (reason?: string) => void;
    }) => isOpen ? (
        <button type="button" onClick={() => onConfirm('Risk no longer applies')}>
            confirm-risk-archive
        </button>
    ) : null,
}));

vi.mock('@/components/risks/RiskDetailOverviewTab', () => ({
    RiskDetailOverviewTab: ({ onLinkControl }: { onLinkControl: (controlId: number, effectiveness: 'high') => Promise<void> }) => (
        <div>
            Overview tab
            <button type="button" onClick={() => void onLinkControl(99, 'high')}>Trigger link failure</button>
        </div>
    ),
}));

vi.mock('@/components/risks/RiskDetailKriHistoryTab', () => ({
    RiskDetailKriHistoryTab: () => <div>History tab</div>,
}));

vi.mock('@/components/risks/RiskDetailQuestionnairesTab', () => ({
    RiskDetailQuestionnairesTab: () => <div>Assessment tab</div>,
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

describe('RiskDetailPage issue entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canIssueWrite = true;
        mockSearchParams = new URLSearchParams();
        mockGetRisk.mockImplementation(async () => ({
            id: 7,
            name: 'Liquidity Risk',
            status: 'active',
            is_priority: false,
            process: 'Treasury',
            description: 'Liquidity mismatch between assets and liabilities.',
            kris: [],
            capabilities: {
                can_create_issue: canIssueWrite,
                can_update: true,
                can_archive_immediately: true,
            },
        }));
        mockGetLinkedControls.mockResolvedValue([]);
        mockGetLinkedVendors.mockResolvedValue([]);
        mockGetOverdue.mockResolvedValue([]);
        mockLinkControl.mockResolvedValue({});
        mockDeleteRisk.mockResolvedValue(undefined);
    });

    it('shows create-issue entry and opens contextual modal with business label', async () => {
        render(<RiskDetailPage />);

        await screen.findByText('Liquidity Risk');

        const action = screen.getByRole('button', { name: 'New Issue' });
        expect(action).toBeInTheDocument();

        fireEvent.click(action);
        expect(screen.getByTestId('issue-modal-context')).toHaveTextContent('Liquidity Risk');
        expect(screen.queryByText('#7')).not.toBeInTheDocument();
    });

    it('hides create-issue entry when user lacks issues:write', async () => {
        canIssueWrite = false;
        render(<RiskDetailPage />);

        await screen.findByText('Liquidity Risk');
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('renders archived-normalized risks as archived in the detail header', async () => {
        mockGetRisk.mockResolvedValueOnce({
            id: 7,
            name: 'Archived Liquidity Risk',
            status: 'active',
            is_archived: true,
            is_priority: false,
            process: 'Treasury',
            description: 'Archived liquidity mismatch.',
            kris: [],
            capabilities: {
                can_create_issue: true,
                can_restore: true,
            },
        });

        render(<RiskDetailPage />);

        await screen.findByText('Archived Liquidity Risk');
        expect(screen.getByText('archived')).toBeInTheDocument();
    });

    it('renders the non-leaky unavailable state when risk detail is forbidden', async () => {
        mockGetRisk.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        render(<RiskDetailPage />);

        await screen.findByRole('heading', { name: /record unavailable/i });
        expect(screen.queryByRole('heading', { name: /access denied/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Risk Not Found')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('keeps the error-state back action non-submitting and operational', async () => {
        mockGetRisk.mockRejectedValue(
            new ApiClientError({ status: 500, messageKey: 'errorKeys.unexpected' })
        );

        render(<RiskDetailPage />, {
            queryClient: createTestQueryClient({ defaultOptions: { queries: { retryDelay: 0 } } }),
        });

        const back = await screen.findByRole('button', { name: 'Risk Register' });
        expect(back).toHaveAttribute('type', 'button');
        fireEvent.click(back);
        expect(mockNavigate).toHaveBeenCalledWith('/risks');
    });

    it('keeps the safe Risk list return destination on visible Back and edit navigation', async () => {
        const returnTo = '/risks?q=claims&view=department&page=3#group-heading';
        mockSearchParams = new URLSearchParams({ return_to: returnTo });
        render(<RiskDetailPage />);
        await screen.findByText('Liquidity Risk');

        fireEvent.click(screen.getByRole('button', { name: /back to register/i }));
        expect(mockNavigate).toHaveBeenCalledWith(returnTo);

        mockNavigate.mockClear();
        fireEvent.click(screen.getByRole('button', { name: /edit risk/i }));
        expect(mockNavigate).toHaveBeenCalledWith(
            `/risks/7/edit?return_to=${encodeURIComponent(returnTo)}`,
        );
    });

    it('exposes an adequate named action for dismissing a link error', async () => {
        mockLinkControl.mockRejectedValueOnce(new Error('link failed'));
        render(<RiskDetailPage />);
        await screen.findByText('Liquidity Risk');

        fireEvent.click(screen.getByRole('button', { name: 'Trigger link failure' }));
        const close = await screen.findByRole('button', { name: 'Close' });
        expect(close).toHaveAttribute('type', 'button');
        fireEvent.click(close);
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('returns an immediately archived Risk to its exact validated list working set', async () => {
        const returnTo = '/risks?q=liquidity&page=4#group-heading';
        mockSearchParams = new URLSearchParams({ return_to: returnTo });
        render(<RiskDetailPage />);
        await screen.findByText('Liquidity Risk');

        fireEvent.click(screen.getByRole('button', { name: /archive/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'confirm-risk-archive' }));

        await waitFor(() => expect(mockDeleteRisk).toHaveBeenCalledWith(7, 'Risk no longer applies'));
        expect(mockNavigate).toHaveBeenCalledWith(returnTo);
    });
});
