import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RiskDetailPage } from '@/pages/RiskDetailPage';
import { ApiClientError } from '@/services/apiClient';

const mockNavigate = vi.fn();
const mockGetRisk = vi.fn();
const mockGetLinkedControls = vi.fn();
const mockGetLinkedVendors = vi.fn();
const mockGetOverdue = vi.fn();
let canIssueWrite = true;

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '7' }),
        useNavigate: () => mockNavigate,
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
    ConfirmDialog: () => null,
}));

vi.mock('@/components/risks/RiskDetailOverviewTab', () => ({
    RiskDetailOverviewTab: () => <div>Overview tab</div>,
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
            },
        }));
        mockGetLinkedControls.mockResolvedValue([]);
        mockGetLinkedVendors.mockResolvedValue([]);
        mockGetOverdue.mockResolvedValue([]);
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

    it('renders denied instead of not found when risk detail is forbidden', async () => {
        mockGetRisk.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        render(<RiskDetailPage />);

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('Risk Not Found')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });
});
