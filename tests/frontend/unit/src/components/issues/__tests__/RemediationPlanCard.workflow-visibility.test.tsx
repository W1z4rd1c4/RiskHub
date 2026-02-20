import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemediationPlanCard } from '@/components/issues/RemediationPlanCard';
import type { Issue } from '@/types/issue';

const mockListAssignableOwners = vi.fn();

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        listAssignableOwners: (...args: unknown[]) => mockListAssignableOwners(...args),
        get: vi.fn(),
        assign: vi.fn(),
        startRemediation: vi.fn(),
        updateProgress: vi.fn(),
        requestException: vi.fn(),
        approveException: vi.fn(),
        close: vi.fn(),
    },
}));

function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
        id: 11,
        title: 'Issue title',
        severity: 'high',
        status: 'open',
        source_type: 'manual',
        source_id: null,
        department_id: 5,
        department_name: 'Risk Management',
        owner_user_id: 2,
        owner_user_name: 'Anna Kowalski',
        opened_at: '2026-02-01T10:00:00Z',
        due_at: '2026-02-20T10:00:00Z',
        closed_at: null,
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z',
        description: 'Desc',
        created_by_id: 2,
        created_by_name: 'Anna Kowalski',
        validation_note: null,
        links: [],
        remediation_plan: {
            id: 1,
            issue_id: 11,
            status: 'active',
            progress_percent: 50,
            owner_user_id: 2,
            owner_user_name: 'Anna Kowalski',
            target_date: '2026-02-20T10:00:00Z',
            blocker_reason: null,
            completion_notes: null,
            completed_at: null,
            created_at: '2026-02-01T10:00:00Z',
            updated_at: '2026-02-01T10:00:00Z',
        },
        exceptions: [],
        ...overrides,
    };
}

describe('RemediationPlanCard workflow visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hides mutation actions when issue is closed and keeps summary visible', async () => {
        mockListAssignableOwners.mockResolvedValue([{ id: 2, name: 'Anna Kowalski', role_name: 'CRO', department_name: 'Risk Management' }]);

        render(
            <RemediationPlanCard
                issue={makeIssue({ status: 'closed', closed_at: '2026-02-05T10:00:00Z' })}
                canWrite
                canApprove
                onIssueUpdated={() => undefined}
            />
        );

        expect(screen.getByText(/This issue is closed\./i)).toBeInTheDocument();
        expect(screen.getByTestId('workflow-summary-card')).toBeInTheDocument();
        expect(screen.getByTestId('workflow-closed-card')).toBeInTheDocument();
        expect(mockListAssignableOwners).not.toHaveBeenCalled();

        expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Start Remediation' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Update Progress' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Request Exception' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Approve Exception' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Close Issue' })).not.toBeInTheDocument();
    });

    it('shows workflow actions for non-closed issue and hides approve exception when no request exists', async () => {
        mockListAssignableOwners.mockResolvedValue([{ id: 2, name: 'Anna Kowalski', role_name: 'CRO', department_name: 'Risk Management' }]);

        render(
            <RemediationPlanCard
                issue={makeIssue({ status: 'open', exceptions: [] })}
                canWrite
                canApprove
                onIssueUpdated={() => undefined}
            />
        );

        await waitFor(() => expect(mockListAssignableOwners).toHaveBeenCalled());

        expect(screen.getByTestId('workflow-assignment-card')).toBeInTheDocument();
        expect(screen.getByTestId('workflow-progress-card')).toBeInTheDocument();
        expect(screen.getByTestId('workflow-exception-card')).toBeInTheDocument();
        expect(screen.getByTestId('workflow-closure-card')).toBeInTheDocument();

        expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start Remediation' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Update Progress' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Request Exception' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close Issue' })).toBeInTheDocument();

        expect(screen.queryByRole('button', { name: 'Approve Exception' })).not.toBeInTheDocument();
    });

    it('shows approve exception action only when a requested exception exists', async () => {
        mockListAssignableOwners.mockResolvedValue([{ id: 2, name: 'Anna Kowalski', role_name: 'CRO', department_name: 'Risk Management' }]);

        render(
            <RemediationPlanCard
                issue={makeIssue({
                    status: 'in_progress',
                    exceptions: [
                        {
                            id: 9,
                            issue_id: 11,
                            status: 'requested',
                            reason: 'Need temporary exception',
                            requested_by_id: 2,
                            requested_by_name: 'Anna Kowalski',
                            approved_by_id: null,
                            approved_by_name: null,
                            requested_at: '2026-02-02T10:00:00Z',
                            approved_at: null,
                            expires_at: null,
                            created_at: '2026-02-02T10:00:00Z',
                            updated_at: '2026-02-02T10:00:00Z',
                        },
                    ],
                })}
                canWrite
                canApprove
                onIssueUpdated={() => undefined}
            />
        );

        await waitFor(() => expect(mockListAssignableOwners).toHaveBeenCalled());

        expect(screen.getByRole('button', { name: 'Approve Exception' })).toBeInTheDocument();
    });
});
