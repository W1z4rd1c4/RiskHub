import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/bootstrap';
import { KRIsPage } from '@/pages/KRIsPage';

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
    effective_permissions: ['risks:read', 'vendors:read'],
    access_scope: 'department',
    scope_label: 'dept',
    ...overrides,
});

const makeKri = (
    id: number,
    metricName: string,
    overrides: Partial<Record<string, unknown>> = {},
) => ({
    id,
    risk_id: 8,
    metric_name: metricName,
    description: `${metricName} description`,
    current_value: 50,
    lower_limit: 0,
    upper_limit: 100,
    unit: 'count',
    breach_status: 'within',
    monitoring_status: 'optimal',
    last_updated: '2026-03-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    frequency: 'quarterly',
    risk_category: 'Finance',
    risk_process: 'Quarterly Close',
    risk_name: 'Close Risk',
    risk_description: 'Close process risk',
    risk_type: 'operational',
    risk_owner_name: 'Test Owner',
    risk_department_name: 'Finance',
    department_name: 'Finance',
    linked_vendors: [{ id: 400, name: 'Primary Vendor' }],
    ...overrides,
});

const allKri = makeKri(20, 'All KRI');
const unlinkedVendorKri = makeKri(27, 'Unlinked Vendor KRI', {
    linked_vendors: [],
});
const warningKri = makeKri(21, 'Warning KRI', {
    monitoring_status: 'warning',
    current_value: 95,
});
const breachKri = makeKri(22, 'Breach KRI', {
    monitoring_status: 'breach',
    current_value: 125,
    breach_status: 'above',
});
const notSubmittedKri = makeKri(23, 'Not Submitted KRI', {
    monitoring_status: 'not_submitted',
});
const dueSoonKri = makeKri(24, 'Due Soon KRI', {
    required_due_date: '2026-03-10',
});
const archivedKri = makeKri(25, 'Archived KRI', {
    is_archived: true,
    monitoring_status: 'warning',
});
const archivedCompanionKri = makeKri(26, 'Active Companion KRI');

