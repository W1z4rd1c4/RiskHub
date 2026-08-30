import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { DirectoryUserImportPanel } from '@/components/users/DirectoryUserImportPanel';
import i18n from '@/i18n';
import { UsersPage } from '@/pages/UsersPage';
import { SessionsPanel } from '@/pages/admin-console/sections/AdminConsoleOpsPanels';
import { clearAuthConfigCache } from '@/services/authConfig';
import { clearBootstrapSession } from '@/services/session/coordinator';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';

const directoryUser = {
    external_id: 'oid-1',
    display_name: 'Alice Example',
    email: 'alice@example.com',
    user_principal_name: 'alice@example.com',
    department: 'Finance',
    job_title: 'Analyst',
    account_enabled: true,
    source: 'graph' as const,
};

const accessUser = {
    id: 200,
    email: 'employee.one@riskhub.test',
    name: 'Employee One',
    is_active: true,
    role_id: 2,
    role: {
        id: 2,
        name: 'employee',
        display_name: 'Employee',
        description: 'Standard employee',
    },
    department_id: 10,
    department_name: 'Operations',
    manager_id: null,
    manager_name: null,
    access_scope: 'department',
    scope_label: 'Department',
    effective_permissions: ['risks:read'],
    external_id: 'oid-employee',
    directory_sync_status: 'active',
    capabilities: {
        can_edit_identity: true,
        can_edit_business_access: true,
        can_edit_role: true,
        can_deactivate: true,
        can_change_active_status: true,
        can_break_glass_enable: true,
        can_revoke_sessions: true,
    },
};

const authUser = {
    id: 1,
    email: 'admin@riskhub.test',
    name: 'Admin User',
    role: 'admin',
    role_display_name: 'Administrator',
    permissions: ['*:*'],
    effective_permissions: ['*:*'],
    access_scope: 'global',
    scope_label: 'Global',
};

const directoryCapabilities = {
    items: [],
    available_roles: [],
    total: 0,
    skip: 0,
    limit: 1,
    capabilities: {
        can_read_directory: true,
        can_view_access_details: true,
        can_use_role_facets: true,
        can_create_local_user: true,
        can_import_directory_user: true,
    },
};

type UsersMutationState = {
    authConfigUnavailable?: boolean;
    breakGlassFails?: boolean;
    userUpdateFails?: boolean;
};

function installUsersPageHandlers(state: UsersMutationState = {}) {
    server.use(
        http.get('*/api/v1/auth/config', () => {
            if (state.authConfigUnavailable) {
                return HttpResponse.json({ detail: 'Auth configuration unavailable' }, { status: 503 });
            }
            return HttpResponse.json({
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                strict_capabilities: false,
                demo_personas: [],
                sso: {
                    enabled: false,
                    provider: 'entra',
                    tenant_id: null,
                    client_id: null,
                    authority: null,
                    scopes: ['openid', 'profile', 'email'],
                },
                sso_error: null,
            });
        }),
        http.get('*/api/v1/auth/me', () => HttpResponse.json(authUser)),
        http.get('*/api/v1/access/users', () => HttpResponse.json([accessUser])),
        http.get('*/api/v1/users/directory', () => HttpResponse.json(directoryCapabilities)),
        http.patch('*/api/v1/users/200', () => {
            if (state.userUpdateFails) {
                return HttpResponse.json({ detail: 'Status update rejected' }, { status: 500 });
            }
            return HttpResponse.json({
                id: accessUser.id,
                email: accessUser.email,
                name: accessUser.name,
                is_active: false,
                role: accessUser.role,
                department_id: accessUser.department_id,
                manager_id: accessUser.manager_id,
                manager_name: accessUser.manager_name,
                created_at: '2026-08-29T10:00:00Z',
                updated_at: '2026-08-29T10:01:00Z',
            });
        }),
        http.post('*/api/v1/admin/directory/break-glass-enable/200', () => {
            if (state.breakGlassFails) {
                return HttpResponse.json({ detail: 'Break-glass rejected' }, { status: 500 });
            }
            return HttpResponse.json({ status: 'success', user_id: 200 });
        }),
    );
}

function renderWithQueryClient(node: React.ReactNode) {
    const queryClient = createTestQueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            {node}
        </QueryClientProvider>,
    );
}

async function renderUsersPage() {
    renderWithQueryClient(
        <MemoryRouter initialEntries={['/users']}>
            <AuthProviderWithReady>
                <Routes>
                    <Route path="/users" element={<UsersPage />} />
                </Routes>
            </AuthProviderWithReady>
        </MemoryRouter>,
    );
    await waitForAuthBootstrapReady();
}

