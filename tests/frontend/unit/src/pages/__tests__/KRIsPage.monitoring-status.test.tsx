import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/coordinator';
import { KRIsPage } from '@/pages/KRIsPage';

const UNLINKED_VENDOR_GROUP = '__unlinked_vendor__';

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

function makeKriCapabilities(overrides: Partial<Record<string, boolean>> = {}) {
    return {
        can_read: true,
        can_update: false,
        can_update_sensitive_fields: false,
        can_request_update_approval: false,
        can_archive_immediately: false,
        can_request_archive_approval: false,
        can_restore: false,
        can_submit_value: false,
        can_submit_backdated_value: false,
        can_request_value_submission_approval: false,
        can_view_history: true,
        can_request_history_correction: false,
        can_apply_history_correction_immediately: false,
        can_link_vendors: false,
        can_unlink_vendors: false,
        can_view_linked_vendors: true,
        can_create_issue: false,
        has_pending_delete_approval: false,
        has_pending_update_approval: false,
        has_pending_value_submission_approval: false,
        has_pending_history_correction_approval: false,
        requires_privileged_update_approval: false,
        requires_privileged_delete_approval: false,
        ...overrides,
    };
}

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
    capabilities: makeKriCapabilities(),
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
    capabilities: makeKriCapabilities({ can_restore: false }),
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

function parseKriRequest(url: URL) {
    const filtersRaw = url.searchParams.get('filters');
    const filters = filtersRaw ? JSON.parse(filtersRaw) as Record<string, unknown> : {};
    return {
        raw: url.searchParams.toString(),
        filters,
        groupBy: url.searchParams.get('group_by'),
        groupValue: url.searchParams.get('group_value'),
        offset: Number(url.searchParams.get('offset') ?? 0),
        limit: Number(url.searchParams.get('limit') ?? 20),
    };
}

function buildVendorGroups(items: Array<ReturnType<typeof makeKri>>) {
    const groups = new Map<string, { value: string; label: string; count: number; active_count: number; highlighted_count: number; meta: Record<string, unknown> }>();

    for (const item of items) {
        const vendors = item.linked_vendors ?? [];
        const memberships = vendors.length > 0
            ? vendors.map((vendor) => ({ value: `vendor:${vendor.id}`, label: vendor.name }))
            : [{ value: UNLINKED_VENDOR_GROUP, label: UNLINKED_VENDOR_GROUP }];

        for (const membership of memberships) {
            const group = groups.get(membership.value) ?? {
                ...membership,
                count: 0,
                active_count: 0,
                highlighted_count: 0,
                meta: {},
            };
            group.count += 1;
            group.active_count += 1;
            if (item.monitoring_status === 'breach') {
                group.highlighted_count += 1;
            }
            groups.set(membership.value, group);
        }
    }

    return [...groups.values()];
}

