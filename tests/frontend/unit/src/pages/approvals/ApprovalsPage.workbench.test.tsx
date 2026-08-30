import { Profiler } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import i18n from '@/i18n';
import ApprovalsPage from '@/pages/ApprovalsPage';
import type { ApprovalRequest } from '@/types/approval';
import { server } from '@test/mocks/server';

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

beforeAll(() => {
    vi.stubGlobal('scrollTo', vi.fn());
});

afterAll(() => {
    vi.unstubAllGlobals();
});

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function HistoryControls() {
    const navigate = useNavigate();
    const location = useLocation();
    return (
        <>
            <button type="button" onClick={() => void navigate(-1)}>Browser back</button>
            <button type="button" onClick={() => void navigate(1)}>Browser forward</button>
            <button
                type="button"
                onClick={() => {
                    const params = new URLSearchParams(location.search);
                    params.set('source', 'updated-context');
                    void navigate(`${location.pathname}?${params.toString()}`);
                }}
            >
                Update unrelated context
            </button>
        </>
    );
}

function ProfiledApprovalsPage({ onCommit }: { onCommit?: (location: string) => void }) {
    const location = useLocation();
    const currentLocation = `${location.pathname}${location.search}`;
    return (
        <Profiler id="approvals-page" onRender={() => onCommit?.(currentLocation)}>
            <ApprovalsPage />
        </Profiler>
    );
}

function renderPage(initialEntry: string | string[], onPageCommit?: (location: string) => void) {
    const initialEntries = typeof initialEntry === 'string' ? [initialEntry] : initialEntry;
    return render(
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
            <Routes>
                <Route
                    path="/approvals"
                    element={<ProfiledApprovalsPage onCommit={onPageCommit} />}
                />
                <Route path="*" element={<p>Other page</p>} />
            </Routes>
            <LocationProbe />
            <HistoryControls />
        </MemoryRouter>,
    );
}

async function findLinkedRequestWithText(text: string) {
    const linkedRequest = await screen.findByRole('region', { name: 'Linked request' });
    await waitFor(() => expect(linkedRequest).toHaveTextContent(text));
    return linkedRequest;
}

const approval: ApprovalRequest = {
    id: 84,
    resource_type: 'process',
    resource_id: 7,
    resource_name: 'F-0007 · Payments',
    action_type: 'edit',
    pending_changes: null,
    governed_mutation: {
        proposal_id: 'proposal-84',
        proposal_version: 1,
        mutation_kind: 'process.edit',
        before: { l1_process: 'Payments' },
        after: { l1_process: 'Payments v2' },
        derived_impact: {
            before: { cif: 'no', criticality_class: 'medium' },
            after: { cif: 'yes', criticality_class: 'critical' },
        },
        impacted_resources: [],
        relationship_change: null,
    },
    status: 'pending',
    reason: 'Improve resilience',
    requested_by_id: 1,
    requested_by_name: 'Alice',
    requested_by_email: 'alice@example.test',
    resolved_by_id: null,
    resolved_by_name: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: '2026-07-16T00:00:00Z',
    can_approve: false,
    can_reject: false,
    capabilities: {
        can_read: true,
        can_approve: false,
        can_reject: false,
        can_cancel: false,
        can_cancel_as_requester: false,
        can_cancel_as_resolver: false,
        can_view_pending_changes: true,
        can_view_resolution_notes: false,
        can_inspect_side_effects: false,
        is_requester: false,
        is_primary_approver: false,
        is_privileged_resolver: false,
        is_pending: true,
        requires_privileged_resolution: false,
        would_apply_side_effects_on_approve: false,
    },
};

const actionableApproval: ApprovalRequest = {
    ...approval,
    can_approve: true,
    can_reject: true,
    capabilities: {
        ...approval.capabilities!,
        can_approve: true,
        can_reject: true,
        can_cancel_as_requester: true,
    },
};

