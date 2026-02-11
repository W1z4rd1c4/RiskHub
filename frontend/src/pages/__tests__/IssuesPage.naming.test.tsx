import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesPage } from '@/pages/IssuesPage';

const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockListDepartments = vi.fn();
const mockListAssignableOwners = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (resource: string, action: string) => {
            if (resource !== 'issues') {
                return false;
            }
            return action === 'read' || action === 'write';
        },
    }),
}));

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        list: (...args: unknown[]) => mockList(...args),
        get: (...args: unknown[]) => mockGet(...args),
        create: (...args: unknown[]) => mockCreate(...args),
        listDepartments: (...args: unknown[]) => mockListDepartments(...args),
        listAssignableOwners: (...args: unknown[]) => mockListAssignableOwners(...args),
    },
}));

vi.mock('@/services/reportApi', () => ({
    reportApi: {
        exportIssues: vi.fn(),
    },
}));

vi.mock('@/components/issues/IssueDetailPanel', () => ({
    IssueDetailPanel: () => <div data-testid="issue-detail-panel">Issue detail</div>,
}));

describe('IssuesPage business naming', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        const summary = {
            id: 42,
            title: 'Patch Vulnerability',
            severity: 'high',
            status: 'open',
            source_type: 'manual',
            source_id: null,
            department_id: 7,
            department_name: 'Operations',
            owner_user_id: 9,
            owner_user_name: 'Eva Kralova',
            opened_at: '2026-01-02T09:00:00Z',
            due_at: null,
            closed_at: null,
            created_at: '2026-01-02T09:00:00Z',
            updated_at: '2026-01-02T09:00:00Z',
        };

        mockList.mockResolvedValue({
            items: [summary],
            total: 1,
            skip: 0,
            limit: 100,
        });
        mockGet.mockResolvedValue({
            ...summary,
            description: 'Remediate vulnerable endpoint',
            created_by_id: 9,
            created_by_name: 'Eva Kralova',
            validation_note: null,
            links: [],
            remediation_plan: {
                id: 5,
                issue_id: 42,
                status: 'draft',
                progress_percent: 0,
                owner_user_id: 9,
                owner_user_name: 'Eva Kralova',
                target_date: null,
                blocker_reason: null,
                completion_notes: null,
                completed_at: null,
                created_at: '2026-01-02T09:00:00Z',
                updated_at: '2026-01-02T09:00:00Z',
            },
            exceptions: [],
        });
        mockCreate.mockResolvedValue({});
        mockListDepartments.mockResolvedValue([{ id: 7, name: 'Operations', code: 'OPS' }]);
        mockListAssignableOwners.mockResolvedValue([
            { id: 9, name: 'Eva Kralova', role_name: 'Department Head', department_name: 'Operations' },
        ]);
    });

    it('renders issue cards and create form using business names instead of IDs', async () => {
        render(<IssuesPage />);

        await screen.findByText('Patch Vulnerability');
        await waitFor(() => expect(mockListDepartments).toHaveBeenCalledTimes(1));

        expect(screen.queryByText('Department ID')).not.toBeInTheDocument();
        expect(screen.queryByText('Owner user ID (optional)')).not.toBeInTheDocument();
        expect(screen.queryByText(/#42/)).not.toBeInTheDocument();

        expect(screen.getByRole('option', { name: 'Operations (OPS)' })).toBeInTheDocument();
        expect(screen.getAllByText('Operations').length).toBeGreaterThan(0);
    });
});
