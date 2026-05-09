import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthActionsProvider } from '@/contexts/AuthActionsContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { SessionProvider } from '@/contexts/SessionContext';

function Probe({ onReady }: { onReady: (auth: ReturnType<typeof useAuth>) => void }) {
    onReady(useAuth());
    return null;
}

describe('AuthContext compatibility shim', () => {
    it('is backed by the split provider modules', () => {
        expect(SessionProvider).toBeDefined();
        expect(PreferencesProvider).toBeDefined();
        expect(AuthActionsProvider).toBeDefined();
    });

    it('keeps useAuth exposing the union surface', () => {
        let captured: ReturnType<typeof useAuth> | null = null;

        render(
            <AuthProvider>
                <Probe onReady={(auth) => {
                    captured = auth;
                }}
                />
            </AuthProvider>,
        );

        const auth = captured!;
        expect(auth).toHaveProperty('user');
        expect(auth).toHaveProperty('isLoading');
        expect(auth).toHaveProperty('bootstrapStatus');
        expect(auth).toHaveProperty('hasPermission');
        expect(auth).toHaveProperty('isAuthenticated');
        expect(auth).toHaveProperty('login');
        expect(auth).toHaveProperty('logout');
    });
});
