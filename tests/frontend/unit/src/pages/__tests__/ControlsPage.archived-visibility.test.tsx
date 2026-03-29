import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@/services/accessTokenStore';
import { clearBootstrapSession } from '@/services/authSessionCoordinator';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { ControlsPage } from '@/pages/ControlsPage';

vi.mock('@/utils/userSettingsStorage', async () => {
    const actual = await vi.importActual<typeof import('@/utils/userSettingsStorage')>('@/utils/userSettingsStorage');
    return {
        ...actual,
        syncPreferencesFromServer: vi.fn(async () => undefined),
        clearLocalSettings: vi.fn(),
    };
});

const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 123,
    email: 'test.user@riskhub.test',
    name: 'Test User',
    role: 'employee',
    role_display_name: 'Employee',
    permissions: [],
    effective_permissions: ['controls:read'],
    access_scope: 'department',
    scope_label: 'dept',
    ...overrides,
});

async function renderWithRoute(route: string) {
    const queryClient = createTestQueryClient();

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProviderWithReady>
                    <DashboardFilterProvider>
                        <Routes>
                            <Route path="/controls" element={<ControlsPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );
    await waitForAuthBootstrapReady();
}

describe('ControlsPage archived visibility', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('hides archived controls by default and shows them when status filter is set to Archived', async () => {
        const user = makeUser();

        const activeControl = {
            id: 1,
            name: 'Active Control',
            department_name: 'Operations',
            frequency: 'monthly',
            risk_level: 3,
            status: 'active',
            control_form: 'manual',
        };

        const archivedControl = {
            ...activeControl,
            id: 2,
            name: 'Archived Control',
            status: 'archived',
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', ({ request }) => {
                const url = new URL(request.url);
                const includeArchived = url.searchParams.get('include_archived') === 'true';
                const status = url.searchParams.get('status');
                const items = includeArchived || status === 'archived' ? [archivedControl] : [activeControl];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    skip: Number(url.searchParams.get('skip') ?? 0),
                    limit: Number(url.searchParams.get('limit') ?? 20),
                });
            })
        );

        await renderWithRoute('/controls');

        await screen.findByText('Active Control');
        expect(screen.queryByText('Archived Control')).not.toBeInTheDocument();

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('controls-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('controls-status-filter-option-archived'));

        await screen.findByText('Archived Control');
    });

    it('sends monitoring_status when a monitoring filter is selected', async () => {
        const user = makeUser();

        const passedControl = {
            id: 11,
            name: 'Passed Control',
            department_name: 'Operations',
            frequency: 'monthly',
            risk_level: 3,
            status: 'active',
            control_form: 'manual',
            monitoring_status: 'passed',
        };

        const failedControl = {
            ...passedControl,
            id: 12,
            name: 'Failed Control',
            monitoring_status: 'failed',
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', ({ request }) => {
                const url = new URL(request.url);
                const monitoringStatus = url.searchParams.get('monitoring_status');
                const items = monitoringStatus === 'passed' ? [passedControl] : [failedControl];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    skip: Number(url.searchParams.get('skip') ?? 0),
                    limit: Number(url.searchParams.get('limit') ?? 20),
                });
            })
        );

        await renderWithRoute('/controls');

        await screen.findByText('Failed Control');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('controls-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('controls-status-filter-option-passed'));

        await screen.findByText('Passed Control');
        expect(screen.queryByText('Failed Control')).not.toBeInTheDocument();
    });
});