function renderWithRoute(route: string) {
    const queryClient = createTestQueryClient();

    const RouteProbe = () => {
        const location = useLocation();
        return <div data-testid="kri-route-search">{location.search}</div>;
    };

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProviderWithReady>
                    <Routes>
                        <Route
                            path="/kris"
                            element={(
                                <>
                                    <RouteProbe />
                                    <KRIsPage />
                                </>
                            )}
                        />
                    </Routes>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

async function renderKriPage(route: string) {
    await act(async () => {
        renderWithRoute(route);
    });
    await waitForAuthBootstrapReady();
}

function installKriHandlers(requestQueries: string[]) {
    const user = makeUser();

    server.use(
        http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
        http.get('*/api/v1/kris', async ({ request }) => {
            const url = new URL(request.url);
            const monitoringStatus = url.searchParams.get('monitoring_status');
            const timelinessStatus = url.searchParams.get('timeliness_status');
            const includeArchived = url.searchParams.get('include_archived') === 'true';
            requestQueries.push(url.searchParams.toString());

            let items = [allKri, unlinkedVendorKri];
            let delayMs = 5;

            if (includeArchived) {
                items = [archivedKri, archivedCompanionKri];
                delayMs = 15;
            } else if (timelinessStatus === 'due_soon') {
                items = [dueSoonKri];
                delayMs = 30;
            } else if (monitoringStatus === 'warning') {
                items = [warningKri];
                delayMs = 120;
            } else if (monitoringStatus === 'breach') {
                items = [breachKri];
                delayMs = 90;
            } else if (monitoringStatus === 'not_submitted') {
                items = [notSubmittedKri];
                delayMs = 60;
            }

            await new Promise((resolve) => window.setTimeout(resolve, delayMs));

            return HttpResponse.json({
                items,
                total: items.length,
                page: Number(url.searchParams.get('page') ?? 1),
                size: Number(url.searchParams.get('size') ?? 20),
            });
        }),
    );
}

describe('KRIsPage monitoring status filters', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('initializes not-submitted mode from the route and requests monitoring_status', async () => {
        const requestQueries: string[] = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris?monitoring_status=not_submitted');

        await screen.findByText('Not Submitted KRI');

        expect(screen.queryByText('All KRI')).not.toBeInTheDocument();
        expect(screen.getByTestId('kris-status-filter-not_submitted')).toHaveClass('bg-accent');
        expect(screen.getByTestId('kri-route-search')).toHaveTextContent('?monitoring_status=not_submitted');
        expect(requestQueries.some((query) => query.includes('monitoring_status=not_submitted'))).toBe(true);
    });

    it('initializes due-soon mode from the route and requests timeliness_status', async () => {
        const requestQueries: string[] = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris?timeliness_status=due_soon');

        await screen.findByText('Due Soon KRI');

        expect(screen.queryByText('All KRI')).not.toBeInTheDocument();
        expect(screen.getByTestId('kris-status-filter-due_soon')).toHaveClass('bg-accent');
        expect(screen.getByTestId('kri-route-search')).toHaveTextContent('?timeliness_status=due_soon');
        expect(requestQueries.some((query) => query.includes('timeliness_status=due_soon'))).toBe(true);
    });

    it('keeps the last rapid filter click authoritative and clears loading after stale requests resolve', async () => {
        const requestQueries: string[] = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris');

        await screen.findByText('All KRI');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('kris-status-filter-warning'));
        await uiUser.click(screen.getByTestId('kris-status-filter-breach'));
        await uiUser.click(screen.getByTestId('kris-status-filter-not_submitted'));
        await uiUser.click(screen.getByTestId('kris-status-filter-due_soon'));
        await uiUser.click(screen.getByTestId('kris-status-filter-archived'));

        await screen.findByText('Archived KRI');

        await waitFor(() => {
            expect(screen.getByTestId('kris-status-filter-archived')).toHaveClass('bg-accent');
            expect(screen.getByTestId('kris-refresh-button').querySelector('.animate-spin')).toBeNull();
        });

        expect(screen.getByTestId('kri-route-search')).toHaveTextContent('?status=archived');
        expect(screen.queryByText('Warning KRI')).not.toBeInTheDocument();
        expect(screen.queryByText('Breach KRI')).not.toBeInTheDocument();
        expect(screen.queryByText('Not Submitted KRI')).not.toBeInTheDocument();
        expect(screen.queryByText('Due Soon KRI')).not.toBeInTheDocument();
        expect(screen.queryByText('Active Companion KRI')).not.toBeInTheDocument();
        expect(requestQueries.some((query) => query.includes('monitoring_status=warning'))).toBe(true);
        expect(requestQueries.some((query) => query.includes('monitoring_status=breach'))).toBe(true);
        expect(requestQueries.some((query) => query.includes('monitoring_status=not_submitted'))).toBe(true);
        expect(requestQueries.some((query) => query.includes('timeliness_status=due_soon'))).toBe(true);
        expect(requestQueries.at(-1)).toContain('include_archived=true');
        expect(requestQueries.at(-1)).toContain('size=100');
    });

    it('uses the same route-backed monitoring filter in grouped views', async () => {
        const requestQueries: string[] = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris?monitoring_status=warning');

        await screen.findByText('Warning KRI');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: 'By Category' }));

        await screen.findByText('Finance');
        await uiUser.click(screen.getByRole('button', { name: /Finance/ }));
        await screen.findByText('Warning KRI');

        expect(screen.getByTestId('kris-status-filter-warning')).toHaveClass('bg-accent');
        expect(screen.getByTestId('kri-route-search')).toHaveTextContent('?monitoring_status=warning');
        expect(screen.queryByText('All KRI')).not.toBeInTheDocument();
        expect(requestQueries.some((query) => query.includes('monitoring_status=warning'))).toBe(true);
    });

    it('groups KRIs by vendor and keeps an unlinked vendor fallback bucket', async () => {
        const requestQueries: string[] = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris');

        await screen.findByText('All KRI');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: 'By Vendor' }));

        await screen.findByRole('button', { name: /Primary Vendor/i });
        await screen.findByRole('button', { name: /Unlinked Vendor/i });

        await uiUser.click(screen.getByRole('button', { name: /Primary Vendor/i }));
        await screen.findByText('All KRI');

        expect(requestQueries.some((query) => query.includes('size=100'))).toBe(true);
    });
});
