import { expect, test, type Locator, type Page } from '@playwright/test';

async function installNotifications(page: Page, count: number, pending = false) {
    const permissions = ['kris:read'];
    const user = { id: 180, email: 'notifications@example.test', name: 'Notification operator', role: 'cro',
        role_display_name: 'CRO', department_id: null, department_name: null, permissions,
        effective_permissions: permissions, access_scope: 'global', scope_label: 'Global' };
    const items = Array.from({ length: count }, (_, index) => ({
        id: index + 1, type: 'governed_approval_action_required', title: `Review request ${index + 1}`,
        message: `Delivered process change ${index + 1}`, resource_type: 'approval', resource_id: index + 1,
        is_read: false, created_at: '2026-10-12T13:00:00Z', expires_at: null,
    }));
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    await page.addInitScript(() => localStorage.setItem('riskhub-language', 'en'));
    await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url());
        const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
        if (url.pathname === '/api/v1/auth/config') return json({ auth_mode: 'hybrid_dev', demo_login_enabled: true,
            password_login_enabled: false, demo_personas: [{ section: 'privileged', name: user.name,
                email: user.email, role_key: 'cro', dept_key: null, color: 'purple' }],
            sso: { enabled: false, provider: 'entra', scopes: [] } });
        if (url.pathname === '/api/v1/auth/refresh' || url.pathname === '/api/v1/auth/demo-login') {
            return json({ access_token: 'notification-layout-token', token_type: 'bearer',
                post_login_redirect_to: '/kris/180', user });
        }
        if (url.pathname === '/api/v1/auth/me') return json(user);
        if (url.pathname === '/api/v1/auth/csrf') return route.fulfill({ status: 204 });
        if (url.pathname === '/api/v1/preferences') return json({ theme: 'riskhub', language: 'en' });
        if (url.pathname === '/api/v1/users/me/shell-summary') return json({ unread_notifications_count: count,
            pending_approvals_count: 0, questionnaire_inbox_count: 0, orphan_total_count: 0,
            can_view_governance: false, generated_at: '2026-10-12T13:00:00Z' });
        if (url.pathname === '/api/v1/kris/180') return json({ detail: 'Not found' }, 404);
        if (url.pathname === '/api/v1/notifications') {
            const limit = Number(url.searchParams.get('limit'));
            if (pending && limit === 10) await delayed;
            return json({ items, total: count, skip: 0, limit, unread_count: count });
        }
        throw new Error(`Unexpected fixture request: ${route.request().method()} ${url.pathname}`);
    });
    await page.goto('/login');
    await page.getByRole('button', { name: user.name }).click();
    await expect(page).toHaveURL(/\/kris\/180$/);
    await expect(page.getByTestId('notification-bell-button')).toBeVisible();
    return release;
}

async function expectChromeInViewport(panel: Locator) {
    await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(panel.getByTestId('notification-view-all-button')).toBeInViewport({ ratio: 1 });
    await expect(panel.getByRole('button', { name: 'Mark all as read', exact: true })).toBeInViewport({ ratio: 1 });
}

async function openInbox(page: Page, activate: () => Promise<void>) {
    const loaded = page.waitForResponse(response => {
        const url = new URL(response.url());
        return response.request().method() === 'GET' && url.pathname === '/api/v1/notifications'
            && url.searchParams.get('limit') === '20';
    });
    await activate();
    expect((await loaded).status()).toBe(200);
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByTestId('notification-dropdown-panel')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
}

for (const height of [720, 480]) {
    for (const count of [6, 10]) {
        test(`${count} loaded notifications keep header and footer actionable at 1280x${height}`, async ({ page }) => {
            await page.setViewportSize({ width: 1280, height });
            await installNotifications(page, count);
            await page.getByTestId('notification-bell-button').click();
            const panel = page.getByTestId('notification-dropdown-panel');
            await expect(panel.getByText(`Review request ${count}`, { exact: true })).toHaveCount(1);
            await expectChromeInViewport(panel);
            // Reaching the last list action scrolls the list without losing either fixed action region.
            await panel.getByRole('button', { name: 'Mark as read', exact: true }).last().focus();
            await expect(panel.getByRole('button', { name: 'Mark as read', exact: true }).last()).toBeInViewport();
            await expectChromeInViewport(panel);
            await page.setViewportSize({ width: 1280, height: height === 720 ? 480 : 720 });
            await expectChromeInViewport(panel);
            await openInbox(page, () => panel.getByTestId('notification-view-all-button').click());
            await expect(page.getByText(`Review request ${count}`, { exact: true })).toBeVisible();
        });
    }

    test(`pending-to-loaded list retains keyboard access at 1280x${height}`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height });
        const release = await installNotifications(page, 10, true);
        const bell = page.getByTestId('notification-bell-button');
        await bell.focus();
        await page.keyboard.press('Enter');
        const panel = page.getByTestId('notification-dropdown-panel');
        await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({ ratio: 1 });
        await expect(panel.getByTestId('notification-view-all-button')).toBeInViewport({ ratio: 1 });
        await page.keyboard.press('Tab');
        await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
        release();
        await expect(panel.getByText('Review request 10', { exact: true })).toHaveCount(1);
        await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
        await expectChromeInViewport(panel);
        // Close -> ten (link, mark-read) pairs -> mark-all -> View all.
        for (let index = 0; index < 22; index++) await page.keyboard.press('Tab');
        await expect(panel.getByTestId('notification-view-all-button')).toBeFocused();
        await expectChromeInViewport(panel);
        await page.keyboard.press('Escape');
        await expect(panel).toHaveCount(0);
        await expect(bell).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(panel.getByText('Review request 10', { exact: true })).toHaveCount(1);
        for (let index = 0; index < 23; index++) await page.keyboard.press('Tab');
        await expect(panel.getByTestId('notification-view-all-button')).toBeFocused();
        await openInbox(page, () => page.keyboard.press('Enter'));
    });
}
