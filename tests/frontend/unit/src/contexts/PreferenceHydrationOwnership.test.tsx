import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider, useLanguageContext } from '@/contexts/LanguageContext';
import { PrincipalQueryBoundary } from '@/contexts/PrincipalQueryBoundary';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import i18n from '@/i18n';
import { preferencesApi, type UserPreferences } from '@/services/preferencesApi';
import {
    __resetAuthSessionCoordinatorForTests,
    __resetSessionStoreForTests,
    applyAuthenticatedSession,
    clearAuthenticatedSession,
    clearExplicitLogoutSuppressed,
} from '@/services/session';
import type { TokenResponse } from '@/services/authApi';

vi.mock('@/services/authConfig', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/authConfig')>();
    return {
        ...actual,
        getAuthConfig: vi.fn(async () => ({
            auth_mode: 'password' as const,
            demo_login_enabled: false,
            password_login_enabled: true,
            strict_capabilities: true,
            sso: { enabled: false, provider: 'entra' as const, scopes: [] },
        })),
    };
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

function session(userId: number, token: string): TokenResponse {
    return {
        access_token: token,
        token_type: 'bearer',
        user: {
            id: userId,
            email: `user-${userId}@example.test`,
            name: `User ${userId}`,
            role: 'employee',
            role_display_name: 'Employee',
            permissions: [],
            effective_permissions: [],
            access_scope: 'department',
            scope_label: 'Department',
        },
    };
}

function PreferenceProbe() {
    const { user, bootstrapStatus } = useAuth();

    return (
        <>
            <output data-testid="session">{`${user?.id ?? 'anonymous'}:${bootstrapStatus}`}</output>
            <PrincipalQueryBoundary principalId={user?.id ?? null}>
                <LanguageProvider>
                    <ThemeProvider>
                        <PreferenceValues />
                    </ThemeProvider>
                </LanguageProvider>
            </PrincipalQueryBoundary>
        </>
    );
}

function PreferenceValues() {
    const { theme } = useTheme();
    const { language } = useLanguageContext();
    return <output data-testid="preferences">{`${theme}:${language}`}</output>;
}

describe('preference hydration ownership', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        localStorage.clear();
        __resetSessionStoreForTests();
        __resetAuthSessionCoordinatorForTests();
        clearExplicitLogoutSuppressed();
        await i18n.changeLanguage('en');
    });

    it('does not let late User A hydration overwrite User B after implicit session loss', async () => {
        const userAHydration = deferred<UserPreferences>();
        const userBHydration = deferred<UserPreferences>();
        vi.spyOn(preferencesApi, 'get')
            .mockReturnValueOnce(userAHydration.promise)
            .mockReturnValueOnce(userBHydration.promise);

        render(
            <AuthProvider>
                <PreferenceProbe />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('anonymous:anonymous'));
        act(() => applyAuthenticatedSession(session(1, 'token-a')));
        await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('1:authenticated'));
        await waitFor(() => expect(preferencesApi.get).toHaveBeenCalledTimes(1));

        act(() => clearAuthenticatedSession({ clearBootstrap: true }));
        await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('anonymous:anonymous'));
        act(() => applyAuthenticatedSession(session(2, 'token-b')));
        await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('2:authenticated'));
        await waitFor(() => expect(preferencesApi.get).toHaveBeenCalledTimes(2));

        await act(async () => userBHydration.resolve({ theme: 'light', language: 'cs' }));
        await waitFor(() => expect(screen.getByTestId('preferences')).toHaveTextContent('light:cs'));
        expect(localStorage.getItem('riskhub-theme')).toBe('light');
        expect(localStorage.getItem('riskhub-language')).toBe('cs');

        await act(async () => userAHydration.resolve({ theme: 'dark', language: 'en' }));
        await Promise.resolve();

        expect(screen.getByTestId('preferences')).toHaveTextContent('light:cs');
        expect(localStorage.getItem('riskhub-theme')).toBe('light');
        expect(localStorage.getItem('riskhub-language')).toBe('cs');
    });
});
