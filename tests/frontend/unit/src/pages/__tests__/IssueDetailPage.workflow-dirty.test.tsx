import { issueFixture } from './pageFixtures';
import type * as MockissuesApiModule from '@/services/issuesApi';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Outlet, RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IssueDetailPage } from '@/pages/IssueDetailPage';
import { issueDetailQueryKey } from '@/lib/queryKeys/issues';
import { __resetSessionStoreForTests, setSessionSnapshot } from '@/services/session/store';
import type { Issue } from '@/types/issue';
import { createTestQueryClient } from '@test/queryClient';

const mockGetIssue = vi.fn<typeof MockissuesApiModule.issuesApi.get>();
const mockListAssignableOwners = vi.fn<typeof MockissuesApiModule.issuesApi.listAssignableOwners>();
const mockAssign = vi.fn<typeof MockissuesApiModule.issuesApi.assign>();
const mockStartRemediation = vi.fn<typeof MockissuesApiModule.issuesApi.startRemediation>();
const mockUpdateProgress = vi.fn<typeof MockissuesApiModule.issuesApi.updateProgress>();
const mockRequestException = vi.fn<typeof MockissuesApiModule.issuesApi.requestException>();
const mockApproveException = vi.fn<typeof MockissuesApiModule.issuesApi.approveException>();
const mockClose = vi.fn<typeof MockissuesApiModule.issuesApi.close>();

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        approveException: (...args: Parameters<typeof mockApproveException>) => mockApproveException(...args),
        assign: (...args: Parameters<typeof mockAssign>) => mockAssign(...args),
        close: (...args: Parameters<typeof mockClose>) => mockClose(...args),
        get: (...args: Parameters<typeof mockGetIssue>) => mockGetIssue(...args),
        listAssignableOwners: (...args: Parameters<typeof mockListAssignableOwners>) => mockListAssignableOwners(...args),
        requestException: (...args: Parameters<typeof mockRequestException>) => mockRequestException(...args),
        startRemediation: (...args: Parameters<typeof mockStartRemediation>) => mockStartRemediation(...args),
        updateProgress: (...args: Parameters<typeof mockUpdateProgress>) => mockUpdateProgress(...args),
    },
}));

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: vi.fn(() => Promise.resolve(({ items: [], total: 0, skip: 0, limit: 100 }))),
    },
}));

const initialIssue: Issue = issueFixture({
    vendor_contexts: [],
    id: 11,
    title: 'Workflow issue',
    severity: 'high',
    status: 'in_progress',
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
    risk_contexts: [],
    description: 'Workflow test issue.',
    created_by_id: 2,
    created_by_name: 'Anna Kowalski',
    validation_note: 'Initial validation',
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
        completion_notes: 'Initial completion',
        completed_at: null,
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z',
    },
    exceptions: [],
    capabilities: {
        can_read: true,
        can_update: true,
        can_change_department: true,
        can_assign_owner: true,
        can_clear_owner: true,
        can_start_remediation: true,
        can_update_remediation_progress: true,
        can_mark_remediation_blocked: true,
        can_mark_remediation_completed: true,
        can_request_exception: true,
        can_approve_exception: true,
        can_revoke_exception: true,
        can_close: true,
        can_link_risk: true,
        can_link_control: true,
        can_link_execution: true,
        can_link_kri: true,
        can_link_vendor: true,
        can_unlink_entities: true,
        can_view_risk_contexts: true,
        can_view_vendor_contexts: true,
        can_use_department_lookup: true,
        can_use_owner_lookup: true,
        can_view_activity_history: true,
        is_owner: true,
        is_closed: false,
        has_active_exception: false,
        has_pending_exception_request: false,
    },
});

function RouteLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <>
            <nav aria-label="Sidebar"><Link to="/risks">Risks sidebar</Link></nav>
            <button type="button" onClick={() => void navigate(-1)}>Browser Back</button>
            <output data-testid="workflow-location">{`${location.pathname}${location.search}`}</output>
            <Outlet />
        </>
    );
}

function renderWorkflow() {
    const queryClient = createTestQueryClient();
    const visitedLocations: string[] = [];
    const router = createMemoryRouter([
        {
            path: '/',
            element: <RouteLayout />,
            children: [
                { path: 'issues/:id', element: <IssueDetailPage /> },
                { path: 'issues', element: <p>Issues register</p> },
                { path: 'risks', element: <p>Risks register</p> },
            ],
        },
    ], {
        initialEntries: ['/issues', '/issues/11?tab=workflow&return_to=%2Fissues'],
        initialIndex: 1,
    });
    let lastLocation = `${router.state.location.pathname}${router.state.location.search}`;
    router.subscribe((state) => {
        const nextLocation = `${state.location.pathname}${state.location.search}`;
        if (state.navigation.state === 'idle' && nextLocation !== lastLocation) {
            visitedLocations.push(nextLocation);
            lastLocation = nextLocation;
        }
    });
    render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return { queryClient, router, visitedLocations };
}

