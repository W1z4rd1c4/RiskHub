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
                <NotificationBell unreadCount={2} />
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
                                <NotificationBell unreadCount={1} />
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

    it('navigates to vendor detail routes for vendor notifications', async () => {
        listMock.mockResolvedValue({
            items: [
                {
                    id: 303,
                    type: 'approval_pending',
                    title: 'Vendor update pending',
                    message: 'A vendor approval needs attention.',
                    resource_type: 'vendor',
                    resource_id: 12,
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
                                <NotificationBell unreadCount={1} />
                                <LocationDisplay />
                            </>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('notification-bell-button'));
        expect(await screen.findByText('Vendor update pending')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Vendor update pending'));

        await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith(303));
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/vendors/12'));
    });

    it('marks generic notifications without navigating', async () => {
        listMock.mockResolvedValue({
            items: [
                {
                    id: 404,
                    type: 'kri_due_soon',
                    title: 'Generic reminder',
                    message: 'A generic reminder has no linked resource.',
                    resource_type: null,
                    resource_id: null,
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
                                <NotificationBell unreadCount={1} />
                                <LocationDisplay />
                            </>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('notification-bell-button'));
        expect(await screen.findByText('Generic reminder')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Generic reminder'));

        await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith(404));
        expect(screen.getByTestId('location')).toHaveTextContent('/');
    });

    it('marks unsupported linked notifications without navigating', async () => {
        listMock.mockResolvedValue({
            items: [
                {
                    id: 505,
                    type: 'approval_pending',
                    title: 'Unsupported resource',
                    message: 'The backend returned a non-navigable resource type.',
                    resource_type: 'external_case',
                    resource_id: 42,
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
                                <NotificationBell unreadCount={1} />
                                <LocationDisplay />
                            </>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('notification-bell-button'));
        expect(await screen.findByText('Unsupported resource')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Unsupported resource'));

        await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith(505));
        expect(screen.getByTestId('location')).toHaveTextContent('/');
    });
});
