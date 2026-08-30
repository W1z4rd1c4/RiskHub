import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { act, Profiler } from 'react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import i18n from '@/i18n';
import NotificationsPage from '@/pages/NotificationsPage';
import type { Notification } from '@/types/notification';
import { server } from '@test/mocks/server';

const linkedUnread: Notification = {
    id: 601,
    type: 'issue_due_soon',
    title: 'Issue due soon',
    message: 'Issue remediation deadline is approaching.',
    resource_type: 'issue',
    resource_id: 77,
    is_read: false,
    created_at: '2026-04-07T10:00:00Z',
    expires_at: null,
};

let readRequests = 0;
let unreadRequests = 0;
let markAllRequests = 0;

function LocationDisplay() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function HistoryControls() {
    const navigate = useNavigate();
    return (
        <>
            <button type="button" onClick={() => navigate(-1)}>History back</button>
            <button type="button" onClick={() => navigate(1)}>History forward</button>
        </>
    );
}

function renderPage(
    initialEntries: string[] = ['/notifications'],
    initialIndex = initialEntries.length - 1,
) {
    return render(
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
            <Routes>
                <Route path="*" element={<><NotificationsPage /><LocationDisplay /><HistoryControls /></>} />
            </Routes>
        </MemoryRouter>,
    );
}

function installHandlers(item: Notification = linkedUnread) {
    server.use(
        http.get('*/api/v1/notifications', () => HttpResponse.json({
            items: [item],
            total: 1,
            skip: 0,
            limit: 20,
            unread_count: item.is_read ? 0 : 1,
        })),
        http.post(`*/api/v1/notifications/${item.id}/read`, () => {
            readRequests += 1;
            return HttpResponse.json({ unread_count: 0 });
        }),
        http.post(`*/api/v1/notifications/${item.id}/unread`, () => {
            unreadRequests += 1;
            return HttpResponse.json({ unread_count: 1 });
        }),
        http.post('*/api/v1/notifications/read-all', () => {
            markAllRequests += 1;
            return new HttpResponse(null, { status: 204 });
        }),
    );
}

