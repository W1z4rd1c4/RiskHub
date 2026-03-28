import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import LoginPage from '@/pages/LoginPage';
import { clearAuthConfigCache } from '@/services/authConfig';
import { AUTH_REQUEST_TIMEOUT_MS } from '@/services/authRequest';

function renderWithQuery(ui: React.ReactElement, initialEntry = '/login') {
    const queryClient = createTestQueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialEntry]}>
                {ui}
            </MemoryRouter>
        </QueryClientProvider>
    );
}

function createAbortablePendingResponse(signal?: AbortSignal): Promise<Response> {
    return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
    });
}

describe('LoginPage auth modes', () => {
    afterEach(() => {
        clearAuthConfigCache();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

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

        await screen.findByRole('button', { name: /microsoft/i });
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

    it('submits demo login using email payload and keeps 4xx failures on the normal error path', async () => {
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
        expect(await screen.findByText(/demo login failed/i)).toBeInTheDocument();
        expect(screen.queryByText(/login unavailable/i)).not.toBeInTheDocument();
    });

    it('replaces hanging auth-config loading with an unavailable state', async () => {
        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/config')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
        });

        renderWithQuery(<LoginPage />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS + 1);
            await Promise.resolve();
        });

        expect(screen.getByText(/login unavailable/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        fetchSpy.mockRestore();
    });

    it('replaces hanging demo login requests with an unavailable banner and clears the button spinner', async () => {
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
        const button = await screen.findByRole('button', { name: /system admin/i });

        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (!url.endsWith('/api/v1/auth/demo-login')) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
        });

        fireEvent.click(button);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS + 1);
            await Promise.resolve();
        });

        expect(screen.getByText(/authentication service/i)).toBeInTheDocument();
        expect(screen.queryByText(/demo login failed/i)).not.toBeInTheDocument();
        expect(button.querySelector('.animate-spin')).toBeNull();
        fetchSpy.mockRestore();
    });

    it('shows a session-recovery failure banner after protected-route redirect', async () => {
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

        renderWithQuery(<LoginPage />, '/login?authError=service_unavailable&returnTo=%2F');

        expect(await screen.findByText(/authentication service is unavailable/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /system admin/i })).toBeInTheDocument();
    });
});
