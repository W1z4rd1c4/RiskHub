import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NativeUserLifecyclePanel } from '@/pages/users/NativeUserLifecyclePanel';
import { applyAuthenticatedSession, clearAuthenticatedSession } from '@/services/session';
import { __resetSessionStoreForTests } from '@/services/session/store';
import type { AccessUserRead } from '@/types/access';
import { server } from '@test/mocks/server';
import { mockAuthUser } from '@test/mocks/handlers';

const target: AccessUserRead = {
    id: 42, name: 'Target colleague', email: 'target@example.test', is_active: true,
    role_id: 3, role: { id: 3, name: 'employee', display_name: 'Employee', description: null },
    department_id: null, department_name: null, manager_id: null, manager_name: null,
    access_scope: 'department', scope_label: 'Department', effective_permissions: [],
    capabilities: { can_edit_identity: true, can_edit_role: true, can_edit_business_access: false,
        can_deactivate: true, can_change_active_status: true, can_break_glass_enable: false,
        can_revoke_sessions: true, can_request_password_reset: true, can_initiate_recovery: true },
};
const status = { user_id: 42, authority_version: 7, enrollment_state: 'enrolled', local_suspended: false,
    recovery_pending: false, is_active: true, delivery_status: 'sent' };
function prepare() {
    applyAuthenticatedSession({ access_token: 'native-admin-test-token', token_type: 'bearer', user: { ...mockAuthUser, role: 'admin' } });
    server.use(
        http.get('*/api/v1/users/42/local-auth/status', () => HttpResponse.json(status)),
        http.get('*/api/v1/auth/local/account', () => HttpResponse.json({ mfa_enabled: false, factor_required: false, mfa_policy: 'optional' })),
    );
}
function view(user = target) {
    prepare();
    const callbacks = { onBusy: vi.fn(), onCommitted: vi.fn(), onRefresh: vi.fn() };
    return { ...render(<NativeUserLifecyclePanel user={user} {...callbacks} />), callbacks };
}
afterEach(() => __resetSessionStoreForTests());

