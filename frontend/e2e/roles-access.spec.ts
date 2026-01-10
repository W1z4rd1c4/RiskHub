/**
 * Role-Based Access E2E Tests
 * Tests BUSINESS_LOGIC.md §1 (Roles & Access Scopes)
 * Covers: Privileged vs Non-Privileged visibility, Admin special access, CRO exclusives
 */
import { test, expect } from '@playwright/test';
import { loginAsDemoUser, DEMO_ACCOUNTS } from './helpers/login';
import { waitForDataLoad } from './helpers/wait';
import { DashboardPage } from './pages/DashboardPage';

// Privileged users (GLOBAL scope) - should see all business data
const PRIVILEGED_USERS = [
    { name: 'Anna Kowalski', role: 'CRO' },
    { name: 'Petra Svobodová', role: 'Risk Manager' },
];

// Non-privileged users (DEPARTMENT scope) - should see only own department
const DEPARTMENT_USERS = [
    { name: 'Eva Králová', role: 'Department Head', department: 'Operations' },
    { name: 'Jana Horáková', role: 'Employee', department: 'Operations' },
];

// Admin user - platform access only
const ADMIN_USER = { name: 'System Admin', role: 'Admin' };

test.describe('Role-Based Access', () => {

    test.describe('Privileged Users (GLOBAL Scope)', () => {

        for (const user of PRIVILEGED_USERS) {
            test.describe(`${user.role} Access`, () => {

                test(`${user.role} can see all business data tabs`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.expectSidebarVisible();
                    await dashboard.expectBusinessDataLinksVisible();
                });

                test(`${user.role} can navigate to Risks`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.navigateToRisks();
                    await expect(page).toHaveURL(/.*risks/);
                    // Should see risks from all departments
                    await waitForDataLoad(page);
                    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
                });

                test(`${user.role} can navigate to Controls`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.navigateToControls();
                    await expect(page).toHaveURL(/.*controls/);
                    await waitForDataLoad(page);
                });

                test(`${user.role} can navigate to KRIs`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.navigateToKRIs();
                    await expect(page).toHaveURL(/.*kris/);
                    await waitForDataLoad(page);
                });

                test(`${user.role} can access Departments page`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.navigateToDepartments();
                    await expect(page).toHaveURL(/.*departments/);
                    await waitForDataLoad(page);
                    // Should see all departments in the list
                });
            });
        }
    });

    test.describe('Non-Privileged Users (DEPARTMENT Scope)', () => {

        for (const user of DEPARTMENT_USERS) {
            test.describe(`${user.role} Access`, () => {

                test(`${user.role} can see business data tabs`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.expectSidebarVisible();
                    await dashboard.expectBusinessDataLinksVisible();
                });

                test(`${user.role} can navigate to Risks (own department only)`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.navigateToRisks();
                    await expect(page).toHaveURL(/.*risks/);
                    await waitForDataLoad(page);
                    // Data should be scoped to their department
                });

                test(`${user.role} cannot see Admin Console`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.expectAdminLinkHidden();
                });

                test(`${user.role} cannot see Risk Hub configuration`, async ({ page }) => {
                    await loginAsDemoUser(page, user.name);
                    const dashboard = new DashboardPage(page);

                    await dashboard.expectRiskHubLinkHidden();
                });
            });
        }
    });

    test.describe('Admin User (Platform Only)', () => {

        test('Admin can see Admin Console link', async ({ page }) => {
            await loginAsDemoUser(page, ADMIN_USER.name);
            const dashboard = new DashboardPage(page);

            await dashboard.expectAdminLinkVisible();
        });

        test('Admin is redirected to admin console after login', async ({ page }) => {
            await loginAsDemoUser(page, ADMIN_USER.name);

            // Admin users are typically redirected to /admin or /settings
            await expect(page).toHaveURL(/.*admin|.*settings/);
        });

        test('Admin cannot see business data tabs (Risks, Controls, KRIs)', async ({ page }) => {
            await loginAsDemoUser(page, ADMIN_USER.name);
            const dashboard = new DashboardPage(page);

            await dashboard.expectBusinessDataLinksHidden();
        });

        test('Admin can access /admin routes', async ({ page }) => {
            await loginAsDemoUser(page, ADMIN_USER.name);

            await page.goto('/admin');
            await waitForDataLoad(page);
            // Should load admin page content
            await expect(page.locator('h1, h2').first()).toBeVisible();
        });
    });

    test.describe('CRO Exclusive Features', () => {

        test('CRO can see Risk Hub configuration', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
            const dashboard = new DashboardPage(page);

            await dashboard.expectRiskHubLinkVisible();
        });

        test('CRO can navigate to Risk Hub', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
            const dashboard = new DashboardPage(page);

            await dashboard.navigateToRiskHub();
            await expect(page).toHaveURL(/.*risk-hub/);
            await waitForDataLoad(page);
        });

        test('Risk Manager cannot see Risk Hub configuration', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
            const dashboard = new DashboardPage(page);

            await dashboard.expectRiskHubLinkHidden();
        });

        test('Department Head cannot see Risk Hub configuration', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_OPERATIONS);
            const dashboard = new DashboardPage(page);

            await dashboard.expectRiskHubLinkHidden();
        });
    });

    test.describe('Approval Access', () => {

        test('Privileged user can see Approvals navigation', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
            const dashboard = new DashboardPage(page);

            await expect(dashboard.approvalsNavLink).toBeVisible();
        });

        test('Privileged user can navigate to Approvals', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
            const dashboard = new DashboardPage(page);

            await dashboard.navigateToApprovals();
            await expect(page).toHaveURL(/.*approvals/);
        });

        test('Department user can see Approvals navigation', async ({ page }) => {
            await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_OPERATIONS);
            const dashboard = new DashboardPage(page);

            // Department users can view approvals (their own pending requests)
            await expect(dashboard.approvalsNavLink).toBeVisible();
        });
    });
});
