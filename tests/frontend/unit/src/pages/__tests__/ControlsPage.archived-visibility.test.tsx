import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/coordinator';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { DepartmentRegisterScopeProvider } from '@/pages/departments/DepartmentRegisterScope';
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
                    <LanguageProvider>
                        <DashboardFilterProvider>
                            <Routes>
                                <Route path="/controls" element={<ControlsPage />} />
                                <Route path="/departments/:departmentId" element={<DepartmentRegisterScopeProvider value={{departmentId:17,departmentName:'Scoped'}}><ControlsPage/></DepartmentRegisterScopeProvider>} />
                            </Routes>
                            <LocationProbe/>
                        </DashboardFilterProvider>
                    </LanguageProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>
    );
    await waitForAuthBootstrapReady();
}

function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname+location.search}</output>;}

describe('ControlsPage archived visibility', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('projects pending state from each Control row without requesting the approval queue', async () => {
        let approvalQueueRequests = 0;
        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(makeUser())),
            http.get('*/api/v1/controls', () => HttpResponse.json({
                items: [{
                    id: 81,
                    name: 'Pending Control change',
                    department_name: 'Operations',
                    frequency: 'monthly',
                    risk_level: 3,
                    status: 'active',
                    is_archived: false,
                    control_form: 'manual',
                    capabilities: {
                        can_read: true,
                        can_update: false,
                        can_update_sensitive_fields: false,
                        can_request_update_approval: false,
                        can_archive_immediately: false,
                        can_request_archive_approval: false,
                        can_restore: false,
                        can_log_execution: false,
                        can_view_executions: true,
                        can_link_risk: false,
                        can_unlink_risk: false,
                        can_view_linked_risks: true,
                        can_view_linked_vendors: true,
                        can_create_issue: false,
                        has_pending_delete_approval: true,
                        has_pending_update_approval: false,
                        requires_privileged_update_approval: false,
                        requires_privileged_delete_approval: false,
                        is_archived: false,
                        is_executable: true,
                    },
                }],
                total: 1,
                offset: 0,
                limit: 20,
            })),
            http.get('*/api/v1/approvals', () => {
                approvalQueueRequests += 1;
                return HttpResponse.json({ items: [], total: 0, skip: 0, limit: 100 });
            }),
        );

        await renderWithRoute('/controls');

        expect(await screen.findByText('Pending Control change')).toBeInTheDocument();
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(approvalQueueRequests).toBe(0);
    });

    it('hides archived controls by default and shows them when lifecycle is set to Archived', async () => {
        const user = makeUser();

        const activeControl = {
            id: 1,
            name: 'Active Control',
            department_name: 'Operations',
            frequency: 'monthly',
            risk_level: 3,
            status: 'active',
            is_archived: false,
            control_form: 'manual',
        };

        const archivedControl = {
            ...activeControl,
            id: 2,
            name: 'Archived Control',
            status: 'active',
            is_archived: true,
        };

        server.use(
            http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
            http.get('*/api/v1/controls', ({ request }) => {
                const url = new URL(request.url);
                const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
                const items = filters.lifecycle === 'archived' ? [archivedControl] : [activeControl];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    offset: Number(url.searchParams.get('offset') ?? 0),
                    limit: Number(url.searchParams.get('limit') ?? 20),
                });
            })
        );

        await renderWithRoute('/controls');

        await screen.findByText('Active Control');
        expect(screen.queryByText('Archived Control')).not.toBeInTheDocument();

        const uiUser = userEvent.setup();
        await uiUser.click(screen.getByTestId('controls-lifecycle-filter-trigger'));
        await uiUser.click(screen.getByTestId('controls-lifecycle-filter-option-archived'));

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
            is_archived: false,
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
                const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as Record<string, unknown>;
                const monitoringStatus = filters.monitoring_status;
                const items = monitoringStatus === 'passed' ? [passedControl] : [failedControl];
                return HttpResponse.json({
                    items,
                    total: items.length,
                    offset: Number(url.searchParams.get('offset') ?? 0),
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
    it.each([false,true])('retains form and locked Department scope through real page URL cleanup (department=%s)',async department=>{
        const criteria:Record<string,unknown>[]=[];let reports=0;
        server.use(
            http.get('*/api/v1/auth/me',()=>HttpResponse.json(makeUser({effective_permissions:['controls:read','reports:read']}))),
            http.get('*/api/v1/controls',({request})=>{criteria.push(JSON.parse(new URL(request.url).searchParams.get('filters')??'{}'));return HttpResponse.json({items:[],total:0,offset:0,limit:50,capabilities:{can_export:true}});}),
            http.get('*/api/v1/reports/controls/export',()=>{reports++;return new HttpResponse('unexpected');}),
        );
        const query='?filters='+encodeURIComponent(JSON.stringify({control_form:'automatic',status:'inactive'}));
        await renderWithRoute((department?'/departments/17':'/controls')+query+(department?'&tab=controls':''));
        expect(await screen.findByText('Control Form: Automatic')).toBeVisible();
        expect(criteria.at(-1)).toMatchObject({control_form:'automatic',status:'inactive',...(department?{department_id:17}:{})});
        expect(screen.getByTestId('location')).toHaveTextContent('control_form');
        if(department)expect(screen.getByTestId('location')).toHaveTextContent('tab=controls');
        const user=userEvent.setup();
        await user.click(await screen.findByRole('button',{name:/export/i}));
        await user.click(screen.getByTestId('export-purpose-point-in-time'));
        expect(screen.getByText(/Snapshot export cannot apply the Control form: Automatic/)).toBeVisible();
        expect(screen.getByTestId('export-submit-button')).toBeDisabled();
        expect(reports).toBe(0);
    });

});
