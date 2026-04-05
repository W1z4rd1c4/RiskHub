import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ProtectedRoute } from '@/App';
import { AuthProvider } from '@/contexts/AuthContext';
import { clearAuthConfigCache } from '@/services/authConfig';
import { __resetBootstrapSessionCacheForTests, setBootstrapSession } from '@/services/bootstrapSessionCache';
import { __resetAuthSessionCoordinatorForTests, clearBootstrapSession } from '@/services/authSessionCoordinator';
import { AUTH_REQUEST_TIMEOUT_MS } from '@/services/authRequest';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { __resetSsoSessionForTests } from '@/services/ssoSession';

vi.mock('@/utils/userSettingsStorage', () => ({
    syncPreferencesFromServer: vi.fn(async () => undefined),
    clearLocalSettings: vi.fn(),
}));

function createAbortablePendingResponse(signal?: AbortSignal): Promise<Response> {
    return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
    });
}

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('ProtectedRoute bootstrap failure handling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setAccessToken('stale-token');
        clearAuthConfigCache();
        clearBootstrapSession();
        __resetBootstrapSessionCacheForTests();
        __resetAuthSessionCoordinatorForTests();
        __resetSsoSessionForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        clearAccessToken();
        clearAuthConfigCache();
        clearBootstrapSession();
        __resetBootstrapSessionCacheForTests();
        __resetAuthSessionCoordinatorForTests();
        __resetSsoSessionForTests();
    });

    it('redirects to login with a stable auth error reason when bootstrap times out', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (
                !url.endsWith('/api/v1/auth/me') &&
                !url.endsWith('/api/v1/auth/refresh') &&
                !url.endsWith('/api/v1/auth/csrf') &&
                !url.endsWith('/api/v1/auth/config')
            ) {
                throw new Error(`Unexpected fetch call: ${url}`);
            }
            return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
        });

        render(
            <AuthProvider>
                <MemoryRouter initialEntries={['/secure']}>
                    <Routes>
                        <Route
                            path="/secure"
                            element={(
                                <ProtectedRoute>
                                    <div>secret</div>
                                </ProtectedRoute>
                            )}
                        />
                        <Route path="/login" element={<LocationProbe />} />
                    </Routes>
                </MemoryRouter>
            </AuthProvider>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS + 1);
            await Promise.resolve();
        });

        expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=%2Fsecure&authError=service_unavailable');
    });

    it('keeps the protected shell in loading state while token bootstrap is still resolving', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
            const url = String(input);
            if (url.endsWith('/api/v1/auth/me')) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
            }
            if (url.endsWith('/api/v1/auth/refresh') || url.endsWith('/api/v1/auth/csrf')) {
                return createAbortablePendingResponse(init?.signal as AbortSignal | undefined);
            }
            throw new Error(`Unexpected fetch call: ${url}`);
        });

        render(
            <AuthProvider>
                <MemoryRouter initialEntries={['/secure']}>
                    <Routes>
                        <Route
                            path="/secure"
                            element={(
                                <ProtectedRoute>
                                    <div>secret</div>
                                </ProtectedRoute>
                            )}
                        />
                        <Route path="/login" element={<LocationProbe />} />
                    </Routes>
                </MemoryRouter>
            </AuthProvider>,
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.queryByTestId('location')).not.toBeInTheDocument();
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('treats a cached bootstrap session as authenticated on the next render', async () => {
        setAccessToken('fresh-token');
        setBootstrapSession({
            token: 'fresh-token',
            user: {
                id: 1,
                email: 'anna@riskhub.local',
                name: 'Anna Kowalski',
                role: 'chief_risk_officer',
                role_display_name: 'Chief Risk Officer',
                permissions: [],
                effective_permissions: [],
                access_scope: 'global',
                scope_label: 'Global',
            },
        });

        render(
            <AuthProvider>
                <MemoryRouter initialEntries={['/secure']}>
                    <Routes>
                        <Route
                            path="/secure"
                            element={(
                                <ProtectedRoute>
                                    <div>secret</div>
                                </ProtectedRoute>
                            )}
                        />
                        <Route path="/login" element={<LocationProbe />} />
                    </Routes>
                </MemoryRouter>
            </AuthProvider>,
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByText('secret')).toBeInTheDocument();
        expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    });
});
