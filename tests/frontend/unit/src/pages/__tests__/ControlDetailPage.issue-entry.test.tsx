import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ControlDetailPage } from '@/pages/ControlDetailPage';
import { ApiClientError } from '@/services/apiClient';

const mockNavigate = vi.fn();
const mockGetControl = vi.fn();
const mockGetLinkedRisks = vi.fn();
let canIssueWrite = true;

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: '13' }),
        useNavigate: () => mockNavigate,
    };
});

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        isLoading: false,
        user: { id: 2 },
        hasPermission: () => true,
    }),
}));

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) => {
            if (resource === 'issues' && action === 'write') {
                return canIssueWrite;
            }
            return true;
        },
    }),
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getControl: (...args: unknown[]) => mockGetControl(...args),
        getLinkedRisks: (...args: unknown[]) => mockGetLinkedRisks(...args),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisk: vi.fn(),
    },
}));

vi.mock('@/components/LinkManagementDialog', () => ({
    LinkManagementDialog: () => null,
}));

vi.mock('@/components/executions/ExecutionHistory', () => ({
    ExecutionHistory: () => <div>Execution history</div>,
}));

vi.mock('@/components/executions/ExecutionLogModal', () => ({
    ExecutionLogModal: () => null,
}));

vi.mock('@/components/ArchiveConfirmDialog', () => ({
    ArchiveConfirmDialog: () => null,
}));

vi.mock('@/components/RiskQuickViewModal', () => ({
    RiskQuickViewModal: () => null,
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

describe('ControlDetailPage issue entry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canIssueWrite = true;
        mockGetControl.mockImplementation(async () => ({
            id: 13,
            name: 'Quarterly Access Review',
            description: 'Ensure privileged access is reviewed.',
            status: 'active',
            risk_level: 3,
            frequency: 'monthly',
            control_form: 'preventive',
            control_owner_id: 2,
            control_owner: { name: 'Anna Kowalski', email: 'anna@example.com' },
            department: { name: 'Risk Management' },
            process_owner_position: 'Chief Risk Officer',
            methodology_reference: 'SOC2-AC-01',
            data_source: 'IAM export',
            capabilities: {
                can_create_issue: canIssueWrite,
            },
        }));
        mockGetLinkedRisks.mockResolvedValue([]);
    });

    it('shows create-issue action and opens contextual modal with control name', async () => {
        render(
            <MemoryRouter initialEntries={['/controls/13']}>
                <ControlDetailPage />
            </MemoryRouter>
        );

        await screen.findByText('Quarterly Access Review');
        fireEvent.click(screen.getByRole('button', { name: 'New Issue' }));

        expect(screen.getByTestId('issue-modal-context')).toHaveTextContent('Quarterly Access Review');
        expect(screen.queryByText('#13')).not.toBeInTheDocument();
    });

    it('hides create-issue action when user lacks issues:write', async () => {
        canIssueWrite = false;
        render(
            <MemoryRouter initialEntries={['/controls/13']}>
                <ControlDetailPage />
            </MemoryRouter>
        );

        await screen.findByText('Quarterly Access Review');
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('renders archived-normalized controls as archived in the detail header', async () => {
        mockGetControl.mockResolvedValueOnce({
            id: 13,
            name: 'Legacy Access Review',
            description: 'Control normalized to active lifecycle status.',
            status: 'active',
            is_archived: true,
            risk_level: 3,
            frequency: 'monthly',
            control_form: 'manual',
            control_owner_id: 2,
            monitoring_status: 'passed',
            capabilities: {
                can_create_issue: true,
                can_restore: true,
            },
        });

        render(
            <MemoryRouter initialEntries={['/controls/13']}>
                <ControlDetailPage />
            </MemoryRouter>
        );

        await screen.findByText('Legacy Access Review');
        expect(screen.getByText(/^archived$/i)).toBeInTheDocument();
        expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();
    });

    it('renders denied instead of not found when control detail is forbidden', async () => {
        mockGetControl.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        render(
            <MemoryRouter initialEntries={['/controls/13']}>
                <ControlDetailPage />
            </MemoryRouter>
        );

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('Control Not Found')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });
});
