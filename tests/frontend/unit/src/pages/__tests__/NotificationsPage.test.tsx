import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
    return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/notifications']}>
            <Routes>
                <Route path="*" element={<><NotificationsPage /><LocationDisplay /></>} />
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

        await user.click(await screen.findByRole('button', { name: 'Unread' }));
        await waitFor(() => expect(unreadListRequests).toBe(1));
        await user.click(screen.getByRole('button', { name: 'Mark as read' }));

        await waitFor(() => expect(screen.queryByText(linkedUnread.title)).not.toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Mark as unread' })).not.toBeInTheDocument();
        expect(screen.getByText('No notifications')).toBeInTheDocument();
        expect(screen.getAllByText('All caught up!')).toHaveLength(2);
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
        await user.click(await screen.findByRole('button', { name: 'Unread' }));
        await waitFor(() => expect(unreadListRequests).toBe(1));
        expect(screen.queryByText('All-view sentinel')).not.toBeInTheDocument();
        const firstReadAction = screen.getAllByRole('button', { name: 'Mark as read' })[0];

        await user.click(firstReadAction);
        await waitFor(() => expect(readRequests).toBe(1));
        const allTab = screen.getByRole('button', { name: 'All' });
        const unreadTab = screen.getByRole('button', { name: /Unread/ });
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
        await user.click(await screen.findByRole('button', { name: 'Unread' }));
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
        await user.click(await screen.findByRole('button', { name: 'Unread' }));
        await waitFor(() => expect(observedSkips).toContain('0'));
        const pagination = screen.getByText('Page 1 of 2').parentElement!;
        await user.click(within(pagination).getAllByRole('button')[1]);
        expect(await screen.findByText(lastPageItem.title)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Mark as read' }));

        expect(await screen.findByText(priorPageItem.title)).toBeInTheDocument();
        expect(screen.queryByText(lastPageItem.title)).not.toBeInTheDocument();
        expect(observedSkips.at(-1)).toBe('0');
        expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument();
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
        await user.click(await screen.findByRole('button', { name: 'Unread' }));
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
