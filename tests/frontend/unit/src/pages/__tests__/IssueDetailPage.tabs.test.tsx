import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';
import { IssueDetailPage } from '@/pages/IssueDetailPage';
import { ApiClientError } from '@/services/apiClient';
import { __resetSessionStoreForTests, setSessionSnapshot } from '@/services/session/store';

const mockGetIssue = vi.fn();
const mockListActivity = vi.fn();


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

function renderIssueDetailPage() {
    const queryClient = createTestQueryClient();
    const rendered = render(
        <QueryClientProvider client={queryClient}>
            <IssueDetailPage />
        </QueryClientProvider>,
    );
    return {
        ...rendered,
        queryClient,
    };
}

function setAuthenticatedSession(userId: number, name: string) {
    setSessionSnapshot({
        token: `token-${userId}`,
        user: {
            id: userId,
            email: `${userId}@riskhub.test`,
            name,
            role: 'administrator',
            role_display_name: 'Administrator',
            department_id: null,
            department_name: null,
            permissions: [],
            effective_permissions: [],
            access_scope: 'global',
            scope_label: 'Global',
        },
        bootstrapStatus: 'authenticated',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
        lastUpdatedAt: Date.now(),
    });
}

const issueHistoryCapabilities = {
    can_view_activity_history: true,
};

