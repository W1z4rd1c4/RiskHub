import type { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const AUTH_READY_TEST_ID = 'test-auth-bootstrap-ready';

function AuthReadyProbe() {
    const { isLoading, isPreferencesHydrated } = useAuth();
    const isReady = !isLoading && isPreferencesHydrated;

    return <div data-testid={AUTH_READY_TEST_ID} data-ready={isReady ? 'true' : 'false'} hidden />;
}

export function AuthProviderWithReady({ children }: { children: ReactNode }) {
    return (
        <AuthProvider>
            <AuthReadyProbe />
            {children}
        </AuthProvider>
    );
}

export async function waitForAuthBootstrapReady(): Promise<void> {
    await waitFor(() => {
        const probe = screen.getByTestId(AUTH_READY_TEST_ID);
        if (probe.getAttribute('data-ready') !== 'true') {
            throw new Error('Auth bootstrap has not completed yet.');
        }
    });
}
