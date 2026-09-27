import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { renderedContrast } from './helpers/renderedContrast';

// Real app/router/download pipeline, controlled network responses (no seed dependency).
const exportName = 'Export Overview summary (CSV)';
const overview = {
    summary: {
        total_controls: 0, controls_by_status: {}, controls_by_form: {}, controls_by_frequency: {},
        total_risks: 0, risks_by_status: {}, critical_risks_count: 0, average_net_risk_score: 0,
        risk_thresholds: { critical: 20, high: 12, medium: 6 },
    },
    department_metrics: [], gross_distribution: { distribution: [] }, net_distribution: { distribution: [] },
    control_trends: [], risk_trends: [], kri_breach_trends: [],
    issue_summary: null, issue_aging: null, issue_severity: null,
    generated_at: '2026-09-27T10:00:00Z',
    filter_scope: { department_applies_to_all_scoped_panels: true, risk_level_applies_to: ['risks'], control_filters_apply_to: ['controls'], unaffected_by_risk_control: ['kri', 'issues', 'vendors'] },
    capabilities: {
        can_read: true, can_view_issue_metrics: false, can_view_committee: true,
        can_view_vendor_metrics: false, can_use_department_filter: true, can_export_or_report: true,
    },
};

async function mockDashboard(page: Page, options: { allowed?: boolean; theme?: string; language?: string } = {}) {
    const user = {
        id: 42, email: 'reviewer@example.test', name: 'Dashboard Reviewer', role: 'cro', role_display_name: 'CRO',
        permissions: ['dashboard:read', 'ict_committee:read', 'reports:read'],
        effective_permissions: ['dashboard:read', 'ict_committee:read', 'reports:read'],
        access_scope: 'global', scope_label: 'Global',
    };
    const overviewRequests: string[] = [];
    await page.addInitScript(() => { document.cookie = 'riskhub_refresh_hint=1; path=/'; });
    await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let json: unknown;
        if (path === '/api/v1/auth/config') {
            json = { auth_mode: 'hybrid_dev', demo_login_enabled: true, password_login_enabled: true,
                strict_capabilities: false, sso: { enabled: false, provider: 'entra', scopes: [] } };
        } else if (path === '/api/v1/auth/refresh') {
            json = { access_token: 'test-dashboard-token', token_type: 'bearer', user };
        } else if (path === '/api/v1/auth/me') {
            json = user;
        } else if (path === '/api/v1/auth/csrf') {
            await route.fulfill({ status: 204, headers: { 'set-cookie': 'riskhub_csrf_token=test-csrf; Path=/' } });
            return;
        } else if (path === '/api/v1/preferences') {
            json = { theme: options.theme ?? 'riskhub', language: options.language ?? 'en' };
        } else if (path === '/api/v1/dashboard/overview') {
            overviewRequests.push(route.request().url());
            json = { ...overview, capabilities: { ...overview.capabilities, can_export_or_report: options.allowed ?? true } };
        } else if (path === '/api/v1/lookups/departments') {
            json = [{ id: 7, name: 'Operations' }];
        } else if (path === '/api/v1/notifications/unread-count' || path.endsWith('/pending/count')) {
            json = { count: 0 };
        } else {
            // Other widget failures must not expose an Overview action on committee views.
            await route.fulfill({ status: 503, json: { detail: 'Widget unavailable in export ownership fixture' } });
            return;
        }
        await route.fulfill({ json });
    });
    return overviewRequests;
}

for (const view of ['risk-committee', 'ict-committee']) {
    test(`Overview export stays hidden on cold/reloaded/warm/history ${view}`, async ({ page }) => {
        const requests = await mockDashboard(page);
        const tabName = view === 'risk-committee' ? 'Risk Committee' : 'ICT Committee';
        await page.goto(`/?view=${view}`);
        await expect(page.getByRole('button', { name: tabName, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: exportName })).toHaveCount(0);
        expect(requests).toHaveLength(0);
        await page.reload();
        await expect(page.getByRole('button', { name: tabName, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: exportName })).toHaveCount(0);
        expect(requests).toHaveLength(0);
        await page.getByRole('button', { name: 'Overview', exact: true }).click();
        await expect(page.getByRole('button', { name: exportName })).toBeVisible();
        await page.getByRole('button', { name: tabName, exact: true }).click();
        await expect(page.getByRole('button', { name: exportName })).toHaveCount(0);
        await page.goBack();
        await expect(page.getByRole('button', { name: exportName })).toBeVisible();
        const count = requests.length;
        await page.goForward();
        await expect(page.getByRole('button', { name: exportName })).toHaveCount(0);
        expect(requests).toHaveLength(count);
    });
}

