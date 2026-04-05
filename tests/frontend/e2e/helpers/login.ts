/**
 * Login helper functions for E2E tests
 * Provides reusable login utilities for the demo account picker
 */
import { Page } from '@playwright/test';
import { waitForPreferencesHydration } from './waitForPreferencesHydration';

export interface LoginOptions {
    retries?: number;
    timeout?: number;
}

/**
 * Login as a demo user via the demo account picker
 * @param page - Playwright page object
 * @param accountName - Display name of the demo account (e.g., 'Anna Kowalski', 'System Admin')
 * @param options - Optional configuration for retries and timeouts
 */
export async function loginAsDemoUser(
    page: Page,
    accountName: string,
    options: LoginOptions = {}
): Promise<void> {
    const { retries = 3, timeout = 15000 } = options;
    const allowedPostLoginPaths = new Set(['/', '/dashboard', '/admin', '/risks', '/controls', '/kris', '/settings']);

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto('/login');

            // Wait for the demo account buttons to load
            await page.waitForSelector(`button:has-text("${accountName}")`, { timeout });

            // Click the demo account button containing the name
            await page.click(`button:has-text("${accountName}")`);

            // Wait for redirect - app redirects to / or /admin depending on user
            await page.waitForURL((url) => allowedPostLoginPaths.has(url.pathname), {
                timeout: timeout + 5000
            });
            await page.waitForLoadState('domcontentloaded');
            await waitForPreferencesHydration(page, timeout + 5000);

            return; // Success
        } catch (error) {
            if (attempt === retries) throw error;
            await page.waitForTimeout(500 * attempt); // Exponential backoff
        }
    }
}

/**
 * Logout the current user
 * @param page - Playwright page object
 */
export async function logout(page: Page): Promise<void> {
    // Click logout button (has data-testid)
    await page.click('[data-testid="logout-button"]');

    // Wait for redirect to login page
    await page.waitForURL(/.*login/, { timeout: 10000 });
}

/**
 * Check if user is logged in by verifying nav presence
 * @param page - Playwright page object
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
    try {
        await page.waitForSelector('nav', { timeout: 2000 });
        return true;
    } catch {
        return false;
    }
}

// Demo account display names mapped to roles for reference
// These match the actual demo accounts in LoginPage.tsx
export const DEMO_ACCOUNTS = {
    // Privileged users (IDs 1-3)
    ADMIN: 'System Admin',
    CRO: 'Anna Kowalski',
    RISK_MANAGER: 'Petra Svobodová',

    // Department heads (IDs 4-6)
    DEPT_HEAD_OPERATIONS: 'Eva Králová',
    DEPT_HEAD_FINANCE: 'Martin Procházka',
    DEPT_HEAD_IT: 'Tomáš Novotný',

    // Employees (IDs 7-9)
    EMPLOYEE_OPERATIONS: 'Jana Horáková',
    EMPLOYEE_FINANCE: 'Lukáš Dvořák',
    EMPLOYEE_IT: 'Barbora Němcová',
} as const;

export type DemoAccountKey = keyof typeof DEMO_ACCOUNTS;
