import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteScope } from '@/App';
import { StrictMode, useState } from 'react';
import { NativeFactor } from '@/pages/native/NativeFactor';
import { NativeFrame } from '@/pages/native/NativeFrame';
import { preferencesApi } from '@/services/preferencesApi';
import { syncPreferencesFromServer } from '@/utils/userSettingsStorage';
import type { NativeErrorKind } from '@/services/nativeAuthApi';
import NativePublicPage from '@/pages/native/NativePublicPage';
import NativeSecurityPage from '@/pages/native/NativeSecurityPage';
import { mockAuthUser } from '@test/mocks/handlers';
import { applyAuthenticatedSession, clearAuthenticatedSession } from '@/services/session';
import type { AuthUser, TokenResponse } from '@/services/authApi';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { server } from '@test/mocks/server';
import i18n from '@/i18n';
import LoginPage from '@/pages/LoginPage';
import { clearAuthConfigCache } from '@/services/authConfig';
import { __resetSessionStoreForTests, getSessionSnapshot } from '@/services/session/store';

const nativeConfig = {
    auth_mode: 'password', demo_login_enabled: false, password_login_enabled: true,
    local_mfa_policy: 'required', strict_capabilities: true,
    identity: {
        mode: 'native', external_directory: 'disabled', local_enrollment_enabled: true,
        password_reset_enabled: true, factor_management_enabled: true, recovery_method: 'governed_local',
    },
    sso: { enabled: false, provider: 'entra', scopes: [] },
};

const finalSession: TokenResponse = {
    access_token: 'ordinary-completed-token', token_type: 'bearer',
    user: { ...mockAuthUser, access_scope: 'global' },
};
function signedIn() {
    const identity = { can_manage_own_credentials: true, can_invite_users: false, can_check_directory_users: false, can_import_directory_users: false };
    applyAuthenticatedSession({ ...finalSession, user: {
        ...finalSession.user,
        me_capabilities: { identity } as AuthUser['me_capabilities'],
    } });
}
function renderFlow(path: string, security = false) {
    return render(<StrictMode><I18nextProvider i18n={i18n}><AuthProvider><MemoryRouter initialEntries={[path]}><RouteScope>
        <Routes><Route path={decodeURIComponent(path)} element={security ? <NativeSecurityPage /> : <NativePublicPage />} />
            <Route path="/login" element={<div>Normal login</div>} /></Routes>
    </RouteScope></MemoryRouter></AuthProvider></I18nextProvider></StrictMode>);
}
async function fillLogin() {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email/i), 'user@example.test');
    await user.type(screen.getByLabelText(/^password/i), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    return user;
}
function renderNative() {
    return render(
        <I18nextProvider i18n={i18n}>
            <MemoryRouter initialEntries={['/login']}>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<div>Protected workspace</div>} />
                </Routes>
            </MemoryRouter>
        </I18nextProvider>,
    );
}

