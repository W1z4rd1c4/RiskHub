import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import {
    Link,
    Outlet,
    RouterProvider,
    createMemoryRouter,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlDetailPage } from '@/pages/ControlDetailPage';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithoutProviders as render } from '@test/render';

const getControlMock = vi.fn();
const getExecutionsMock = vi.fn();
const getLinkedRisksMock = vi.fn();

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        deleteControl: vi.fn(),
        getControl: (...args: unknown[]) => getControlMock(...args),
        getExecutions: (...args: unknown[]) => getExecutionsMock(...args),
        getLinkedRisks: (...args: unknown[]) => getLinkedRisksMock(...args),
        linkRisk: vi.fn(),
        restoreControl: vi.fn(),
        unlinkRisk: vi.fn(),
    },
}));

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        createContextual: vi.fn(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: { getRisk: vi.fn() },
}));

vi.mock('@/components/executions/ExecutionLogModal', () => ({
    ExecutionLogModal: () => null,
}));

vi.mock('@/components/ArchiveConfirmDialog', () => ({
    ArchiveConfirmDialog: () => null,
}));

function TestShell() {
    return (
        <>
            <nav aria-label="Sidebar">
                <Link to="/controls">Sidebar Controls</Link>
            </nav>
            <Outlet />
        </>
    );
}

function renderControlHistory() {
    const router = createMemoryRouter([
        {
            path: '/',
            element: <TestShell />,
            children: [
                { path: 'before-control', element: <p>Previous page</p> },
                { path: 'controls', element: <p>Controls destination</p> },
                { path: 'controls/:id', element: <ControlDetailPage /> },
            ],
        },
    ], {
        initialEntries: ['/before-control', '/controls/13?tab=history'],
        initialIndex: 1,
    });

    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    return router;
}

async function expectStayForSidebarAndBack(
    router: ReturnType<typeof renderControlHistory>,
    expectedTitle: string,
) {
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Sidebar Controls' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/controls/13');
    expect(router.state.location.search).toBe('?tab=history');
    expect(screen.getByPlaceholderText('Issue title')).toHaveValue(expectedTitle);

    await act(async () => {
        await router.navigate(-1);
    });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/controls/13');
    expect(router.state.location.search).toBe('?tab=history');
    expect(screen.getByPlaceholderText('Issue title')).toHaveValue(expectedTitle);
}

describe('ControlDetailPage contextual issue dirty guards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getControlMock.mockResolvedValue({
            id: 13,
            name: 'Quarterly Access Review',
            description: 'Ensure privileged access is reviewed.',
            status: 'active',
            risk_level: 3,
            frequency: 'monthly',
            control_form: 'preventive',
            control_owner_id: 2,
            monitoring_status: 'passed',
            capabilities: {
                can_create_issue: true,
                can_log_execution: true,
            },
        });
        getLinkedRisksMock.mockResolvedValue([]);
        getExecutionsMock.mockResolvedValue([{
            id: 81,
            control_id: 13,
            result: 'failed',
            findings: 'Privileged access evidence is incomplete.',
            executed_at: '2026-08-28T08:00:00Z',
            executed_by: { id: 2, name: 'Anna Kowalski' },
            created_at: '2026-08-28T08:00:00Z',
        }]);
    });

    it('keeps the header quick-create draft on sidebar and browser Back without a blocker collision', async () => {
        const user = userEvent.setup();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const router = renderControlHistory();

        await waitFor(() => expect(screen.getAllByRole('button', { name: 'New Issue' })).toHaveLength(2));
        await user.click(screen.getAllByRole('button', { name: 'New Issue' })[0]);

        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getAllByPlaceholderText('Issue title')).toHaveLength(1);
        const title = screen.getByPlaceholderText('Issue title');
        await user.clear(title);
        await user.type(title, 'Header access evidence follow-up');

        await expectStayForSidebarAndBack(router, 'Header access evidence follow-up');
        expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('A router only supports one blocker at a time');
    });

    it('keeps the execution quick-create draft on sidebar and browser Back without a blocker collision', async () => {
        const user = userEvent.setup();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const router = renderControlHistory();

        await waitFor(() => expect(screen.getAllByRole('button', { name: 'New Issue' })).toHaveLength(2));
        const executionCard = screen.getByText('Failed').closest('.glass-card');
        expect(executionCard).not.toBeNull();
        await user.click(within(executionCard as HTMLElement).getByRole('button', { name: 'New Issue' }));

        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getAllByPlaceholderText('Issue title')).toHaveLength(1);
        const title = screen.getByPlaceholderText('Issue title');
        await user.clear(title);
        await user.type(title, 'Execution evidence follow-up');

        await expectStayForSidebarAndBack(router, 'Execution evidence follow-up');
        expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('A router only supports one blocker at a time');
    });
});
