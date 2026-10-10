import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { AuthProviderWithReady, waitForAuthBootstrapReady } from '@test/authBootstrap';
import { server } from '@test/mocks/server';
import { createTestQueryClient } from '@test/queryClient';
import { clearAccessToken, setAccessToken } from '@test/accessTokenStoreHarness';
import { clearBootstrapSession } from '@/services/session/coordinator';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ControlsPage } from '@/pages/ControlsPage';
import { KRIsPage } from '@/pages/KRIsPage';

/**
 * W8 PM review: grouping the Control and KRI registers by risk type shows the
 * same display name as the Risk register (translated built-in type, else the
 * configured Risk Hub name) instead of the raw risk-type code.
 */

vi.mock('@/utils/userSettingsStorage', async () => {
    const actual = await vi.importActual<typeof import('@/utils/userSettingsStorage')>('@/utils/userSettingsStorage');
    return {
        ...actual,
        syncPreferencesFromServer: vi.fn(async () => undefined),
        clearLocalSettings: vi.fn(),
    };
});

const user = {
    id: 123,
    email: 'test.user@riskhub.test',
    name: 'Test User',
    role: 'employee',
    role_display_name: 'Employee',
    permissions: [],
    effective_permissions: ['controls:read', 'risks:read'],
    access_scope: 'department',
    scope_label: 'dept',
};

const groups = [
    { value: 'operational', label: 'operational', count: 2, active_count: 2, highlighted_count: 0 },
    { value: 'it_security', label: 'it_security', count: 1, active_count: 1, highlighted_count: 0 },
    { value: '__unknown_risk_type__', label: '__unknown_risk_type__', count: 1, active_count: 1, highlighted_count: 0 },
];

// "Grouped by risk": each card's meta line names the risk's type.
const riskGroups = [
    { value: 'Claims risk', label: 'Claims risk', count: 1, meta: { risk_type: 'operational', risk_department_name: 'Claims', risk_owner_name: 'Dana' } },
    { value: 'Cyber risk', label: 'Cyber risk', count: 1, meta: { risk_type: 'it_security', risk_department_name: 'IT', risk_owner_name: 'Eva' } },
];

function installHandlers(collection: 'controls' | 'kris', responseGroups: unknown[] = groups) {
    server.use(
        http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
        http.get('*/api/v1/riskhub/public-risk-types', () => HttpResponse.json([
            { code: 'operational', display_name: 'Configured operational name', color: '#3b82f6', icon: null, sort_order: 1 },
            { code: 'it_security', display_name: 'IT Security', color: '#ef4444', icon: null, sort_order: 2 },
        ])),
        http.get(`*/api/v1/${collection}`, () => HttpResponse.json({
            items: [], total: 4, offset: 0, limit: 20, groups: responseGroups,
        })),
    );
}

async function renderRegister(path: string, element: ReactElement, route: string) {
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <MemoryRouter initialEntries={[route]}>
                <AuthProviderWithReady>
                    <LanguageProvider>
                        <DashboardFilterProvider>
                            <Routes>
                                <Route path={path} element={element} />
                            </Routes>
                        </DashboardFilterProvider>
                    </LanguageProvider>
                </AuthProviderWithReady>
            </MemoryRouter>
        </QueryClientProvider>,
    );
    await waitForAuthBootstrapReady();
}

async function expectRiskTypeGroupLabels() {
    // Built-in type: the translated label, as on the Risk register.
    expect(await screen.findByText('Operational')).toBeInTheDocument();
    // Custom type: the configured Risk Hub display name.
    expect(await screen.findByText('IT Security')).toBeInTheDocument();
    expect(screen.queryByText('operational')).not.toBeInTheDocument();
    expect(screen.queryByText('it_security')).not.toBeInTheDocument();
    expect(screen.queryByText('__unknown_risk_type__')).not.toBeInTheDocument();
}

describe('Control and KRI registers grouped by risk type', () => {
    beforeEach(() => {
        clearBootstrapSession();
        setAccessToken('test-token');
    });

    afterEach(() => {
        clearAccessToken();
        clearBootstrapSession();
    });

    it('labels Control risk-type groups with the risk-type display name', async () => {
        installHandlers('controls');
        await renderRegister('/controls', <ControlsPage />, '/controls?view=risk_type');
        await expectRiskTypeGroupLabels();
    });

    it('labels KRI risk-type groups with the risk-type display name', async () => {
        installHandlers('kris');
        await renderRegister('/kris', <KRIsPage />, '/kris?view=risk_type');
        await expectRiskTypeGroupLabels();
    });

    it.each([
        ['controls', '/controls', <ControlsPage key="controls" />],
        ['kris', '/kris', <KRIsPage key="kris" />],
    ] as const)('names the risk type on %s grouped by risk', async (collection, path, element) => {
        installHandlers(collection, riskGroups);
        await renderRegister(path, element, `${path}?view=risk`);
        expect(await screen.findByText('Claims risk')).toBeInTheDocument();
        await expectRiskTypeGroupLabels();
    });
});
