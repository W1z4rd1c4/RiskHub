import { act, fireEvent, render, screen, waitFor, within, type ReactElement } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import * as axe from 'axe-core';
import { Profiler, Suspense, startTransition, useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getExecutionsMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/controlApi', () => ({
    controlApi: {
        getExecutions: (...args: unknown[]) => getExecutionsMock(...args),
    },
}));

vi.mock('@/components/issues/IssueQuickCreateModal', () => ({
    IssueQuickCreateModal: ({
        contextEntityId,
        contextEntityLabel,
        contextEntityType,
        isOpen,
    }: {
        contextEntityId: number;
        contextEntityLabel: string;
        contextEntityType: string;
        isOpen: boolean;
    }) =>
        isOpen ? (
            <div data-testid="execution-issue-context">
                {contextEntityType}:{contextEntityId}:{contextEntityLabel}
            </div>
        ) : null,
}));

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

import { ExecutionHistory } from '@/components/executions/ExecutionHistory';
import { ApiClientError } from '@/services/apiClient';
import type { ControlExecution } from '@/types/execution';

function LocationProbe() {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <div>
            <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
            <button type="button" onClick={() => navigate(-1)}>History back</button>
            <button type="button" onClick={() => navigate(1)}>History forward</button>
        </div>
    );
}

function renderExecutionHistory(
    history: ReactElement,
    initialEntries: string[] = ['/controls/1?tab=history'],
) {
    const renderResult = render(
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
            {history}
            <LocationProbe />
        </MemoryRouter>,
    );

    return {
        ...renderResult,
        rerenderHistory: (nextHistory: ReactElement) => renderResult.rerender(
            <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
                {nextHistory}
                <LocationProbe />
            </MemoryRouter>,
        ),
    };
}