describe('native user lifecycle', () => {
    it('uses message delivery wording for an enrolled account with a sent reset or recovery', async () => {
        view();
        await screen.findByText('Message sent.');
        expect(screen.queryByText(/Invitation sent/)).not.toBeInTheDocument();
    });

    it('preserves a committed reset when the following status refresh fails', async () => {
        let requests = 0;
        server.use(http.post('*/api/v1/users/42/password-reset', () => {
            requests += 1;
            server.use(http.get('*/api/v1/users/42/local-auth/status', () => new HttpResponse(null, { status: 503 })));
            return HttpResponse.json({ status: 'accepted' }, { status: 202 });
        }));
        view();
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /send password reset link/i }));
        await user.type(screen.getByLabelText(/^reason/i), 'INC-206 reset request');
        await user.click(screen.getByRole('button', { name: /confirm account action/i }));
        await screen.findByText(/Password reset request accepted/);
        await screen.findByText(/Account status could not be loaded/);
        expect(requests).toBe(1);
        expect(screen.getByText(/Password reset request accepted/)).toBeInTheDocument();
    });

    it('binds recent authentication to the exact recovery target, version and proposed address', async () => {
        const recentBodies: Record<string, unknown>[] = [];
        const recoveryBodies: Record<string, unknown>[] = [];
        server.use(
            http.post('*/api/v1/auth/local/recent-auth', async ({ request }) => {
                recentBodies.push(await request.json() as Record<string, unknown>);
                return HttpResponse.json({ proof: 'display-never-proof', expires_in: 300 });
            }),
            http.post('*/api/v1/users/42/recovery', async ({ request }) => {
                recoveryBodies.push(await request.json() as Record<string, unknown>);
                return HttpResponse.json({ status: 'accepted' }, { status: 202 });
            }),
        );
        view();
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /start assisted recovery/i }));
        await waitFor(() => expect(screen.getByLabelText(/^reason/i)).toHaveFocus());
        await user.type(screen.getByLabelText(/^reason/i), 'Address lost');
        await user.type(screen.getByLabelText(/incident reference/i), 'INC-206');
        await user.type(screen.getByLabelText(/identity verification method/i), 'In-person verification by designated operator');
        await user.selectOptions(screen.getByLabelText(/recovery operation/i), 'verified_address_recovery');
        await user.type(screen.getByLabelText(/proposed recovery email/i), 'new@example.test');
        await user.type(screen.getByLabelText(/your administrator password/i), 'Test recent-auth password!');
        expect(screen.queryByLabelText(/your authenticator/i)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /confirm account action/i }));
        await screen.findByText(/Recovery request accepted/);
        expect(recentBodies).toEqual([expect.objectContaining({ target_user_id: 42, expected_token_version: 7,
            operation: 'assisted_recovery', intended_recovery_operation: 'verified_address_recovery', intended_recovery_email: 'new@example.test' })]);
        expect(recoveryBodies).toEqual([expect.objectContaining({ expected_token_version: 7, new_email: 'new@example.test',
            recent_auth_proof: 'display-never-proof', operation: 'verified_address_recovery', reason: 'Address lost', incident_reference: 'INC-206' })]);
        expect(document.body.textContent).not.toContain('display-never-proof');
        expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('Test recent-auth password!');
    });

    it('shows privileged offline escalation without a callable recovery override', async () => {
        view({ ...target, capabilities: { ...target.capabilities, can_initiate_recovery: false, recovery_offline_required: true } });
        await screen.findByText(/two-operator recovery procedure/i);
        expect(screen.queryByRole('button', { name: /start assisted recovery/i })).not.toBeInTheDocument();
    });

    it('keeps the last-admin conflict and reason available for correction', async () => {
        server.use(http.patch('*/api/v1/access/users/42', () => HttpResponse.json({ detail: 'last admin' }, { status: 409 })));
        const { rerender, callbacks } = view();
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /suspend account/i }));
        await user.type(screen.getByLabelText(/^reason/i), 'INC-206 departure');
        await user.click(screen.getByRole('button', { name: /confirm account action/i }));
        await screen.findByText(/last eligible platform administrator/);
        rerender(<NativeUserLifecyclePanel user={{ ...target, capabilities: { ...target.capabilities, can_change_active_status: false } }} {...callbacks} />);
        expect(screen.getByLabelText(/^reason/i)).toHaveValue('INC-206 departure');
        expect(screen.getByRole('button', { name: /confirm account action/i })).toBeDisabled();
        expect(callbacks.onCommitted).not.toHaveBeenCalled();
        expect(callbacks.onRefresh).toHaveBeenCalled();
    });

    it('does not send recovery after the recent-auth owner changes', async () => {
        let finish: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => { finish = resolve; });
        let requests = 0;
        server.use(
            http.post('*/api/v1/auth/local/recent-auth', async () => { await gate; return HttpResponse.json({ proof: 'stale-proof' }); }),
            http.post('*/api/v1/users/42/recovery', () => { requests += 1; return HttpResponse.json({ status: 'accepted' }, { status: 202 }); }),
        );
        const { callbacks } = view();
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: /start assisted recovery/i }));
        await user.type(screen.getByLabelText(/^reason/i), 'Lost factor');
        await user.type(screen.getByLabelText(/incident reference/i), 'INC-206');
        await user.type(screen.getByLabelText(/identity verification method/i), 'Approved in-person check');
        await user.type(screen.getByLabelText(/your administrator password/i), 'Old principal password!');
        await user.click(screen.getByRole('button', { name: /confirm account action/i }));
        clearAuthenticatedSession({ clearBootstrap: true });
        finish?.();
        await waitFor(() => expect(screen.queryByLabelText(/your administrator password/i)).not.toBeInTheDocument());
        expect(requests).toBe(0);
        expect(callbacks.onCommitted).not.toHaveBeenCalled();
    });
});
