import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from '../NotificationBell';

const getUnreadCountMock = vi.fn();
const listMock = vi.fn();
const markAsReadMock = vi.fn();
const markAllAsReadMock = vi.fn();

vi.mock('@/services/notificationsApi', () => ({
    notificationsApi: {
        getUnreadCount: () => getUnreadCountMock(),
        list: (...args: unknown[]) => listMock(...args),
        markAsRead: (...args: unknown[]) => markAsReadMock(...args),
        markAllAsRead: (...args: unknown[]) => markAllAsReadMock(...args),
    },
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
    useFormattedDate: () => ({
        formatRelativeDate: () => 'just now',
    }),
}));

describe('NotificationBell', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        getUnreadCountMock.mockResolvedValue({ count: 2 });
        listMock.mockResolvedValue({
            items: [
                {
                    id: 101,
                    type: 'approval_pending',
                    title: 'Questionnaire submitted',
                    message: 'A risk assessment questionnaire was submitted.',
                    is_read: false,
                    created_at: '2026-02-16T12:00:00Z',
                },
            ],
            total: 1,
            skip: 0,
            limit: 10,
            unread_count: 1,
        });
        markAsReadMock.mockResolvedValue({ unread_count: 0 });
        markAllAsReadMock.mockResolvedValue(undefined);
    });

    it('renders an opaque dropdown panel when opened', async () => {
        render(
            <MemoryRouter>
                <NotificationBell />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('notification-bell-button'));

        const panel = await screen.findByTestId('notification-dropdown-panel');
        expect(panel).toHaveClass('bg-popover');
        expect(panel).toHaveClass('border-border');
        expect(panel).not.toHaveClass('glass');
        expect(screen.getByTestId('notification-view-all-button')).toBeInTheDocument();

        await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    });
});
