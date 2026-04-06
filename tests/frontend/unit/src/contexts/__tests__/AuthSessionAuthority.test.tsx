import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import * as authSessionCoordinator from '@/services/authSessionCoordinator';
import { clearBootstrapSession } from '@/services/authSessionCoordinator';
import { __resetSessionStoreForTests } from '@/services/sessionStore';

vi.mock('@/utils/userSettingsStorage', () => ({
    syncPreferencesFromServer: vi.fn(async () => undefined),
    clearLocalSettings: vi.fn(),
}));

function PermissionProbe() {
    const { hasPermission, isLoading } = useAuth();

    return (
        <div>
            <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
            <div data-testid="permission">{hasPermission('users', 'read') ? 'yes' : 'no'}</div>
        </div>
    );
}

describe('AuthContext session authority', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        __resetSessionStoreForTests();
        clearAccessToken();
        clearBootstrapSession();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        __resetSessionStoreForTests();
        clearAccessToken();
        clearBootstrapSession();
    });

    it('does not grant permissions from a stale token without a canonical user', async () => {
        setAccessToken('stale-token');
        clearBootstrapSession();
        vi.spyOn(authSessionCoordinator, 'bootstrapAuthSession').mockImplementation(
            () => new Promise(() => undefined),
        );

        render(
            <AuthProvider>
                <PermissionProbe />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('loading'));
        expect(screen.getByTestId('permission')).toHaveTextContent('no');
    });
});
