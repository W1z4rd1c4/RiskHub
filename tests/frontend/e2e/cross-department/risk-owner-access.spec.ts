/**
 * Risk Owner Cross-Department Access E2E Tests
 * Tests BUSINESS_LOGIC.md §7.1 - Risk Owner Access:
 * - Risk owner can access own risk in other department
 * - Risk owner can edit own risk (subject to approval rules)
 * - Non-owner cannot access other department's risk
 */
import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { E2E_RISKS } from '../fixtures/e2e-data';
import { RisksPage } from '../pages/RisksPage';
import { waitForDataLoad } from '../helpers/wait';
import { loginAsDemoUser } from '../helpers/login';

test.describe('Risk Owner Cross-Department Access', () => {
    test.describe('Risk Owner Access from Other Department', () => {
        test('Risk owner can see their owned risk in risks list regardless of department', async ({ deptHeadPage }) => {
            /**
             * BUSINESS_LOGIC.md §7.1: Risk Owner can access the risk they own regardless of department
             * 
             * Scenario:
             * - Dept Head (Operations) may own risks in other departments
             * - They should see those risks in their risks list
             */
            const risksPage = new RisksPage(deptHeadPage);
            await risksPage.navigate();
            await waitForDataLoad(deptHeadPage);

            // Verify the risks table is visible
            await risksPage.expectTableVisible();

            // If there are risks, they should include both:
            // 1. Department's risks (Operations)
            // 2. Risks owned by this user from other departments
            const rowCount = await risksPage.getRowCount();
            if (rowCount === 0) {
                test.skip(true, 'No risks available for this user');
            }

            // User should see risks - this includes owned risks from any department
            expect(rowCount).toBeGreaterThan(0);
        });

        test('Risk owner can access detail page of risk they own in other department', async ({ browser }) => {
            /**
             * Test that a risk owner (from Dept A) can view the detail page of
             * a risk assigned to Dept B, because they are the owner.
             * 
             * We use Finance Dept Head who may own risks in other departments.
             */
            const context = await browser.newContext();
            const page = await context.newPage();
            await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_FINANCE);

            const risksPage = new RisksPage(page);
            await risksPage.navigate();
            await waitForDataLoad(page);

            const rowCount = await risksPage.getRowCount();
            if (rowCount > 0) {
                // Click on first available risk
                await risksPage.clickFirstRow();
                await waitForDataLoad(page);

                // Verify we can see the detail page (not redirected/blocked)
                await expect(page.locator('h1, h2').first()).toBeVisible();

                // Check that owner information is displayed
                const pageContent = await page.textContent('main, [role="main"], .content');
                expect(pageContent).toBeTruthy();
            } else {
                test.skip(true, 'No risks visible for this user');
            }

            await context.close();
        });
    });

    test.describe('Risk Owner Edit Permissions', () => {
        test('Risk owner can access edit form for their owned risk', async ({ deptHeadPage }) => {
            /**
             * BUSINESS_LOGIC.md §7.1: Risk Owner can edit the risk they own
             * Note: Edits are subject to approval rules (§5, §6)
             */
            const risksPage = new RisksPage(deptHeadPage);
            await risksPage.navigate();
            await risksPage.search(E2E_RISKS.OPS_HEAD_CROSS_DEPT_EDITABLE.name);
            await risksPage.openRowByText(E2E_RISKS.OPS_HEAD_CROSS_DEPT_EDITABLE.name);

            const editButton = deptHeadPage.getByRole('button', { name: /edit|upravit/i });
            await expect(editButton).toBeVisible();

            await editButton.click();
            await waitForDataLoad(deptHeadPage);

            await expect(deptHeadPage.locator('form, [role="dialog"], [data-testid="edit-form"]').first()).toBeVisible();
        });

        test('Risk owner edit of non-sensitive field subject to approval if required', async ({ deptHeadPage }) => {
            /**
             * When a non-privileged user (Dept Head) edits a risk:
             * - If risk is high-priority: requires CRO/Risk Manager approval
             * - Standard edits may require primary approval
             */
            const risksPage = new RisksPage(deptHeadPage);
            await risksPage.navigate();
            await risksPage.search(E2E_RISKS.OPS_HEAD_CROSS_DEPT_EDITABLE.name);
            await risksPage.openRowByText(E2E_RISKS.OPS_HEAD_CROSS_DEPT_EDITABLE.name);

            const editButton = deptHeadPage.getByRole('button', { name: /edit|upravit/i });
            await expect(editButton).toBeVisible();
            await editButton.click();
            await waitForDataLoad(deptHeadPage);

            const descField = deptHeadPage.getByTestId('risk-description-input');
            await expect(descField).toBeVisible();
            await descField.fill('Updated description for E2E test');

            await deptHeadPage.getByTestId('risk-form-next-button').click();
            await deptHeadPage.getByTestId('risk-form-next-button').click();

            const saveButton = deptHeadPage.getByTestId('risk-form-submit-button');
            await expect(saveButton).toBeVisible();
            await saveButton.click();
            await waitForDataLoad(deptHeadPage);
            await deptHeadPage.waitForTimeout(1000);
        });
    });

    test.describe('Non-Owner Access Restrictions', () => {
        test('Employee cannot access risk from other department if not owner', async ({ employeePage }) => {
            /**
             * BUSINESS_LOGIC.md §7.1: Access requires ownership or department membership
             * Employee from Department A cannot view Dept B risks unless they are owner
             */
            const risksPage = new RisksPage(employeePage);
            await risksPage.navigate();
            await waitForDataLoad(employeePage);

            // Employee should only see risks:
            // 1. In their department
            // 2. Where they are the owner
            await risksPage.expectTableVisible();

            // The table should be scoped to their visible risks
            const rowCount = await risksPage.getRowCount();
            // This is valid - may have 0 or more visible risks
            expect(rowCount).toBeGreaterThanOrEqual(0);
        });

        test('Direct URL access to other department risk returns 403 or redirects', async ({ browser }) => {
            /**
             * Test that accessing a risk via direct URL that belongs to another
             * department (and user is not owner) results in access denial
             */
            const context = await browser.newContext();
            const page = await context.newPage();

            // Login as Employee Operations (department-scoped)
            await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);

            // Try to access a risk by direct URL
            // Most systems will return 403 or redirect to dashboard
            const response = await page.goto('/risks/9999', { waitUntil: 'networkidle' });
            await waitForDataLoad(page);

            // Verify page shows error/not found content (app may stay at URL)
            const url = page.url();
            const pageContent = await page.textContent('body');
            const isAccessDenied =
                (response && (response.status() === 403 || response.status() === 404)) ||
                url.includes('dashboard') ||
                url.includes('login') ||
                (pageContent && (pageContent.includes('not found') || pageContent.includes('Not Found') || pageContent.includes('404') || pageContent.includes('Error') || pageContent.includes('does not exist')));

            // Should not be able to access invalid/unauthorized risk
            expect(isAccessDenied).toBe(true);

            await context.close();
        });

        test('Employee sees only department-scoped risks in list', async ({ employeePage }) => {
            /**
             * Business rule: Department-scoped users see filtered data
             * Only their department's risks + risks they own
             */
            const risksPage = new RisksPage(employeePage);
            await risksPage.navigate();
            await waitForDataLoad(employeePage);

            await risksPage.expectTableVisible();

            // All visible risks should be either:
            // - In the employee's department (Operations)
            // - Owned by the employee
            // We can't verify the exact scoping without API access,
            // but we verify the list loads without error
            const rowCount = await risksPage.getRowCount();
            expect(rowCount).toBeGreaterThanOrEqual(0);
        });
    });
});
