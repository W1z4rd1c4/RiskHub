import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { assertZeroAxeFindings, toFindings, WCAG_TAGS } from './helpers/axeBaseline';

type Locale = 'en' | 'cs';
const entries = Array.from({ length: 75 }, (_, i) => ({
    id: 1075 - i, kri_id: 177, value: 75 - i, unit: 'units',
    period_start: new Date(Date.UTC(2026, 0, 75 - i)).toISOString().slice(0, 10),
    period_end: new Date(Date.UTC(2026, 0, 75 - i)).toISOString().slice(0, 10),
    recorded_at: new Date(Date.UTC(2026, 0, 75 - i)).toISOString(),
    lower_limit: 0, upper_limit: 100, breach_status: 'within', recorded_by_name: 'Fixture recorder',
}));
async function mockApi(page: Page, locale: Locale, theme: string) {
    let failOlder = true;
    let protectedStatus: number | null = null;
    let releaseOlder!: () => void;
    const pendingOlder = new Promise<void>(resolve => { releaseOlder = resolve; });
    const requests: { offset: number; limit: number }[] = [];
    const user = { id: 177, email: 'history@example.test', name: 'History Reviewer', role: 'admin', role_display_name: 'Administrator', department_id: null, department_name: null, permissions: ['risks:read'], effective_permissions: ['risks:read'], access_scope: 'global', scope_label: 'Global' };
    await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        let body: unknown = {};
        let status = 200;
        if (url.pathname.endsWith('/auth/config')) body = { auth_mode: 'hybrid_dev', demo_login_enabled: true, password_login_enabled: true, strict_capabilities: false, demo_personas: [{ section: 'privileged', name: 'History Reviewer', email: user.email, role_key: 'admin', dept_key: null, color: 'purple' }], sso: { enabled: false, provider: 'entra', tenant_id: null, client_id: null, authority: null, scopes: [] }, sso_error: null };
        else if (/\/auth\/(demo-login|refresh)$/.test(url.pathname)) body = { access_token: 'history-token', token_type: 'bearer', post_login_redirect_to: '/kris/177?tab=history', user };
        else if (url.pathname.endsWith('/auth/csrf')) { await route.fulfill({ status: 204, headers: { 'set-cookie': 'riskhub_csrf_token=fixture-csrf; Path=/; SameSite=Lax' } }); return; }
        else if (url.pathname.endsWith('/auth/me')) body = user;
        else if (url.pathname.endsWith('/preferences')) body = { theme, language: locale };
        else if (url.pathname.endsWith('/users/me/shell-summary')) body = { unread_notifications_count: 0, pending_approvals_count: 0, questionnaire_inbox_count: 0, orphan_total_count: 0, can_view_governance: false, generated_at: '2026-09-01T00:00:00Z' };
        else if (url.pathname === '/api/v1/kris/177') body = { id: 177, risk_id: 1, metric_name: 'History pagination fixture', description: '', current_value: 75, unit: 'units', lower_limit: 0, upper_limit: 100, breach_status: 'within', frequency: 'daily', created_at: '2026-01-01T00:00:00Z', last_updated: '2026-03-16T00:00:00Z', is_archived: false };
        else if (url.pathname === '/api/v1/kris/177/history') {
            const offset = Number(url.searchParams.get('offset'));
            const limit = Number(url.searchParams.get('limit'));
            requests.push({ offset, limit });
            if (protectedStatus) { status = protectedStatus; body = { detail: 'Protected fixture' }; }
            else if (offset === 50 && failOlder) { await pendingOlder; failOlder = false; status = 503; body = { detail: 'Temporary fixture outage' }; }
            else body = { items: entries.slice(offset, offset + limit), total: 75, offset, limit, capabilities: { can_request_correction: true } };
        } else if (url.pathname.startsWith('/api/v1/kris/177/history/')) body = entries.find(entry => url.pathname.endsWith(`/${entry.id}`));
        else { status = 404; body = { detail: 'Not available in fixture' }; }
        await route.fulfill({ status, contentType: 'application/json', headers: url.pathname.endsWith('/auth/demo-login') ? { 'set-cookie': 'riskhub_refresh_hint=1; Path=/; SameSite=Lax' } : {}, body: JSON.stringify(body) });
    });
    return { requests, releaseOlder, setProtectedStatus: (status: number) => { protectedStatus = status; } };
}
async function accessible(page: Page, state: string) {
    const scope = '[data-testid="kri-history-window"]';
    await page.locator(scope).evaluate(async node => {
        await Promise.all(node.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => undefined)));
    });
    const result = await new AxeBuilder({ page }).include(scope).withTags([...WCAG_TAGS]).analyze();
    assertZeroAxeFindings(toFindings(result.violations), state);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBeTruthy();
}
for (const locale of ['en', 'cs'] as const) for (const theme of ['riskhub', 'light', 'dark']) for (const width of [1024, 1440]) {
    test(`KRI history ${locale} ${theme} ${width}: page window, retry, keyboard, URL`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'America/Los_Angeles' });
        await context.addInitScript(({ locale, theme }) => { localStorage.setItem('riskhub-language', locale); localStorage.setItem('riskhub-theme', theme); }, { locale, theme });
        const page = await context.newPage();
        const { requests, releaseOlder, setProtectedStatus } = await mockApi(page, locale, theme);
        const older = locale === 'en' ? 'Older entries' : 'Starší záznamy';
        const newer = locale === 'en' ? 'Newer entries' : 'Novější záznamy';
        const range = locale === 'en' ? 'of' : 'z';
        try {
            await page.goto('/login');
            await page.getByRole('button', { name: 'History Reviewer' }).click();
            await expect(page.getByText(`1–50 ${range} 75`, { exact: true })).toBeVisible();
            await accessible(page, 'first page');
            await page.getByRole('button', { name: older, exact: true }).focus();
            await page.keyboard.press('Enter');
            await expect(page.getByTestId('kri-history-window')).toHaveAttribute('aria-busy', 'true');
            await expect(page.getByRole('button', { name: older, exact: true })).toBeDisabled();
            await accessible(page, 'pending continuation');
            releaseOlder();
            await expect(page.getByTestId('kri-history-load-state')).toBeVisible();
            await expect(page.locator('h4').filter({ hasText: /^75 units$/ })).toHaveCount(0);
            await accessible(page, 'failed continuation');
            await page.getByTestId('kri-history-load-state').getByRole('button').click();
            const lastRange = page.getByText(`51–75 ${range} 75`, { exact: true });
            await expect(lastRange).toBeVisible();
            await expect(lastRange).toBeFocused();
            await expect(page.getByRole('button', { name: older, exact: true })).toBeDisabled();
            await expect(page.locator('h4').filter({ hasText: /^1 units$/ })).toBeVisible();
            await expect(page).toHaveURL(/history_page=2/);
            await accessible(page, 'last page');
            await expect(page.getByText(locale === 'en'
                ? 'Trend shows only this page: Jan 1, 2026 – Jan 25, 2026 (period end dates).'
                : 'Trend zobrazuje pouze tuto stránku: 1. 1. 2026 – 25. 1. 2026 (data konce období).', { exact: true })).toBeVisible();
            await expect(page.getByText(locale === 'en' ? /Comparison choices are limited to this page/ : /Výběr pro porovnání je omezen na tuto stránku/)).toBeVisible();
            await page.getByRole('combobox').first().click();
            await expect(page.getByRole('option')).toHaveCount(25);
            await expect(page.getByRole('option', { name: locale === 'en' ? 'Jan 1, 2026 (1 units)' : '1. 1. 2026 (1 units)', exact: true })).toBeAttached();
            await page.keyboard.press('Escape');
            const corrections = page.getByRole('button', { name: locale === 'en' ? 'Request Correction' : 'Požádat o opravu', exact: false });
            await expect(corrections).toHaveCount(25);
            await corrections.last().click();
            const dialog = page.getByRole('dialog');
            await expect(dialog.getByText(locale === 'en' ? 'Period: Jan 1, 2026' : 'Období: 1. 1. 2026', { exact: true })).toBeVisible();
            await dialog.getByRole('spinbutton').fill('2');
            await dialog.getByRole('textbox').fill('Correct the oldest period from the source ledger');
            const correctionRequest = page.waitForRequest(request => request.method() === 'PATCH' && request.url().includes('/kris/177/history/1001'));
            await dialog.getByRole('button', { name: locale === 'en' ? 'Submit Correction' : 'Odeslat opravu', exact: true }).click();
            expect((await correctionRequest).postDataJSON()).toEqual({ value: 2, reason: 'Correct the oldest period from the source ledger' });
            await expect(dialog).not.toBeVisible();
            await page.reload();
            await expect(lastRange).toBeVisible();
            await page.getByRole('button', { name: newer, exact: true }).click();
            await expect(page.getByText(`1–50 ${range} 75`, { exact: true })).toBeVisible();
            await page.goBack();
            await expect(lastRange).toBeVisible();
            await page.goForward();
            await expect(page.getByText(`1–50 ${range} 75`, { exact: true })).toBeVisible();
            setProtectedStatus(403);
            await page.getByRole('button', { name: older, exact: true }).click();
            await expect(page.getByText(locale === 'en' ? 'Access denied to history page 2' : 'Přístup ke stránce historie 2 byl odepřen', { exact: true })).toBeVisible();
            await expect(page.getByText(locale === 'en' ? 'You do not have permission to view history.' : 'Nemáte oprávnění zobrazit historii.', { exact: true })).toBeVisible();
            await expect(page.getByTestId('kri-history-load-state').getByRole('button')).toHaveCount(0);
            await accessible(page, 'denied continuation');
            setProtectedStatus(404);
            await page.reload();
            await expect(page.getByText(locale === 'en' ? 'History page 2 is unavailable' : 'Stránka historie 2 není dostupná', { exact: true })).toBeVisible();
            await expect(page.getByText(locale === 'en' ? 'You do not have permission to view history.' : 'Nemáte oprávnění zobrazit historii.', { exact: true })).toHaveCount(0);
            await expect(page.getByTestId('kri-history-load-state').getByRole('button')).toHaveCount(0);
            await accessible(page, 'non-leaky unavailable continuation');
            expect(requests.every(request => request.limit === 50)).toBeTruthy();
            expect(requests.some(request => request.offset === 50)).toBeTruthy();
        } finally { releaseOlder(); await context.close(); }
    });
}