describe('ExecutionHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('restores the expanded execution from the URL after a shared-link load', async () => {
        getExecutionsMock.mockResolvedValue([{
            id: 31,
            control_id: 1,
            result: 'failed',
            findings: 'Access evidence is incomplete',
            executed_at: '2026-03-07T10:00:00Z',
            executed_by: { id: 1, name: 'Anna Kowalski' },
            created_at: '2026-03-07T10:00:00Z',
        }]);

        renderExecutionHistory(
            <ExecutionHistory controlId={1} />,
            ['/controls/1?tab=history&source=review&execution=31'],
        );

        const disclosure = await screen.findByRole('button', { name: /controls:results.failed/i });
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('location').textContent)
            .toBe('/controls/1?tab=history&source=review&execution=31');
    });

    it('keeps the committed control request owned while a different control transition is suspended', async () => {
        let releaseControlA!: (value: ControlExecution[]) => void;
        let releaseControlB!: (value: ControlExecution[]) => void;
        let releaseControlBRender!: () => void;
        let isControlBRenderBlocked = true;
        const controlARequest = new Promise<ControlExecution[]>((resolve) => {
            releaseControlA = resolve;
        });
        const controlBRequest = new Promise<ControlExecution[]>((resolve) => {
            releaseControlB = resolve;
        });
        const controlBRender = new Promise<void>((resolve) => {
            releaseControlBRender = () => {
                isControlBRenderBlocked = false;
                resolve();
            };
        });
        const crossControlCommits: boolean[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        getExecutionsMock
            .mockReturnValueOnce(controlARequest)
            .mockReturnValueOnce(controlBRequest);

        function BlockingControlBSibling({ controlId }: { controlId: number }) {
            if (controlId === 2 && isControlBRenderBlocked) {
                throw controlBRender;
            }
            return null;
        }

        function TransitionHarness() {
            const [controlId, setControlId] = useState(1);
            return (
                <>
                    <button
                        type="button"
                        onClick={() => startTransition(() => setControlId(2))}
                    >
                        Show control B
                    </button>
                    <Suspense fallback={<div>Suspended control</div>}>
                        <Profiler
                            id="execution-history-identity"
                            onRender={() => {
                                if (host.querySelector('[data-testid="current-control"]')?.textContent !== '2') return;
                                crossControlCommits.push(host.textContent?.includes('Control A executor') ?? false);
                            }}
                        >
                            <output data-testid="current-control">{controlId}</output>
                            <ExecutionHistory controlId={controlId} />
                            <BlockingControlBSibling controlId={controlId} />
                        </Profiler>
                    </Suspense>
                </>
            );
        }

        render(
            <MemoryRouter>
                <TransitionHarness />
            </MemoryRouter>,
            { container: host },
        );
        await waitFor(() => expect(getExecutionsMock).toHaveBeenCalledWith(1));

        fireEvent.click(screen.getByRole('button', { name: 'Show control B' }));
        expect(screen.getByTestId('current-control')).toHaveTextContent('1');
        expect(getExecutionsMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            releaseControlA([{
                id: 31,
                control_id: 1,
                result: 'passed',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Control A executor' },
                created_at: '2026-03-07T10:00:00Z',
            }]);
            await controlARequest;
        });
        expect(screen.getByTestId('current-control')).toHaveTextContent('1');
        expect(screen.getByText('Control A executor')).toBeInTheDocument();

        await act(async () => {
            releaseControlBRender();
            await controlBRender;
        });
        await waitFor(() => expect(getExecutionsMock).toHaveBeenCalledWith(2));
        expect(crossControlCommits).not.toContain(true);
        expect(screen.queryByText('Control A executor')).not.toBeInTheDocument();

        await act(async () => {
            releaseControlB([]);
            await controlBRequest;
        });
        expect(screen.getByText('empty_state.no_executions')).toBeInTheDocument();
    });

    it('pushes disclosure choices while preserving unrelated query state across history and reload', async () => {
        const user = userEvent.setup();
        getExecutionsMock.mockResolvedValue([{
            id: 31,
            control_id: 1,
            result: 'failed',
            findings: 'Access evidence is incomplete',
            executed_at: '2026-03-07T10:00:00Z',
            executed_by: { id: 1, name: 'Anna Kowalski' },
            created_at: '2026-03-07T10:00:00Z',
        }]);

        const firstRender = renderExecutionHistory(
            <ExecutionHistory controlId={1} />,
            ['/controls/1?tab=history&source=review'],
        );
        const disclosure = await screen.findByRole('button', { name: /controls:results.failed/i });

        await user.click(disclosure);
        await waitFor(() => expect(screen.getByTestId('location').textContent)
            .toBe('/controls/1?tab=history&source=review&execution=31'));
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');

        await user.click(screen.getByRole('button', { name: 'History back' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent)
            .toBe('/controls/1?tab=history&source=review'));
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');

        await user.click(screen.getByRole('button', { name: 'History forward' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent)
            .toBe('/controls/1?tab=history&source=review&execution=31'));
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        expect(getExecutionsMock).toHaveBeenCalledTimes(1);

        const reloadUrl = screen.getByTestId('location').textContent!;
        firstRender.unmount();
        renderExecutionHistory(<ExecutionHistory controlId={1} />, [reloadUrl]);

        expect(await screen.findByRole('button', { name: /controls:results.failed/i }))
            .toHaveAttribute('aria-expanded', 'true');
    });

    it('canonicalizes a positive execution identifier with history replace', async () => {
        const user = userEvent.setup();
        getExecutionsMock.mockResolvedValue([{
            id: 31,
            control_id: 1,
            result: 'failed',
            executed_at: '2026-03-07T10:00:00Z',
            executed_by: { id: 1, name: 'Anna Kowalski' },
            created_at: '2026-03-07T10:00:00Z',
        }]);

        renderExecutionHistory(
            <ExecutionHistory controlId={1} />,
            ['/before', '/controls/1?tab=history&source=review&execution=0031'],
        );

        expect(await screen.findByRole('button', { name: /controls:results.failed/i }))
            .toHaveAttribute('aria-expanded', 'true');
        await waitFor(() => expect(screen.getByTestId('location').textContent)
            .toBe('/controls/1?tab=history&source=review&execution=31'));

        await user.click(screen.getByRole('button', { name: 'History back' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/before'));
    });

    it('removes an execution identifier absent from a successful collection with history replace', async () => {
        const user = userEvent.setup();
        getExecutionsMock.mockResolvedValue([{
            id: 31,
            control_id: 1,
            result: 'failed',
            executed_at: '2026-03-07T10:00:00Z',
            executed_by: { id: 1, name: 'Anna Kowalski' },
            created_at: '2026-03-07T10:00:00Z',
        }]);

        renderExecutionHistory(
            <ExecutionHistory controlId={1} />,
            ['/before', '/controls/1?tab=history&source=review&execution=999'],
        );

        await screen.findByRole('button', { name: /controls:results.failed/i });
        await waitFor(() => expect(screen.getByTestId('location').textContent)
            .toBe('/controls/1?tab=history&source=review'));

        await user.click(screen.getByRole('button', { name: 'History back' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/before'));
    });

    it.each([
        'execution=31&execution=32',
        'execution=0',
        'execution=not-an-id',
    ])('rejects invalid execution query state with history replace: %s', async (executionQuery) => {
        const user = userEvent.setup();
        getExecutionsMock.mockResolvedValue([{
            id: 31,
            control_id: 1,
            result: 'failed',
            executed_at: '2026-03-07T10:00:00Z',
            executed_by: { id: 1, name: 'Anna Kowalski' },
            created_at: '2026-03-07T10:00:00Z',
        }]);

        renderExecutionHistory(
            <ExecutionHistory controlId={1} />,
            ['/before', `/controls/1?tab=history&source=review&${executionQuery}`],
        );

        const disclosure = await screen.findByRole('button', { name: /controls:results.failed/i });
        await waitFor(() => expect(screen.getByTestId('location').textContent)
            .toBe('/controls/1?tab=history&source=review'));
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');

        await user.click(screen.getByRole('button', { name: 'History back' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/before'));
    });

    it('renders canonical execution result states with the correct status styling', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 1,
                control_id: 1,
                result: 'failed',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            },
            {
                id: 2,
                control_id: 1,
                result: 'warning',
                executed_at: '2026-03-06T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-06T10:00:00Z',
            },
            {
                id: 3,
                control_id: 1,
                result: 'passed',
                executed_at: '2026-03-05T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-05T10:00:00Z',
            },
            {
                id: 4,
                control_id: 1,
                result: 'not_applicable',
                executed_at: '2026-03-04T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-04T10:00:00Z',
            },
        ]);

        renderExecutionHistory(<ExecutionHistory controlId={1} />);

        await waitFor(() => {
            expect(screen.queryByText('common:loading.history')).not.toBeInTheDocument();
        });

        expect(screen.getByText('controls:results.failed')).toHaveClass('text-rose-400');
        expect(screen.getByText('controls:executions.issues_found')).toHaveClass('text-amber-400');
        expect(screen.getByText('controls:results.passed')).toHaveClass('text-emerald-400');
        expect(screen.getByText('controls:results.not_applicable')).toHaveClass('text-slate-400');

        const failedCard = screen.getByText('controls:results.failed').closest('.glass-card');
        expect(failedCard).not.toBeNull();
        expect(within(failedCard as HTMLElement).queryByText('controls:results.passed')).toBeNull();
    });

    it('renders unknown results as neutral instead of passed', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 9,
                control_id: 1,
                result: 'unexpected_result',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            } as any,
        ]);

        renderExecutionHistory(<ExecutionHistory controlId={1} />);

        await screen.findByText('common:labels.not_available');
        expect(screen.queryByText('controls:results.passed')).not.toBeInTheDocument();
        expect(screen.getByText('common:labels.not_available')).toHaveClass('text-slate-300');
    });

    it('shows execution-specific issue actions only for failed or warning rows when allowed', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 11,
                control_id: 1,
                result: 'failed',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            },
            {
                id: 12,
                control_id: 1,
                result: 'passed',
                executed_at: '2026-03-06T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-06T10:00:00Z',
            },
            {
                id: 13,
                control_id: 1,
                result: 'warning',
                executed_at: '2026-03-05T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-05T10:00:00Z',
            },
        ]);

        renderExecutionHistory(
            <ExecutionHistory
                controlId={1}
                controlName="Access Review"
                canCreateIssue
                createIssueLabel="New Issue"
            />
        );

        await screen.findByText('controls:results.failed');
        fireEvent.click(screen.getByText('controls:results.failed'));
        fireEvent.click(screen.getByText('controls:executions.issues_found'));

        expect(screen.getAllByRole('button', { name: 'New Issue' })).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'New Issue' })[0]);
        expect(screen.getByTestId('execution-issue-context')).toHaveTextContent('execution:11:Access Review');
    });

    it('uses sibling native controls for disclosure and issue creation', async () => {
        const user = userEvent.setup();
        getExecutionsMock.mockResolvedValue([
            {
                id: 31,
                control_id: 1,
                result: 'failed',
                findings: 'Access evidence is incomplete',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            },
        ]);

        const { container } = renderExecutionHistory(
            <ExecutionHistory controlId={1} canCreateIssue createIssueLabel="New Issue" />
        );

        const disclosure = await screen.findByRole('button', { name: /controls:results.failed/i });
        const issueAction = screen.getByRole('button', { name: 'New Issue' });
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        expect(disclosure).toHaveAttribute('aria-controls', 'execution-details-31');
        expect(disclosure.contains(issueAction)).toBe(false);
        expect(disclosure.className).toContain('focus-visible:ring-2');
        expect(issueAction.className).toContain('focus-visible:ring-2');

        disclosure.focus();
        await user.keyboard('{Enter}');
        expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        expect(document.getElementById('execution-details-31')).toBeInTheDocument();

        await user.keyboard(' ');
        expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        expect(document.getElementById('execution-details-31')).not.toBeInTheDocument();

        const results = await axe.run(container);
        expect(results.violations).toEqual([]);
    });

    it('hides execution-specific issue actions when backend capability is false', async () => {
        getExecutionsMock.mockResolvedValue([
            {
                id: 21,
                control_id: 1,
                result: 'failed',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            },
        ]);

        renderExecutionHistory(
            <ExecutionHistory
                controlId={1}
                controlName="Access Review"
                canCreateIssue={false}
                createIssueLabel="New Issue"
            />
        );

        await screen.findByText('controls:results.failed');
        expect(screen.queryByRole('button', { name: 'New Issue' })).not.toBeInTheDocument();
    });

    it('renders a retryable error state instead of empty history when loading fails', async () => {
        const user = userEvent.setup();
        let releaseRetry!: (value: never[]) => void;
        const retry = new Promise<never[]>((resolve) => {
            releaseRetry = resolve;
        });
        getExecutionsMock
            .mockRejectedValueOnce(new Error('network'))
            .mockImplementationOnce(() => retry);

        renderExecutionHistory(<ExecutionHistory controlId={1} />);

        await screen.findByText('errors.load_history_failed');
        expect(screen.queryByText('empty_state.no_executions')).not.toBeInTheDocument();

        const retryButton = screen.getByRole('button', { name: 'errors.try_again' });
        retryButton.focus();
        await user.click(retryButton);

        await waitFor(() => expect(getExecutionsMock).toHaveBeenCalledTimes(2));
        expect(retryButton).toHaveFocus();
        expect(retryButton).toHaveAttribute('aria-disabled', 'true');
        expect(retryButton).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(retryButton);
        expect(getExecutionsMock).toHaveBeenCalledTimes(2);

        await act(async () => {
            releaseRetry([]);
        });
        await screen.findByText('empty_state.no_executions');
    });

    it('keeps safe execution evidence visible when a same-control refresh fails', async () => {
        getExecutionsMock
            .mockResolvedValueOnce([{
                id: 41,
                control_id: 1,
                result: 'passed',
                findings: 'Quarterly evidence verified',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            }])
            .mockRejectedValueOnce(new Error('temporary outage'));

        const { rerenderHistory } = renderExecutionHistory(<ExecutionHistory controlId={1} refreshKey={0} />);
        await screen.findByText('controls:results.passed');

        rerenderHistory(<ExecutionHistory controlId={1} refreshKey={1} />);

        expect(await screen.findByRole('alert')).toHaveTextContent('errors.history_stale');
        expect(screen.getByText('controls:results.passed')).toBeInTheDocument();
        expect(screen.queryByText('empty_state.no_executions')).not.toBeInTheDocument();
    });

    it('clears protected execution evidence when a refresh is forbidden', async () => {
        getExecutionsMock
            .mockResolvedValueOnce([{
                id: 42,
                control_id: 1,
                result: 'passed',
                findings: 'Restricted evidence',
                executed_at: '2026-03-07T10:00:00Z',
                executed_by: { id: 1, name: 'Anna Kowalski' },
                created_at: '2026-03-07T10:00:00Z',
            }])
            .mockRejectedValueOnce(new ApiClientError({
                status: 403,
                messageKey: 'errorKeys.forbidden',
            }));

        const { rerenderHistory } = renderExecutionHistory(<ExecutionHistory controlId={1} refreshKey={0} />);
        await screen.findByText('controls:results.passed');

        rerenderHistory(<ExecutionHistory controlId={1} refreshKey={1} />);

        expect(await screen.findByRole('alert')).toHaveTextContent('errors.history_access_denied');
        expect(screen.queryByText('controls:results.passed')).not.toBeInTheDocument();
        expect(screen.queryByText('empty_state.no_executions')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'errors.try_again' })).not.toBeInTheDocument();
    });
});
