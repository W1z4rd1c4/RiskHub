import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import NotificationsPage from '@/pages/NotificationsPage';

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

vi.mock('@/services/logger', () => ({
    logError: vi.fn(),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) =>
            values?.count !== undefined ? `${key}:${values.count}` : key,
    }),
    useFormattedDate: () => ({
        formatRelativeDate: () => 'just now',
    }),
}));

function LocationDisplay() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/notifications']}>
            <Routes>
                <Route
                    path="*"
                    element={
                        <>
                            <NotificationsPage />
                            <LocationDisplay />
                        </>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

describe('NotificationsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        markAsReadMock.mockResolvedValue({ unread_count: 0 });
        markAllAsReadMock.mockResolvedValue(undefined);
    });

    it('marks generic notifications without navigating', async () => {
        listMock.mockResolvedValue({
            items: [
                {
                    id: 601,
                    type: 'kri_due_soon',
                    title: 'Generic reminder',
                    message: 'A generic notification has no linked resource.',
                    resource_type: null,
                    resource_id: null,
                    is_read: false,
                    created_at: '2026-04-07T10:00:00Z',
                    expires_at: null,
                },
            ],
            total: 1,
            skip: 0,
            limit: 20,
            unread_count: 1,
        });

        renderPage();

        expect(await screen.findByText('Generic reminder')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Generic reminder'));

        await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith(601));
        expect(screen.getByTestId('location')).toHaveTextContent('/notifications');
    });

    it('marks unsupported linked notifications without navigating', async () => {
        listMock.mockResolvedValue({
            items: [
                {
                    id: 602,
                    type: 'approval_pending',
                    title: 'Unsupported resource',
                    message: 'The resource type is not navigable.',
                    resource_type: 'external_case',
                    resource_id: 42,
                    is_read: false,
                    created_at: '2026-04-07T10:00:00Z',
                    expires_at: null,
                },
            ],
            total: 1,
            skip: 0,
            limit: 20,
            unread_count: 1,
        });

        renderPage();

        expect(await screen.findByText('Unsupported resource')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Unsupported resource'));

        await waitFor(() => expect(markAsReadMock).toHaveBeenCalledWith(602));
        expect(screen.getByTestId('location')).toHaveTextContent('/notifications');
    });
});