describe('ApprovalsPage workbench continuity', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    it('direct-loads the URL-selected queue and describes its server page', async () => {
        let requestUrl: URL | null = null;
        server.use(
            http.get('*/api/v1/approvals', ({ request }) => {
                requestUrl = new URL(request.url);
                return HttpResponse.json({
                    items: [],
                    total: 250,
                    skip: 100,
                    limit: 100,
                    skipped_corrupt_payloads: 0,
                });
            }),
        );

        renderPage('/approvals?tab=all&q=Vendor%20A&page=2&source=governance');

        expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('searchbox', { name: 'Search approvals' })).toHaveValue('Vendor A');
        expect(await screen.findByText('Showing 101–200 of 250 requests')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
        await waitFor(() => {
            expect(requestUrl?.searchParams.get('q')).toBe('Vendor A');
            expect(requestUrl?.searchParams.get('skip')).toBe('100');
            expect(requestUrl?.searchParams.get('limit')).toBe('100');
            expect(requestUrl?.searchParams.has('status')).toBe(false);
            expect(requestUrl?.searchParams.has('my_requests')).toBe(false);
        });
    });

    it('replace-normalizes an overlarge page from the server total before presenting a range', async () => {
        const requestedSkips: number[] = [];
        server.use(
            http.get('*/api/v1/approvals', ({ request }) => {
                const skip = Number(new URL(request.url).searchParams.get('skip') ?? 0);
                requestedSkips.push(skip);
                return HttpResponse.json({
                    items: skip === 200 ? [approval] : [],
                    total: 250,
                    skip,
                    limit: 100,
                    skipped_corrupt_payloads: 0,
                });
            }),
        );

        renderPage('/approvals?tab=all&page=99&source=governance');

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=3'));
        expect(screen.getByTestId('location')).toHaveTextContent('source=governance');
        expect(await screen.findByText('Showing 201–250 of 250 requests')).toBeInTheDocument();
        expect(screen.queryByText(/Showing 9801/)).not.toBeInTheDocument();
        expect(screen.queryByText('All Caught Up')).not.toBeInTheDocument();
        expect(requestedSkips).toEqual([9800, 200]);
    });

    it('cannot let a suspended overlarge response rewrite a newer committed queue URL', async () => {
        let releaseOlder!: () => void;
        let releaseNewer!: () => void;
        const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
        const newerGate = new Promise<void>((resolve) => { releaseNewer = resolve; });
        server.use(
            http.get('*/api/v1/approvals', async ({ request }) => {
                const url = new URL(request.url);
                if (url.searchParams.get('q') === 'older') {
                    await olderGate;
                    return HttpResponse.json({
                        items: [], total: 1, skip: 9800, limit: 100, skipped_corrupt_payloads: 0,
                    });
                }
                await newerGate;
                return HttpResponse.json({
                    items: [], total: 0, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
                });
            }),
        );
        renderPage('/approvals?tab=all&q=older&page=99&source=governance');

        await act(async () => {
            releaseOlder();
            await olderGate;
            await Promise.resolve();
            await Promise.resolve();
            fireEvent.change(screen.getByRole('searchbox', { name: 'Search approvals' }), {
                target: { value: 'newer' },
            });
        });

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=newer'));
        const committedLocation = screen.getByTestId('location').textContent ?? '';
        expect(committedLocation).toContain('q=newer');
        expect(committedLocation).not.toContain('q=older');
        expect(committedLocation).toContain('source=governance');

        await act(async () => {
            releaseNewer();
            await newerGate;
        });
        expect(await screen.findByText('Showing 0–0 of 0 requests')).toBeInTheDocument();
    });

    it('normalizes invalid owned values with replace while preserving unrelated context', async () => {
        const user = userEvent.setup();
        renderPage([
            '/before',
            '/approvals?tab=unknown&q=%20vendor%20&page=0&approvalId=hidden&source=governance',
        ]);

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
            '/approvals?tab=pending&q=vendor&source=governance',
        ));
        await user.click(screen.getByRole('button', { name: 'Browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/before');
    });

    it('pushes row selection into the URL and restores expansion with browser history', async () => {
        let listRequests = 0;
        let detailRequests = 0;
        server.use(
            http.get('*/api/v1/approvals', () => {
                listRequests += 1;
                return HttpResponse.json({
                    items: [approval],
                    total: 1,
                    skip: 0,
                    limit: 100,
                    skipped_corrupt_payloads: 0,
                });
            }),
            http.get('*/api/v1/approvals/84', () => {
                detailRequests += 1;
                return HttpResponse.json(approval);
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=pending&source=governance');
        await screen.findByText('F-0007 · Payments');

        await user.click(screen.getByRole('button', { name: /view changes/i }));

        expect(screen.getByTestId('location')).toHaveTextContent(
            '/approvals?tab=pending&source=governance&approvalId=84',
        );
        expect(screen.getByTestId('approval-governed-mutation-84')).toBeInTheDocument();
        expect(detailRequests).toBe(0);

        await user.click(screen.getByRole('button', { name: 'Update unrelated context' }));
        expect(screen.getByTestId('location')).toHaveTextContent('source=updated-context');
        expect(listRequests).toBe(1);

        await user.click(screen.getByRole('button', { name: 'Browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/approvals?tab=pending&source=governance&approvalId=84',
        );
        expect(screen.getByTestId('approval-governed-mutation-84')).toBeInTheDocument();
        expect(listRequests).toBe(1);

        await user.click(screen.getByRole('button', { name: 'Browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/approvals?tab=pending&source=governance');
        await waitFor(() => expect(
            screen.queryByTestId('approval-governed-mutation-84'),
        ).not.toBeInTheDocument());
        expect(listRequests).toBe(1);
    });

    it('loads an off-page deep link once and labels it outside the queue population', async () => {
        let detailRequests = 0;
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json({
                items: [],
                total: 0,
                skip: 0,
                limit: 100,
                skipped_corrupt_payloads: 0,
            })),
            http.get('*/api/v1/approvals/84', () => {
                detailRequests += 1;
                return HttpResponse.json(approval);
            }),
        );

        renderPage('/approvals?tab=pending&approvalId=84&source=governance');

        const linkedRequest = await findLinkedRequestWithText('F-0007 · Payments');
        expect(linkedRequest).toHaveTextContent('Linked requests are shown outside this queue page.');
        expect(detailRequests).toBe(1);
        expect(screen.getByText('Showing 0–0 of 0 requests')).toBeInTheDocument();
    });

    it('loads an off-page deep link even when the primary queue fails', async () => {
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json(
                { detail: 'queue failed' },
                { status: 500 },
            )),
            http.get('*/api/v1/approvals/84', () => HttpResponse.json(approval)),
        );

        renderPage('/approvals?tab=pending&approvalId=84');

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        const linkedRequest = await findLinkedRequestWithText('F-0007 · Payments');
        expect(linkedRequest).toHaveTextContent('Linked requests are shown outside this queue page.');
    });

    it.each(['approve', 'reject', 'cancel'] as const)(
        'removes a linked selection and preserves its queue URL after successful %s',
        async (action) => {
            let listRequests = 0;
            let detailRequests = 0;
            server.use(
                http.get('*/api/v1/approvals', ({ request }) => {
                    listRequests += 1;
                    const skip = Number(new URL(request.url).searchParams.get('skip') ?? 0);
                    return HttpResponse.json({
                        items: [], total: 250, skip, limit: 100, skipped_corrupt_payloads: 0,
                    });
                }),
                http.get('*/api/v1/approvals/84', () => {
                    detailRequests += 1;
                    return HttpResponse.json(actionableApproval);
                }),
                http.post(`*/api/v1/approvals/84/${action}`, () => HttpResponse.json({
                    ...actionableApproval,
                    status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled',
                })),
            );
            const user = userEvent.setup();
            renderPage('/approvals?tab=all&q=Vendor&page=2&approvalId=84&source=governance');
            await findLinkedRequestWithText('F-0007 · Payments');

            if (action === 'cancel') {
                await user.click(screen.getByRole('button', { name: 'Cancel Request' }));
                await user.click(await screen.findByRole('button', { name: 'Confirm' }));
            } else {
                const actionName = action === 'approve' ? 'Approve' : 'Reject';
                await user.click(screen.getByRole('button', { name: actionName }));
                const dialog = await screen.findByRole('dialog');
                await user.type(
                    screen.getByRole('textbox', { name: /provide a reason/i }),
                    'Reviewed outcome',
                );
                await user.click(within(dialog).getByRole('button', { name: actionName }));
            }

            await waitFor(() => {
                const location = new URL(
                    `http://riskhub.test${screen.getByTestId('location').textContent ?? ''}`,
                );
                expect(location.searchParams.has('approvalId')).toBe(false);
                expect(location.searchParams.get('tab')).toBe('all');
                expect(location.searchParams.get('q')).toBe('Vendor');
                expect(location.searchParams.get('page')).toBe('2');
                expect(location.searchParams.get('source')).toBe('governance');
            });
            expect(screen.queryByRole('region', { name: 'Linked request' })).not.toBeInTheDocument();
            expect(detailRequests).toBe(1);
            expect(listRequests).toBe(2);
        },
    );

    it('allows a blank decision submit, announces validation, and focuses the notes field', async () => {
        let resolutionRequests = 0;
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json({
                items: [actionableApproval],
                total: 1,
                skip: 0,
                limit: 100,
                skipped_corrupt_payloads: 0,
            })),
            http.post('*/api/v1/approvals/84/approve', () => {
                resolutionRequests += 1;
                return HttpResponse.json(actionableApproval);
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=pending');
        await screen.findByText('F-0007 · Payments');

        await user.click(screen.getByRole('button', { name: 'Approve' }));
        const dialog = await screen.findByRole('dialog');
        const submit = within(dialog).getByRole('button', { name: 'Approve' });
        expect(submit).toBeEnabled();

        await user.click(submit);

        const resolutionAlert = await within(dialog).findByRole('alert');
        const notes = within(dialog).getByRole('textbox', { name: /provide a reason/i });
        expect(resolutionAlert).toHaveTextContent(
            'Please provide a reason for this decision (mandatory).',
        );
        expect(notes).toHaveFocus();
        expect(resolutionAlert).not.toHaveFocus();
        expect(resolutionRequests).toBe(0);
    });

    it.each([
        [422, 'Some fields are invalid. Please review and try again.'],
        [500, 'Server error'],
    ] as const)(
        'keeps HTTP %s resolution feedback and retained notes inside the dialog for retry',
        async (status, expectedMessage) => {
            let listRequests = 0;
            const submittedBodies: unknown[] = [];
            server.use(
                http.get('*/api/v1/approvals', () => {
                    listRequests += 1;
                    return HttpResponse.json({
                        items: [actionableApproval],
                        total: 1,
                        skip: 0,
                        limit: 100,
                        skipped_corrupt_payloads: 0,
                    });
                }),
                http.post('*/api/v1/approvals/84/approve', async ({ request }) => {
                    submittedBodies.push(await request.json());
                    return submittedBodies.length === 1
                        ? HttpResponse.json({ detail: 'resolution failed' }, { status })
                        : HttpResponse.json({ ...actionableApproval, status: 'approved' });
                }),
            );
            const user = userEvent.setup();
            renderPage('/approvals?tab=pending');
            await screen.findByText('F-0007 · Payments');

            await user.click(screen.getByRole('button', { name: 'Approve' }));
            const dialog = await screen.findByRole('dialog');
            const notes = within(dialog).getByRole('textbox', { name: /provide a reason/i });
            await user.type(notes, 'Reviewed outcome');
            await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

            const resolutionAlert = await within(dialog).findByRole('alert');
            expect(resolutionAlert).toHaveTextContent(expectedMessage);
            expect(notes).toHaveValue('Reviewed outcome');
            expect(dialog).toContainElement(document.activeElement);
            expect(resolutionAlert).not.toHaveFocus();
            expect(screen.getAllByRole('alert')).toEqual([resolutionAlert]);

            await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
            expect(submittedBodies).toEqual([
                { resolution_notes: 'Reviewed outcome' },
                { resolution_notes: 'Reviewed outcome' },
            ]);
            expect(listRequests).toBe(2);
        },
    );

    it('keeps a failed cancellation open with local feedback and a working retry', async () => {
        let cancelRequests = 0;
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json({
                items: [actionableApproval],
                total: 1,
                skip: 0,
                limit: 100,
                skipped_corrupt_payloads: 0,
            })),
            http.get('*/api/v1/approvals/84', () => HttpResponse.json(actionableApproval)),
            http.post('*/api/v1/approvals/84/cancel', () => {
                cancelRequests += 1;
                return cancelRequests === 1
                    ? HttpResponse.json({ detail: 'cancel failed' }, { status: 500 })
                    : HttpResponse.json({ ...actionableApproval, status: 'cancelled' });
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=pending&approvalId=84&source=governance');
        await screen.findByText('F-0007 · Payments');

        await user.click(screen.getByRole('button', { name: 'Cancel Request' }));
        const cancelDialog = await screen.findByRole('alertdialog');
        await user.click(within(cancelDialog).getByRole('button', { name: 'Confirm' }));

        expect(await within(cancelDialog).findByRole('alert')).toHaveTextContent('Server error');
        expect(screen.getByRole('alertdialog')).toBe(cancelDialog);
        expect(within(cancelDialog).getByRole('button', { name: 'Confirm' })).toBeEnabled();
        expect(screen.getByTestId('location')).toHaveTextContent('approvalId=84');

        await user.click(within(cancelDialog).getByRole('button', { name: 'Confirm' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        await waitFor(() => expect(
            screen.getByTestId('location'),
        ).not.toHaveTextContent('approvalId=84'));
        expect(cancelRequests).toBe(2);
    });

    it.each([403, 404])('uses the same non-leaky linked-request state for HTTP %s', async (status) => {
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json({
                items: [],
                total: 0,
                skip: 0,
                limit: 100,
                skipped_corrupt_payloads: 0,
            })),
            http.get('*/api/v1/approvals/84', () => HttpResponse.json(
                { detail: 'sensitive detail' },
                { status },
            )),
        );

        renderPage('/approvals?tab=pending&approvalId=84');

        const linkedRequest = await findLinkedRequestWithText('This linked request is unavailable.');
        expect(linkedRequest).not.toHaveTextContent('sensitive detail');
        expect(linkedRequest).not.toHaveTextContent(String(status));
    });

    it('announces skipped corrupt requests without claiming the page positions are all visible', async () => {
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json({
                items: [],
                total: 250,
                skip: 0,
                limit: 100,
                skipped_corrupt_payloads: 3,
            })),
        );

        renderPage('/approvals?tab=all');

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Some matching requests could not be displayed. Results are incomplete (3 skipped).',
        );
        expect(screen.getByText('Page positions 1–100 of 250 matching requests')).toBeInTheDocument();
        expect(screen.queryByText('Showing 1–100 of 250 requests')).not.toBeInTheDocument();
    });

    it('replaces search history, resets its page, and preserves linked and unrelated context', async () => {
        let detailRequests = 0;
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json({
                items: [approval],
                total: 1,
                skip: 0,
                limit: 100,
                skipped_corrupt_payloads: 0,
            })),
            http.get('*/api/v1/approvals/84', () => {
                detailRequests += 1;
                return HttpResponse.json(approval);
            }),
        );
        const user = userEvent.setup();
        renderPage([
            '/before',
            '/approvals?tab=pending&page=4&approvalId=84&source=governance',
        ]);
        const search = await screen.findByRole('searchbox', { name: 'Search approvals' });

        fireEvent.change(search, { target: { value: '  process  ' } });

        await waitFor(() => {
            const location = new URL(
                `http://riskhub.test${screen.getByTestId('location').textContent ?? ''}`,
            );
            expect(location.searchParams.get('q')).toBe('process');
            expect(location.searchParams.has('page')).toBe(false);
            expect(location.searchParams.get('approvalId')).toBe('84');
            expect(location.searchParams.get('source')).toBe('governance');
        });
        expect(detailRequests).toBe(1);

        await user.click(screen.getByRole('button', { name: 'Browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/before');
    });

    it('preserves spaces while a user types a multi-word search and commits its trimmed query', async () => {
        const requestedQueries: Array<string | null> = [];
        server.use(
            http.get('*/api/v1/approvals', ({ request }) => {
                requestedQueries.push(new URL(request.url).searchParams.get('q'));
                return HttpResponse.json({
                    items: [], total: 0, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
                });
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=all&page=3&source=governance');
        const search = await screen.findByRole('searchbox', { name: 'Search approvals' });

        await user.type(search, 'Vendor Alpha');

        expect(search).toHaveValue('Vendor Alpha');
        await waitFor(() => {
            const location = new URL(
                `http://riskhub.test${screen.getByTestId('location').textContent ?? ''}`,
            );
            expect(location.searchParams.get('q')).toBe('Vendor Alpha');
            expect(location.searchParams.has('page')).toBe(false);
            expect(location.searchParams.get('source')).toBe('governance');
            expect(requestedQueries).toContain('Vendor Alpha');
        });
    });

    it('pushes discrete tab and page choices while retaining a linked request', async () => {
        let detailRequests = 0;
        server.use(
            http.get('*/api/v1/approvals', ({ request }) => {
                const skip = Number(new URL(request.url).searchParams.get('skip') ?? 0);
                return HttpResponse.json({
                    items: [approval],
                    total: 250,
                    skip,
                    limit: 100,
                    skipped_corrupt_payloads: 0,
                });
            }),
            http.get('*/api/v1/approvals/84', () => {
                detailRequests += 1;
                return HttpResponse.json(approval);
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=pending&approvalId=84&source=governance');
        await screen.findByText('Showing 1–100 of 250 requests');

        await user.click(screen.getByRole('button', { name: 'Next page' }));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=2'));
        expect(screen.getByTestId('location')).toHaveTextContent('approvalId=84');

        await user.click(screen.getByRole('tab', { name: 'My Requests' }));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('tab=mine'));
        expect(screen.getByTestId('location')).not.toHaveTextContent('page=2');
        expect(screen.getByTestId('location')).toHaveTextContent('approvalId=84');

        await user.click(screen.getByRole('button', { name: 'Browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('page=2');
        await user.click(screen.getByRole('button', { name: 'Browser forward' }));
        expect(screen.getByTestId('location')).toHaveTextContent('tab=mine');
        expect(detailRequests).toBe(1);
    });

    it('keeps pagination focus mounted without presenting a stale range while the next page loads', async () => {
        let releaseNextPage!: () => void;
        const nextPageGate = new Promise<void>((resolve) => { releaseNextPage = resolve; });
        server.use(
            http.get('*/api/v1/approvals', async ({ request }) => {
                const skip = Number(new URL(request.url).searchParams.get('skip') ?? 0);
                if (skip === 100) {
                    await nextPageGate;
                }
                return HttpResponse.json({
                    items: [{ ...approval, id: skip === 100 ? 85 : 84 }],
                    total: 250,
                    skip,
                    limit: 100,
                    skipped_corrupt_payloads: 0,
                });
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=all');
        await screen.findByText('Showing 1–100 of 250 requests');
        const nextPage = screen.getByRole('button', { name: 'Next page' });

        await user.click(nextPage);

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=2'));
        expect(screen.getByRole('button', { name: 'Next page' })).toBe(nextPage);
        expect(nextPage).toHaveFocus();
        expect(screen.queryByText('Showing 1–100 of 250 requests')).not.toBeInTheDocument();
        expect(screen.queryByText(/Showing 101–0/)).not.toBeInTheDocument();

        await act(async () => {
            releaseNextPage();
            await nextPageGate;
        });
        expect(await screen.findByText('Showing 101–200 of 250 requests')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next page' })).toBe(nextPage);
        expect(nextPage).toHaveFocus();
    });

    it('keeps the newest approval query authoritative when an older page resolves last', async () => {
        let releaseOlder!: () => void;
        const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
        const newestApproval = { ...approval, id: 85, resource_name: 'Newest request' };
        server.use(
            http.get('*/api/v1/approvals', async ({ request }) => {
                const query = new URL(request.url).searchParams.get('q');
                if (query === 'older') {
                    await olderGate;
                    return HttpResponse.json({
                        items: [approval], total: 1, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
                    });
                }
                return HttpResponse.json({
                    items: [newestApproval], total: 1, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
                });
            }),
        );
        renderPage('/approvals?tab=all&q=older');

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search approvals' }), {
            target: { value: 'newer' },
        });
        expect(await screen.findByText('Newest request')).toBeInTheDocument();

        await act(async () => {
            releaseOlder();
            await olderGate;
            await Promise.resolve();
        });

        expect(screen.getByText('Newest request')).toBeInTheDocument();
        expect(screen.queryByText('F-0007 · Payments')).not.toBeInTheDocument();
    });

    it('masks a settled queue error in the first commit owned by a new URL query', async () => {
        let releaseNewer!: () => void;
        const newerGate = new Promise<void>((resolve) => { releaseNewer = resolve; });
        let leakedPreviousError = false;
        server.use(
            http.get('*/api/v1/approvals', async ({ request }) => {
                const query = new URL(request.url).searchParams.get('q');
                if (query === 'older') {
                    return HttpResponse.json({ detail: 'older failed' }, { status: 500 });
                }
                await newerGate;
                return HttpResponse.json({
                    items: [], total: 0, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
                });
            }),
        );
        renderPage('/approvals?tab=all&q=older', (location) => {
            const alert = screen.queryByRole('alert');
            if (location.includes('q=newer') && alert?.textContent?.includes('Server error')) {
                leakedPreviousError = true;
            }
        });
        expect(await screen.findByRole('alert')).toHaveTextContent('Server error');

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search approvals' }), {
            target: { value: 'newer' },
        });

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=newer'));
        expect(leakedPreviousError).toBe(false);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        await act(async () => {
            releaseNewer();
            await newerGate;
        });
    });

    it('never announces a late failed queue under the newer query', async () => {
        let releaseOlder!: () => void;
        let releaseNewer!: () => void;
        const olderGate = new Promise<void>((resolve) => { releaseOlder = resolve; });
        const newerGate = new Promise<void>((resolve) => { releaseNewer = resolve; });
        server.use(
            http.get('*/api/v1/approvals', async ({ request }) => {
                const query = new URL(request.url).searchParams.get('q');
                if (query === 'older') {
                    await olderGate;
                    return HttpResponse.json({ detail: 'older failed' }, { status: 500 });
                }
                await newerGate;
                return HttpResponse.json({
                    items: [], total: 0, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
                });
            }),
        );
        renderPage('/approvals?tab=all&q=older');

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search approvals' }), {
            target: { value: 'newer' },
        });
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=newer'));
        await act(async () => {
            releaseOlder();
            await olderGate;
        });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        await act(async () => {
            releaseNewer();
            await newerGate;
        });
        expect(await screen.findByText('Showing 0–0 of 0 requests')).toBeInTheDocument();
    });

    it('clears a linked request immediately and ignores its late response after history removes the parameter', async () => {
        let releaseDetail!: () => void;
        const detailGate = new Promise<void>((resolve) => { releaseDetail = resolve; });
        server.use(
            http.get('*/api/v1/approvals', () => HttpResponse.json({
                items: [], total: 0, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
            })),
            http.get('*/api/v1/approvals/84', async () => {
                await detailGate;
                return HttpResponse.json(approval);
            }),
        );
        const user = userEvent.setup();
        renderPage([
            '/approvals?tab=pending',
            '/approvals?tab=pending&approvalId=84',
        ]);
        expect(await screen.findByText('Loading linked request.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/approvals?tab=pending');
        expect(screen.queryByRole('region', { name: 'Linked request' })).not.toBeInTheDocument();

        await act(async () => {
            releaseDetail();
            await detailGate;
            await Promise.resolve();
        });

        expect(screen.queryByRole('region', { name: 'Linked request' })).not.toBeInTheDocument();
        expect(screen.queryByText('F-0007 · Payments')).not.toBeInTheDocument();
    });

    it('keeps one off-page linked request across tab, search, and page changes', async () => {
        let detailRequests = 0;
        server.use(
            http.get('*/api/v1/approvals', ({ request }) => {
                const skip = Number(new URL(request.url).searchParams.get('skip') ?? 0);
                return HttpResponse.json({
                    items: [], total: 250, skip, limit: 100, skipped_corrupt_payloads: 0,
                });
            }),
            http.get('*/api/v1/approvals/84', () => {
                detailRequests += 1;
                return HttpResponse.json(approval);
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=pending&approvalId=84');
        await findLinkedRequestWithText('F-0007 · Payments');

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search approvals' }), {
            target: { value: 'vendor' },
        });
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('q=vendor'));
        await user.click(screen.getByRole('button', { name: 'Next page' }));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=2'));
        await user.click(screen.getByRole('tab', { name: 'My Requests' }));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('tab=mine'));

        expect(screen.getByTestId('location')).toHaveTextContent('approvalId=84');
        expect(screen.getByRole('region', { name: 'Linked request' })).toHaveTextContent(
            'F-0007 · Payments',
        );
        expect(detailRequests).toBe(1);
    });

    it('keeps a failed primary queue distinct from an empty queue and retries locally', async () => {
        let requests = 0;
        server.use(
            http.get('*/api/v1/approvals', () => {
                requests += 1;
                return requests === 1
                    ? HttpResponse.json({ detail: 'failed' }, { status: 500 })
                    : HttpResponse.json({
                        items: [], total: 0, skip: 0, limit: 100, skipped_corrupt_payloads: 0,
                    });
            }),
        );
        const user = userEvent.setup();
        renderPage('/approvals?tab=pending');

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('All Caught Up')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('Showing 0–0 of 0 requests')).toBeInTheDocument();
        expect(requests).toBe(2);
    });
});