describe('Native login authority', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        window.history.replaceState(null, '', '/');
        clearAuthConfigCache();
        __resetSessionStoreForTests();
        await i18n.changeLanguage('en');
    });

    it('keeps a password challenge anonymous while factor verification is pending', async () => {
        let finishFactor!: () => void;
        let factorRequested = false;
        const pendingFactor = new Promise<void>((resolve) => { finishFactor = resolve; });
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json(nativeConfig)),
            http.post('*/api/v1/auth/login', () => HttpResponse.json({
                status: 'mfa_required', challenge: 'partial-credential', expires_in: 300,
            }, { status: 202 })),
            http.post('*/api/v1/auth/local/mfa/verify', async () => {
                factorRequested = true;
                await pendingFactor;
                return HttpResponse.json({ detail: 'invalid_proof' }, { status: 401 });
            }),
        );
        renderNative();
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/^email/i), 'user@example.test');
        await user.type(screen.getByLabelText(/^password/i), 'correct horse battery staple');
        await user.click(screen.getByRole('button', { name: /^sign in$/i }));
        await user.type(await screen.findByLabelText(/authentication code/i), '123456');
        expect(getSessionSnapshot().user).toBeNull();
        expect(getSessionSnapshot().token).toBeNull();
        expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /^verify$/i }));
        await waitFor(() => expect(factorRequested).toBe(true));
        expect(getSessionSnapshot().user).toBeNull();
        expect(getSessionSnapshot().token).toBeNull();
        expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument();
        await act(async () => finishFactor());
    });


    it('accepts a completed password-only session without requesting a factor', async () => {
        let factors = 0;
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json({ ...nativeConfig, local_mfa_policy: 'optional' })),
            http.post('*/api/v1/auth/login', () => HttpResponse.json(finalSession)),
            http.post('*/api/v1/auth/local/mfa/verify', () => { factors += 1; return HttpResponse.json({}); }),
        );
        renderNative(); await fillLogin();
        await screen.findByText('Protected workspace');
        expect(getSessionSnapshot().user?.id).toBe(finalSession.user.id);
        expect(factors).toBe(0);
    });

    it('discards a late completed verification after cancellation', async () => {
        let finish!: () => void;
        let requested = false;
        const pending = new Promise<void>((resolve) => { finish = resolve; });
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json(nativeConfig)),
            http.post('*/api/v1/auth/login', () => HttpResponse.json({ status: 'mfa_required', challenge: 'partial', expires_in: 300 }, { status: 202 })),
            http.post('*/api/v1/auth/local/mfa/verify', async () => { requested = true; await pending; return HttpResponse.json(finalSession); }),
        );
        renderNative(); const user = await fillLogin();
        await user.type(await screen.findByLabelText(/authentication code/i), '123456');
        await user.click(screen.getByRole('button', { name: /^verify$/i }));
        await waitFor(() => expect(requested).toBe(true));
        await user.click(screen.getByRole('button', { name: /^cancel$/i }));
        await act(async () => finish());
        expect(getSessionSnapshot().token).toBeNull();
        expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^password/i)).toHaveValue('');
    });

    it.each(['/auth/local/enroll', '/auth/local/enroll/', '/AUTH/LOCAL/ENROLL', '/auth/local/%65nroll'])('captures an invitation once and explicitly redeems accepted route %s', async (path) => {
        const requests: unknown[] = [];
        window.history.replaceState(null, '', '/auth/local/enroll#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json({ ...nativeConfig, local_mfa_policy: 'optional' })),
            http.post('*/api/v1/auth/local/enrollment/start', async ({ request }) => { requests.push(await request.json()); return HttpResponse.json({ status: 'completed' }, { status: 202 }); }),
        );
        renderFlow(path);
        const password = await screen.findByLabelText(/new password/i);
        expect(window.location.hash).toBe('');
        expect(requests).toEqual([]);
        const user = userEvent.setup();
        await user.type(password, 'An invitation passphrase 123');
        await user.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText(/Your password is set/);
        expect(requests).toEqual([{ grant: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', password: 'An invitation passphrase 123' }]);
        expect(getSessionSnapshot().token).toBeNull();
        expect(JSON.stringify(localStorage)).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
        expect(JSON.stringify(sessionStorage)).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    });

    it('uses generic password-reset confirmation and never signs in', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json(nativeConfig)),
            http.post('*/api/v1/auth/local/password/reset/request', () => HttpResponse.json({ status: 'accepted' }, { status: 202 })),
        );
        renderFlow('/auth/local/reset-password');
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/^email/i), 'unknown@example.test');
        await user.click(screen.getByRole('button', { name: /send reset email/i }));
        await screen.findByText(/If this address is eligible/);
        expect(getSessionSnapshot().token).toBeNull();
    });

    it('does not replay a reset after a lost single-use response', async () => {
        signedIn();
        let calls = 0;
        window.history.replaceState(null, '', '/auth/local/reset-password#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json(nativeConfig)),
            http.post('*/api/v1/auth/local/password/reset/complete', () => { calls += 1; return HttpResponse.error(); }),
        );
        renderFlow('/auth/local/reset-password');
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/new password/i), 'A new reset passphrase 456');
        await user.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText(/The response was lost/);
        expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
        expect(calls).toBe(1);
        expect(getSessionSnapshot().token).toBeNull();
    });

    it('changes a password-only account password through recent proof and clears the session', async () => {
        signedIn();
        const bodies: Record<string, unknown>[] = [];
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json({ ...nativeConfig, local_mfa_policy: 'optional' })),
            http.get('*/api/v1/auth/local/account', () => HttpResponse.json({ mfa_enabled: false, factor_required: false, mfa_policy: 'optional' })),
            http.post('*/api/v1/auth/local/recent-auth', async ({ request }) => { bodies.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ proof: 'bound-proof', expires_in: 300 }); }),
            http.post('*/api/v1/auth/local/password/change', async ({ request }) => { bodies.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ status: 'completed' }); }),
        );
        renderFlow('/auth/local/security', true);
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/new password/i), 'A new unique passphrase 654');
        await user.type(screen.getByLabelText(/^password/i), 'old passphrase 321');
        expect(screen.queryByLabelText(/authentication code/i)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /confirm change/i }));
        await screen.findByText(/Your security change is complete/);
        expect(bodies[0]).toMatchObject({ operation: 'password_change', intended_password: 'A new unique passphrase 654', target_user_id: finalSession.user.id });
        expect(bodies[0]).not.toHaveProperty('factor');
        expect(bodies[1]).toEqual({ recent_auth_proof: 'bound-proof', password: 'A new unique passphrase 654' });
        expect(getSessionSnapshot().token).toBeNull();
        expect(getSessionSnapshot().user).toBeNull();
    });

    it.each(['/auth/local/security', '/auth/local/security/', '/AUTH/LOCAL/SECURITY', '/auth/local/%73ecurity'])('retains display-once codes after logout at accepted route %s', async (path) => {
        signedIn();
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json({ ...nativeConfig, local_mfa_policy: 'optional' })),
            http.get('*/api/v1/auth/local/account', () => HttpResponse.json({ mfa_enabled: true, factor_required: true, mfa_policy: 'optional' })),
            http.post('*/api/v1/auth/local/recent-auth', () => HttpResponse.json({ proof: 'codes-proof', expires_in: 300 })),
            http.post('*/api/v1/auth/local/recovery-codes/regenerate', () => HttpResponse.json({ status: 'enrolled', recovery_codes: ['private-code-one', 'private-code-two'] })),
        );
        renderFlow(path, true);
        const user = userEvent.setup();
        await user.selectOptions(await screen.findByLabelText(/what would you like/i), 'recovery_codes');
        await user.type(screen.getByLabelText(/^password/i), 'current password 123');
        await user.type(screen.getByLabelText(/authentication code/i), '123456');
        await user.click(screen.getByRole('button', { name: /confirm change/i }));
        await screen.findByText('private-code-one');
        expect(getSessionSnapshot().token).toBeNull();
        await user.click(screen.getByRole('button', { name: /I have saved my codes/i }));
        await screen.findByText('Normal login');
        expect(screen.queryByText('private-code-one')).not.toBeInTheDocument();
    });

    it('preserves the session and reports an unchanged password truthfully', async () => {
        signedIn();
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json({ ...nativeConfig, local_mfa_policy: 'optional' })),
            http.get('*/api/v1/auth/local/account', () => HttpResponse.json({ mfa_enabled: false, factor_required: false, mfa_policy: 'optional' })),
            http.post('*/api/v1/auth/local/recent-auth', () => HttpResponse.json({ proof: 'unchanged-proof', expires_in: 300 })),
            http.post('*/api/v1/auth/local/password/change', () => HttpResponse.json({ status: 'completed', reauthentication_required: false })),
        );
        renderFlow('/auth/local/security', true);
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/new password/i), 'same password 123');
        await user.type(screen.getByLabelText(/^password/i), 'same password 123');
        await user.click(screen.getByRole('button', { name: /confirm change/i }));
        await screen.findByText(/This is your current password/);
        expect(getSessionSnapshot().token).toBe(finalSession.access_token);
        expect(screen.queryByText(/previous sessions have ended/)).not.toBeInTheDocument();
    });

    it('keeps a native language selection when older preference hydration finishes', async () => {
        let finish!: (value: { theme: 'dark'; language: 'en' }) => void;
        const deferred = new Promise<{ theme: 'dark'; language: 'en' }>((resolve) => { finish = resolve; });
        vi.spyOn(preferencesApi, 'get').mockReturnValueOnce(deferred);
        const hydration = syncPreferencesFromServer();
        render(<I18nextProvider i18n={i18n}><NativeFrame title="Account"><p>Account</p></NativeFrame></I18nextProvider>);
        await userEvent.setup().selectOptions(screen.getByLabelText(/language/i), 'cs');
        await waitFor(() => expect(i18n.language).toBe('cs'));
        await act(async () => { finish({ theme: 'dark', language: 'en' }); await hydration; });
        expect(i18n.language).toBe('cs');
        expect(localStorage.getItem('riskhub-language')).toBe('cs');
    });

    it('clears pending security work on a different principal', async () => {
        signedIn();
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json(nativeConfig)),
            http.get('*/api/v1/auth/local/account', () => HttpResponse.json({ mfa_enabled: true, factor_required: true, mfa_policy: 'required' })),
        );
        renderFlow('/auth/local/security', true);
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/new password/i), 'secret entered before logout');
        act(() => clearAuthenticatedSession());
        expect(screen.queryByDisplayValue('secret entered before logout')).not.toBeInTheDocument();
    });

    it('refuses HTTP 202 from factor verification even if its body resembles a session', async () => {
        server.use(
            http.get('*/api/v1/auth/config', () => HttpResponse.json(nativeConfig)),
            http.post('*/api/v1/auth/login', () => HttpResponse.json({ status: 'mfa_required', challenge: 'partial', expires_in: 300 }, { status: 202 })),
            http.post('*/api/v1/auth/local/mfa/verify', () => HttpResponse.json(finalSession, { status: 202 })),
        );
        renderNative(); const user = await fillLogin();
        await user.type(await screen.findByLabelText(/authentication code/i), '123456');
        await user.click(screen.getByRole('button', { name: /^verify$/i }));
        await screen.findByText(/The response was lost/);
        expect(getSessionSnapshot().token).toBeNull();
        expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument();
    });

    it('discards the setup key and challenge when the five-minute window expires', async () => {
        function ExpiryProbe() {
            const [reason, setReason] = useState<NativeErrorKind | 'expired' | null>(null);
            if (reason) return <p>{reason}</p>;
            return <NativeFactor mode="enrollment" challenge={{ challenge: 'temporary', provisioning_uri: 'otpauth://totp/RiskHub?secret=JBSWY3DPEHPK3PXP', expires_in: 300 }}
                onDone={() => undefined} onCancel={(value) => setReason(value ?? 'invalid')} />;
        }
        vi.useFakeTimers();
        try {
            render(<I18nextProvider i18n={i18n}><ExpiryProbe /></I18nextProvider>);
            expect(screen.getByLabelText(/authenticator setup key/i)).toBeInTheDocument();
            await act(async () => { await vi.advanceTimersByTimeAsync(300_001); });
            expect(screen.getByText('expired')).toBeInTheDocument();
            expect(screen.queryByLabelText(/authenticator setup key/i)).not.toBeInTheDocument();
        } finally { vi.useRealTimers(); }
    });

});
