import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { nativeEnroll, nativeLogin } from './setup/native_browser_helpers';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const root = process.env.NATIVE_E2E_ROOT;
const python = process.env.NATIVE_E2E_PYTHON;
test.skip(!root || !python, 'Requires a fresh loopback native fixture and backend Python interpreter');

async function lifecycle(page: Page, email: string) {
    const row = page.getByRole('row').filter({ hasText: email });
    await row.getByRole('button', { name: /account lifecycle/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /refresh account status/i })).toBeEnabled();
    return dialog;
}
async function action(page: Page, name: RegExp, complete: RegExp) {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name }).click();
    await expect(dialog.getByLabel(/^reason/i)).toBeFocused();
    await dialog.getByLabel(/^reason/i).fill('INC-206: verified operator request');
    await dialog.getByRole('button', { name: /confirm account action/i }).click();
    await expect(dialog.getByText(complete)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /refresh account status/i })).toBeEnabled();
}

test('native administrator onboarding, lifecycle, recovery and EN/CS desktop accessibility', async ({ page, browser, request }, info) => {
    test.setTimeout(180_000);
    const config = await (await request.get('/api/v1/auth/config')).json();
    const required = config.local_mfa_policy === 'required';
    const handoff = JSON.parse(readFileSync(resolve(root!, 'handoff/admin.json'), 'utf8'));
    const password = 'Admin browser acceptance passphrase 83!';
    const codes = await nativeEnroll(page, handoff.credential, password, required);
    await nativeLogin(page, 'native-admin@example.com', password, codes[0]);
    await page.goto('/users');
    await page.getByRole('button', { name: /add user/i }).click();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('native-admin-create-1024.png') });
    await page.getByLabel(/full name/i).fill('Native colleague');
    await page.getByLabel(/^email/i).fill('native-colleague@example.com');
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/Account created/)).toBeVisible();
    await page.getByRole('link', { name: /view users/i }).click();
    let dialog = await lifecycle(page, 'native-colleague@example.com');
    await expect(dialog.getByText(/Invited; recipient setup pending/)).toBeVisible();
    await action(page, /resend invitation/i, /New invitation created/);
    await action(page, /cancel invitation/i, /Invitation cancelled/);
    await expect(dialog.getByText(/Link cancelled/)).toBeVisible();
    await action(page, /resend invitation/i, /New invitation created/);
    execFileSync(python!, [resolve('../tests/frontend/e2e/setup/native_mail_handoff.py'), '--root', root!,
        '--email', 'native-colleague@example.com', '--output-name', 'colleague.json'], { stdio: 'pipe' });
    const invitation = JSON.parse(readFileSync(resolve(root!, 'handoff/colleague.json'), 'utf8'));
    const recipient = await browser.newContext({ baseURL: process.env.FRONTEND_URL });
    try {
        await nativeEnroll(await recipient.newPage(), invitation.credential, 'Recipient-only password 63!', required);
    } finally { await recipient.close(); }
    await dialog.getByRole('button', { name: /refresh account status/i }).click();
    await expect(dialog.getByText('Setup complete', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel(/email address/i)).toBeDisabled();
    await dialog.getByLabel(/full name/i).fill('Updated native colleague');
    await dialog.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'native-colleague@example.com' })).toContainText('Updated native colleague');
    dialog = await lifecycle(page, 'native-colleague@example.com');
    await action(page, /suspend account/i, /Account suspended; sessions revoked/);
    await action(page, /resume account/i, /Local suspension removed/);
    await action(page, /send password reset link/i, /Password reset request accepted/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dialog.getByRole('button', { name: /start assisted recovery/i }).click();
    await dialog.getByLabel(/^reason/i).fill('INC-206: independently verified lost factor');
    await dialog.getByLabel(/incident reference/i).fill('INC-206');
    await dialog.getByLabel(/identity verification method/i).fill('Approved in-person operator procedure');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('native-admin-recovery-1440.png') });
    await dialog.getByLabel(/your administrator password/i).fill(password);
    if (required) {
        await dialog.getByLabel(/^verification method/i).selectOption('recovery_code');
        await dialog.getByLabel(/your authenticator or recovery code/i).fill(codes[1]);
    }
    await dialog.getByRole('button', { name: /confirm account action/i }).click();
    await expect(dialog.getByText(/Recovery request accepted/)).toBeVisible();
    await expect(dialog.getByText('Recovery pending; sign-in is blocked', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: /^close$/i }).click();
    dialog = await lifecycle(page, 'native-admin@example.com');
    await expect(dialog.getByText(/two-operator recovery procedure/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /start assisted recovery/i })).toHaveCount(0);
    await dialog.getByRole('button', { name: /^close$/i }).click();
    await page.goto('/settings?tab=localization');
    await page.getByTestId('language-cs').click();
    await page.goto('/users');
    for (const width of [1024, 1440]) {
        await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
        await page.getByRole('row').filter({ hasText: 'native-colleague@example.com' }).getByRole('button', { name: 'Životní cyklus účtu' }).click();
        await expect(page.getByRole('dialog').getByText('Probíhá obnovení; přihlášení je blokováno', { exact: true })).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`native-admin-status-cs-${width}.png`) });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, state: history.state }));
    expect([handoff.credential, invitation.credential, password, ...codes].some((secret) => stored.includes(secret))).toBe(false);
});
