import { readFileSync, statSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Grants come from an operator-owned isolated bootstrap handoff, never from source.
// Disable traces and automatic screenshots even if invoked with the general config.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const handoffPath = process.env.NATIVE_E2E_HANDOFF;
test.skip(!handoffPath, 'Requires a fresh isolated native installation and NATIVE_E2E_HANDOFF');

function totp(secret: string): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bits = [...secret.toUpperCase().replace(/=+$/, '')].map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0')).join('');
    const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
    const digest = createHmac('sha1', key).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
async function assertNoBrowserSecrets(page: Page, secrets: string[]) {
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, state: window.history.state }));
    expect(secrets.some((secret) => stored.includes(secret))).toBe(false);
    expect(secrets.some((secret) => page.url().includes(secret))).toBe(false);
}
async function login(page: Page, email: string, password: string, backup?: string) {
    await page.goto('/login');
    await page.getByLabel(/^email/i).fill(email);
    await page.getByLabel(/^password/i).fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    if (backup) {
        await page.getByLabel(/verification method/i).selectOption('recovery_code');
        await page.getByLabel(/^backup code/i).fill(backup);
        await page.getByRole('button', { name: /^verify$/i }).click();
    }
    await expect(page.getByTestId('logout-button')).toBeVisible();
}

test('real invitation, local session, password change and desktop accessibility', async ({ page, request }, testInfo) => {
    test.setTimeout(120_000);
    const configResponse = await request.get('/api/v1/auth/config');
    const config = await configResponse.json();
    expect(config.identity?.mode).toBe('native');
    expect(config.password_login_enabled).toBe(true);
    expect(statSync(handoffPath!).mode & 0o077).toBe(0);
    const handoff = JSON.parse(readFileSync(handoffPath!, 'utf8'));
    const email = process.env.NATIVE_E2E_EMAIL ?? 'native-admin@example.com';
    const password = 'A browser-only original passphrase 47!';
    const nextPassword = 'A browser-only replacement passphrase 98!';
    let microsoftRequests = 0;
    page.on('request', (outgoing) => {
        if (/https:\/\/(?:login\.microsoftonline|graph\.microsoft)\.com\//.test(outgoing.url())) microsoftRequests += 1;
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`/auth/local/enroll#${handoff.credential}`);
    const newPassword = page.getByLabel(/new password/i);
    await expect(newPassword).toBeVisible();
    await assertNoBrowserSecrets(page, [handoff.credential]);
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(newPassword).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('native-enrollment-1024.png') });
    await newPassword.fill(password);
    await page.getByRole('button', { name: /^continue$/i }).click();
    let codes: string[] = [];
    let setupKey = '';
    if (config.local_mfa_policy === 'required') {
        await page.getByRole('button', { name: /show setup key/i }).click();
        setupKey = await page.getByLabel(/authenticator setup key/i).inputValue();
        await page.getByLabel(/authentication code/i).fill(totp(setupKey));
        await page.getByRole('button', { name: /^verify$/i }).click();
        const list = page.getByRole('list');
        await expect(list.getByRole('listitem')).toHaveCount(10);
        codes = await list.getByRole('listitem').allTextContents();
        await assertNoBrowserSecrets(page, [handoff.credential, password, setupKey, ...codes]);
        await page.getByRole('button', { name: /I have saved my codes/i }).click();
    } else {
        await expect(page.getByText(/Your password is set/)).toBeVisible();
        await page.getByRole('link', { name: /return to sign in/i }).click();
    }
    await login(page, email, password, codes[0]);
    await page.goto('/settings');
    await page.getByRole('link', { name: /account security/i }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByLabel(/new password/i)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('native-security-1440.png') });
    await page.getByLabel(/new password/i).fill(nextPassword);
    await page.getByLabel(/^password/i).fill(password);
    if (codes.length) {
        await page.getByLabel(/verification method/i).selectOption('recovery_code');
        await page.getByLabel(/^backup code/i).fill(codes[1]);
    } else {
        await expect(page.getByLabel(/authentication code/i)).toHaveCount(0);
    }
    await page.getByRole('button', { name: /confirm change/i }).click();
    await expect(page.getByText(/Your security change is complete/)).toBeVisible();
    await assertNoBrowserSecrets(page, [password, nextPassword, ...codes]);
    await login(page, email, nextPassword, codes[2]);
    // Exercise voluntary enrollment under optional policy and factor replacement
    // under required policy through the same account-security screen.
    await page.goto('/settings');
    await page.getByRole('link', { name: /account security/i }).click();
    await page.getByLabel(/what would you like/i).selectOption(codes.length ? 'factor_replace' : 'factor_enroll');
    await page.getByLabel(/^password/i).fill(nextPassword);
    if (codes.length) {
        await page.getByLabel(/verification method/i).selectOption('recovery_code');
        await page.getByLabel(/^backup code/i).fill(codes[3]);
    }
    await page.getByRole('button', { name: /confirm change/i }).click();
    if (!codes.length) await page.getByRole('button', { name: /show setup key/i }).click();
    const replacementKey = await page.getByLabel(/authenticator setup key/i).inputValue();
    await page.getByLabel(/authentication code/i).fill(totp(replacementKey));
    await page.getByRole('button', { name: /^verify$/i }).click();
    const newCodes = page.getByRole('list').getByRole('listitem');
    await expect(newCodes).toHaveCount(10);
    const replacements = await newCodes.allTextContents();
    await assertNoBrowserSecrets(page, [nextPassword, replacementKey, ...replacements]);
    await page.getByRole('button', { name: /I have saved my codes/i }).click();
    await login(page, email, nextPassword, replacements[0]);
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login/);
    expect(microsoftRequests).toBe(0);
});

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    test(`Czech language and keyboard login at ${viewport.width}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.goto('/login');
        await page.getByLabel('Language', { exact: true }).selectOption('cs');
        await expect(page.getByRole('heading', { name: 'Přihlášení do RiskHub' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.getByLabel(/^E-mail/)).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.getByLabel(/^Heslo/)).toBeFocused();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`native-login-cs-${viewport.width}.png`) });
    });
}
