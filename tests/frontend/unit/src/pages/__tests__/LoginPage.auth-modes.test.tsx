import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';

import { server } from '@test/mocks/server';
import { mockDemoPersonas } from '@test/mocks/handlers';
import { createTestQueryClient } from '@test/queryClient';
import i18n, {
    createDynamicLocaleBackend,
    createRetryableLocaleLoader,
    namespaces,
} from '@/i18n';
import { resources as czechResources } from '@/i18n/locales/cs';
import { resources as englishResources } from '@/i18n/locales/en';
import LoginPage from '@/pages/LoginPage';
import { clearAuthConfigCache } from '@/services/authConfig';
import { AUTH_REQUEST_TIMEOUT_MS } from '@/services/authRequest';
import { __resetSessionStoreForTests, setSessionSnapshot } from '@/services/session/store';

const logoutRedirectMock = vi.fn();

vi.mock('@/services/entraAuth', () => ({
    entraAuth: {
        logoutRedirect: (...args: unknown[]) => logoutRedirectMock(...args),
    },
}));

function renderWithQuery(
    ui: React.ReactElement,
    initialEntry = '/login',
    i18nInstance: typeof i18n = i18n,
) {
    const queryClient = createTestQueryClient();
    return render(
        <I18nextProvider i18n={i18nInstance}>
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[initialEntry]}>
                    {ui}
                </MemoryRouter>
            </QueryClientProvider>
        </I18nextProvider>
    );
}

function createAbortablePendingResponse(signal?: AbortSignal): Promise<Response> {
    return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
    });
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
}