describe('NotificationsPage read-state controls', () => {
    beforeEach(async () => {
        readRequests = 0;
        unreadRequests = 0;
        markAllRequests = 0;
        await i18n.changeLanguage('en');
        installHandlers();
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('shows a focus-stable local retry instead of a false empty state after the initial list request fails', async () => {
        let listRequests = 0;
        let releaseRetry!: () => void;
        const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
        server.use(
            http.get('*/api/v1/notifications', async () => {
                listRequests += 1;
                if (listRequests === 1) {
                    return HttpResponse.json({ detail: 'failed' }, { status: 500 });
                }
                await retryGate;
                return HttpResponse.json({
                    items: [],
                    total: 0,
                    skip: 0,
                    limit: 20,
                    unread_count: 0,
                });
            }),
        );
        const user = userEvent.setup();
        renderPage();

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Could not load notifications. Try again.');
        expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
        expect(screen.queryByText('All caught up!')).not.toBeInTheDocument();

        const retry = screen.getByRole('button', { name: 'Retry' });
        await user.click(retry);
        await waitFor(() => expect(listRequests).toBe(2));
        expect(retry).toHaveFocus();
        expect(retry).toHaveAttribute('aria-disabled', 'true');
        expect(retry).toHaveAttribute('aria-busy', 'true');
        fireEvent.click(retry);
        expect(listRequests).toBe(2);

        await act(async () => { releaseRetry(); });
        expect(await screen.findByText('No notifications')).toBeInTheDocument();
        expect(screen.getByText('All caught up!')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the safe rows visible and labels them stale when a same-view backfill fails', async () => {
        const secondUnread = { ...linkedUnread, id: 602, title: 'Second unread issue' };
        let acknowledged = false;
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const unreadOnly = new URL(request.url).searchParams.get('unread_only') === 'true';
                if (unreadOnly && acknowledged) {
                    return HttpResponse.json({ detail: 'failed' }, { status: 500 });
                }
                return HttpResponse.json({
                    items: unreadOnly ? [linkedUnread, secondUnread] : [linkedUnread],
                    total: unreadOnly ? 2 : 1,
                    skip: 0,
                    limit: 20,
                    unread_count: 2,
                });
            }),
            http.post('*/api/v1/notifications/601/read', () => {
                acknowledged = true;
                return HttpResponse.json({ unread_count: 1 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole('tab', { name: 'Unread' }));
        await screen.findByText(secondUnread.title);

        await user.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);

        expect(await screen.findByRole('alert')).toHaveTextContent('Notifications may be out of date. Try again.');
        expect(screen.getByText(secondUnread.title)).toBeInTheDocument();
        expect(screen.queryByText(linkedUnread.title)).not.toBeInTheDocument();
        expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
    });

    it('does not reuse rows from a different tab when the new URL-scoped request fails', async () => {
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const unreadOnly = new URL(request.url).searchParams.get('unread_only') === 'true';
                return unreadOnly
                    ? HttpResponse.json({ detail: 'failed' }, { status: 500 })
                    : HttpResponse.json({
                        items: [linkedUnread],
                        total: 1,
                        skip: 0,
                        limit: 20,
                        unread_count: 1,
                    });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await screen.findByText(linkedUnread.title);

        await user.click(screen.getByRole('tab', { name: /^Unread/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not load notifications. Try again.');
        expect(screen.queryByText(linkedUnread.title)).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/notifications?tab=unread');
    });

    it('does not commit All rows under the Unread URL while the Unread request is pending', async () => {
        let releaseUnread!: () => void;
        const unreadRequest = new Promise<void>((resolve) => { releaseUnread = resolve; });
        const unreadCommitSnapshots: boolean[] = [];
        const host = document.createElement('div');
        document.body.appendChild(host);
        server.use(
            http.get('*/api/v1/notifications', async ({ request }) => {
                const unreadOnly = new URL(request.url).searchParams.get('unread_only') === 'true';
                if (unreadOnly) {
                    await unreadRequest;
                }
                return HttpResponse.json({
                    items: unreadOnly ? [] : [linkedUnread],
                    total: unreadOnly ? 0 : 1,
                    skip: 0,
                    limit: 20,
                    unread_count: unreadOnly ? 0 : 1,
                });
            }),
        );

        render(
            <Profiler
                id="notifications"
                onRender={() => {
                    const selectedTab = host.querySelector('[role="tab"][aria-selected="true"]');
                    if (!selectedTab?.textContent?.includes('Unread')) return;
                    unreadCommitSnapshots.push(host.textContent?.includes(linkedUnread.title) ?? false);
                }}
            >
                <MemoryRouter initialEntries={['/notifications']}>
                    <Routes>
                        <Route path="*" element={<><NotificationsPage /><LocationDisplay /></>} />
                    </Routes>
                </MemoryRouter>
            </Profiler>,
            { container: host },
        );

        expect(await screen.findByText(linkedUnread.title)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /^Unread/ }));

        expect(unreadCommitSnapshots).not.toContain(true);
        expect(screen.queryByText(linkedUnread.title)).not.toBeInTheDocument();

        await act(async () => {
            releaseUnread();
            await unreadRequest;
        });
        expect(await screen.findByText('No notifications')).toBeInTheDocument();
    });

    it('clears previously loaded notifications when a same-view refresh is denied', async () => {
        const secondUnread = { ...linkedUnread, id: 602, title: 'Second unread issue' };
        let acknowledged = false;
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const unreadOnly = new URL(request.url).searchParams.get('unread_only') === 'true';
                if (unreadOnly && acknowledged) {
                    return HttpResponse.json({ detail: 'forbidden' }, { status: 403 });
                }
                return HttpResponse.json({
                    items: unreadOnly ? [linkedUnread, secondUnread] : [linkedUnread],
                    total: unreadOnly ? 2 : 1,
                    skip: 0,
                    limit: 20,
                    unread_count: 2,
                });
            }),
            http.post('*/api/v1/notifications/601/read', () => {
                acknowledged = true;
                return HttpResponse.json({ unread_count: 1 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole('tab', { name: 'Unread' }));
        await screen.findByText(secondUnread.title);

        await user.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);

        expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to notifications.');
        expect(screen.queryByText(linkedUnread.title)).not.toBeInTheDocument();
        expect(screen.queryByText(secondUnread.title)).not.toBeInTheDocument();
        expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
    });

    it('keeps tab and one-based page in URL history while preserving unrelated params', async () => {
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                const skip = Number(url.searchParams.get('skip') ?? '0');
                return HttpResponse.json({
                    items: [{ ...linkedUnread, id: 900 + skip, title: `Item at ${skip}` }],
                    total: 41,
                    skip,
                    limit: 20,
                    unread_count: 41,
                });
            }),
        );
        const user = userEvent.setup();
        renderPage(['/notifications?tab=unread&page=2&return_to=%2Frisks%3Fpage%3D3&source=audit']);

        expect(await screen.findByText('Item at 20')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Unread/ })).toHaveAttribute('aria-selected', 'true');

        await user.click(screen.getByRole('tab', { name: 'All' }));
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/notifications?return_to=%2Frisks%3Fpage%3D3&source=audit',
        );
        expect(await screen.findByText('Item at 0')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(await screen.findByText('Item at 20')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Unread/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('location')).toHaveTextContent(
            '/notifications?tab=unread&page=2&return_to=%2Frisks%3Fpage%3D3&source=audit',
        );

        await user.click(screen.getByRole('button', { name: 'History forward' }));
        expect(await screen.findByText('Item at 0')).toBeInTheDocument();
    });

    it('repairs invalid and server-out-of-range page state with replace', async () => {
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                const skip = Number(url.searchParams.get('skip') ?? '0');
                return HttpResponse.json({
                    items: skip === 20 ? [linkedUnread] : [],
                    total: 21,
                    skip,
                    limit: 20,
                    unread_count: 1,
                });
            }),
        );
        const user = userEvent.setup();
        renderPage(['/before', '/notifications?tab=invalid&page=5&keep=1']);

        expect(await screen.findByText(linkedUnread.title)).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/notifications?page=2&keep=1');
        });

        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/before');
    });

    it('normalizes an unsafe page before requesting notifications', async () => {
        const observedSkips: string[] = [];
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                observedSkips.push(url.searchParams.get('skip') ?? '0');
                return HttpResponse.json({
                    items: [linkedUnread],
                    total: 1,
                    skip: 0,
                    limit: 20,
                    unread_count: 1,
                });
            }),
        );
        const user = userEvent.setup();
        renderPage(['/before', '/notifications?tab=all&page=999999999999999999999&keep=1']);

        expect(await screen.findByText(linkedUnread.title)).toBeInTheDocument();
        expect(observedSkips).toEqual(['0']);
        expect(screen.getByTestId('location')).toHaveTextContent('/notifications?keep=1');
        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/before');
    });

    it('ignores an older Unread response after Back restores a fresh All view', async () => {
        let releaseUnread!: () => void;
        const unreadGate = new Promise<void>((resolve) => { releaseUnread = resolve; });
        let unreadRequests = 0;
        let allRequests = 0;
        server.use(
            http.get('*/api/v1/notifications', async ({ request }) => {
                const url = new URL(request.url);
                if (url.searchParams.get('unread_only') === 'true') {
                    unreadRequests += 1;
                    await unreadGate;
                    return HttpResponse.json({
                        items: [{ ...linkedUnread, id: 911, title: 'Late unread result' }],
                        total: 1,
                        skip: 0,
                        limit: 20,
                        unread_count: 1,
                    });
                }

                allRequests += 1;
                return HttpResponse.json({
                    items: [{
                        ...linkedUnread,
                        id: 912 + allRequests,
                        title: allRequests === 1 ? 'Initial all result' : 'Fresh all result',
                    }],
                    total: 1,
                    skip: 0,
                    limit: 20,
                    unread_count: 1,
                });
            }),
        );
        const user = userEvent.setup();
        renderPage();

        expect(await screen.findByText('Initial all result')).toBeInTheDocument();
        await user.click(screen.getByRole('tab', { name: /Unread/ }));
        await waitFor(() => expect(unreadRequests).toBe(1));
        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(await screen.findByText('Fresh all result')).toBeInTheDocument();

        await act(async () => {
            releaseUnread();
            await unreadGate;
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Fresh all result')).toBeInTheDocument();
        expect(screen.queryByText('Late unread result')).not.toBeInTheDocument();
    });

    it('does not let a pending mutation overwrite a view restored with Back', async () => {
        let releaseRead!: () => void;
        const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
        let readRequests = 0;
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                const unread = url.searchParams.get('unread_only') === 'true';
                const skip = Number(url.searchParams.get('skip') ?? '0');
                return HttpResponse.json({
                    items: [{
                        ...linkedUnread,
                        id: unread ? 921 : 922,
                        title: unread ? 'Unread mutation source' : 'Restored all result',
                    }],
                    total: unread ? 21 : 1,
                    skip,
                    limit: 20,
                    unread_count: 1,
                });
            }),
            http.post('*/api/v1/notifications/921/read', async () => {
                readRequests += 1;
                await readGate;
                return HttpResponse.json({ unread_count: 0 });
            }),
        );
        const user = userEvent.setup();
        renderPage(['/notifications', '/notifications?tab=unread&page=2']);

        expect(await screen.findByText('Unread mutation source')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Mark as read' }));
        await waitFor(() => expect(readRequests).toBe(1));
        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(await screen.findByText('Restored all result')).toBeInTheDocument();
        expect(screen.getByText('1 unread')).toBeInTheDocument();

        await act(async () => {
            releaseRead();
            await readGate;
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByTestId('location')).toHaveTextContent('/notifications');
        expect(screen.getByTestId('location')).not.toHaveTextContent('tab=unread');
        expect(screen.getByText('Restored all result')).toBeInTheDocument();
        expect(screen.getByText('1 unread')).toBeInTheDocument();
        expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
    });

    it('does not let an old mutation overwrite a fresh return to the same view', async () => {
        let releaseRead!: () => void;
        const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
        let readRequests = 0;
        let allRequests = 0;
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                if (url.searchParams.get('unread_only') === 'true') {
                    return HttpResponse.json({
                        items: [{ ...linkedUnread, id: 932, title: 'Intervening unread view' }],
                        total: 1,
                        skip: 0,
                        limit: 20,
                        unread_count: 3,
                    });
                }

                allRequests += 1;
                const isFreshReturn = allRequests > 1;
                return HttpResponse.json({
                    items: [{
                        ...linkedUnread,
                        id: isFreshReturn ? 933 : 931,
                        title: isFreshReturn ? 'Fresh same-view result' : 'Initial mutation source',
                    }],
                    total: 1,
                    skip: 0,
                    limit: 20,
                    unread_count: isFreshReturn ? 2 : 1,
                });
            }),
            http.post('*/api/v1/notifications/931/read', async () => {
                readRequests += 1;
                await readGate;
                return HttpResponse.json({ unread_count: 0 });
            }),
        );
        const user = userEvent.setup();
        renderPage(['/notifications', '/notifications?tab=unread'], 0);

        expect(await screen.findByText('Initial mutation source')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Mark as read' }));
        await waitFor(() => expect(readRequests).toBe(1));
        await user.click(screen.getByRole('button', { name: 'History forward' }));
        expect(await screen.findByText('Intervening unread view')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(await screen.findByText('Fresh same-view result')).toBeInTheDocument();
        expect(screen.getByText('2 unread')).toBeInTheDocument();

        await act(async () => {
            releaseRead();
            await readGate;
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByTestId('location')).toHaveTextContent('/notifications');
        expect(screen.getByText('Fresh same-view result')).toBeInTheDocument();
        expect(screen.queryByText('Initial mutation source')).not.toBeInTheDocument();
        expect(screen.getByText('2 unread')).toBeInTheDocument();
    });

    it('keeps hover, focus, and resource navigation free of read-state mutations', async () => {
        const user = userEvent.setup();
        renderPage();
        const link = await screen.findByRole('link', { name: /Issue due soon/ });

        await user.hover(link);
        link.focus();
        expect(readRequests).toBe(0);
        expect(unreadRequests).toBe(0);

        await user.click(link);
        expect(screen.getByTestId('location')).toHaveTextContent('/issues/77');
        expect(readRequests).toBe(0);
        expect(unreadRequests).toBe(0);
    });

    it('renders non-navigable content statically with a separate read action', async () => {
        const item = { ...linkedUnread, id: 602, resource_type: null, resource_id: null };
        installHandlers(item);
        renderPage();
        const title = await screen.findByText(item.title);

        expect(title.closest('a,button')).toBeNull();
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
        expect(readRequests).toBe(0);
    });

    it('allows one pending request, applies the acknowledged count, and supports mark unread', async () => {
        let releaseRead!: () => void;
        const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
        server.use(
            http.post('*/api/v1/notifications/601/read', async () => {
                readRequests += 1;
                await readGate;
                return HttpResponse.json({ unread_count: 0 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        const readAction = await screen.findByRole('button', { name: 'Mark as read' });

        await user.click(readAction);
        await waitFor(() => expect(readRequests).toBe(1));
        expect(readAction).toHaveAttribute('aria-disabled', 'true');
        const markAll = screen.getByRole('button', { name: 'Mark all as read' });
        expect(markAll).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(readAction);
        fireEvent.click(markAll);
        expect(readRequests).toBe(1);
        expect(markAllRequests).toBe(0);
        expect(screen.getByText('1 unread')).toBeInTheDocument();
        releaseRead();

        const unreadAction = await screen.findByRole('button', { name: 'Mark as unread' });
        expect(screen.getByText('All caught up!')).toBeInTheDocument();
        await user.click(unreadAction);
        await waitFor(() => expect(unreadRequests).toBe(1));
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
        expect(screen.getByText('1 unread')).toBeInTheDocument();
    });

    it('preserves the item and count on failure and renders one adjacent local alert', async () => {
        server.use(
            http.post('*/api/v1/notifications/601/read', () => {
                readRequests += 1;
                return HttpResponse.json({ detail: 'failed' }, { status: 500 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        const action = await screen.findByRole('button', { name: 'Mark as read' });

        await user.click(action);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Could not update this notification. Try again.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(action).toHaveAttribute('aria-describedby', alert.id);
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
        expect(screen.getByText('1 unread')).toBeInTheDocument();
    });

    it('keeps mark-all state unchanged on failure and reports one adjacent alert', async () => {
        server.use(
            http.post('*/api/v1/notifications/read-all', () => {
                markAllRequests += 1;
                return HttpResponse.json({ detail: 'failed' }, { status: 500 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        const markAll = await screen.findByRole('button', { name: 'Mark all as read' });

        await user.click(markAll);

        const alert = await screen.findByRole('alert');
        expect(markAllRequests).toBe(1);
        expect(alert).toHaveTextContent('Could not mark all notifications as read. Try again.');
        expect(markAll).toHaveAttribute('aria-describedby', alert.id);
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
        expect(screen.getByText('1 unread')).toBeInTheDocument();

        server.use(http.post('*/api/v1/notifications/601/read', () => HttpResponse.json({}, { status: 500 })));
        await user.click(screen.getByRole('button', { name: 'Mark as read' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not update this notification. Try again.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('clears a completed mark-all error when the query view changes', async () => {
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const unread = new URL(request.url).searchParams.get('unread_only') === 'true';
                return HttpResponse.json({
                    items: [{
                        ...linkedUnread,
                        id: unread ? 941 : linkedUnread.id,
                        title: unread ? 'Unread view after mutation error' : linkedUnread.title,
                    }],
                    total: 1,
                    skip: 0,
                    limit: 20,
                    unread_count: 1,
                });
            }),
            http.post('*/api/v1/notifications/read-all', () => (
                HttpResponse.json({ detail: 'failed' }, { status: 500 })
            )),
        );
        const user = userEvent.setup();
        renderPage();
        await screen.findByText(linkedUnread.title);

        await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark all notifications as read. Try again.');
        await user.click(screen.getByRole('tab', { name: /Unread/ }));

        expect(await screen.findByText('Unread view after mutation error')).toBeInTheDocument();
        expect(screen.queryByText('Could not mark all notifications as read. Try again.')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not carry a completed mutation error into a denied refresh', async () => {
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const unread = new URL(request.url).searchParams.get('unread_only') === 'true';
                return unread
                    ? HttpResponse.json({ detail: 'forbidden' }, { status: 403 })
                    : HttpResponse.json({
                        items: [linkedUnread],
                        total: 1,
                        skip: 0,
                        limit: 20,
                        unread_count: 1,
                    });
            }),
            http.post('*/api/v1/notifications/read-all', () => (
                HttpResponse.json({ detail: 'failed' }, { status: 500 })
            )),
        );
        const user = userEvent.setup();
        renderPage();
        await screen.findByText(linkedUnread.title);

        await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark all notifications as read. Try again.');
        await user.click(screen.getByRole('tab', { name: /Unread/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to notifications.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.queryByText('Could not mark all notifications as read. Try again.')).not.toBeInTheDocument();
    });

    it('applies mark-all item and count changes only after server acknowledgement', async () => {
        let releaseMarkAll!: () => void;
        const markAllGate = new Promise<void>(resolve => { releaseMarkAll = resolve; });
        server.use(
            http.post('*/api/v1/notifications/read-all', async () => {
                markAllRequests += 1;
                await markAllGate;
                return new HttpResponse(null, { status: 204 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        const markAll = await screen.findByRole('button', { name: 'Mark all as read' });

        await user.click(markAll);
        await waitFor(() => expect(markAllRequests).toBe(1));
        expect(markAll).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('button', { name: 'Mark as read' })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText('1 unread')).toBeInTheDocument();
        releaseMarkAll();

        expect(await screen.findByRole('button', { name: 'Mark as unread' })).toBeEnabled();
        expect(screen.getByText('All caught up!')).toBeInTheDocument();
    });

    it('removes an acknowledged read item from the Unread view', async () => {
        let unreadListRequests = 0;
        let itemRead = false;
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                if (url.searchParams.get('unread_only') === 'true') {
                    unreadListRequests += 1;
                }
                if (itemRead) {
                    return HttpResponse.json({ detail: 'backfill failed' }, { status: 500 });
                }
                return HttpResponse.json({
                    items: [linkedUnread],
                    total: 1,
                    skip: 0,
                    limit: 20,
                    unread_count: 1,
                });
            }),
            http.post('*/api/v1/notifications/601/read', () => {
                itemRead = true;
                return HttpResponse.json({ unread_count: 0 });
            }),
        );
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('tab', { name: 'Unread' }));
        await waitFor(() => expect(unreadListRequests).toBe(1));
        await user.click(screen.getByRole('button', { name: 'Mark as read' }));

        await waitFor(() => expect(screen.queryByText(linkedUnread.title)).not.toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Mark as unread' })).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('Notifications may be out of date. Try again.');
        expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
        expect(screen.queryByText('All caught up!')).not.toBeInTheDocument();
    });

    it('backfills page zero and blocks tab or page changes while read acknowledgement is pending', async () => {
        const unreadItems = Array.from({ length: 21 }, (_, index) => ({
            ...linkedUnread,
            id: 700 + index,
            title: `Unread item ${index + 1}`,
        }));
        let acknowledged = false;
        let unreadListRequests = 0;
        let totalListRequests = 0;
        let releaseRead!: () => void;
        let releaseBackfill!: () => void;
        const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
        const backfillGate = new Promise<void>(resolve => { releaseBackfill = resolve; });
        let backfillRequests = 0;
        server.use(
            http.get('*/api/v1/notifications', async ({ request }) => {
                totalListRequests += 1;
                const url = new URL(request.url);
                const isUnreadView = url.searchParams.get('unread_only') === 'true';
                const skip = Number(url.searchParams.get('skip') ?? '0');
                if (!isUnreadView) {
                    return HttpResponse.json({
                        items: [{ ...linkedUnread, id: 799, title: 'All-view sentinel' }],
                        total: 1,
                        skip,
                        limit: 20,
                        unread_count: 21,
                    });
                }
                unreadListRequests += 1;
                if (acknowledged) {
                    backfillRequests += 1;
                    await backfillGate;
                }
                const availableItems = acknowledged ? unreadItems.slice(1) : unreadItems;
                return HttpResponse.json({
                    items: availableItems.slice(skip, skip + 20),
                    total: availableItems.length,
                    skip,
                    limit: 20,
                    unread_count: availableItems.length,
                });
            }),
            http.post('*/api/v1/notifications/700/read', async () => {
                readRequests += 1;
                await readGate;
                acknowledged = true;
                return HttpResponse.json({ unread_count: 20 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole('tab', { name: 'Unread' }));
        await waitFor(() => expect(unreadListRequests).toBe(1));
        expect(screen.queryByText('All-view sentinel')).not.toBeInTheDocument();
        const firstReadAction = screen.getAllByRole('button', { name: 'Mark as read' })[0];

        await user.click(firstReadAction);
        await waitFor(() => expect(readRequests).toBe(1));
        const allTab = screen.getByRole('tab', { name: 'All' });
        const unreadTab = screen.getByRole('tab', { name: /Unread/ });
        const pagination = screen.getByText('Page 1 of 2').parentElement!;
        const [previousPage, nextPage] = within(pagination).getAllByRole('button');
        expect(allTab).toBeDisabled();
        expect(unreadTab).toBeDisabled();
        expect(previousPage).toBeDisabled();
        expect(nextPage).toBeDisabled();
        const requestsBeforeAttemptedNavigation = totalListRequests;
        fireEvent.click(allTab);
        fireEvent.click(nextPage);
        expect(totalListRequests).toBe(requestsBeforeAttemptedNavigation);
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
        expect(screen.queryByText('All-view sentinel')).not.toBeInTheDocument();
        releaseRead();

        await waitFor(() => expect(backfillRequests).toBe(1));
        expect(screen.queryByText('Unread item 1')).not.toBeInTheDocument();
        expect(allTab).toBeDisabled();
        expect(unreadTab).toBeDisabled();
        releaseBackfill();

        expect(await screen.findByText('Unread item 21')).toBeInTheDocument();
        expect(screen.queryByText('Unread item 1')).not.toBeInTheDocument();
        expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
        expect(unreadListRequests).toBe(2);
        expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(20);
    });

    it('keeps a newer backfill unread count instead of restoring the mutation fallback', async () => {
        const backfilledItem = { ...linkedUnread, id: 810, title: 'Backfilled issue' };
        let acknowledged = false;
        server.use(
            http.get('*/api/v1/notifications', () => HttpResponse.json({
                items: [acknowledged ? backfilledItem : linkedUnread],
                total: acknowledged ? 21 : 1,
                skip: 0,
                limit: 20,
                unread_count: acknowledged ? 21 : 1,
            })),
            http.post('*/api/v1/notifications/601/read', () => {
                acknowledged = true;
                return HttpResponse.json({ unread_count: 20 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole('tab', { name: 'Unread' }));
        await user.click(screen.getByRole('button', { name: 'Mark as read' }));

        expect(await screen.findByText(backfilledItem.title)).toBeInTheDocument();
        expect(screen.getByText('21 unread')).toBeInTheDocument();
        expect(screen.queryByText('20 unread')).not.toBeInTheDocument();
    });

    it('moves an emptied nonzero Unread page back and reconciles it from the server', async () => {
        const priorPageItem = { ...linkedUnread, id: 603, title: 'Prior-page issue' };
        const lastPageItem = { ...linkedUnread, id: 604, title: 'Last-page issue' };
        const observedSkips: string[] = [];
        let lastPageRead = false;
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                const skip = url.searchParams.get('skip') ?? '0';
                if (url.searchParams.get('unread_only') === 'true') {
                    observedSkips.push(skip);
                }
                const onLastPage = skip === '20';
                return HttpResponse.json({
                    items: [onLastPage ? lastPageItem : priorPageItem],
                    total: lastPageRead ? 20 : 21,
                    skip: Number(skip),
                    limit: 20,
                    unread_count: 2,
                });
            }),
            http.post('*/api/v1/notifications/604/read', () => {
                lastPageRead = true;
                return HttpResponse.json({ unread_count: 1 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole('tab', { name: 'Unread' }));
        await waitFor(() => expect(observedSkips).toContain('0'));
        const pagination = screen.getByText('Page 1 of 2').parentElement!;
        await user.click(within(pagination).getAllByRole('button')[1]);
        expect(await screen.findByText(lastPageItem.title)).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/notifications?tab=unread&page=2');

        await user.click(screen.getByRole('button', { name: 'Mark as read' }));

        expect(await screen.findByText(priorPageItem.title)).toBeInTheDocument();
        expect(screen.queryByText(lastPageItem.title)).not.toBeInTheDocument();
        expect(observedSkips.at(-1)).toBe('0');
        expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/notifications?tab=unread');

        await user.click(screen.getByRole('button', { name: 'History back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/notifications?tab=unread');
        expect(screen.getByTestId('location')).not.toHaveTextContent('page=2');
    });

    it('clears the Unread view and pagination after acknowledged mark-all', async () => {
        let inboxCleared = false;
        server.use(
            http.get('*/api/v1/notifications', ({ request }) => {
                const url = new URL(request.url);
                const skip = Number(url.searchParams.get('skip') ?? '0');
                return HttpResponse.json({
                    items: inboxCleared ? [] : [{ ...linkedUnread, id: skip === 20 ? 606 : 605 }],
                    total: inboxCleared ? 0 : 21,
                    skip,
                    limit: 20,
                    unread_count: inboxCleared ? 0 : 2,
                });
            }),
            http.post('*/api/v1/notifications/read-all', () => {
                markAllRequests += 1;
                inboxCleared = true;
                return new HttpResponse(null, { status: 204 });
            }),
        );
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole('tab', { name: 'Unread' }));
        const pagination = await screen.findByText('Page 1 of 2');
        await user.click(within(pagination.parentElement!).getAllByRole('button')[1]);
        expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

        expect(await screen.findByText('No notifications')).toBeInTheDocument();
        expect(screen.getAllByText('All caught up!')).toHaveLength(2);
        expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
        expect(markAllRequests).toBe(1);
    });

    it('localizes read, unread, and mark-all actions and failures in Czech', async () => {
        await i18n.changeLanguage('cs');
        server.use(http.post('*/api/v1/notifications/601/read', () => HttpResponse.json({}, { status: 500 })));
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole('button', { name: 'Označit jako přečtené' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Oznámení se nepodařilo aktualizovat. Zkuste to znovu.');

        server.use(http.post('*/api/v1/notifications/601/read', () => HttpResponse.json({ unread_count: 0 })));
        await user.click(screen.getByRole('button', { name: 'Označit jako přečtené' }));
        const markUnread = await screen.findByRole('button', { name: 'Označit jako nepřečtené' });

        server.use(http.post('*/api/v1/notifications/601/unread', () => HttpResponse.json({}, { status: 500 })));
        await user.click(markUnread);
        expect(await screen.findByRole('alert')).toHaveTextContent('Oznámení se nepodařilo aktualizovat. Zkuste to znovu.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);

        server.use(http.post('*/api/v1/notifications/601/unread', () => HttpResponse.json({ unread_count: 1 })));
        await user.click(screen.getByRole('button', { name: 'Označit jako nepřečtené' }));
        await screen.findByRole('button', { name: 'Označit jako přečtené' });

        server.use(http.post('*/api/v1/notifications/read-all', () => HttpResponse.json({}, { status: 500 })));
        await user.click(screen.getByRole('button', { name: 'Označit vše jako přečtené' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Oznámení se nepodařilo označit jako přečtená. Zkuste to znovu.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
});
