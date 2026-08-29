import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_ASSETS } from './fixtures/e2e-data';
import { getAssetByName } from './helpers/ict-register';
import { waitForDataLoad } from './helpers/wait';

type Locale = 'cs' | 'en';

const REGISTERS = [
    { path: '/processes', prefix: 'processes', stateTrigger: 'processes-status-filter-trigger', stateName: { en: 'Lifecycle', cs: 'Životní cyklus' } },
    { path: '/assets', prefix: 'assets', stateTrigger: 'assets-status-filter-trigger', stateName: { en: 'Lifecycle', cs: 'Životní cyklus' } },
    { path: '/threats', prefix: 'threats', stateTrigger: 'threats-status-filter-trigger', stateName: { en: 'Lifecycle', cs: 'Životní cyklus' } },
    { path: '/vendors', prefix: 'vendors', stateTrigger: 'vendors-status-filter-trigger', stateName: { en: 'Lifecycle', cs: 'Životní cyklus' } },
    { path: '/risks', prefix: 'risks', stateTrigger: 'risks-lifecycle-filter-trigger', stateName: { en: 'Lifecycle', cs: 'Životní cyklus' } },
    { path: '/controls', prefix: 'controls', stateTrigger: 'controls-lifecycle-filter-trigger', stateName: { en: 'Lifecycle', cs: 'Životní cyklus' } },
    { path: '/kris', prefix: 'kris', stateTrigger: 'kris-lifecycle-filter-trigger', stateName: { en: 'Lifecycle', cs: 'Životní cyklus' } },
    { path: '/issues', prefix: 'issues', stateTrigger: 'issues-status-filter-trigger', stateName: { en: 'All statuses', cs: 'Všechny stavy' } },
] as const;

const VIEWPORTS = [
    { width: 1024, height: 900 },
    { width: 1440, height: 900 },
] as const;

async function setLocale(page: Page, locale: Locale): Promise<void> {
    await page.unroute('**/api/v1/preferences');
    await page.route('**/api/v1/preferences', async (route, request) => {
        if (request.method() !== 'GET') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ theme: 'riskhub', language: locale }),
        });
    });
    await page.evaluate((language) => localStorage.setItem('riskhub-language', language), locale);
}

async function expectControlGeometry(
    locator: Locator,
    expectedHeight: number,
    expectedRadius: number,
    label: string,
): Promise<void> {
    await expect(locator, `${label} visible`).toBeVisible();
    const geometry = await locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
            height: bounds.height,
            radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
        };
    });
    expect(Math.abs(geometry.height - expectedHeight), `${label} height`).toBeLessThanOrEqual(1);
    expect(geometry.radius, `${label} radius`).toBe(expectedRadius);
}

async function expectNoControlIntersections(controls: Locator[], label: string): Promise<void> {
    const bounds = await Promise.all(controls.map((control) => control.boundingBox()));
    expect(bounds.every(Boolean), `${label} control bounds`).toBe(true);
    const intersections: string[] = [];
    for (let leftIndex = 0; leftIndex < bounds.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < bounds.length; rightIndex += 1) {
            const left = bounds[leftIndex]!;
            const right = bounds[rightIndex]!;
            const intersects = left.x < right.x + right.width - 1
                && left.x + left.width > right.x + 1
                && left.y < right.y + right.height - 1
                && left.y + left.height > right.y + 1;
            if (intersects) intersections.push(`${leftIndex}/${rightIndex}`);
        }
    }
    expect(intersections, `${label} overlapping controls`).toEqual([]);
}