describe('LoginPage auth modes', () => {
    afterEach(async () => {
        clearAuthConfigCache();
        __resetSessionStoreForTests();
        logoutRedirectMock.mockReset();
        vi.restoreAllMocks();
        vi.useRealTimers();
        await i18n.changeLanguage('en');
    });

    it('renders Microsoft login only in microsoft_sso mode', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'microsoft_sso',
                    demo_login_enabled: false,
                    password_login_enabled: false,
                    demo_personas: [],
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

    it('keeps the confirmed production-login language after a chunk failure and lets the user retry', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'microsoft_sso',
                    demo_login_enabled: false,
                    password_login_enabled: false,
                    demo_personas: [],
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
        localStorage.setItem('riskhub-language', 'en');
        const importCzech = vi.fn()
            .mockRejectedValueOnce(new Error('locale chunk unavailable'))
            .mockImplementationOnce(() => import('@/i18n/locales/cs'));
        const instance = i18n.createInstance();
        await instance
            .use(createDynamicLocaleBackend(createRetryableLocaleLoader({
                en: () => import('@/i18n/locales/en'),
                cs: importCzech,
            })))
            .init({
                lng: 'en',
                fallbackLng: false,
                supportedLngs: ['en', 'cs'],
                nonExplicitSupportedLngs: true,
                defaultNS: 'common',
                ns: namespaces,
                partialBundledLanguages: true,
                resources: { en: englishResources },
                react: { useSuspense: false },
            });
        const user = userEvent.setup();

        renderWithQuery(<LoginPage />, '/login', instance);
        const english = await screen.findByRole('button', { name: 'EN' });
        const czech = screen.getByRole('button', { name: 'CS' });

        await user.click(czech);
        expect(await screen.findByText(/unable to connect to server\. please try again/i)).toBeInTheDocument();
        expect(english).toHaveAttribute('aria-pressed', 'true');
        expect(czech).toHaveAttribute('aria-pressed', 'false');
        expect(instance.language).toBe('en');
        expect(localStorage.getItem('riskhub-language')).toBe('en');

        await user.click(czech);
        await waitFor(() => expect(czech).toHaveAttribute('aria-pressed', 'true'));
        expect(instance.language).toBe('cs');
        expect(localStorage.getItem('riskhub-language')).toBe('cs');
        expect(importCzech).toHaveBeenCalledTimes(2);
        expect(screen.queryByText(/unable to connect to server\. please try again/i)).not.toBeInTheDocument();
    });

    it.each([
        ['success', false],
        ['failure', true],
    ] as const)(
        'ignores stale Czech locale %s after a newer English production-login intent',
        async (_outcome, rejectCzech) => {
            server.use(
                http.get('*/api/v1/auth/config', () => {
                    return HttpResponse.json({
                        auth_mode: 'microsoft_sso',
                        demo_login_enabled: false,
                        password_login_enabled: false,
                        demo_personas: [],
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
            localStorage.setItem('riskhub-language', 'en');
            const czechActivation = deferred<void>();
            const englishActivation = deferred<void>();
            const instance = i18n.createInstance();
            await instance.init({
                lng: 'en',
                fallbackLng: false,
                supportedLngs: ['en', 'cs'],
                nonExplicitSupportedLngs: true,
                defaultNS: 'common',
                ns: namespaces,
                resources: {
                    en: englishResources,
                    cs: czechResources,
                },
                react: { useSuspense: false },
            });
            const loadLanguages = vi.spyOn(instance, 'loadLanguages');
            loadLanguages.mockImplementation(((language: string, callback?: (error?: unknown) => void) => {
                const activation = language === 'cs' ? czechActivation : englishActivation;
                return activation.promise.then(
                    () => {
                        callback?.();
                        return instance.t;
                    },
                    (error: unknown) => {
                        callback?.(error);
                        return instance.t;
                    },
                );
            }) as typeof instance.loadLanguages);
            renderWithQuery(<LoginPage />, '/login', instance);
            const english = await screen.findByRole('button', { name: 'EN' });
            const czech = screen.getByRole('button', { name: 'CS' });

            fireEvent.click(czech);
            await waitFor(() => expect(loadLanguages).toHaveBeenCalledWith('cs', expect.any(Function)));
            localStorage.setItem('riskhub-language', 'pending-current-intent');
            fireEvent.click(english);
            await waitFor(() => expect(loadLanguages).toHaveBeenCalledWith('en', expect.any(Function)));
            await act(async () => {
                englishActivation.resolve();
                await englishActivation.promise;
            });
            await waitFor(() => expect(localStorage.getItem('riskhub-language')).toBe('en'));

            await act(async () => {
                if (rejectCzech) {
                    czechActivation.reject(new Error('stale Czech load failed'));
                    await czechActivation.promise.catch(() => undefined);
                } else {
                    czechActivation.resolve();
                    await czechActivation.promise;
                }
                await new Promise((resolve) => setTimeout(resolve, 25));
            });
            expect(english).toHaveAttribute('aria-pressed', 'true');
            expect(czech).toHaveAttribute('aria-pressed', 'false');
            expect(instance.language).toBe('en');
            expect(localStorage.getItem('riskhub-language')).toBe('en');
            expect(screen.queryByText(/unable to connect to server\. please try again/i)).not.toBeInTheDocument();
        },
    );

    it('keeps demo account picker in hybrid_dev mode', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'hybrid_dev',
                    demo_login_enabled: true,
                    password_login_enabled: true,
                    demo_personas: mockDemoPersonas,
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
        expect(screen.getByRole('button', { name: /klára černá/i })).toBeInTheDocument();
        const grid = screen.getByTestId('demo-persona-grid');
        expect(grid).toHaveClass('lg:grid-cols-5');
        expect(grid.children).toHaveLength(10);
    });

    it('submits demo login using email payload and keeps 4xx failures on the normal error path', async () => {
        let capturedBody: unknown = null;
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'hybrid_dev',
                    demo_login_enabled: true,
                    password_login_enabled: true,
                    demo_personas: mockDemoPersonas,
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
                    demo_personas: mockDemoPersonas,
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
                    demo_personas: mockDemoPersonas,
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

    it('shows a Microsoft sign-out recovery banner and retry action after incomplete SSO logout', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({
                    auth_mode: 'microsoft_sso',
                    demo_login_enabled: false,
                    password_login_enabled: false,
                    demo_personas: [],
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
        await act(async () => {
            setSessionSnapshot((previous) => ({
                ...previous,
                token: null,
                user: null,
                bootstrapStatus: 'anonymous',
                bootstrapError: null,
                logoutPending: false,
                logoutErrorKey: 'errorKeys.sso_logout_incomplete',
            }));
        });

        const user = userEvent.setup();
        renderWithQuery(<LoginPage />);

        expect(await screen.findByText(/microsoft sign-out did not complete/i)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /complete microsoft sign-out/i }));
        expect(logoutRedirectMock).toHaveBeenCalledTimes(1);
    });

    it('keeps Microsoft sign-out recovery visible when auth config fails', async () => {
        logoutRedirectMock.mockRejectedValueOnce(new Error('redirect failed'));
        server.use(
            http.get('*/api/v1/auth/config', () => {
                return HttpResponse.json({ detail: 'unavailable' }, { status: 503 });
            }),
        );
        await act(async () => {
            setSessionSnapshot((previous) => ({
                ...previous,
                token: null,
                user: null,
                bootstrapStatus: 'anonymous',
                bootstrapError: null,
                logoutPending: false,
                logoutErrorKey: 'errorKeys.sso_logout_incomplete',
            }));
        });

        const user = userEvent.setup();
        renderWithQuery(<LoginPage />);

        expect(await screen.findByText(/login unavailable/i)).toBeInTheDocument();
        expect(screen.getByText(/microsoft sign-out did not complete/i)).toBeInTheDocument();

        const recoveryButton = screen.getByRole('button', { name: /complete microsoft sign-out/i });
        await user.click(recoveryButton);

        await waitFor(() => {
            expect(logoutRedirectMock).toHaveBeenCalledTimes(1);
            expect(recoveryButton).toBeEnabled();
        });
        expect(screen.getByText(/microsoft sign-out did not complete/i)).toBeInTheDocument();
    });
});