describe('UX-157 local outcomes', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    afterEach(() => {
        clearAuthConfigCache();
        clearAccessToken();
        clearBootstrapSession();
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('combines directory failures with corrective guidance in one alert without moving input focus', async () => {
        const user = userEvent.setup();
        let failure: 'provider' | 'generic' = 'provider';
        server.use(
            http.get('*/api/v1/directory/users/search', () => {
                if (failure === 'provider') {
                    return HttpResponse.json(
                        { detail: 'Directory provider unavailable' },
                        { status: 503 },
                    );
                }
                return HttpResponse.json({ detail: 'Directory search failed' }, { status: 500 });
            }),
        );

        render(<DirectoryUserImportPanel onImported={() => undefined} />);
        const search = screen.getByRole('textbox', { name: 'Search by name or email' });
        await user.type(search, 'alice');

        let alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Directory provider is not configured.');
        expect(alert).toHaveTextContent('Configure ENTRA_TENANT_ID');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(search).toHaveFocus();

        failure = 'generic';
        await user.clear(search);
        await user.type(search, 'bob');

        alert = await screen.findByRole('alert');
        await waitFor(() => {
            expect(alert).toHaveTextContent('Directory search failed. Try again.');
        });
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(search).toHaveFocus();
    });

    it('renders a generic directory import failure and retry guidance as one alert without moving button focus', async () => {
        const user = userEvent.setup();
        let importRequests = 0;
        let releaseImport!: () => void;
        const importGate = new Promise<void>((resolve) => { releaseImport = resolve; });
        server.use(
            http.get('*/api/v1/directory/users/search', () => HttpResponse.json([directoryUser])),
            http.post('*/api/v1/directory/users/oid-1/import', async () => {
                importRequests += 1;
                await importGate;
                return HttpResponse.json({ detail: 'Directory import failed' }, { status: 500 });
            }),
        );

        render(<DirectoryUserImportPanel onImported={() => undefined} />);
        await user.type(
            screen.getByRole('textbox', { name: 'Search by name or email' }),
            'alice',
        );
        const importButton = await screen.findByRole('button', { name: 'Import' });
        await user.click(importButton);
        await waitFor(() => expect(importRequests).toBe(1));
        expect(importButton).toBeEnabled();
        expect(importButton).toHaveAttribute('aria-disabled', 'true');
        expect(importButton).toHaveAttribute('aria-busy', 'true');
        expect(importButton).toHaveFocus();
        fireEvent.click(importButton);
        fireEvent.click(importButton);
        expect(importRequests).toBe(1);
        releaseImport();

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Directory import failed. Try again.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(importButton).toHaveFocus();
    });

    it('replaces the Sessions directory success status with one guided alert and preserves action focus', async () => {
        const user = userEvent.setup();
        let shouldFail = false;
        server.use(
            http.get('*/api/v1/admin/sessions', () => HttpResponse.json([])),
            http.get('*/api/v1/admin/capabilities', () => HttpResponse.json({
                can_revoke_sessions: true,
                can_run_directory_check_all: true,
                can_update_log_config: true,
                can_export_loaded_audit_logs: true,
            })),
            http.post('*/api/v1/admin/directory/check-all', () => {
                if (shouldFail) {
                    return HttpResponse.json({ detail: 'Directory check failed' }, { status: 500 });
                }
                return HttpResponse.json({
                    checked: 3,
                    deprovisioned: 1,
                    active: 2,
                    errors: 0,
                    skipped: 0,
                    results: [],
                });
            }),
        );

        renderWithQueryClient(<SessionsPanel />);
        const checkButton = await screen.findByRole('button', { name: 'Check AD' });
        await user.click(checkButton);

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Checked 3 users (1 deprovisioned).',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(checkButton).toHaveFocus();

        shouldFail = true;
        await user.click(checkButton);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Directory check failed. Try again.',
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(checkButton).toHaveFocus();
    });

    it('replaces the Users directory success status with one alert and preserves action focus', async () => {
        clearAuthConfigCache();
        clearBootstrapSession();
        setAccessToken('ux-157-users-token');
        const user = userEvent.setup();
        let shouldFail = false;
        let singleCheckRequests = 0;
        let releaseSingleCheck!: () => void;
        const singleCheckGate = new Promise<void>((resolve) => { releaseSingleCheck = resolve; });
        installUsersPageHandlers();
        server.use(
            http.post('*/api/v1/admin/directory/check-all', () => {
                if (shouldFail) {
                    return HttpResponse.json({ detail: 'Directory check failed' }, { status: 500 });
                }
                return HttpResponse.json({
                    checked: 3,
                    deprovisioned: 1,
                    active: 2,
                    errors: 0,
                    skipped: 0,
                    results: [],
                });
            }),
            http.post('*/api/v1/admin/directory/check-user/200', async () => {
                singleCheckRequests += 1;
                await singleCheckGate;
                return HttpResponse.json({ detail: 'Directory check failed' }, { status: 500 });
            }),
        );

        await renderUsersPage();
        const checkButton = (await screen.findAllByRole('button', { name: 'Check AD' }))
            .find((button) => !button.hasAttribute('title'))!;
        await user.click(checkButton);

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Checked 3 users (1 deprovisioned).',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(checkButton).toHaveFocus();

        shouldFail = true;
        await user.click(checkButton);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Directory check failed. Try again.',
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(checkButton).toHaveFocus();

        const singleCheckButton = screen.getByTitle('Check directory status');
        await user.click(singleCheckButton);
        await waitFor(() => expect(singleCheckRequests).toBe(1));
        expect(singleCheckButton).toBeEnabled();
        expect(singleCheckButton).toHaveAttribute('aria-disabled', 'true');
        expect(singleCheckButton).toHaveAttribute('aria-busy', 'true');
        expect(singleCheckButton).toHaveFocus();
        fireEvent.click(singleCheckButton);
        fireEvent.click(singleCheckButton);
        expect(singleCheckRequests).toBe(1);
        releaseSingleCheck();

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Directory check failed. Try again.',
        );
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(singleCheckButton).toHaveFocus();
    });

    it('renders the auth-mode load error as exactly one alert', async () => {
        clearAuthConfigCache();
        clearBootstrapSession();
        setAccessToken('ux-157-auth-error-token');
        installUsersPageHandlers({ authConfigUnavailable: true });

        await renderUsersPage();

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Authentication mode is temporarily unavailable.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('replaces a user status-toggle success with one failure alert and restores row-action focus', async () => {
        clearAuthConfigCache();
        clearBootstrapSession();
        setAccessToken('ux-157-toggle-token');
        const state: UsersMutationState = {};
        installUsersPageHandlers(state);
        const user = userEvent.setup();

        await renderUsersPage();
        const toggleButton = await screen.findByRole('button', { name: 'Deactivate' });
        await user.click(toggleButton);
        let dialog = await screen.findByRole('alertdialog', { name: 'Deactivate User' });
        await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

        expect(await screen.findByRole('status')).toHaveTextContent(
            'The status for Employee One was changed to Inactive.',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await waitFor(() => expect(toggleButton).toHaveFocus());

        state.userUpdateFails = true;
        await user.click(toggleButton);
        dialog = await screen.findByRole('alertdialog', { name: 'Deactivate User' });
        await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Status update rejected');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        await waitFor(() => expect(toggleButton).toHaveFocus());
    });

    it('keeps one break-glass failure alert, reason, and action focus inside the open dialog', async () => {
        clearAuthConfigCache();
        clearBootstrapSession();
        setAccessToken('ux-157-break-glass-token');
        const state: UsersMutationState = {};
        installUsersPageHandlers(state);
        const user = userEvent.setup();
        let breakGlassRequests = 0;
        let releaseBreakGlass!: () => void;
        const breakGlassGate = new Promise<void>((resolve) => { releaseBreakGlass = resolve; });
        server.use(
            http.post('*/api/v1/admin/directory/break-glass-enable/200', async () => {
                if (!state.breakGlassFails) {
                    return HttpResponse.json({ status: 'success', user_id: 200 });
                }
                breakGlassRequests += 1;
                await breakGlassGate;
                return HttpResponse.json({ detail: 'Break-glass rejected' }, { status: 500 });
            }),
        );

        await renderUsersPage();
        const breakGlassButton = await screen.findByRole('button', { name: 'Break-glass' });
        await user.click(breakGlassButton);
        let dialog = await screen.findByRole('dialog', { name: 'Break-glass enable' });
        await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Emergency handoff');
        let submitButton = within(dialog).getByRole('button', { name: 'Break-glass enable' });
        await user.click(submitButton);

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Employee One enabled through break-glass access.',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await waitFor(() => expect(breakGlassButton).toHaveFocus());

        state.breakGlassFails = true;
        await user.click(breakGlassButton);
        dialog = await screen.findByRole('dialog', { name: 'Break-glass enable' });
        await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Retry handoff');
        submitButton = within(dialog).getByRole('button', { name: 'Break-glass enable' });
        await user.click(submitButton);
        await waitFor(() => expect(breakGlassRequests).toBe(1));
        expect(submitButton).toBeEnabled();
        expect(submitButton).toHaveAttribute('aria-disabled', 'true');
        expect(submitButton).toHaveAttribute('aria-busy', 'true');
        expect(submitButton).toHaveFocus();
        fireEvent.click(submitButton);
        fireEvent.click(submitButton);
        expect(breakGlassRequests).toBe(1);
        expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Retry handoff');
        releaseBreakGlass();

        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Break-glass rejected');
        expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue('Retry handoff');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(submitButton).toHaveFocus();
        expect(dialog).toBeInTheDocument();
    });
});
