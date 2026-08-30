import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import i18n from '@/i18n';
import type { Notification } from '@/types/notification';
import { server } from '@test/mocks/server';

const linkedUnread: Notification = {
    id: 202,
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

function BellHarness({ item = linkedUnread }: { item?: Notification }) {
    const [count, setCount] = useState(item.is_read ? 0 : 1);
    return (
        <>
            <NotificationBell unreadCount={count} onUnreadCountChange={setCount} />
            <output aria-label="Unread count">{count}</output>
        </>
    );
}

function installHandlers(item: Notification = linkedUnread) {
    server.use(
        http.get('*/api/v1/notifications', () => HttpResponse.json({
            items: [item],
            total: 1,
            skip: 0,
            limit: 10,
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

async function openBell() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: i18n.t('notifications:aria.bell') }));
    await screen.findByText(linkedUnread.title);
    return user;
}

describe('NotificationBell read-state controls', () => {
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
        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="*" element={<><BellHarness /><LocationDisplay /></>} />
                </Routes>
            </MemoryRouter>,
        );
        const user = await openBell();
        const resourceLink = screen.getByRole('link', { name: /Issue due soon/ });

        await user.hover(resourceLink);
        resourceLink.focus();
        expect(readRequests).toBe(0);
        expect(unreadRequests).toBe(0);

        await user.click(resourceLink);
        expect(screen.getByTestId('location')).toHaveTextContent('/issues/77');
        expect(readRequests).toBe(0);
        expect(unreadRequests).toBe(0);
    });

    it('renders non-navigable content statically and changes state only after the explicit action succeeds', async () => {
        const item = { ...linkedUnread, id: 203, resource_type: null, resource_id: null };
        installHandlers(item);
        render(<MemoryRouter><BellHarness item={item} /></MemoryRouter>);
        const user = await openBell();
        const title = screen.getByText(item.title);
        expect(title.closest('a,button')).toBeNull();

        const action = screen.getByRole('button', { name: 'Mark as read' });
        await user.click(action);

        await waitFor(() => expect(readRequests).toBe(1));
        expect(screen.getByRole('button', { name: 'Mark as unread' })).toBeEnabled();
        expect(screen.getByRole('status', { name: 'Unread count' })).toHaveTextContent('0');
    });

    it('allows only one pending request and supports the symmetric read-to-unread action', async () => {
        let releaseRead!: () => void;
        const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
        server.use(
            http.post('*/api/v1/notifications/202/read', async () => {
                readRequests += 1;
                await readGate;
                return HttpResponse.json({ unread_count: 0 });
            }),
        );
        render(<MemoryRouter><BellHarness /></MemoryRouter>);
        const user = await openBell();
        const readAction = screen.getByRole('button', { name: 'Mark as read' });

        await user.click(readAction);
        await waitFor(() => expect(readRequests).toBe(1));
        expect(readAction).toBeEnabled();
        expect(readAction).toHaveAttribute('aria-disabled', 'true');
        expect(readAction).toHaveAttribute('aria-busy', 'true');
        expect(readAction).toHaveFocus();
        const markAll = screen.getByRole('button', { name: 'Mark all as read' });
        expect(markAll).toBeEnabled();
        expect(markAll).toHaveAttribute('aria-disabled', 'true');
        expect(markAll).toHaveAttribute('aria-busy', 'false');
        fireEvent.click(readAction);
        fireEvent.click(markAll);
        expect(readRequests).toBe(1);
        expect(markAllRequests).toBe(0);
        releaseRead();

        const unreadAction = await screen.findByRole('button', { name: 'Mark as unread' });
        await user.click(unreadAction);
        await waitFor(() => expect(unreadRequests).toBe(1));
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
        expect(screen.getByRole('status', { name: 'Unread count' })).toHaveTextContent('1');
    });

    it('preserves the item and count on failure and renders one adjacent local alert', async () => {
        server.use(
            http.post('*/api/v1/notifications/202/read', () => {
                readRequests += 1;
                return HttpResponse.json({ detail: 'failed' }, { status: 500 });
            }),
        );
        render(<MemoryRouter><BellHarness /></MemoryRouter>);
        const user = await openBell();
        const action = screen.getByRole('button', { name: 'Mark as read' });

        await user.click(action);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Could not update this notification. Try again.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(action).toHaveAttribute('aria-describedby', alert.id);
        expect(action).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
        expect(screen.getByRole('status', { name: 'Unread count' })).toHaveTextContent('1');

        server.use(http.post('*/api/v1/notifications/read-all', () => HttpResponse.json({}, { status: 500 })));
        await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark all notifications as read. Try again.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('keeps mark-all state unchanged on failure and reports one adjacent alert', async () => {
        server.use(
            http.post('*/api/v1/notifications/read-all', () => {
                markAllRequests += 1;
                return HttpResponse.json({ detail: 'failed' }, { status: 500 });
            }),
        );
        render(<MemoryRouter><BellHarness /></MemoryRouter>);
        const user = await openBell();
        const markAll = screen.getByRole('button', { name: 'Mark all as read' });

        await user.click(markAll);

        const alert = await screen.findByRole('alert');
        expect(markAllRequests).toBe(1);
        expect(alert).toHaveTextContent('Could not mark all notifications as read. Try again.');
        expect(markAll).toHaveAttribute('aria-describedby', alert.id);
        expect(markAll).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
        expect(screen.getByRole('status', { name: 'Unread count' })).toHaveTextContent('1');
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
        render(<MemoryRouter><BellHarness /></MemoryRouter>);
        const user = await openBell();
        const markAll = screen.getByRole('button', { name: 'Mark all as read' });

        await user.click(markAll);
        await waitFor(() => expect(markAllRequests).toBe(1));
        expect(markAll).toBeEnabled();
        expect(markAll).toHaveAttribute('aria-disabled', 'true');
        expect(markAll).toHaveAttribute('aria-busy', 'true');
        expect(markAll).toHaveFocus();
        const rowAction = screen.getByRole('button', { name: 'Mark as read' });
        expect(rowAction).toBeEnabled();
        expect(rowAction).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(markAll);
        fireEvent.click(rowAction);
        expect(markAllRequests).toBe(1);
        expect(readRequests).toBe(0);
        expect(screen.getByRole('status', { name: 'Unread count' })).toHaveTextContent('1');
        releaseMarkAll();

        expect(await screen.findByRole('button', { name: 'Mark as unread' })).toBeEnabled();
        expect(screen.getByRole('status', { name: 'Unread count' })).toHaveTextContent('0');
    });

    it('localizes read, unread, and mark-all actions and failures in Czech', async () => {
        await i18n.changeLanguage('cs');
        server.use(http.post('*/api/v1/notifications/202/read', () => HttpResponse.json({}, { status: 500 })));
        render(<MemoryRouter><BellHarness /></MemoryRouter>);
        const user = await openBell();

        await user.click(screen.getByRole('button', { name: 'Označit jako přečtené' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Oznámení se nepodařilo aktualizovat. Zkuste to znovu.');

        server.use(http.post('*/api/v1/notifications/202/read', () => HttpResponse.json({ unread_count: 0 })));
        await user.click(screen.getByRole('button', { name: 'Označit jako přečtené' }));
        const markUnread = await screen.findByRole('button', { name: 'Označit jako nepřečtené' });

        server.use(http.post('*/api/v1/notifications/202/unread', () => HttpResponse.json({}, { status: 500 })));
        await user.click(markUnread);
        expect(await screen.findByRole('alert')).toHaveTextContent('Oznámení se nepodařilo aktualizovat. Zkuste to znovu.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);

        server.use(http.post('*/api/v1/notifications/202/unread', () => HttpResponse.json({ unread_count: 1 })));
        await user.click(screen.getByRole('button', { name: 'Označit jako nepřečtené' }));
        await screen.findByRole('button', { name: 'Označit jako přečtené' });

        server.use(http.post('*/api/v1/notifications/read-all', () => HttpResponse.json({}, { status: 500 })));
        await user.click(screen.getByRole('button', { name: 'Označit vše jako přečtené' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Oznámení se nepodařilo označit jako přečtená. Zkuste to znovu.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
});
