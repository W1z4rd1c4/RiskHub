import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export function nativeTotp(secret: string): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bits = [...secret.toUpperCase().replace(/=+$/, '')].map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0')).join('');
    const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
    const digest = createHmac('sha1', key).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
export async function nativeEnroll(page: Page, credential: string, password: string, required: boolean) {
    await page.goto(`/auth/local/enroll#${credential}`);
    await page.getByLabel(/new password/i).fill(password);
    await page.getByRole('button', { name: /^continue$/i }).click();
    if (!required) {
        await expect(page.getByText(/Your password is set/)).toBeVisible();
        return [];
    }
    await page.getByRole('button', { name: /show setup key/i }).click();
    const key = await page.getByLabel(/authenticator setup key/i).inputValue();
    await page.getByLabel(/authentication code/i).fill(nativeTotp(key));
    await page.getByRole('button', { name: /^verify$/i }).click();
    const codes = page.getByRole('list').getByRole('listitem');
    await expect(codes).toHaveCount(10);
    const result = await codes.allTextContents();
    await page.getByRole('button', { name: /I have saved my codes/i }).click();
    return result;
}
export async function nativeLogin(page: Page, email: string, password: string, backup?: string) {
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
