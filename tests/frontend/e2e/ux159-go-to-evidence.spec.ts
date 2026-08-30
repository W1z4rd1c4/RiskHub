import { expect, test, type Browser, type Page, type Route } from '@playwright/test';

type Locale = 'en' | 'cs';

type JourneyState = {
    fanOutRequests: string[];
    includeRecord: boolean;
    locale: Locale;
    permissions: string[];
    recordQueries: string[];
    trackSearchFanOut: boolean;
    vendorAttempts: number;
    vendorShouldFail: boolean;
};

const registerListPaths = new Set([
    '/api/v1/assets',
    '/api/v1/controls',
    '/api/v1/issues',
    '/api/v1/kris',
    '/api/v1/processes',
    '/api/v1/risks',
    '/api/v1/threats',
    '/api/v1/vendors',
]);

const fullPermissions = [
    'activity_log:read',
    'assets:read',
    'controls:read',
    'departments:read',
    'issues:read',
    'processes:read',
    'risks:read',
    'threats:read',
    'users:write',
    'vendors:read',
];

const labels = {
    en: {
        accessDenied: 'Access Denied',
        accessDeniedDescription: 'Access denied.',
        destination: 'KRIs Risk appetite monitoring',
        destinationGroup: 'Destinations',
        displayName: 'Vendor outage',
        evidenceLinks: [
            ['/activity-log', 'Open Activity Log'],
            ['/audit-trail', 'Open Control Execution History'],
            ['/vendor-reports', 'Open Vendor Reports'],
        ] as const,
        goTo: 'Go to',
        notFound: 'Page not found',
        query: 'appetite',
        record: 'Risk RSK-159 Vendor outage Active',
        recordGroup: 'Records',
        retry: 'Retry',
        search: 'Search destinations and records',
    },
    cs: {
        accessDenied: 'Přístup zamítnut',
        accessDeniedDescription: 'Přístup odepřen.',
        destination: 'KRI Sledování rizikového apetitu',
        destinationGroup: 'Cíle navigace',
        displayName: 'Výpadek dodavatele',
        evidenceLinks: [
            ['/activity-log', 'Otevřít záznam aktivit'],
            ['/audit-trail', 'Otevřít historii provedení kontrol'],
            ['/vendor-reports', 'Otevřít reporty dodavatelů'],
        ] as const,
        goTo: 'Přejít na',
        notFound: 'Stránka nebyla nalezena',
        query: 'apetitu',
        record: 'Riziko RSK-159 Výpadek dodavatele Aktivní',
        recordGroup: 'Záznamy',
        retry: 'Zkusit znovu',
        search: 'Hledat cíle navigace a záznamy',
    },
} as const;

function json(route: Route, body: unknown, status = 200, headers?: Record<string, string>) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
    });
}

function buildUser(permissions: string[]) {
    return {
        id: 159,
        email: 'journey@example.test',
        name: 'Journey User',
        role: 'cro',
        role_display_name: 'Chief Risk Officer',
        department_id: null,
        department_name: null,
        permissions,
        effective_permissions: permissions,
        access_scope: 'global',
        scope_label: 'Global',
    };
}

