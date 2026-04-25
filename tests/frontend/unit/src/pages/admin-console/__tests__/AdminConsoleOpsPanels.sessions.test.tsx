import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';

import { ApiClientError } from '@/services/apiClient';

const getActiveSessionsMock = vi.fn();
const revokeSessionMock = vi.fn();
const checkAllDirectoryUsersMock = vi.fn();
const invalidateQueriesMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/adminApi', () => ({
    adminApi: {
        getActiveSessions: (...args: unknown[]) => getActiveSessionsMock(...args),
        revokeSession: (...args: unknown[]) => revokeSessionMock(...args),
        checkAllDirectoryUsers: (...args: unknown[]) => checkAllDirectoryUsersMock(...args),
    },
}));

import { SessionsPanel } from '@/pages/admin-console/sections/AdminConsoleOpsPanels';

function createWrapper() {
    const queryClient = createTestQueryClient();
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = ((...args: Parameters<typeof queryClient.invalidateQueries>) => {
        invalidateQueriesMock(...args);
        return originalInvalidate(...args);
    }) as typeof queryClient.invalidateQueries;

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('SessionsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getActiveSessionsMock.mockResolvedValue([
            {
                user_id: 7,
                user_name: 'Session User',
                user_email: 'session.user@example.test',
                role: 'Employee',
                department: null,
                last_activity: '2026-04-25T10:00:00Z',
                last_login: '2026-04-25T09:30:00Z',
                active_sessions: 1,
                is_active: true,
            },
        ]);
        checkAllDirectoryUsersMock.mockResolvedValue({
            checked: 3,
            deprovisioned: 1,
            active: 2,
            errors: 0,
            skipped: 0,
            results: [],
        });
    });

    it('shows user names and emails without raw user id fallback', async () => {
        render(<SessionsPanel />, { wrapper: createWrapper() });

        expect(await screen.findByText('Session User')).toBeInTheDocument();
        expect(screen.getByText('session.user@example.test')).toBeInTheDocument();
        expect(screen.queryByText('7')).not.toBeInTheDocument();
    });

    it('refreshes sessions and shows the API error when revoke fails', async () => {
        revokeSessionMock.mockRejectedValueOnce(new ApiClientError({
            status: 400,
            code: 'SELF_REVOKE_BLOCKED',
            messageKey: 'errorKeys.request_failed',
            rawMessage: 'Cannot revoke your own session',
        }));

        render(<SessionsPanel />, { wrapper: createWrapper() });

        await screen.findByText('Session User');
        fireEvent.click(screen.getByRole('button', { name: 'sessions.revoke' }));
        const revokeButtons = screen.getAllByRole('button', { name: 'sessions.revoke' });
        fireEvent.click(revokeButtons[revokeButtons.length - 1]);

        expect(await screen.findByText('Cannot revoke your own session')).toBeInTheDocument();
        await waitFor(() => {
            expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['adminSessions'] });
        });
    });

    it('runs directory check-all, shows the summary, and refreshes sessions', async () => {
        render(<SessionsPanel />, { wrapper: createWrapper() });

        await screen.findByText('Session User');
        fireEvent.click(screen.getByRole('button', { name: 'users.check_directory' }));

        await waitFor(() => {
            expect(checkAllDirectoryUsersMock).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByText('users.directory_check_all_success')).toBeInTheDocument();
        await waitFor(() => {
            expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['adminSessions'] });
        });
    });

    it('shows a directory check failure message when check-all fails', async () => {
        checkAllDirectoryUsersMock.mockRejectedValueOnce(new Error('directory unavailable'));

        render(<SessionsPanel />, { wrapper: createWrapper() });

        await screen.findByText('Session User');
        fireEvent.click(screen.getByRole('button', { name: 'users.check_directory' }));

        expect(await screen.findByText('users.directory_check_failed')).toBeInTheDocument();
    });
});