function installKriHandlers(
    requestQueries: Array<ReturnType<typeof parseKriRequest>>,
    userOverrides: Partial<Record<string, unknown>> = {},
    collectionCapabilities: Record<string, boolean> | undefined = { can_view_vendor_contexts: true },
) {
    const user = makeUser(userOverrides);
    const canRestoreArchived = (user.effective_permissions as string[]).includes('risks:delete');

    server.use(
        http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
        http.get('*/api/v1/kris', async ({ request }) => {
            const url = new URL(request.url);
            const requestInfo = parseKriRequest(url);
            const monitoringStatus = requestInfo.filters.monitoring_status;
            const timelinessStatus = requestInfo.filters.timeliness_status;
            const includeArchived = requestInfo.filters.include_archived === true;
            const archivedOnly = requestInfo.filters.is_archived === true;
            requestQueries.push(requestInfo);

            let items = [allKri, unlinkedVendorKri];
            let delayMs = 5;

            if (archivedOnly) {
                items = [{
                    ...archivedKri,
                    capabilities: makeKriCapabilities({ can_restore: canRestoreArchived }),
                }];
                delayMs = 15;
            } else if (includeArchived) {
                items = [{
                    ...archivedKri,
                    capabilities: makeKriCapabilities({ can_restore: canRestoreArchived }),
                }, archivedCompanionKri];
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

            if (requestInfo.groupBy === 'vendor') {
                if (requestInfo.groupValue) {
                    const groupedItems = requestInfo.groupValue === UNLINKED_VENDOR_GROUP
                        ? items.filter((item) => (item.linked_vendors ?? []).length === 0)
                        : items.filter((item) => (item.linked_vendors ?? []).some((vendor) => `vendor:${vendor.id}` === requestInfo.groupValue));

                    return HttpResponse.json({
                        items: groupedItems,
                        total: groupedItems.length,
                        offset: requestInfo.offset,
                        limit: requestInfo.limit,
                        groups: buildVendorGroups(items),
                        capabilities: collectionCapabilities,
                    });
                }

                return HttpResponse.json({
                    items: [],
                    total: items.length,
                    offset: requestInfo.offset,
                    limit: requestInfo.limit,
                    groups: buildVendorGroups(items),
                    capabilities: collectionCapabilities,
                });
            }

            if (requestInfo.groupBy === 'category') {
                if (requestInfo.groupValue) {
                    const groupedItems = items.filter((item) => (item.risk_category ?? '__uncategorized__') === requestInfo.groupValue);
                    return HttpResponse.json({
                        items: groupedItems,
                        total: groupedItems.length,
                        offset: requestInfo.offset,
                        limit: requestInfo.limit,
                        groups: [{
                            value: 'Finance',
                            label: 'Finance',
                            count: items.length,
                            active_count: items.length,
                            highlighted_count: items.filter((item) => item.monitoring_status === 'breach').length,
                            meta: {},
                        }],
                    });
                }

                return HttpResponse.json({
                    items: [],
                    total: items.length,
                    offset: requestInfo.offset,
                    limit: requestInfo.limit,
                    groups: [{
                        value: 'Finance',
                        label: 'Finance',
                        count: items.length,
                        active_count: items.length,
                        highlighted_count: items.filter((item) => item.monitoring_status === 'breach').length,
                        meta: {},
                    }],
                });
            }

            return HttpResponse.json({
                items,
                total: items.length,
                offset: requestInfo.offset,
                limit: requestInfo.limit,
                groups: null,
                capabilities: collectionCapabilities,
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
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris?monitoring_status=not_submitted');

        await screen.findByText('Not Submitted KRI');

        expect(screen.queryByText('All KRI')).not.toBeInTheDocument();
        expect(screen.getByTestId('kris-status-filter-not_submitted')).toHaveClass('bg-accent');
        expect(screen.getByTestId('kri-route-search')).toHaveTextContent('?monitoring_status=not_submitted');
        expect(requestQueries.some((query) => query.filters.monitoring_status === 'not_submitted')).toBe(true);
    });

    it.each([
        ['false capability', { can_view_vendor_contexts: true, can_export: false }],
        ['missing capability', { can_view_vendor_contexts: true }],
        ['missing capabilities', undefined],
    ])('hides export when KRI list returns %s', async (_caseName, capabilities) => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries, {}, capabilities);

        await renderKriPage('/kris');

        await screen.findByText('All KRI');
        expect(screen.queryByTestId('kris-export-button')).not.toBeInTheDocument();
    });

    it('shows export when KRI list can_export is true', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries, {}, { can_view_vendor_contexts: true, can_export: true });

        await renderKriPage('/kris');

        await screen.findByText('All KRI');
        expect(screen.getByTestId('kris-export-button')).toBeInTheDocument();
    });

    it('renders denied and clears collection actions when KRI reads are forbidden', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries, {}, { can_view_vendor_contexts: true, can_create: true, can_export: true });
        let requestCount = 0;
        server.use(
            http.get('*/api/v1/kris', () => {
                requestCount += 1;
                if (requestCount > 1) {
                    return HttpResponse.json({ detail: 'Forbidden' }, { status: 403 });
                }
                return HttpResponse.json({
                    items: [allKri],
                    total: 1,
                    offset: 0,
                    limit: 20,
                    capabilities: { can_create: true, can_export: true },
                });
            })
        );

        await renderKriPage('/kris');

        await screen.findByText('All KRI');
        expect(screen.getByTestId('kris-export-button')).toBeInTheDocument();
        expect(screen.getByTestId('kris-create-button')).toBeInTheDocument();

        await userEvent.click(screen.getByTestId('kris-refresh-button'));

        await screen.findByRole('heading', { name: /access denied/i });
        expect(screen.queryByText('All KRI')).not.toBeInTheDocument();
        expect(screen.queryByTestId('kris-export-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('kris-create-button')).not.toBeInTheDocument();
    });

    it('initializes due-soon mode from the route and requests timeliness_status', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris?timeliness_status=due_soon');

        await screen.findByText('Due Soon KRI');

        expect(screen.queryByText('All KRI')).not.toBeInTheDocument();
        expect(screen.getByTestId('kris-status-filter-due_soon')).toHaveClass('bg-accent');
        expect(screen.getByTestId('kri-route-search')).toHaveTextContent('?timeliness_status=due_soon');
        expect(requestQueries.some((query) => query.filters.timeliness_status === 'due_soon')).toBe(true);
    });

    it('keeps the last rapid filter click authoritative and clears loading after stale requests resolve', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
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
        expect(screen.queryByTestId('kri-unarchive-25')).not.toBeInTheDocument();
        expect(requestQueries.some((query) => query.filters.monitoring_status === 'warning')).toBe(true);
        expect(requestQueries.some((query) => query.filters.monitoring_status === 'breach')).toBe(true);
        expect(requestQueries.some((query) => query.filters.monitoring_status === 'not_submitted')).toBe(true);
        expect(requestQueries.some((query) => query.filters.timeliness_status === 'due_soon')).toBe(true);
        expect(requestQueries.at(-1)?.filters.is_archived).toBe(true);
        expect(requestQueries.at(-1)?.filters.include_archived).toBeUndefined();
    });

    it('uses the same route-backed monitoring filter in grouped views', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
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
        expect(requestQueries.some((query) => query.filters.monitoring_status === 'warning')).toBe(true);
        expect(requestQueries.some((query) => query.groupBy === 'category')).toBe(true);
    });

    it('groups KRIs by vendor and keeps an unlinked vendor fallback bucket', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris');

        await screen.findByText('All KRI');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: 'By Vendor' }));

        await screen.findByRole('button', { name: /Primary Vendor/i });
        await screen.findByRole('button', { name: /Unlinked Vendor/i });

        await uiUser.click(screen.getByRole('button', { name: /Primary Vendor/i }));
        await screen.findByText('All KRI');

        expect(requestQueries.some((query) => query.groupBy === 'vendor')).toBe(true);
        expect(requestQueries.some((query) => query.groupBy === 'vendor' && query.groupValue === 'vendor:400')).toBe(true);
    });

    it('clears stale grouped drilldown selection when search changes', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris');

        await screen.findByText('All KRI');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: 'By Category' }));
        await screen.findByRole('button', { name: /Finance/i });
        await uiUser.click(screen.getByRole('button', { name: /Finance/i }));
        await screen.findByText('All KRI');

        await uiUser.type(screen.getByTestId('kris-search-input'), 'close');

        await waitFor(() => {
            const searchedCategoryRequests = requestQueries.filter(
                (query) => query.groupBy === 'category' && query.filters.search === 'close'
            );
            expect(searchedCategoryRequests.at(-1)?.groupValue).toBeNull();
        });
    });

    it('sorts KRI table rows by metric name on the client', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris');

        await screen.findByText('All KRI');
        await screen.findByText('Unlinked Vendor KRI');

        const metricOrder = () => screen.getAllByRole('row')
            .map((row) => {
                if (within(row).queryByText('All KRI')) return 'All KRI';
                if (within(row).queryByText('Unlinked Vendor KRI')) return 'Unlinked Vendor KRI';
                return null;
            })
            .filter(Boolean);

        expect(metricOrder()).toEqual(['All KRI', 'Unlinked Vendor KRI']);

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('columnheader', { name: /Metric/i }));
        await uiUser.click(screen.getByRole('columnheader', { name: /Metric/i }));

        expect(metricOrder()).toEqual(['Unlinked Vendor KRI', 'All KRI']);
    });

    it('shows archived KRI restore only when the user can delete risks', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries, {
            effective_permissions: ['risks:read', 'risks:delete', 'vendors:read'],
        });

        await renderKriPage('/kris?status=archived');

        await screen.findByText('Archived KRI');

        expect(screen.getByTestId('kri-unarchive-25')).toBeInTheDocument();
    });

    it('translates load errors from the errorKeys namespace', async () => {
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser())),
            http.get('*/api/v1/kris', () => HttpResponse.json({ detail: 'Failed' }, { status: 500 })),
        );

        await renderKriPage('/kris');

        await screen.findByText('Server error. Please try again later.');

        expect(screen.getByText('Error Loading KRIs')).toBeInTheDocument();
        expect(screen.getByText('Try Again')).toBeInTheDocument();
        expect(screen.queryByText('errorKeys.server')).not.toBeInTheDocument();
    });

    it('uses backend archived-only filtering for grouped summaries and drilldown', async () => {
        const requestQueries: Array<ReturnType<typeof parseKriRequest>> = [];
        installKriHandlers(requestQueries);

        await renderKriPage('/kris?status=archived');

        await screen.findByText('Archived KRI');

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByRole('button', { name: 'By Category' }));

        await screen.findByRole('button', { name: /Finance/i });
        await uiUser.click(screen.getByRole('button', { name: /Finance/i }));
        await screen.findByText('Archived KRI');

        expect(screen.queryByText('Active Companion KRI')).not.toBeInTheDocument();
        expect(requestQueries.some((query) => query.groupBy === 'category' && query.filters.is_archived === true)).toBe(true);
        expect(
            requestQueries.some((query) =>
                query.groupBy === 'category' &&
                query.groupValue === 'Finance' &&
                query.filters.is_archived === true
            )
        ).toBe(true);
    });
});
