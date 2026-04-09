import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const listMock = vi.fn();
const markAsReadMock = vi.fn();
const markAllAsReadMock = vi.fn();

vi.mock('@/services/notificationsApi', () => ({
    notificationsApi: {
        list: (...args: unknown[]) => listMock(...args),
        markAsRead: (...args: unknown[]) => markAsReadMock(...args),
        markAllAsRead: (...args: unknown[]) => markAllAsReadMock(...args),
    },
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
    useFormattedDate: () => ({
        formatRelativeDate: () => 'just now',
    }),
}));

function LocationDisplay() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
}

describe('NotificationBell', () => {
    beforeEach(() => {
        vi.clearAllMocks();

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
                <NotificationBell initialUnreadCount={2} />
            </MemoryRouter>
        );

        expect(screen.getByText('2')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('notification-bell-button'));

        const panel = await screen.findByTestId('notification-dropdown-panel');
        expect(panel).toHaveClass('bg-popover');
        expect(panel).toHaveClass('border-border');
        expect(panel).not.toHaveClass('glass');
        expect(screen.getByTestId('notification-view-all-button')).toBeInTheDocument();

        await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    });

    it('navigates to issue detail routes for issue notifications', async () => {
        listMock.mockResolvedValue({
            items: [
                {
                    id: 202,
                    type: 'issue_due_soon',
                    title: 'Issue due soon',
                    message: 'Issue remediation deadline is approaching.',
                    resource_type: 'issue',
                    resource_id: 77,
                    is_read: false,
                    created_at: '2026-04-07T10:00:00Z',
                    expires_at: null,
                },
            ],
            total: 1,
            skip: 0,
            limit: 10,
            unread_count: 1,
        });

        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route
                        path="*"
                        element={
                            <>
                                <NotificationBell initialUnreadCount={1} />
                                <LocationDisplay />
                            </>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('notification-bell-button'));
        expect(await screen.findByText('Issue due soon')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Issue due soon'));

        await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith(202));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/issues/77'));
    });
});
