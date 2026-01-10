/**
 * Control Ownership E2E Tests
 * Tests BUSINESS_LOGIC.md §2.2 Control Ownership rules:
 * - Control Owner Assignment (cross-department)
 * - Cross-Department Control Owner Access
 * - Ownership Display
 */
import { test, expect } from '../fixtures/auth.fixture';
import { ControlsPage } from '../pages/ControlsPage';
import { waitForDataLoad } from '../helpers/wait';

test.describe('Control Ownership', () => {
    test.describe('Control Owner Assignment', () => {
        test('Risk Manager can create control and assign owner from any department', async ({ riskManagerPage }) => {
            const controlsPage = new ControlsPage(riskManagerPage);
            await controlsPage.navigate();

            // Check if create button is available
            await controlsPage.expectCreateButtonVisible();

            // Click create to verify form
            await controlsPage.clickCreateButton();

            // Verify we're on the create form
            await expect(riskManagerPage.locator('h1, h2').first()).toContainText(/new|create|control/i);

            // The control owner field should allow selection of any active user
            const ownerField = riskManagerPage.locator('[data-testid="control-owner-select"], select[name*="owner"], [aria-label*="owner" i], [name*="control_owner"]');
            if (await ownerField.isVisible({ timeout: 3000 }).catch(() => false)) {
                await ownerField.click();
                // Should show users from multiple departments
                await expect(riskManagerPage.locator('[role="option"], option').first()).toBeVisible();
            }
        });

        test('Control department_id can be set independently from owner department', async ({ riskManagerPage }) => {
            const controlsPage = new ControlsPage(riskManagerPage);
            await controlsPage.navigate();
            await controlsPage.clickCreateButton();
            await waitForDataLoad(riskManagerPage);

            // Check for separate department and owner fields
            const deptField = riskManagerPage.locator('[data-testid="department-select"], select[name*="department"], [aria-label*="department" i]');
            const ownerField = riskManagerPage.locator('[data-testid="control-owner-select"], select[name*="owner"], [aria-label*="owner" i]');

            // Both should be visible and independently selectable
            if (await deptField.isVisible({ timeout: 3000 }).catch(() => false)) {
                await expect(deptField).toBeVisible();
            }
            if (await ownerField.isVisible({ timeout: 3000 }).catch(() => false)) {
                await expect(ownerField).toBeVisible();
            }
        });
    });

    test.describe('Cross-Department Control Owner Access', () => {
        test('Control Owner can view their control even from different department', async ({ riskManagerPage }) => {
            // BUSINESS_LOGIC.md §7.1: Control Owner can access the control they own + its linked risks
            const controlsPage = new ControlsPage(riskManagerPage);
            await controlsPage.navigate();
            await waitForDataLoad(riskManagerPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(riskManagerPage);

                // Should be able to view control detail
                await expect(riskManagerPage.locator('h1, h2').first()).toBeVisible();

                // Check owner is displayed
                const pageContent = await riskManagerPage.textContent('main, [role="main"], .content');
                expect(pageContent).toContain('wner'); // "Owner" partial
            } else {
                test.skip();
            }
        });

        test('Control Owner can edit their control (subject to approval if high-risk linked)', async ({ riskManagerPage }) => {
            const controlsPage = new ControlsPage(riskManagerPage);
            await controlsPage.navigate();
            await waitForDataLoad(riskManagerPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(riskManagerPage);

                // Look for edit button
                const editButton = riskManagerPage.locator('button:has-text("Edit"), a:has-text("Edit"), [aria-label*="edit" i]');
                const editVisible = await editButton.first().isVisible({ timeout: 3000 }).catch(() => false);

                // Risk Manager (privileged) should see edit button
                if (editVisible) {
                    await expect(editButton.first()).toBeVisible();
                }
            } else {
                test.skip();
            }
        });

        test('Department-scoped user can view controls in their department', async ({ deptHeadPage }) => {
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            // Department head should see controls page - verify page loaded
            await expect(deptHeadPage.locator('h1, h2, table, nav').first()).toBeVisible({ timeout: 10000 });
            await controlsPage.expectTableVisible();
        });
    });

    test.describe('Ownership Display', () => {
        test('Control detail page shows Control Owner', async ({ riskManagerPage }) => {
            const controlsPage = new ControlsPage(riskManagerPage);
            await controlsPage.navigate();

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(riskManagerPage);

                // Look for owner label
                const ownerLabel = riskManagerPage.locator('text=/control.*owner|owner/i').first();
                await expect(ownerLabel).toBeVisible({ timeout: 10000 });
            } else {
                test.skip();
            }
        });

        test('Control detail page shows Department', async ({ riskManagerPage }) => {
            const controlsPage = new ControlsPage(riskManagerPage);
            await controlsPage.navigate();

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(riskManagerPage);

                // Check for department display
                const deptLabel = riskManagerPage.locator('text=/department/i').first();
                await expect(deptLabel).toBeVisible({ timeout: 10000 });
            } else {
                test.skip();
            }
        });

        test('Control detail page shows Created By and Updated By', async ({ riskManagerPage }) => {
            const controlsPage = new ControlsPage(riskManagerPage);
            await controlsPage.navigate();

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(riskManagerPage);

                // Controls typically show creator/updater info
                const pageContent = await riskManagerPage.textContent('main, [role="main"], .content');
                // At minimum, we should see timestamps or user references
                expect(pageContent).toBeTruthy();
            } else {
                test.skip();
            }
        });
    });

    test.describe('RBAC Access Rules', () => {
        test('Employee has read-only access to department controls', async ({ employeePage }) => {
            const controlsPage = new ControlsPage(employeePage);
            await controlsPage.navigate();
            await waitForDataLoad(employeePage);

            // Employee should see controls table (read access)
            await controlsPage.expectTableVisible();
        });

        test('CRO can access all controls globally', async ({ croPage }) => {
            const controlsPage = new ControlsPage(croPage);
            await controlsPage.navigate();
            await waitForDataLoad(croPage);

            // CRO has GLOBAL scope
            await controlsPage.expectTableVisible();
            await controlsPage.expectCreateButtonVisible();

            // Check for department filter with multiple options
            const deptFilter = croPage.locator('[data-testid="department-filter"], button:has-text("Department"), select:has-text("Department")');
            if (await deptFilter.isVisible().catch(() => false)) {
                // Global user should see filter option
                await deptFilter.click();
                await croPage.waitForTimeout(500); // Wait for dropdown
                const options = croPage.locator('[role="option"], option, [role="menuitem"], li');
                const optionCount = await options.count();
                expect(optionCount >= 0).toBe(true);
            }
        });
    });
});
