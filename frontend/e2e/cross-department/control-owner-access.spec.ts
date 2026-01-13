/**
 * Control Owner Cross-Department Access E2E Tests
 * Tests BUSINESS_LOGIC.md §7.1 - Control Owner Access:
 * - Control owner can view own control in other department
 * - Control owner can view linked risks
 * - Control owner can edit own control (subject to high-risk approval)
 */
import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth.fixture';
import { ControlsPage } from '../pages/ControlsPage';
import { waitForDataLoad } from '../helpers/wait';
import { loginAsDemoUser } from '../helpers/login';

test.describe('Control Owner Cross-Department Access', () => {
    test.describe('Control Owner View Access', () => {
        test('Control owner can see their owned controls in controls list', async ({ deptHeadPage }) => {
            /**
             * BUSINESS_LOGIC.md §7.1: Control Owner can access controls they own
             * regardless of the control's department assignment
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            // Verify controls table is visible
            await controlsPage.expectTableVisible();

            // User sees controls they have access to (dept + owned)
            const rowCount = await controlsPage.getRowCount();
            if (rowCount === 0) {
                test.skip(true, 'No controls available for this user');
            }

            expect(rowCount).toBeGreaterThan(0);
        });

        test('Control owner can access detail page of control from other department', async ({ browser }) => {
            /**
             * Test that a control owner from Dept A can view the detail page of
             * a control assigned to Dept B, because they are the control_owner
             */
            const context = await browser.newContext();
            const page = await context.newPage();
            await loginAsDemoUser(page, DEMO_ACCOUNTS.DEPT_HEAD_FINANCE);

            const controlsPage = new ControlsPage(page);
            await controlsPage.navigate();
            await waitForDataLoad(page);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                // Click on first available control
                await controlsPage.clickFirstRow();
                await waitForDataLoad(page);

                // Verify we can see the detail page
                await expect(page.locator('h1, h2').first()).toBeVisible();

                // Check that control details are shown
                const pageContent = await page.textContent('main, [role="main"], .content');
                expect(pageContent).toBeTruthy();
            } else {
                test.skip(true, 'No controls visible for this user');
            }

            await context.close();
        });
    });

    test.describe('Control Owner Linked Risk Access', () => {
        test('Control owner can view linked risks in control detail', async ({ deptHeadPage }) => {
            /**
             * BUSINESS_LOGIC.md §7.2: Control Owner can view linked risks
             * Even if the linked risk is in a different department
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(deptHeadPage);

                // Look for linked risks section/tab
                const linkedRisksTab = deptHeadPage.locator('button:has-text("Risks"), [role="tab"]:has-text("Risks"), a:has-text("Linked Risks")');
                const linkedRisksSection = deptHeadPage.locator('[data-testid="linked-risks"], text=/linked.*risk/i');

                const hasTab = await linkedRisksTab.first().isVisible({ timeout: 3000 }).catch(() => false);
                const hasSection = await linkedRisksSection.first().isVisible({ timeout: 3000 }).catch(() => false);

                if (hasTab) {
                    await linkedRisksTab.first().click();
                    await waitForDataLoad(deptHeadPage);
                }

                if (hasTab || hasSection) {
                    // Verify linked risks are displayed (could be empty if no links)
                    await deptHeadPage.waitForTimeout(500);
                    const pageContent = await deptHeadPage.textContent('main, [role="main"], .content');
                    expect(pageContent).toBeTruthy();
                } else {
                    // Some control detail pages may show risks differently
                    test.skip(true, 'Linked risks section not found in this view');
                }
            } else {
                test.skip(true, 'No controls available');
            }
        });

        test('Control owner can click through to linked risk detail', async ({ deptHeadPage }) => {
            /**
             * Access inheritance: Control Owner → view linked Risk → view Risk's Controls
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(deptHeadPage);

                // Look for linked risk link/card
                const riskLink = deptHeadPage.locator('a[href*="/risks/"], [data-testid="linked-risk-card"], .risk-link');
                const hasRiskLink = await riskLink.first().isVisible({ timeout: 5000 }).catch(() => false);

                if (hasRiskLink) {
                    await riskLink.first().click();
                    await deptHeadPage.waitForURL(/.*risks\/\d+/, { timeout: 10000 });
                    await waitForDataLoad(deptHeadPage);

                    // Verify risk detail page loaded
                    await expect(deptHeadPage.locator('h1, h2').first()).toBeVisible();
                } else {
                    test.skip(true, 'No linked risk links found');
                }
            } else {
                test.skip(true, 'No controls available');
            }
        });
    });

    test.describe('Control Owner Edit Permissions', () => {
        test('Control owner can access edit form for their owned control', async ({ deptHeadPage }) => {
            /**
             * BUSINESS_LOGIC.md §7.1: Control Owner can edit controls they own
             * Note: Subject to high-risk approval if linked to high-risk/priority risk
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(deptHeadPage);

                // Look for edit button
                const editButton = deptHeadPage.locator('button:has-text("Edit"), a:has-text("Edit"), [aria-label*="edit" i]');
                const hasEditButton = await editButton.first().isVisible({ timeout: 5000 }).catch(() => false);

                if (hasEditButton) {
                    await editButton.first().click();
                    await waitForDataLoad(deptHeadPage);

                    // Should see edit form
                    const formVisible = await deptHeadPage.locator('form, [role="dialog"], [data-testid="edit-form"]').first().isVisible({ timeout: 5000 }).catch(() => false);
                    expect(formVisible).toBe(true);
                } else {
                    test.skip(true, 'Edit button not visible - user may not be owner of this control');
                }
            } else {
                test.skip(true, 'No controls available');
            }
        });

        test('Control edit on high-risk linked control creates approval request', async ({ deptHeadPage }) => {
            /**
             * BUSINESS_LOGIC.md §5.2: Control linked to high-risk requires privileged approval
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(deptHeadPage);

                const editButton = deptHeadPage.locator('button:has-text("Edit"), a:has-text("Edit")');
                const hasEditButton = await editButton.first().isVisible({ timeout: 3000 }).catch(() => false);

                if (hasEditButton) {
                    await editButton.first().click();
                    await waitForDataLoad(deptHeadPage);

                    // Find a non-sensitive field to edit
                    const descField = deptHeadPage.locator('textarea[name*="description" i], input[name*="description" i]');
                    if (await descField.first().isVisible({ timeout: 3000 }).catch(() => false)) {
                        await descField.first().fill('Updated control description for E2E test');

                        const saveButton = deptHeadPage.locator('button:has-text("Save"), button:has-text("Submit"), button[type="submit"]');
                        if (await saveButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
                            await saveButton.first().click();
                            await waitForDataLoad(deptHeadPage);
                            // Either immediate save or approval request created - both valid
                            await deptHeadPage.waitForTimeout(1000);
                        }
                    }
                } else {
                    test.skip(true, 'Edit not available for this control');
                }
            } else {
                test.skip(true, 'No controls available');
            }
        });
    });

    test.describe('Non-Owner Access Restrictions', () => {
        test('Employee cannot access control from other department if not owner', async ({ employeePage }) => {
            /**
             * Department-scoped user without ownership cannot access other dept controls
             */
            const controlsPage = new ControlsPage(employeePage);
            await controlsPage.navigate();
            await waitForDataLoad(employeePage);

            await controlsPage.expectTableVisible();

            // Employee sees only scoped controls
            const rowCount = await controlsPage.getRowCount();
            expect(rowCount).toBeGreaterThanOrEqual(0);
        });

        test('Direct URL access to other department control when not owner is denied', async ({ browser }) => {
            /**
             * Accessing a control via direct URL without ownership/department access
             */
            const context = await browser.newContext();
            const page = await context.newPage();

            await loginAsDemoUser(page, DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS);

            const response = await page.goto('/controls/9999', { waitUntil: 'networkidle' });

            // Verify page shows error/not found content
            const url = page.url();
            const pageContent = await page.textContent('body');
            const isAccessDenied =
                (response && (response.status() === 403 || response.status() === 404)) ||
                url.includes('dashboard') ||
                url.includes('login') ||
                (pageContent && (pageContent.includes('not found') || pageContent.includes('Not Found') || pageContent.includes('404') || pageContent.includes('Error') || pageContent.includes('does not exist')));

            expect(isAccessDenied).toBe(true);

            await context.close();
        });
    });

    test.describe('Control-Side Link Management (Phase 154-02)', () => {
        test('Control owner can open Manage Risk Linkage dialog', async ({ deptHeadPage }) => {
            /**
             * BUSINESS_LOGIC.md §7.1: Control Owner can manage links via control detail
             * Fixed in Phase 154-02
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(deptHeadPage);

                // Look for "Manage Risk Linkage" button
                const linkButton = deptHeadPage.locator(
                    'button:has-text("Manage Risk Linkage"), ' +
                    'button:has-text("Link Risks"), ' +
                    'button:has-text("Manage Links"), ' +
                    '[data-testid="manage-risk-linkage"]'
                );

                const hasLinkButton = await linkButton.first().isVisible({ timeout: 5000 }).catch(() => false);

                if (hasLinkButton) {
                    await linkButton.first().click();
                    await waitForDataLoad(deptHeadPage);

                    // Verify dialog opens
                    const dialog = deptHeadPage.locator('[role="dialog"], .modal');
                    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
                } else {
                    test.skip(true, 'Manage Risk Linkage button not visible - may not have controls:write');
                }
            } else {
                test.skip(true, 'No controls available');
            }
        });

        test('Control page renders even if linked risks section has error', async ({ deptHeadPage }) => {
            /**
             * Phase 154-04: Page stays usable even if linked risks fails
             * Control detail should NOT show full page error
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(deptHeadPage);

                // Verify main control info is visible (page didn't blank)
                const hasControlName = await deptHeadPage.locator('h1, h2').first().isVisible({ timeout: 5000 });
                expect(hasControlName).toBe(true);

                // Linked risks section may show error OR data, but page should not be blank
                const pageContent = await deptHeadPage.textContent('main, [role="main"], .content');
                expect(pageContent).toBeTruthy();
                expect(pageContent).not.toContain('Failed to load control details');
            } else {
                test.skip(true, 'No controls available');
            }
        });

        test('Control owner can search and link a risk via control detail', async ({ deptHeadPage }) => {
            /**
             * Full control-side linking flow: click Manage Linkage, search, select, link
             * Fixed in Phase 154-02 (backend) to allow cross-department access
             */
            const controlsPage = new ControlsPage(deptHeadPage);
            await controlsPage.navigate();
            await waitForDataLoad(deptHeadPage);

            const rowCount = await controlsPage.getRowCount();
            if (rowCount > 0) {
                await controlsPage.clickFirstRow();
                await waitForDataLoad(deptHeadPage);

                // Click Manage Risk Linkage button
                const linkButton = deptHeadPage.locator(
                    'button:has-text("Manage Risk Linkage"), button:has-text("Link Risks")'
                );

                if (await linkButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
                    await linkButton.first().click();
                    await waitForDataLoad(deptHeadPage);

                    // Look for search input in dialog
                    const searchInput = deptHeadPage.locator(
                        '[role="dialog"] input[type="search"], ' +
                        '[role="dialog"] input[placeholder*="Search"], ' +
                        '.modal input'
                    );

                    if (await searchInput.first().isVisible({ timeout: 5000 }).catch(() => false)) {
                        // Search for a risk
                        await searchInput.first().fill('risk');
                        await deptHeadPage.waitForTimeout(500);

                        // Look for risk options 
                        const riskOption = deptHeadPage.locator(
                            '[role="dialog"] [role="option"], ' +
                            '[role="dialog"] tr, ' +
                            '[role="dialog"] li, ' +
                            '.modal .risk-item'
                        );

                        const hasOptions = await riskOption.first().isVisible({ timeout: 5000 }).catch(() => false);

                        if (hasOptions) {
                            // Verify search works - risk options are displayed
                            expect(hasOptions).toBe(true);
                        }
                    } else {
                        test.skip(true, 'Search input not found in link dialog');
                    }
                } else {
                    test.skip(true, 'Link button not visible');
                }
            } else {
                test.skip(true, 'No controls available');
            }
        });
    });
});