test('backend denial hides the Overview export', async ({ page }) => {
    await mockDashboard(page, { allowed: false });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: exportName })).toHaveCount(0);
});

test('delayed failure and retry keep original normalized filters across filter/history/view changes', async ({ page }) => {
    await mockDashboard(page);
    let releaseFailure!: () => void;
    const pending = new Promise<void>((resolve) => { releaseFailure = resolve; });
    const exports: string[] = [];
    await page.route('**/api/v1/reports/summary/export?**', async (route) => {
        exports.push(route.request().url());
        if (exports.length === 1) {
            await pending;
            await route.fulfill({ status: 503, json: { detail: 'Export unavailable' } });
        } else {
            await route.fulfill({ contentType: 'text/csv', body: 'Generated At,2026-09-27T10:01:00Z\n' });
        }
    });
    await page.goto('/?departmentId=007&riskLevel=high&controlStatus=active&controlForm=manual');
    const button = page.getByRole('button', { name: exportName });
    await button.click();
    await expect.poll(() => exports.length).toBe(1);
    await expect(button).toBeDisabled();
    await page.getByRole('button', { name: 'Clear All', exact: true }).click();
    await page.goBack();
    await page.goForward();
    await expect(button).toBeDisabled();
    await page.getByRole('button', { name: 'Risk Committee', exact: true }).click();
    releaseFailure();
    await expect(page.getByRole('button', { name: exportName })).toHaveCount(0);
    await expect(page.getByText('Overview summary CSV export failed.', { exact: false })).toHaveCount(0);
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Overview summary CSV export failed.' });
    await expect(alert).toBeVisible();
    const download = page.waitForEvent('download');
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('dashboard-summary.csv');
    expect(exports).toHaveLength(2);
    expect(exports[1]).toBe(exports[0]);
    expect(Object.fromEntries(new URL(exports[0]).searchParams)).toEqual({
        format: 'csv', department_id: '7', risk_level: 'high', control_status: 'active', control_form: 'manual',
    });
    await expect(alert).toHaveCount(0);
});

for (const language of ['en', 'cs']) {
    for (const theme of ['riskhub', 'light', 'dark']) {
        for (const width of [1024, 1440]) {
            test(`export/retry accessibility ${language} ${theme} ${width}`, async ({ page }) => {
                await page.setViewportSize({ width, height: 900 });
                await mockDashboard(page, { language, theme });
                await page.route('**/api/v1/reports/summary/export?**', (route) => route.fulfill({ status: 503, json: { detail: 'Export unavailable' } }));
                await page.goto('/');
                const label = language === 'en' ? exportName : 'Exportovat souhrn přehledu (CSV)';
                const button = page.getByRole('button', { name: label, exact: true });
                await expect(button).toBeVisible();
                await expect(button).toHaveText(label);
                expect(await renderedContrast(button.locator('span'))).toBeGreaterThanOrEqual(4.5);
                await button.hover();
                await button.evaluate(async (element) => {
                    await Promise.all(element.getAnimations().map((animation) => animation.finished));
                });
                expect(await renderedContrast(button.locator('span'))).toBeGreaterThanOrEqual(4.5);
                await button.focus();
                await expect(button).toBeFocused();
                await page.keyboard.press('Enter');
                const alert = page.getByRole('alert').filter({ hasText: language === 'en' ? 'Overview summary CSV export failed.' : 'Export souhrnu přehledu do CSV selhal.' });
                await expect(alert).toBeVisible();
                expect(await renderedContrast(alert.locator('p'))).toBeGreaterThanOrEqual(4.5);
                const bounds = await button.boundingBox();
                expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width).toBeTruthy();
                const audit = await new AxeBuilder({ page })
                    .include(`button[title="${label}"]`).include('[role="alert"]')
                    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
                expect(audit.violations).toEqual([]);
            });
        }
    }
}
