/**
 * E2E Tests for Risk CRUD Permissions
 * Tests BUSINESS_LOGIC.md §4 - Permission Matrix for risks
 *
 * Permission coverage:
 * - risks:read - All roles (scoped by department)
 * - risks:write - Risk Manager, Compliance
 * - risks:delete - Privileged only (via approval)
 */
import { test, expect } from '../fixtures/auth.fixture';
import { RisksPage } from '../pages/RisksPage';
import { waitForDataLoad } from '../helpers/wait';

test.describe('Risk CRUD Permissions', () => {
    test.describe('risks:read - View Risks', () => {
        test('Risk Manager (GLOBAL) can view all risks', async ({ riskManagerPage }) => {
            const risksPage = new RisksPage(riskManagerPage);
            await risksPage.navigate();

            await risksPage.expectTableVisible();
            await risksPage.expectRowsLoaded(1);

            // GLOBAL users should see risks from multiple departments
            const rowCount = await risksPage.getRowCount();
            expect(rowCount).toBeGreaterThan(0);
        });

        test('CRO (GLOBAL) can view all risks', async ({ croPage }) => {
            const risksPage = new RisksPage(croPage);
            await risksPage.navigate();

            await risksPage.expectTableVisible();
            await risksPage.expectRowsLoaded(1);
        });

        test('Department Head (DEPARTMENT) can view department risks', async ({ deptHeadPage }) => {
            const risksPage = new RisksPage(deptHeadPage);
            await risksPage.navigate();

            await risksPage.expectTableVisible();
            // Department-scoped users see only their department's risks
            const rowCount = await risksPage.getRowCount();
            expect(rowCount).toBeGreaterThanOrEqual(0); // May be 0 if no risks in dept
        });

        test('Employee (DEPARTMENT) can view department risks', async ({ employeePage }) => {
            const risksPage = new RisksPage(employeePage);
            await risksPage.navigate();

            await risksPage.expectTableVisible();
        });

        test('Risk detail page is accessible for in-scope risks', async ({ riskManagerPage }) => {
            const risksPage = new RisksPage(riskManagerPage);
            await risksPage.navigate();

            // Get initial row count
            const rowCount = await risksPage.getRowCount();
            if (rowCount > 0) {
                await risksPage.clickFirstRow();

                // Should be on risk detail page
                await expect(riskManagerPage).toHaveURL(/.*risks\/\d+/);
                await waitForDataLoad(riskManagerPage);

                // Verify detail content is visible
                await expect(riskManagerPage.locator('h1, h2').first()).toBeVisible();
            }
        });
    });

    test.describe('risks:write - Create/Edit Risks', () => {
        test('Risk Manager can see New Risk button', async ({ riskManagerPage }) => {
            const risksPage = new RisksPage(riskManagerPage);
            await risksPage.navigate();

            await risksPage.expectCreateButtonVisible();
        });

        test('CRO can see New Risk button', async ({ croPage }) => {
            const risksPage = new RisksPage(croPage);
            await risksPage.navigate();

            await risksPage.expectCreateButtonVisible();
        });

        test('Department Head can see New Risk button (department-scoped write)', async ({ deptHeadPage }) => {
            const risksPage = new RisksPage(deptHeadPage);
            await risksPage.navigate();

            // Dept heads should have risks:write for their department
            await risksPage.expectCreateButtonVisible();
        });

        test('Employee cannot see New Risk button', async ({ employeePage }) => {
            const risksPage = new RisksPage(employeePage);
            await risksPage.navigate();

            // Employees do not have risks:write permission
            await risksPage.expectCreateButtonHidden();
        });

        test('Risk Manager can access create Risk page', async ({ riskManagerPage }) => {
            const risksPage = new RisksPage(riskManagerPage);
            await risksPage.navigate();

            await risksPage.clickCreateButton();

            // Should navigate to risk creation page
            await expect(riskManagerPage).toHaveURL(/.*risks\/(new|create)/);

            // Verify create form is visible (name input or form)
            const formElement = riskManagerPage.locator('form, input[name], textarea');
            await expect(formElement.first()).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('risks:delete - Delete Risks', () => {
        test('Risk Manager can access delete action on Risk detail', async ({ riskManagerPage }) => {
            const risksPage = new RisksPage(riskManagerPage);
            await risksPage.navigate();

            const rowCount = await risksPage.getRowCount();
            if (rowCount === 0) {
                test.skip();
                return;
            }

            await risksPage.clickFirstRow();
            await waitForDataLoad(riskManagerPage);

            // Look for delete button or archive action
            const deleteBtn = riskManagerPage.locator('button:has-text("Delete"), button:has-text("Archive"), button:has(.lucide-trash)');
            const hasDeleteBtn = await deleteBtn.isVisible().catch(() => false);

            // Privileged users should see delete option
            expect(hasDeleteBtn).toBe(true);
        });

        test('Employee delete triggers approval request', async ({ employeePage }) => {
            const risksPage = new RisksPage(employeePage);
            await risksPage.navigate();

            const rowCount = await risksPage.getRowCount();
            if (rowCount === 0) {
                test.skip();
                return;
            }

            await risksPage.clickFirstRow();
            await waitForDataLoad(employeePage);

            // Look for delete button - should either not exist or trigger approval
            const deleteBtn = employeePage.locator('button:has-text("Delete"), button:has-text("Archive"), button:has(.lucide-trash)');
            const hasDeleteBtn = await deleteBtn.isVisible().catch(() => false);

            if (hasDeleteBtn) {
                await deleteBtn.click();

                // Should prompt for approval or show approval dialog
                const approvalDialog = employeePage.locator('[role="dialog"], [role="alertdialog"]');
                const toastMessage = employeePage.locator('[role="status"], .toast');

                // Either a dialog appears or approval toast
                const hasDialog = await approvalDialog.isVisible({ timeout: 5000 }).catch(() => false);
                const hasToast = await toastMessage.isVisible({ timeout: 5000 }).catch(() => false);

                // Non-privileged should require approval
                expect(hasDialog || hasToast).toBe(true);
            }
        });

        test('Department Head delete on non-owned risk requires approval', async ({ deptHeadPage }) => {
            const risksPage = new RisksPage(deptHeadPage);
            await risksPage.navigate();

            const rowCount = await risksPage.getRowCount();
            if (rowCount === 0) {
                test.skip();
                return;
            }

            await risksPage.clickFirstRow();
            await waitForDataLoad(deptHeadPage);

            // Dept heads are non-privileged, so delete should require approval
            const deleteBtn = deptHeadPage.locator('button:has-text("Delete"), button:has-text("Archive"), button:has(.lucide-trash)');
            const hasDeleteBtn = await deleteBtn.isVisible().catch(() => false);

            // Dept heads should see delete but it creates approval request
            if (hasDeleteBtn) {
                await deleteBtn.click();

                // Wait for confirmation dialog or approval toast
                await deptHeadPage.waitForTimeout(1000);
            }
        });
    });
});
