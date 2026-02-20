/**
 * Authentication fixtures for E2E tests
 * Provides pre-authenticated test contexts for different roles
 */
/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, Page } from '@playwright/test';
import { loginAsDemoUser, DEMO_ACCOUNTS } from '../helpers/login';

// Extend the base test with authenticated fixtures
export const test = base.extend<{
    // Privileged role fixtures (GLOBAL scope)
    croPage: Page;
    riskManagerPage: Page;
    compliancePage: Page;

    // Department role fixtures (DEPARTMENT scope)
    deptHeadPage: Page;
    employeePage: Page;

    // Admin fixture (Platform only)
    adminPage: Page;

    // Generic authenticated page
    authenticatedPage: Page;
}>({
    // CRO - Chief Risk Officer (GLOBAL scope, Risk Hub access)
    croPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await use(page);
        await context.close();
    },

    // Risk Manager (GLOBAL scope)
    riskManagerPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
        await use(page);
        await context.close();
    },

    // Compliance (GLOBAL scope) - Use Risk Manager as proxy since no dedicated Compliance user
    compliancePage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER); // No dedicated Compliance user
        await use(page);
        await context.close();
    },

    // Department Head (DEPARTMENT scope - Operations)
    deptHeadPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_OPERATIONS);
        await use(page);
        await context.close();
    },

    // Employee (DEPARTMENT scope - Operations)
    employeePage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);
        await use(page);
        await context.close();
    },

    // System Admin (Platform only - no business data)
    adminPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
        await use(page);
        await context.close();
    },

    // Generic authenticated page (defaults to Risk Manager)
    authenticatedPage: async ({ browser }, use) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
        await use(page);
        await context.close();
    },
});

export { expect } from '@playwright/test';

// Re-export demo accounts for convenience
export { DEMO_ACCOUNTS } from '../helpers/login';