describe('Issue Workflow dirty-task protection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetSessionStoreForTests();
        setSessionSnapshot({
            token: 'issue-workflow-token',
            user: {
                id: 2,
                email: 'anna@riskhub.test',
                name: 'Anna Kowalski',
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
        mockGetIssue.mockResolvedValue(initialIssue);
        mockListAssignableOwners.mockResolvedValue([
            { id: 2, name: 'Anna Kowalski', role_name: 'Owner', department_name: 'Risk Management' },
        ]);
    });

    it('treats lookup-driven owner clearing as clean while a later owner edit remains dirty', async () => {
        const user = userEvent.setup();
        mockListAssignableOwners.mockResolvedValue([
            { id: 7, name: 'Boris Novak', role_name: 'Owner', department_name: 'Risk Management' },
        ]);
        const { router } = renderWorkflow();
        const assignmentCard = await screen.findByTestId('workflow-assignment-card');
        const owner = within(assignmentCard).getByRole('combobox');

        await waitFor(() => expect(owner).toBeEnabled());
        expect(owner).toHaveTextContent('Select owner');

        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        await waitFor(() => expect(router.state.location.search).toBe('?return_to=%2Fissues'));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await act(async () => {
            await router.navigate('/issues/11?tab=workflow&return_to=%2Fissues');
        });
        const ownerAfterTab = within(await screen.findByTestId('workflow-assignment-card')).getByRole('combobox');
        await waitFor(() => expect(ownerAfterTab).toBeEnabled());
        await user.click(screen.getByRole('button', { name: 'Browser Back' }));
        await waitFor(() => expect(router.state.location.search).toBe('?return_to=%2Fissues'));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        await act(async () => {
            await router.navigate('/issues/11?tab=workflow&return_to=%2Fissues');
        });
        const editedOwner = within(await screen.findByTestId('workflow-assignment-card')).getByRole('combobox');
        await waitFor(() => expect(editedOwner).toBeEnabled());
        await user.click(editedOwner);
        await user.click(await screen.findByRole('option', { name: /Boris Novak/ }));
        await user.click(screen.getByRole('button', { name: 'Browser Back' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.search).toBe('?tab=workflow&return_to=%2Fissues');
    });

    it('guards workflow tab, visible Back, sidebar, browser Back, and native unload until an exact revert', async () => {
        const user = userEvent.setup();
        const { router } = renderWorkflow();
        const progress = await screen.findByDisplayValue('50');

        await user.clear(progress);
        await user.type(progress, '75');
        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.search).toBe('?tab=workflow&return_to=%2Fissues');
        await user.click(screen.getByRole('button', { name: 'Stay' }));
        expect(progress).toHaveValue(75);

        await user.click(screen.getByRole('tab', { name: 'History' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Stay' }));
        await user.click(screen.getByRole('button', { name: /back to issues/i }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Stay' }));
        await user.click(screen.getByRole('link', { name: 'Risks sidebar' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Stay' }));
        await user.click(screen.getByRole('button', { name: 'Browser Back' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Stay' }));

        const beforeUnload = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(beforeUnload)).toBe(false);

        await user.clear(progress);
        await user.type(progress, '50');
        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        await waitFor(() => expect(router.state.location.search).toBe('?return_to=%2Fissues'));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts only the fields acknowledged by a successful workflow mutation', async () => {
        const user = userEvent.setup();
        mockUpdateProgress.mockResolvedValue({
            ...initialIssue,
            remediation_plan: {
                ...initialIssue.remediation_plan!,
                progress_percent: 75,
            },
        });
        const { router } = renderWorkflow();
        const progress = await screen.findByDisplayValue('50');
        const validationNote = screen.getByDisplayValue('Initial validation');

        await user.clear(progress);
        await user.type(progress, '75');
        await user.clear(validationNote);
        await user.type(validationNote, 'Unsaved validation');
        await user.click(screen.getByRole('button', { name: 'Update Progress' }));
        await waitFor(() => expect(mockUpdateProgress).toHaveBeenCalledTimes(1));

        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.search).toBe('?tab=workflow&return_to=%2Fissues');
        await user.click(screen.getByRole('button', { name: 'Stay' }));

        await user.clear(validationNote);
        await user.type(validationNote, 'Initial validation');
        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        await waitFor(() => expect(router.state.location.search).toBe('?return_to=%2Fissues'));
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts exception reason and expiry only after their respective successful operations', async () => {
        const user = userEvent.setup();
        const requestedIssue: Issue = issueFixture({
            ...initialIssue,
            exceptions: [{
                id: 9,
                issue_id: 11,
                status: 'requested',
                reason: 'Existing request',
                requested_by_id: 2,
                requested_by_name: 'Anna Kowalski',
                approved_by_id: null,
                approved_by_name: null,
                requested_at: '2026-02-02T10:00:00Z',
                approved_at: null,
                expires_at: null,
                created_at: '2026-02-02T10:00:00Z',
                updated_at: '2026-02-02T10:00:00Z',
            }],
        });
        mockGetIssue.mockResolvedValue(requestedIssue);
        mockRequestException.mockResolvedValue(requestedIssue.exceptions[0]);
        mockApproveException.mockResolvedValue({ ...requestedIssue.exceptions[0], status: 'approved' });
        const { router } = renderWorkflow();
        const exceptionCard = await screen.findByTestId('workflow-exception-card');
        const exceptionReason = within(exceptionCard).getByRole('textbox');
        const validationNote = screen.getByDisplayValue('Initial validation');
        const expiry = exceptionCard.querySelector<HTMLInputElement>('input[type="datetime-local"]');
        expect(expiry).not.toBeNull();

        await user.type(exceptionReason, 'Temporary exception');
        await user.clear(validationNote);
        await user.type(validationNote, 'Unsaved validation');
        await user.click(within(exceptionCard).getByRole('button', { name: 'Request Exception' }));
        await waitFor(() => expect(mockRequestException).toHaveBeenCalledTimes(1));
        expect(exceptionReason).toHaveValue('');

        await user.type(expiry!, '2026-04-01T08:00');
        await user.click(within(exceptionCard).getByRole('button', { name: 'Approve Exception' }));
        await waitFor(() => expect(mockApproveException).toHaveBeenCalledTimes(1));
        expect(expiry).toHaveValue('');

        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(router.state.location.search).toBe('?tab=workflow&return_to=%2Fissues');
    });

    it('keeps failed workflow fields dirty and confirms one leave navigation', async () => {
        const user = userEvent.setup();
        mockUpdateProgress.mockRejectedValue(new Error('Save failed'));
        const { router, visitedLocations } = renderWorkflow();
        const progress = await screen.findByDisplayValue('50');

        await user.clear(progress);
        await user.type(progress, '75');
        await user.click(screen.getByRole('button', { name: 'Update Progress' }));
        await waitFor(() => expect(mockUpdateProgress).toHaveBeenCalledTimes(1));
        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Leave' }));

        await waitFor(() => expect(router.state.location.search).toBe('?return_to=%2Fissues'));
        expect(visitedLocations).toEqual(['/issues/11?return_to=%2Fissues']);
    });

    it('preserves dirty fields while a background refresh advances clean accepted fields', async () => {
        const user = userEvent.setup();
        const { queryClient } = renderWorkflow();
        const progress = await screen.findByDisplayValue('50');

        await user.clear(progress);
        await user.type(progress, '75');
        await act(() => {
            queryClient.setQueryData(issueDetailQueryKey(2, 11), {
                ...initialIssue,
                due_at: '2026-03-20T10:00:00Z',
                remediation_plan: {
                    ...initialIssue.remediation_plan!,
                    progress_percent: 20,
                    completion_notes: 'Server completion',
                },
            });
            return Promise.resolve();
        });

        expect(progress).toHaveValue(75);
        expect(await screen.findByDisplayValue('Server completion')).toBeInTheDocument();
    });

    it('locks workflow exits while a mutation is pending and unlocks after its acknowledged result', async () => {
        const user = userEvent.setup();
        let resolveUpdate: (value: Issue) => void = () => {};
        mockUpdateProgress.mockReturnValue(new Promise<Issue>((resolve) => {
            resolveUpdate = resolve;
        }));
        const { queryClient, router } = renderWorkflow();
        const progress = await screen.findByDisplayValue('50');
        const updateButton = screen.getByRole('button', { name: 'Update Progress' });

        await user.clear(progress);
        await user.type(progress, '75');
        await user.click(updateButton);
        await waitFor(() => expect(updateButton).toBeDisabled());
        expect(progress).toBeDisabled();
        expect(screen.getByDisplayValue('Initial validation')).toBeDisabled();
        await act(() => {
            queryClient.setQueryData(issueDetailQueryKey(2, 11), {
                ...initialIssue,
                due_at: '2026-03-20T10:00:00Z',
            });
            return Promise.resolve();
        });
        expect(updateButton).toBeDisabled();

        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        await user.click(screen.getByRole('link', { name: 'Risks sidebar' }));
        await user.click(screen.getByRole('button', { name: 'Browser Back' }));
        expect(router.state.location.search).toBe('?tab=workflow&return_to=%2Fissues');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        const beforeUnload = new Event('beforeunload', { cancelable: true });
        expect(window.dispatchEvent(beforeUnload)).toBe(false);

        await act(() => Promise.resolve(resolveUpdate({
            ...initialIssue,
            remediation_plan: {
                ...initialIssue.remediation_plan!,
                progress_percent: 75,
            },
        })));
        await waitFor(() => expect(updateButton).toBeEnabled());
        await user.click(screen.getByRole('tab', { name: 'Overview' }));
        await waitFor(() => expect(router.state.location.search).toBe('?return_to=%2Fissues'));
    });
});
