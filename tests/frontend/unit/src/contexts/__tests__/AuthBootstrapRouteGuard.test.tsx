import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ProtectedRoute } from '@/App';
import { AuthProvider } from '@/contexts/AuthContext';
import { clearAuthConfigCache } from '@/services/authConfig';
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
        __resetAuthSessionCoordinatorForTests();
        __resetSsoSessionForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        clearAccessToken();
        clearAuthConfigCache();
        clearBootstrapSession();
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
});
