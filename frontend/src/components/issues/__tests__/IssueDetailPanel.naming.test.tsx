import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IssueDetailPanel } from '../IssueDetailPanel';
import type { Issue } from '@/types/issue';

vi.mock('../RemediationPlanCard', () => ({
    RemediationPlanCard: () => <div data-testid="remediation-plan-card">Remediation</div>,
}));

function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
        id: 19,
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
        description: 'Quarterly evidence was not attached.',
        created_by_id: 8,
        created_by_name: 'Anna Kowalski',
        validation_note: null,
        links: [
            {
                id: 55,
                issue_id: 19,
                risk_id: 90,
                control_id: null,
                execution_id: null,
                kri_id: null,
                linked_entity_type: 'risk',
                linked_entity_name: 'Customer Churn Risk',
                created_at: '2026-02-01T10:00:00Z',
            },
        ],
        remediation_plan: {
            id: 70,
            issue_id: 19,
            status: 'draft',
            progress_percent: 0,
            owner_user_id: 8,
            owner_user_name: 'Anna Kowalski',
            target_date: null,
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

describe('IssueDetailPanel business naming', () => {
    it('renders business names and hides raw IDs', () => {
        render(
            <IssueDetailPanel
                issue={makeIssue()}
                canWrite={false}
                canApprove={false}
                onIssueUpdated={() => undefined}
            />
        );

        expect(screen.getByText('Anna Kowalski')).toBeInTheDocument();
        expect(screen.getByText('Finance')).toBeInTheDocument();
        expect(screen.getByText('Customer Churn Risk')).toBeInTheDocument();

        expect(screen.queryByText(/Issue #/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Owner ID/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Department ID/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Risk #/i)).not.toBeInTheDocument();
    });

    it('shows unknown fallback labels without exposing numeric IDs', () => {
        render(
            <IssueDetailPanel
                issue={makeIssue({
                    links: [
                        {
                            id: 56,
                            issue_id: 19,
                            risk_id: 777,
                            control_id: null,
                            execution_id: null,
                            kri_id: null,
                            linked_entity_type: 'risk',
                            linked_entity_name: null,
                            created_at: '2026-02-01T10:00:00Z',
                        },
                    ],
                })}
                canWrite={false}
                canApprove={false}
                onIssueUpdated={() => undefined}
            />
        );

        expect(screen.getByText('Unknown risk')).toBeInTheDocument();
        expect(screen.queryByText(/Risk #777/i)).not.toBeInTheDocument();
    });
});
