import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';
import LoginPage from '@/pages/LoginPage';
import type { TokenResponse } from '@/services/authApi';
import { applyAuthenticatedSession } from '@/services/session';
import { mockAuthUser } from '@test/mocks/handlers';
import { server } from '@test/mocks/server';

const session: TokenResponse = {
    access_token: 'return-to-test-token', token_type: 'bearer', user: mockAuthUser,
};
const nativeConfig = {
    auth_mode: 'password', demo_login_enabled: false, password_login_enabled: true,
    local_mfa_policy: 'optional', strict_capabilities: true,
    identity: {
        mode: 'native', external_directory: 'disabled', local_enrollment_enabled: true,
        password_reset_enabled: true, factor_management_enabled: true, recovery_method: 'governed_local',
    },
    sso: { enabled: false, provider: 'entra', scopes: [] },
};
const routers: ReturnType<typeof createMemoryRouter>[] = [];

function renderLogin(query: string) {
    const router = createMemoryRouter([
        { path: '/login', element: <LoginPage /> },
        { path: '*', id: 'workspace', element: <div>Internal workspace</div> },
    ], { initialEntries: [`/login?returnTo=${query}`] });
    routers.push(router);
    render(<I18nextProvider i18n={i18n}><RouterProvider router={router} /></I18nextProvider>);
    return router;
}

async function expectDestination(router: ReturnType<typeof createMemoryRouter>, target: string) {
    await screen.findByText('Internal workspace');
    await waitFor(() => {
        const { pathname, search, hash } = router.state.location;
        expect(`${pathname}${search}${hash}`).toBe(target);
    });
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.matches[0].route.id).toBe('workspace');
    expect(router.state.errors).toBeNull();
}

describe('LoginPage returnTo navigation ownership', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        server.use(http.get('*/api/v1/auth/config', () => HttpResponse.json(nativeConfig)));
    });
    afterEach(() => {
        routers.splice(0).forEach((router) => router.dispose());
    });

    it.each([
        ['raw tab', '/\t/evil.example', '/'],
        ['once-encoded tab', '/%09/evil.example', '/'],
        ['twice-encoded tab', '/%2509/evil.example', '/%09/evil.example'],
        ['encoded internal query', '%2Frisks%3Fq%3Da%252Bb%26next%3D%252Fcontrols%23details',
            '/risks?q=a%2Bb&next=%2Fcontrols#details'],
    ])('safely redirects an existing session through the real query parser: %s', async (_label, query, expected) => {
        applyAuthenticatedSession(session);
        const router = renderLogin(query);
        await expectDestination(router, expected);
    });

    it.each([
        ['/assets/161?source=login%2Bquery#details', '/assets/161?source=login%2Bquery#details'],
        ['/\t/evil.example', '/'],
    ])('the completed login owns and sanitizes the server redirect: %j', async (serverTarget, expected) => {
        server.use(http.post('*/api/v1/auth/login', () => HttpResponse.json({
            ...session, post_login_redirect_to: serverTarget,
        })));
        const router = renderLogin('%2Frisks%3Fq%3Dfallback');
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/^email/i), 'user@example.test');
        await user.type(screen.getByLabelText(/^password/i), 'return-to-test-password');
        await user.click(screen.getByRole('button', { name: /^sign in$/i }));
        await expectDestination(router, expected);
    });
});
