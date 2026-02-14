import type { Page } from '@playwright/test';

export async function waitForPreferencesHydration(page: Page, timeout = 10000): Promise<void> {
  await page.waitForSelector('html[data-preferences-hydrated="true"]', { timeout });
}

