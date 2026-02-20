import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { server } from '@test/mocks/server';
import LoginPage from '@/pages/LoginPage';

function renderWithQuery(ui: React.ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/login']}>
                {ui}
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('LoginPage auth modes', () => {
    it('renders Microsoft login only in microsoft_sso mode', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'microsoft_sso',
                    demo_login_enabled: false,
                    password_login_enabled: false,
                    sso: {
                        enabled: true,
                        provider: 'entra',
                        tenant_id: 'tenant',
                        client_id: 'client',
                        authority: 'https://login.microsoftonline.com/tenant',
                        scopes: ['openid', 'profile', 'email'],
                    },
                    sso_error: null,
                });
            }),
        );

        renderWithQuery(<LoginPage />);

        await screen.findByRole('button', { name: /continue with microsoft/i });
        expect(screen.queryByRole('button', { name: /system admin/i })).not.toBeInTheDocument();
    });

    it('keeps demo account picker in hybrid_dev mode', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'hybrid_dev',
                    demo_login_enabled: true,
                    password_login_enabled: true,
                    sso: {
                        enabled: false,
                        provider: 'entra',
                        tenant_id: null,
                        client_id: null,
                        authority: null,
                        scopes: ['openid', 'profile', 'email'],
                    },
                    sso_error: null,
                });
            }),
        );

        renderWithQuery(<LoginPage />);

        await screen.findByRole('button', { name: /system admin/i });
    });

    it('submits demo login using email payload', async () => {
        let capturedBody: unknown = null;
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'hybrid_dev',
                    demo_login_enabled: true,
                    password_login_enabled: true,
                    sso: {
                        enabled: false,
                        provider: 'entra',
                        tenant_id: null,
                        client_id: null,
                        authority: null,
                        scopes: ['openid', 'profile', 'email'],
                    },
                    sso_error: null,
                });
            }),
            http.post('*/api/v1/auth/demo-login', async ({ request }) => {
                capturedBody = await request.json();
                return HttpResponse.json({ detail: 'forced test failure' }, { status: 400 });
            }),
        );

        const user = userEvent.setup();
        renderWithQuery(<LoginPage />);
        const button = await screen.findByRole('button', { name: /system admin/i });

        await user.click(button);

        await waitFor(() => {
            expect(capturedBody).toEqual({ email: 'admin@riskhub.local' });
        });
    });
});