async function installMockApi(page: Page, state: JourneyState) {
    await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (state.trackSearchFanOut && request.method() === 'GET' && registerListPaths.has(url.pathname)) {
            state.fanOutRequests.push(url.pathname);
        }

        if (url.pathname === '/api/v1/auth/config') {
            await json(route, {
                auth_mode: 'hybrid_dev',
                demo_login_enabled: true,
                password_login_enabled: true,
                strict_capabilities: false,
                demo_personas: [{
                    section: 'privileged',
                    name: 'Journey User',
                    email: 'journey@example.test',
                    role_key: 'cro',
                    dept_key: null,
                    color: 'purple',
                }],
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
            return;
        }

        if (url.pathname === '/api/v1/auth/demo-login' || url.pathname === '/api/v1/auth/refresh') {
            await json(route, {
                access_token: 'ux159-browser-token',
                token_type: 'bearer',
                post_login_redirect_to: '/ux159-start',
                user: buildUser(state.permissions),
            }, 200, {
                'set-cookie': 'riskhub_refresh_hint=1; Path=/; SameSite=Lax',
            });
            return;
        }

        if (url.pathname === '/api/v1/auth/me') {
            await json(route, buildUser(state.permissions));
            return;
        }

        if (url.pathname === '/api/v1/preferences') {
            await json(route, { theme: 'riskhub', language: state.locale });
            return;
        }

        if (url.pathname === '/api/v1/users/me/shell-summary') {
            await json(route, {
                unread_notifications_count: 0,
                pending_approvals_count: 0,
                questionnaire_inbox_count: 0,
                orphan_total_count: 0,
                can_view_governance: state.permissions.includes('users:write'),
                generated_at: '2026-08-31T12:00:00Z',
            });
            return;
        }

        if (url.pathname === '/api/v1/go-to/records') {
            const query = url.searchParams.get('q') ?? '';
            state.recordQueries.push(query);
            await json(route, state.includeRecord ? [{
                entity_type: 'risk',
                business_identifier: 'RSK-159',
                display_name: labels[state.locale].displayName,
                status: 'active',
                destination: '/risks/84',
            }] : []);
            return;
        }

        if (url.pathname === '/api/v1/executions') {
            await json(route, {
                items: [],
                total: 0,
                skip: 0,
                limit: 1,
                capabilities: { can_read: true, can_export_csv: false },
            });
            return;
        }

        if (url.pathname === '/api/v1/vendor-reports/capabilities') {
            state.vendorAttempts += 1;
            if (state.vendorShouldFail) {
                await json(route, { detail: 'temporary capability failure' }, 503);
            } else {
                await json(route, {
                    can_read: true,
                    can_download_annual_report: true,
                    can_download_dora_register: true,
                    can_use_department_filter: false,
                });
            }
            return;
        }

        if (registerListPaths.has(url.pathname)) {
            await json(route, { items: [], total: 0, skip: 0, offset: 0, limit: 20 });
            return;
        }

        await json(route, { detail: 'not mocked by the bounded UX-159 journey' }, 404);
    });
}

async function openAuthenticatedJourney(
    browser: Browser,
    locale: Locale,
    permissions: string[],
    includeRecord: boolean,
) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((language) => {
        localStorage.setItem('riskhub-language', language);
        localStorage.setItem('riskhub-theme', 'riskhub');
    }, locale);
    const page = await context.newPage();
    const state: JourneyState = {
        fanOutRequests: [],
        includeRecord,
        locale,
        permissions,
        recordQueries: [],
        trackSearchFanOut: false,
        vendorAttempts: 0,
        vendorShouldFail: false,
    };
    await installMockApi(page, state);
    await page.goto('/login?returnTo=%2Fux159-start');
    await page.getByRole('button', { name: /Journey User/ }).click();
    await expect(page).toHaveURL(/\/ux159-start$/);
    await expect(page.getByRole('button', { name: labels[locale].goTo, exact: true })).toBeVisible();
    return { context, page, state };
}

