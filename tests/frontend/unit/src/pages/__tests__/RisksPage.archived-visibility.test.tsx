import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/bootstrap';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { RisksPage } from '@/pages/RisksPage';

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
    effective_permissions: ['risks:read'],
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
                            <Route path="/risks" element={<RisksPage />} />
                        </Routes>
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );
    await waitForAuthBootstrapReady();
}

describe('RisksPage archived visibility', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('hides archived risks by default and shows them when status filter is set to Archived', async () => {
        const user = makeUser();

        const activeRisk = {
            id: 1,
            risk_id_code: 'R-ACT-001',
            name: 'Active Risk',
            process: 'Mock Process',
            risk_type: 'operational',
            category: 'Mock',
            description: 'Mock Desc',
            gross_score: 9,
            gross_probability: 3,
            gross_impact: 3,
            net_score: 4,
            status: 'active',
            is_priority: false,
        };

        const archivedRisk = {
            ...activeRisk,
            id: 2,
            risk_id_code: 'R-ARC-001',
            name: 'Archived Risk',
            status: 'archived',
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/risks', ({ request }) => {
                const url = new URL(request.url);
                const includeArchived = url.searchParams.get('include_archived') === 'true';
                const status = url.searchParams.get('status');
                const items = includeArchived || status === 'archived' ? [archivedRisk] : [activeRisk];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    skip: Number(url.searchParams.get('skip') ?? 0),
                    limit: Number(url.searchParams.get('limit') ?? 20),
                });
            })
        );

        await renderWithRoute('/risks');

        await screen.findByText('Active Risk');
        expect(screen.queryByText('Archived Risk')).not.toBeInTheDocument();

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('risks-status-filter-trigger'));
        await uiUser.click(screen.getByTestId('risks-status-filter-option-archived'));

        await screen.findByText('Archived Risk');
    });
});