test.describe('desktop control-system geometry (#155)', () => {
    test('keeps all eight register controls aligned in English and Czech at supported desktop widths', async ({ riskManagerPage }) => {
        test.setTimeout(300_000);

        for (const locale of ['en', 'cs'] as const) {
            await setLocale(riskManagerPage, locale);
            for (const viewport of VIEWPORTS) {
                await riskManagerPage.setViewportSize(viewport);
                const optionalFilterRemoveTreatments: string[] = [];
                for (const register of REGISTERS) {
                    const label = `${locale} ${register.prefix} ${viewport.width}x${viewport.height}`;
                    await riskManagerPage.goto(register.path);
                    await waitForDataLoad(riskManagerPage, 30_000);
                    const shell = riskManagerPage.getByTestId(`${register.prefix}-register-shell`);
                    await expect(shell).toBeVisible();
                    await expect(riskManagerPage.getByTestId('sortable-table-skeleton')).toHaveCount(0, { timeout: 30_000 });

                    const search = riskManagerPage.getByTestId(`${register.prefix}-search-input`);
                    const toolbar = search.locator('xpath=ancestor::section[1]');
                    const lifecycle = toolbar.locator('button[role="combobox"]:visible');
                    const addFilter = riskManagerPage.getByTestId(`${register.prefix}-add-filter`);
                    const addFilterControl = addFilter.locator('..');
                    const refresh = riskManagerPage.getByTestId(`${register.prefix}-refresh-button`);

                    await expectControlGeometry(search, 40, 12, `${label} search`);
                    const stateTrigger = riskManagerPage.getByTestId(register.stateTrigger);
                    await expect(stateTrigger, `${label} primary state control name`).toHaveAccessibleName(register.stateName[locale]);
                    const lifecycleCount = await lifecycle.count();
                    expect(lifecycleCount, `${label} lifecycle controls`).toBeGreaterThan(0);
                    for (let index = 0; index < lifecycleCount; index += 1) {
                        await expectControlGeometry(lifecycle.nth(index), 40, 12, `${label} lifecycle ${index}`);
                    }
                    await expectControlGeometry(addFilterControl, 40, 12, `${label} add filter`);
                    await expectControlGeometry(refresh, 40, 12, `${label} refresh`);
                    await expectNoControlIntersections(
                        [search, ...await lifecycle.all(), addFilterControl, refresh],
                        label,
                    );

                    const idleAddFilterShadow = await addFilterControl.evaluate((element) => (
                        getComputedStyle(element).boxShadow
                    ));
                    await search.focus();
                    let addFilterReached = false;
                    for (let tabIndex = 0; tabIndex < lifecycleCount + 2; tabIndex += 1) {
                        await riskManagerPage.keyboard.press('Tab');
                        addFilterReached = await addFilter.evaluate((element) => element === document.activeElement);
                        if (addFilterReached) break;
                    }
                    expect(addFilterReached, `${label} keyboard-focused add filter`).toBe(true);
                    const addFilterFocus = await addFilterControl.evaluate((element) => {
                        const probe = document.createElement('span');
                        probe.style.color = 'hsl(var(--ring))';
                        element.appendChild(probe);
                        const ringColor = getComputedStyle(probe).color;
                        probe.remove();
                        return {
                            boxShadow: getComputedStyle(element).boxShadow,
                            ringColor,
                        };
                    });
                    expect(addFilterFocus.boxShadow, `${label} visible add-filter focus`).not.toBe(idleAddFilterShadow);
                    expect(addFilterFocus.boxShadow, `${label} semantic add-filter focus color`).toContain(addFilterFocus.ringColor);

                    for (const view of await shell.locator('[data-testid*="-view-"]').all()) {
                        await expectControlGeometry(view, 32, 10, `${label} view`);
                    }
                    for (const actionName of ['create', 'export'] as const) {
                        const action = riskManagerPage.getByTestId(`${register.prefix}-${actionName}-button`);
                        if (await action.count()) {
                            await expectControlGeometry(action, 40, 12, `${label} ${actionName}`);
                        }
                    }

                    const availableOptions = await addFilter.locator('option').evaluateAll((options) => (
                        options.map((option) => (option as HTMLOptionElement).value).filter(Boolean)
                    ));
                    if (availableOptions[0]) {
                        await addFilter.selectOption(availableOptions[0]);
                        const remove = toolbar.getByRole('button', {
                            name: locale === 'en' ? /^Remove / : /^Odebrat /,
                        }).first();
                        await expectControlGeometry(remove, 32, 10, `${label} optional filter remove`);
                        await riskManagerPage.mouse.move(0, 0);
                        await expect.poll(
                            () => remove.evaluate((element) => element.matches(':hover')),
                            { message: `${label} optional filter remove idle` },
                        ).toBe(false);
                        optionalFilterRemoveTreatments.push(await remove.evaluate((element) => {
                            const style = getComputedStyle(element);
                            return JSON.stringify({ background: style.backgroundColor, foreground: style.color });
                        }));
                        const filterCard = remove.locator('..');
                        const domainControl = filterCard.locator(
                            '[data-testid*="-filter-control-"], button[role="combobox"], label:has(> select)',
                        ).first();
                        await expect(domainControl, `${label} optional filter control visible`).toBeVisible();
                        await expectNoControlIntersections(
                            [remove, domainControl],
                            `${label} optional filter`,
                        );

                        const interactiveControl = filterCard.locator(
                            'input:not([type="hidden"]):not(:disabled), select:not(:disabled), button[role="combobox"]:not(:disabled)',
                        ).first();
                        await expect(interactiveControl, `${label} optional filter interactive control`).toBeVisible();
                        await remove.focus();
                        await riskManagerPage.keyboard.press('Tab');
                        await expect(interactiveControl, `${label} optional filter keyboard reachable`).toBeFocused();
                        const interactiveRole = await interactiveControl.getAttribute('role');
                        await interactiveControl.click();
                        if (interactiveRole === 'combobox') {
                            await expect(riskManagerPage.getByRole('listbox'), `${label} optional filter clickable`).toBeVisible();
                            await riskManagerPage.keyboard.press('Escape');
                        } else {
                            await expect(interactiveControl, `${label} optional filter clickable`).toBeFocused();
                        }
                    }

                    const pageWidth = await riskManagerPage.evaluate(() => ({
                        client: document.documentElement.clientWidth,
                        scroll: document.documentElement.scrollWidth,
                    }));
                    expect(pageWidth.scroll, `${label} document overflow`).toBeLessThanOrEqual(pageWidth.client + 1);
                }
                expect(optionalFilterRemoveTreatments, `${locale} ${viewport.width}px optional filter remove coverage`).toHaveLength(REGISTERS.length);
                expect(
                    new Set(optionalFilterRemoveTreatments).size,
                    `${locale} ${viewport.width}px optional filter remove visual treatments`,
                ).toBe(1);
            }
        }
    });

    test('keeps every Asset detail back state on the shared 40px control contract', async ({ deptHeadPage }) => {
        const asset = await getAssetByName(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
        expect(asset).not.toBeNull();
        const assetId = asset!.id;
        let state: 'error' | 'governed-blocked' | 'ownership-blocked' | 'edit' | 'view' = 'view';

        await setLocale(deptHeadPage, 'en');
        await deptHeadPage.route(
            new RegExp(`/api/v1/assets/${assetId}(?:\\?.*)?$`),
            async (route, request) => {
                if (request.method() !== 'GET') {
                    await route.continue();
                    return;
                }
                if (state === 'error') {
                    await route.fulfill({
                        status: 500,
                        contentType: 'application/json',
                        body: JSON.stringify({ detail: 'Asset unavailable' }),
                    });
                    return;
                }
                const response = await route.fetch();
                const body = await response.json() as Record<string, unknown>;
                const capabilities = {
                    ...(body.capabilities as Record<string, unknown>),
                    can_read: true,
                    can_update: state !== 'governed-blocked',
                    can_archive: true,
                    can_restore: false,
                    has_pending_change: state === 'governed-blocked',
                    business_edit_blocked: state === 'governed-blocked',
                    can_cancel_pending_change: false,
                };
                const pendingChange = state === 'governed-blocked' ? {
                    approval_id: null,
                    proposal_id: null,
                    proposal_version: null,
                    status: 'pending',
                    requested_at: '2026-08-29T00:00:00Z',
                    requested_by_name: null,
                    reason: '',
                    generic_label: 'protected_asset_change',
                    mutation_kind: null,
                    before: {},
                    after: {},
                    derived_impact: {},
                    impacted_resources: [],
                    relationship_change: null,
                    capabilities: { can_view_diff: false, can_cancel: false },
                } : null;
                await route.fulfill({
                    response,
                    json: {
                        ...body,
                        business_owner_orphaned: state === 'ownership-blocked',
                        ict_owner_orphaned: false,
                        ownership_status: state === 'ownership-blocked' ? 'pending_governance' : 'assigned',
                        capabilities,
                        pending_change: pendingChange,
                    },
                });
            },
        );

        const scenarios = [
            { state: 'error' as const, path: `/assets/${assetId}`, destination: '/assets' },
            { state: 'governed-blocked' as const, path: `/assets/${assetId}/edit`, destination: `/assets/${assetId}` },
            { state: 'ownership-blocked' as const, path: `/assets/${assetId}/edit`, destination: `/assets/${assetId}` },
            { state: 'edit' as const, path: `/assets/${assetId}/edit`, destination: `/assets/${assetId}` },
            { state: 'view' as const, path: `/assets/${assetId}`, destination: '/assets' },
        ];

        for (const viewport of VIEWPORTS) {
            await deptHeadPage.setViewportSize(viewport);
            for (const scenario of scenarios) {
                state = scenario.state;
                await deptHeadPage.goto(scenario.path);
                const back = deptHeadPage.getByRole('button', { name: 'Back to Assets' });
                await expectControlGeometry(
                    back,
                    40,
                    12,
                    `${scenario.state} Asset back ${viewport.width}x${viewport.height}`,
                );
                await expect(back).toHaveAttribute('type', 'button');

                if (scenario.state === 'error') {
                    await expect(deptHeadPage.getByText('Asset not found.')).toBeVisible();
                } else if (scenario.state === 'governed-blocked') {
                    await expect(deptHeadPage.getByTestId('asset-pending-change')).toBeVisible();
                    await expect(deptHeadPage.getByTestId('asset-form-name')).toHaveCount(0);
                } else if (scenario.state === 'ownership-blocked') {
                    const ownershipAlert = deptHeadPage.getByTestId('asset-orphan-edit-blocked');
                    await expect(ownershipAlert).toBeVisible();
                    await expect(deptHeadPage.getByTestId('asset-form-name')).toHaveCount(0);
                } else if (scenario.state === 'edit') {
                    await expect(deptHeadPage.getByTestId('asset-form-name')).toBeVisible();
                } else {
                    await expect(back).toHaveAttribute('data-testid', 'asset-detail-back');
                    await expect(deptHeadPage.getByTestId('asset-detail-edit')).toBeVisible();
                }

                await back.click();
                await expect(deptHeadPage).toHaveURL(new RegExp(`${scenario.destination}$`));
            }
        }
    });

    test('keeps the audited Vendor identity fields on shared default geometry and naming', async ({ riskManagerPage }) => {
        await setLocale(riskManagerPage, 'en');
        await riskManagerPage.setViewportSize({ width: 1440, height: 900 });
        await riskManagerPage.goto('/vendors/new');

        for (const name of ['Vendor Name', 'Legal Name', 'Registration ID', 'Website']) {
            const input = riskManagerPage.getByRole('textbox', { name });
            await expectControlGeometry(input, 40, 12, `Vendor identity ${name}`);
        }
        for (const name of ['Vendor Type', 'Country']) {
            await expectControlGeometry(
                riskManagerPage.getByRole('combobox', { name }),
                40,
                12,
                `Vendor identity ${name}`,
            );
        }

        const nameInput = riskManagerPage.getByRole('textbox', { name: 'Vendor Name' });
        await nameInput.focus();
        const focus = await nameInput.evaluate((element) => {
            const probe = document.createElement('span');
            probe.style.color = 'hsl(var(--ring))';
            element.appendChild(probe);
            const ringColor = getComputedStyle(probe).color;
            probe.remove();
            return { boxShadow: getComputedStyle(element).boxShadow, ringColor };
        });
        expect(focus.boxShadow).toContain(focus.ringColor);
        await expect(riskManagerPage.getByRole('textbox', { name: 'Description' })).toBeVisible();
    });
});
