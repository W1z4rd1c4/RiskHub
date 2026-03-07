import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueDetailPage } from '@/pages/IssueDetailPage';

const mockGetIssue = vi.fn();
const mockListActivity = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) =>
            resource === 'issues' && (action === 'read' || action === 'write' || action === 'approve'),
        canViewActivityLog: true,
    }),
}));

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        get: (...args: unknown[]) => mockGetIssue(...args),
    },
}));

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: (...args: unknown[]) => mockListActivity(...args),
    },
}));

vi.mock('@/components/issues/RemediationPlanCard', () => ({
    RemediationPlanCard: () => <div>Workflow card</div>,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useParams: () => ({ id: '42' }),
    };
});

describe('IssueDetailPage tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetIssue.mockResolvedValue({
            id: 42,
            title: 'Access Review Gap',
            severity: 'medium',
            status: 'open',
            source_type: 'manual',
            source_id: null,
            department_id: 3,
            department_name: 'Finance',
            owner_user_id: 8,
            owner_user_name: 'Anna Kowalski',
            opened_at: '2026-02-01T10:00:00Z',
            due_at: null,
            closed_at: null,
            created_at: '2026-02-01T10:00:00Z',
            updated_at: '2026-02-01T10:00:00Z',
            risk_contexts: [
                {
                    risk_id: 90,
                    risk_name: 'Customer Churn Risk',
                    risk_category: 'Operational',
                    risk_process: 'Retention',
                    risk_type: 'operational',
                },
            ],
            description: 'Quarterly evidence was not attached.',
            created_by_id: 8,
            created_by_name: 'Anna Kowalski',
            validation_note: null,
            links: [
                {
                    id: 55,
                    issue_id: 42,
                    risk_id: 90,
                    control_id: null,
                    execution_id: null,
                    kri_id: null,
                    linked_entity_type: 'risk',
                    linked_entity_name: 'Customer Churn Risk',
                    created_at: '2026-02-01T10:00:00Z',
                },
            ],
            remediation_plan: null,
            exceptions: [],
        });
        mockListActivity.mockResolvedValue({
            items: [
                {
                    id: 1,
                    entity_type: 'issue',
                    entity_id: 42,
                    entity_name: 'Access Review Gap',
                    action: 'update',
                    actor_id: 8,
                    actor_name: 'Anna Kowalski',
                    department_id: 3,
                    changes: null,
                    description: 'Issue updated',
                    created_at: '2026-02-02T10:00:00Z',
                },
            ],
            total: 1,
            skip: 0,
            limit: 100,
        });
    });

    it('renders tabs and keeps business naming without raw IDs', async () => {
        render(<IssueDetailPage />);

        await screen.findByText('Access Review Gap');

        expect(screen.getByTestId('issue-overview-panel')).toBeInTheDocument();
        expect(screen.getByText('Finance')).toBeInTheDocument();
        expect(screen.getAllByText('Anna Kowalski').length).toBeGreaterThan(0);
        expect(screen.getByText('Customer Churn Risk')).toBeInTheDocument();
        expect(screen.queryByText(/Issue #/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Owner ID/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Department ID/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Workflow/i }));
        expect(screen.getByTestId('issue-workflow-panel')).toBeInTheDocument();
        expect(screen.getByText('Workflow card')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /History/i }));
        expect(screen.getByTestId('issue-history-panel')).toBeInTheDocument();
        await waitFor(() =>
            expect(mockListActivity).toHaveBeenCalledWith({
                entity_type: 'issue',
                entity_id: 42,
                limit: 100,
            })
        );
        expect(screen.getByText('Issue updated')).toBeInTheDocument();
    });

    it('shows unknown linked entity label without exposing numeric IDs', async () => {
        mockGetIssue.mockResolvedValueOnce({
            id: 42,
            title: 'Access Review Gap',
            severity: 'medium',
            status: 'open',
            source_type: 'manual',
            source_id: null,
            department_id: 3,
            department_name: 'Finance',
            owner_user_id: 8,
            owner_user_name: 'Anna Kowalski',
            opened_at: '2026-02-01T10:00:00Z',
            due_at: null,
            closed_at: null,
            created_at: '2026-02-01T10:00:00Z',
            updated_at: '2026-02-01T10:00:00Z',
            risk_contexts: [],
            description: 'Quarterly evidence was not attached.',
            created_by_id: 8,
            created_by_name: 'Anna Kowalski',
            validation_note: null,
            links: [
                {
                    id: 56,
                    issue_id: 42,
                    risk_id: 777,
                    control_id: null,
                    execution_id: null,
                    kri_id: null,
                    linked_entity_type: 'risk',
                    linked_entity_name: null,
                    created_at: '2026-02-01T10:00:00Z',
                },
            ],
            remediation_plan: null,
            exceptions: [],
        });

        render(<IssueDetailPage />);

        await screen.findByText('Unknown risk');
        expect(screen.queryByText(/Risk #777/i)).not.toBeInTheDocument();
    });
});