describe('IssueDetailPage tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetSessionStoreForTests();
        mockGetIssue.mockResolvedValue({
            id: 42,
            title: 'Access Review Gap',
            severity: 'medium',
            status: 'open',
            source_type: 'manual',
            source_id: null,
            source_display: 'Customer Churn Risk',
            source_link: {
                id: 55,
                issue_id: 42,
                risk_id: 90,
                control_id: null,
                execution_id: null,
                kri_id: null,
                linked_entity_type: 'risk',
                linked_entity_name: 'Customer Churn Risk',
                is_source_link: true,
                created_at: '2026-02-01T10:00:00Z',
            },
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
                    is_source_link: true,
                    created_at: '2026-02-01T10:00:00Z',
                },
            ],
            remediation_plan: null,
            capabilities: issueHistoryCapabilities,
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

    it('loads issue detail from backend without local session permission gates', async () => {
        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');
        expect(mockGetIssue).toHaveBeenCalledWith(42, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(screen.queryByText('You do not have permission to view issues.')).not.toBeInTheDocument();
    });

    it('renders view denied when backend issue detail returns forbidden', async () => {
        mockGetIssue.mockRejectedValueOnce(
            new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            })
        );

        renderIssueDetailPage();

        await screen.findByText('You do not have permission to view issues.');
        expect(screen.queryByText('Issue Not Found')).not.toBeInTheDocument();
        expect(screen.queryByTestId('issue-overview-panel')).not.toBeInTheDocument();
    });

    it('renders tabs and keeps business naming without raw IDs', async () => {
        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');

        expect(screen.getByTestId('issue-overview-panel')).toBeInTheDocument();
        expect(screen.getByText('Finance')).toBeInTheDocument();
        expect(screen.getAllByText('Anna Kowalski').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Customer Churn Risk').length).toBeGreaterThan(1);
        expect(screen.getAllByText('Source').length).toBeGreaterThan(1);
        expect(screen.queryByText(/Issue #/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Owner ID/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Department ID/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Workflow/i }));
        expect(screen.getByTestId('issue-workflow-panel')).toBeInTheDocument();
        expect(screen.getByText('Workflow card')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /History/i }));
        expect(screen.getByTestId('issue-history-panel')).toBeInTheDocument();
        await waitFor(() =>
            expect(mockListActivity).toHaveBeenCalledWith(
                {
                    entity_type: 'issue',
                    entity_id: 42,
                    limit: 100,
                },
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            )
        );
        expect(await screen.findByText('Issue updated')).toBeInTheDocument();
    });

    it('does not fetch history when backend capability denies activity history', async () => {
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
            links: [],
            remediation_plan: null,
            capabilities: { can_view_activity_history: false },
            exceptions: [],
        });

        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');
        fireEvent.click(screen.getByRole('tab', { name: /History/i }));

        expect(screen.getByText('You do not have permission to view activity history for this issue.')).toBeInTheDocument();
        expect(mockListActivity).not.toHaveBeenCalled();
    });

    it('does not fetch history when backend capability metadata is missing', async () => {
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
            links: [],
            remediation_plan: null,
            exceptions: [],
        });

        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');
        fireEvent.click(screen.getByRole('tab', { name: /History/i }));

        expect(screen.getByText('You do not have permission to view activity history for this issue.')).toBeInTheDocument();
        expect(mockListActivity).not.toHaveBeenCalled();
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

        renderIssueDetailPage();

        await screen.findByText('Unknown risk');
        expect(screen.queryByText(/Risk #777/i)).not.toBeInTheDocument();
    });

    it('re-fetches history when the loaded issue is refreshed on the history tab', async () => {
        mockGetIssue.mockReset();
        mockGetIssue
            .mockResolvedValueOnce({
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
                links: [],
                remediation_plan: null,
                capabilities: issueHistoryCapabilities,
                exceptions: [],
            })
            .mockResolvedValueOnce({
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
                updated_at: '2026-02-03T10:00:00Z',
                risk_contexts: [],
                description: 'Quarterly evidence was not attached.',
                created_by_id: 8,
                created_by_name: 'Anna Kowalski',
                validation_note: null,
                links: [],
                remediation_plan: null,
                capabilities: issueHistoryCapabilities,
                exceptions: [],
            });
        mockListActivity.mockReset();
        mockListActivity
            .mockResolvedValueOnce({
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
            })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 2,
                        entity_type: 'issue',
                        entity_id: 42,
                        entity_name: 'Access Review Gap',
                        action: 'update',
                        actor_id: 8,
                        actor_name: 'Anna Kowalski',
                        department_id: 3,
                        changes: null,
                        description: 'Issue refreshed from API',
                        created_at: '2026-02-03T10:00:00Z',
                    },
                ],
                total: 1,
                skip: 0,
                limit: 100,
            });

        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');

        fireEvent.click(screen.getByRole('tab', { name: /History/i }));
        await screen.findByText('Issue updated');
        expect(mockGetIssue).toHaveBeenCalledTimes(1);
        expect(mockListActivity).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

        await waitFor(() => expect(mockGetIssue).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(mockListActivity).toHaveBeenCalledTimes(2));
        expect(await screen.findByText('Issue refreshed from API')).toBeInTheDocument();
        expect(screen.queryByText('Issue updated')).not.toBeInTheDocument();
    });

    it('requests issue detail without local issues:read gating', async () => {
        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');
        expect(mockGetIssue).toHaveBeenCalledWith(42, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(mockListActivity).not.toHaveBeenCalled();
    });

    it('shows the fatal error screen when the initial issue load fails without cached data', async () => {
        mockGetIssue.mockReset();
        mockGetIssue.mockRejectedValueOnce(new Error('backend unavailable'));

        renderIssueDetailPage();

        expect(await screen.findByText('Issue Not Found')).toBeInTheDocument();
        expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
        expect(screen.queryByTestId('issue-overview-panel')).not.toBeInTheDocument();
        expect(screen.queryByText('Access Review Gap')).not.toBeInTheDocument();
    });

    it('keeps cached issue data visible when a background refetch fails', async () => {
        mockGetIssue.mockReset();
        mockGetIssue
            .mockResolvedValueOnce({
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
                links: [],
                remediation_plan: null,
                exceptions: [],
            })
            .mockRejectedValueOnce(new Error('temporary upstream failure'));

        const rendered = renderIssueDetailPage();

        await screen.findByText('Access Review Gap');
        expect(screen.getByTestId('issue-overview-panel')).toBeInTheDocument();

        await act(async () => {
            try {
                await rendered.queryClient.refetchQueries({ queryKey: ['issue'] });
            } catch {
                // TanStack Query surfaces the refetch failure via query state; the UI should retain cached data.
            }
        });

        await waitFor(() => expect(mockGetIssue).toHaveBeenCalledTimes(2));
        expect(screen.getByText('Access Review Gap')).toBeInTheDocument();
        expect(screen.getByTestId('issue-overview-panel')).toBeInTheDocument();
        expect(screen.queryByText('Issue Not Found')).not.toBeInTheDocument();
    });

    it('aborts the history request when the page unmounts on the history tab', async () => {
        let capturedSignal: AbortSignal | undefined;
        let abortNotified = false;
        mockListActivity.mockImplementationOnce(
            (_filters: unknown, options?: { signal?: AbortSignal }) =>
                new Promise((resolve) => {
                capturedSignal = options?.signal;
                    options?.signal?.addEventListener(
                        'abort',
                        () => {
                            abortNotified = true;
                            resolve({
                                items: [],
                                total: 0,
                                skip: 0,
                                limit: 100,
                            });
                        },
                        { once: true },
                    );
                }),
        );

        const rendered = renderIssueDetailPage();
        await screen.findByText('Access Review Gap');

        fireEvent.click(screen.getByRole('tab', { name: /History/i }));
        await waitFor(() => expect(mockListActivity).toHaveBeenCalledTimes(1));

        rendered.unmount();

        await waitFor(() => expect(abortNotified).toBe(true));
        expect(capturedSignal).toBeDefined();
        expect(capturedSignal?.aborted).toBe(true);
    });

    it('does not reuse cached issue detail when the authenticated user changes', async () => {
        setAuthenticatedSession(8, 'Anna Kowalski');
        mockGetIssue.mockReset();
        mockGetIssue
            .mockResolvedValueOnce({
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
                links: [],
                remediation_plan: null,
                exceptions: [],
            })
            .mockRejectedValueOnce(new Error('forbidden'));

        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');

        await act(async () => {
            setAuthenticatedSession(99, 'External Reviewer');
        });

        expect(await screen.findByText('Issue Not Found')).toBeInTheDocument();
        expect(screen.queryByTestId('issue-overview-panel')).not.toBeInTheDocument();
        expect(screen.queryByText('Access Review Gap')).not.toBeInTheDocument();
        expect(mockGetIssue).toHaveBeenCalledTimes(2);
    });

    it('clears cached issue history when the authenticated user changes', async () => {
        setAuthenticatedSession(8, 'Anna Kowalski');
        mockGetIssue.mockReset();
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
            risk_contexts: [],
            description: 'Quarterly evidence was not attached.',
            created_by_id: 8,
            created_by_name: 'Anna Kowalski',
            validation_note: null,
            links: [],
            remediation_plan: null,
            capabilities: issueHistoryCapabilities,
            exceptions: [],
        });
        mockListActivity.mockReset();
        mockListActivity
            .mockResolvedValueOnce({
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
            })
            .mockRejectedValueOnce(new Error('forbidden'));

        renderIssueDetailPage();

        await screen.findByText('Access Review Gap');
        fireEvent.click(screen.getByRole('tab', { name: /History/i }));
        expect(await screen.findByText('Issue updated')).toBeInTheDocument();

        await act(async () => {
            setAuthenticatedSession(99, 'External Reviewer');
        });

        await waitFor(() => expect(mockListActivity).toHaveBeenCalledTimes(2));
        await waitFor(() => {
            expect(screen.queryByText('Issue updated')).not.toBeInTheDocument();
        });
        expect(
            screen.getByText('No activity log entries found for this issue.'),
        ).toBeInTheDocument();
    });
});
