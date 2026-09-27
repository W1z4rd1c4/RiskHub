import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteScope } from '@/App';
import { UserNewPage } from '@/pages/UserNewPage';
import { applyAuthenticatedSession } from '@/services/session';
import { __resetSessionStoreForTests } from '@/services/session/store';
import { clearAuthConfigCache } from '@/services/authConfig';
import { server } from '@test/mocks/server';
import { mockAuthUser } from '@test/mocks/handlers';

const config = {
    auth_mode: 'password', password_login_enabled: true, demo_login_enabled: false,
    local_mfa_policy: 'optional',
    identity: { mode: 'native', external_directory: 'disabled', local_enrollment_enabled: true,
        password_reset_enabled: true, factor_management_enabled: true, recovery_method: 'governed_local' },
    sso: { enabled: false, provider: 'entra', scopes: [] },
};
function renderCreate(canInvite: boolean) {
    applyAuthenticatedSession({ access_token: 'native-admin-component-token', token_type: 'bearer', user: {
        ...mockAuthUser, role: canInvite ? 'admin' : 'cro', access_scope: 'global',
        me_capabilities: { ...mockAuthUser.me_capabilities, identity: {
            can_invite_users: canInvite, can_manage_own_credentials: true,
            can_import_directory_users: false, can_check_directory_users: false,
        } },
    } });
    server.use(
        http.get('*/api/v1/auth/config', () => HttpResponse.json(config)),
        http.get('*/api/v1/users/directory', () => HttpResponse.json({ items: [], total: 0, skip: 0, limit: 1,
            available_roles: [], capabilities: { can_read_directory: true, can_view_access_details: true,
                can_use_role_facets: true, can_create_local_user: false, can_import_directory_user: false } })),
        http.get('*/api/v1/access/roles', () => HttpResponse.json([
            { id: 3, name: 'employee', display_name: 'Employee', description: null, permissions: [] },
        ])),
        http.get('*/api/v1/departments', () => HttpResponse.json([])),
    );
    return render(<AuthProvider><RouterProvider router={createMemoryRouter([{ path: '/users/new', element: <RouteScope><UserNewPage /></RouteScope> }], { initialEntries: ['/users/new'] })} /></AuthProvider>);
}

describe('native account creation', () => {
    afterEach(() => { clearAuthConfigCache(); __resetSessionStoreForTests(); });

    it('invites without an admin-chosen password and preserves creation when delivery fails', async () => {
        const bodies: unknown[] = [];
        server.use(http.post('*/api/v1/users/invitations', async ({ request }) => {
            bodies.push(await request.json());
            return HttpResponse.json({ user_id: 42, enrollment_state: 'invited', delivery_status: 'failed' }, { status: 202 });
        }));
        renderCreate(true);
        const user = userEvent.setup();
        await user.type(await screen.findByLabelText(/full name/i), 'Invited colleague');
        await user.type(screen.getByLabelText(/^email/i), 'colleague@example.test');
        expect(document.querySelector('input[type="password"]')).toBeNull();
        await user.click(screen.getByRole('button', { name: /create account/i }));
        await screen.findByText(/account created/i);
        await screen.findByText(/delivery failed/i);
        expect(bodies).toHaveLength(1);
        expect(bodies[0]).toMatchObject({ name: 'Invited colleague', email: 'colleague@example.test' });
        expect(bodies[0]).not.toHaveProperty('password');
        expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    });

    it('does not grant native invitation actions to a CRO without the backend capability', async () => {
        renderCreate(false);
        await screen.findByText(/access denied/i);
        expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
        expect(document.querySelector('input[type="password"]')).toBeNull();
    });
    it('cancels manager search A when B becomes the latest normalized query', async () => {
        let completeA: (() => void) | undefined;
        const waitA = new Promise<void>((resolve) => { completeA = resolve; });
        let signalA: AbortSignal | undefined;
        server.use(http.get('*/api/v1/users/lookup', async ({ request }) => {
            const query = new URL(request.url).searchParams.get('q');
            if (query === 'a') {
                signalA = request.signal;
                await waitA;
                return HttpResponse.json([{ id: 70, name: 'Stale manager A', email: 'a@example.test' }]);
            }
            return HttpResponse.json(query === 'b' ? [{ id: 71, name: 'Current manager B', email: 'b@example.test' }] : []);
        }));
        renderCreate(true);
        const user = userEvent.setup();
        const search = await screen.findByLabelText(/search managers/i);
        await user.type(search, 'a');
        await waitFor(() => expect(signalA).toBeDefined());
        await user.clear(search);
        await user.type(search, 'b');
        await screen.findByRole('option', { name: /Current manager B/ });
        await act(async () => completeA?.());
        expect(signalA?.aborted).toBe(true);
        expect(screen.queryByRole('option', { name: /Stale manager A/ })).not.toBeInTheDocument();
    });

});
