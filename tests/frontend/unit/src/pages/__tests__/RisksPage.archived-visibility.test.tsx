import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    MemoryRouter,
    Outlet,
    Route,
    RouterProvider,
    Routes,
    createMemoryRouter,
    useLocation,
    useNavigate,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/coordinator';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { RiskDetailPage } from '@/pages/RiskDetailPage';
import { RisksPage } from '@/pages/RisksPage';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';

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

async function renderWithRoute(route: string | string[]) {
    const queryClient = createTestQueryClient();
    const initialEntries = Array.isArray(route) ? route : [route];

    render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
                <AuthProviderWithReady>
                    <DashboardFilterProvider>
                        <Routes>
                            <Route path="/risks" element={<RisksPage />} />
                            <Route path="/risks/:id" element={null} />
                            <Route path="/risks/new" element={null} />
                        </Routes>
                        <LocationProbe />
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );
    await waitForAuthBootstrapReady();
}

async function renderDepartmentRiskJourney(route: string) {
    const queryClient = createTestQueryClient();
    const router = createMemoryRouter([
        {
            path: '/',
            element: (
                <AuthProviderWithReady>
                    <DashboardFilterProvider>
                        <Outlet />
                        <LocationProbe />
                    </DashboardFilterProvider>
                </AuthProviderWithReady>
            ),
            children: [
                {
                    path: 'departments/:departmentId',
                    element: (
                        <DepartmentRegisterScopeProvider value={{ departmentId: 7, departmentName: 'Compliance' }}>
                            <RisksPage />
                        </DepartmentRegisterScopeProvider>
                    ),
                },
                { path: 'risks/:id', element: <RiskDetailPage /> },
            ],
        },
    ], { initialEntries: [route] });
    render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
    await waitForAuthBootstrapReady();
}

function LocationProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <>
            <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
            <button type="button" onClick={() => navigate(-1)}>browser back</button>
        </>
    );
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

    it('hides archived risks by default and shows them when lifecycle is set to Archived', async () => {
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
            status: 'active',
            is_archived: true,
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/risks', ({ request }) => {
                const url = new URL(request.url);
                const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
                const items = filters.lifecycle === 'archived' ? [archivedRisk] : [activeRisk];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    offset: Number(url.searchParams.get('offset') ?? 0),
                    limit: Number(url.searchParams.get('limit') ?? 20),
                });
            })
        );

        await renderWithRoute('/risks');

        await screen.findByText('Active Risk');
        expect(screen.queryByText('Archived Risk')).not.toBeInTheDocument();

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('risks-lifecycle-filter-trigger'));
        await uiUser.click(screen.getByTestId('risks-lifecycle-filter-option-archived'));

        await screen.findByText('Archived Risk');
    });

    it('replaces query A rows and actions with an unavailable state when query B fails', async () => {
        const activeRisk = {
            id: 1,
            risk_id_code: 'R-ACT-001',
            name: 'Query A Risk',
            process: 'Payments',
            risk_type: 'operational',
            category: 'Operations',
            description: 'Only valid for the initial query.',
            gross_score: 9,
            gross_probability: 3,
            gross_impact: 3,
            net_score: 4,
            status: 'active',
            is_priority: false,
        };
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser())),
            http.get('*/api/v1/risks', ({ request }) => {
                const filters = JSON.parse(new URL(request.url).searchParams.get('filters') ?? '{}') as Record<string, unknown>;
                if (filters.lifecycle === 'archived') {
                    return HttpResponse.json({ detail: 'temporary failure' }, { status: 500 });
                }
                return HttpResponse.json({
                    items: [activeRisk],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities: { can_create: true, can_export: true },
                });
            }),
        );

        await renderWithRoute('/risks?source=review');
        expect(await screen.findByText('Query A Risk')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New Risk' })).toBeInTheDocument();

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('risks-lifecycle-filter-trigger'));
        await uiUser.click(screen.getByTestId('risks-lifecycle-filter-option-archived'));

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('Query A Risk')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'New Risk' })).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('source=review');
    });

    it('carries the exact list working set into visible detail and create navigation', async () => {
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
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser())),
            http.get('*/api/v1/risks', () => HttpResponse.json({
                items: [activeRisk],
                total: 1,
                offset: 0,
                limit: 20,
                capabilities: { can_create: true },
            })),
        );

        await renderWithRoute('/risks?q=claims&page=3&source=audit#group-heading');
        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByText('Active Risk'));

        expect(await screen.findByTestId('location')).toHaveTextContent(
            `/risks/1?return_to=${encodeURIComponent('/risks?q=claims&page=3&source=audit#group-heading')}`,
        );

        await uiUser.click(screen.getByRole('button', { name: 'browser back' }));
        await uiUser.click(await screen.findByRole('button', { name: 'New Risk' }));
        expect(await screen.findByTestId('location')).toHaveTextContent(
            `/risks/new?return_to=${encodeURIComponent('/risks?q=claims&page=3&source=audit#group-heading')}`,
        );
    });

    it('returns from Risk detail to the exact Department Risk-tab working set', async () => {
        const activeRisk = {
            id: 1,
            risk_id_code: 'R-ACT-001',
            name: 'Department Risk',
            process: 'Payments',
            risk_type: 'operational',
            category: 'Operations',
            description: 'Risk shown inside the Department workspace.',
            gross_score: 9,
            gross_probability: 3,
            gross_impact: 3,
            net_score: 4,
            net_probability: 2,
            net_impact: 2,
            status: 'active',
            is_priority: false,
            is_archived: false,
            created_at: '2026-08-30T00:00:00Z',
            updated_at: '2026-08-30T00:00:00Z',
            kris: [],
        };
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser())),
            http.get('*/api/v1/risks', () => HttpResponse.json({
                items: [activeRisk],
                total: 100,
                offset: 20,
                limit: 10,
            })),
            http.get('*/api/v1/risks/1', () => HttpResponse.json(activeRisk)),
            http.get('*/api/v1/risks/1/controls', () => HttpResponse.json([])),
            http.get('*/api/v1/risks/1/vendors', () => HttpResponse.json([])),
            http.get('*/api/v1/risks/1/threat-links', () => HttpResponse.json([])),
            http.get('*/api/v1/risks/1/process-links', () => HttpResponse.json([])),
            http.get('*/api/v1/risks/1/asset-links', () => HttpResponse.json([])),
            http.get('*/api/v1/kris/overdue', () => HttpResponse.json([])),
        );
        const workingSet = '/departments/7?tab=risks&q=payments&page=3&source=audit#group-heading';

        await renderDepartmentRiskJourney(workingSet);
        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByText('Department Risk'));
        await screen.findByRole('heading', { name: 'Department Risk' });
        await uiUser.click(screen.getByRole('button', { name: /back to register/i }));

        expect(await screen.findByText('Department Risk')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(workingSet);
    });

    it('removes a semantic filter with a pushed page-one URL transition', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser())),
            http.get('*/api/v1/risks', () => HttpResponse.json({
                items: [],
                total: 0,
                offset: 0,
                limit: 20,
            })),
        );
        const original = '/risks?ict_linked=true&page=3&source=audit#group-heading';

        await renderWithRoute(original);
        const uiUser = userEvent.setup();
        await uiUser.click(await screen.findByTestId('semantic-filter-remove-ict_linked'));

        expect(screen.getByTestId('location')).toHaveTextContent('/risks?source=audit#group-heading');

        await uiUser.click(screen.getByRole('button', { name: 'browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent(original);
    });

    it('replace-normalizes invalid owned URL state without trapping browser Back', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser())),
            http.get('*/api/v1/risks', () => HttpResponse.json({
                items: [],
                total: 0,
                offset: 0,
                limit: 20,
            })),
        );

        await renderWithRoute([
            '/risks?source=before',
            '/risks?source=review&view=bogus&sort=oops&filters=%7Bbad&group=&page=004&q=',
        ]);

        expect(await screen.findByTestId('location')).toHaveTextContent('/risks?source=review&page=4');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: 'browser back' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/risks?source=before');
    });

});