async function exerciseLocalizedGoTo(page: Page, state: JourneyState) {
    const copy = labels[state.locale];
    const trigger = page.getByRole('button', { name: copy.goTo, exact: true });

    await trigger.focus();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: copy.goTo });
    const search = dialog.getByRole('combobox', { name: copy.search });
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    await page.keyboard.press(state.locale === 'en' ? 'Meta+K' : 'Control+K');
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();

    state.trackSearchFanOut = true;
    await search.fill(copy.query);
    await expect.poll(() => state.recordQueries.length).toBe(1);
    await expect(dialog.getByRole('listbox')).toHaveCount(1);
    await expect(dialog.getByRole('group', { name: copy.destinationGroup })).toBeVisible();
    await expect(dialog.getByRole('group', { name: copy.recordGroup })).toBeVisible();
    await expect(dialog.getByRole('option', { name: copy.destination })).toBeVisible();
    const recordOption = dialog.getByRole('option', { name: copy.record });
    await expect(recordOption).toBeVisible();
    await expect(recordOption).not.toContainText('84');
    await expect(recordOption).toContainText('RSK-159');
    expect(await recordOption.getAttribute('aria-label')).not.toContain('84');
    expect(state.fanOutRequests).toEqual([]);

    state.trackSearchFanOut = false;
    await search.press('ArrowUp');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/kris$/);

    await page.goBack();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(search).toBeFocused();
    state.trackSearchFanOut = true;
    await search.fill(copy.query);
    await expect.poll(() => state.recordQueries.length).toBe(2);
    expect(state.recordQueries).toEqual([copy.query, copy.query]);
    expect(state.fanOutRequests).toEqual([]);

    state.trackSearchFanOut = false;
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/risks\/84$/);
}

async function navigateWithinApp(page: Page, pathname: string) {
    await page.evaluate((nextPathname) => {
        window.history.pushState({}, '', nextPathname);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, pathname);
    await expect(page).toHaveURL(new RegExp(`${pathname.replaceAll('/', '\\/')}$`));
}

test('desktop Go To and Evidence journey is localized, capability-safe, and request-bounded', async ({ browser }) => {
    test.setTimeout(120_000);

    for (const locale of ['en', 'cs'] as const) {
        const { context, page, state } = await openAuthenticatedJourney(
            browser,
            locale,
            fullPermissions,
            true,
        );

        await exerciseLocalizedGoTo(page, state);

        if (locale === 'en') {
            state.vendorShouldFail = true;
            state.vendorAttempts = 0;
            await navigateWithinApp(page, '/evidence');
            await expect(page.getByRole('heading', { name: 'Evidence & Reports' })).toBeVisible();
            await expect(page.getByRole('button', { name: labels.en.retry })).toBeVisible();
            const attemptsBeforeRetry = state.vendorAttempts;
            state.vendorShouldFail = false;
            await page.getByRole('button', { name: labels.en.retry }).click();
            await expect.poll(() => state.vendorAttempts).toBeGreaterThan(attemptsBeforeRetry);

            const evidenceLinks = page.locator('main article a');
            await expect(evidenceLinks).toHaveCount(3);
            for (const [href, name] of labels.en.evidenceLinks) {
                await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
            }

            await navigateWithinApp(page, '/ux159-not-a-route');
            await expect(page.getByRole('heading', { name: labels.en.notFound })).toBeVisible();
        }

        await context.close();
    }

    const limited = await openAuthenticatedJourney(browser, 'en', ['risks:read'], false);
    const limitedTrigger = limited.page.getByRole('button', { name: labels.en.goTo, exact: true });
    await limitedTrigger.click();
    const limitedDialog = limited.page.getByRole('dialog', { name: labels.en.goTo });
    const limitedSearch = limitedDialog.getByRole('combobox', { name: labels.en.search });
    limited.state.trackSearchFanOut = true;
    await limitedSearch.fill('controls');
    await expect.poll(() => limited.state.recordQueries.length).toBe(1);
    await expect(limitedDialog.getByRole('option', { name: /Controls/ })).toHaveCount(0);
    await expect(limitedDialog.getByText('Quarterly access review')).toHaveCount(0);
    expect(limited.state.fanOutRequests).toEqual([]);

    limited.state.trackSearchFanOut = false;
    await navigateWithinApp(limited.page, '/audit-trail');
    await expect(limited.page.getByRole('heading', { name: labels.en.accessDenied })).toBeVisible();
    await expect(limited.page.getByText(labels.en.accessDeniedDescription, { exact: true })).toBeVisible();
    await expect(limited.page.getByText('Control Execution History')).toHaveCount(0);
    await expect(limited.page.getByText('Activity Log')).toHaveCount(0);
    await limited.context.close();
});
