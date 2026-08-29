import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_ASSETS, E2E_CONTROLS, E2E_RISKS, E2E_VENDORS } from './fixtures/e2e-data';
import {
    getApiBaseUrl,
    getControlByName,
    getDemoTokenByAccountName,
    getRiskByCode,
    getVendorByRegistration,
} from './helpers/api-auth';
import { DEMO_ACCOUNTS } from './helpers/login';
import { waitForDataLoad } from './helpers/wait';

const SUPPORTED_VIEWPORTS = [
    { width: 1024, height: 600 },
    { width: 1024, height: 900 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
] as const;

const DETAIL_HEADER_VIEWPORTS = [
    { width: 1024, height: 600 },
    { width: 1024, height: 900 },
] as const;

const TEXT_SPACING_CSS = `
    * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
    }
    p { margin-bottom: 2em !important; }
`;

type Locale = 'en' | 'cs';

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

async function visit(page: Page, path: string): Promise<void> {
    await page.goto(path);
    await waitForDataLoad(page, 30_000);
    await expect(page.getByRole('main')).toBeVisible();
}

async function applyTextSpacing(page: Page): Promise<void> {
    await page.addStyleTag({ content: TEXT_SPACING_CSS });
}

async function expectNoDocumentHorizontalOverflow(page: Page, label: string): Promise<void> {
    const geometry = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth, `${label} document horizontal overflow`).toBeLessThanOrEqual(
        geometry.clientWidth + 1,
    );
}

async function expectContained(child: Locator, parent: Locator, label: string): Promise<void> {
    const [childBox, parentBox] = await Promise.all([child.boundingBox(), parent.boundingBox()]);
    expect(childBox, `${label} child bounds`).not.toBeNull();
    expect(parentBox, `${label} parent bounds`).not.toBeNull();
    expect(childBox!.x, `${label} left edge`).toBeGreaterThanOrEqual(parentBox!.x - 1);
    expect(childBox!.x + childBox!.width, `${label} right edge`).toBeLessThanOrEqual(
        parentBox!.x + parentBox!.width + 1,
    );
    expect(childBox!.y, `${label} top edge`).toBeGreaterThanOrEqual(parentBox!.y - 1);
    expect(childBox!.y + childBox!.height, `${label} bottom edge`).toBeLessThanOrEqual(
        parentBox!.y + parentBox!.height + 1,
    );
}

async function expectTableKeyboardReach(page: Page, route: '/risks' | '/threats'): Promise<void> {
    await visit(page, route);
    const regionName = (await page.locator('html').getAttribute('lang'))?.startsWith('cs')
        ? 'Posuvná datová tabulka'
        : 'Scrollable data table';
    const viewport = page.getByRole('region', { name: regionName }).filter({ has: page.getByRole('table') });
    await expect(viewport).toHaveCount(1);
    await expect(viewport).toHaveAttribute('tabindex', '0');

    const before = await viewport.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
    }));
    expect(before.scrollWidth, `${route} deterministic seed must overflow`).toBeGreaterThan(before.clientWidth);

    await viewport.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before.scrollLeft);
    for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('ArrowRight');
    }

    const finalColumn = viewport.getByRole('columnheader').last();
    await expectContained(finalColumn, viewport, `${route} final column after keyboard scroll`);
    await expect(page.getByText('More columns to the right')).toHaveCount(0);
    await expectNoDocumentHorizontalOverflow(page, route);
}

async function firstEntityId(page: Page, apiPath: string): Promise<number> {
    const token = await getDemoTokenByAccountName(DEMO_ACCOUNTS.CRO);
    const response = await page.request.get(new URL(apiPath, getApiBaseUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok(), apiPath).toBe(true);
    const payload = await response.json() as { items?: Array<{ id: number }> } | Array<{ id: number }>;
    const item = Array.isArray(payload) ? payload[0] : payload.items?.[0];
    expect(item?.id, `${apiPath} fixture id`).toBeTruthy();
    return item!.id;
}

async function installLongDetailFixture(page: Page, pathFragment: string): Promise<void> {
    await page.route(`**/api/v1/${pathFragment}/*`, async (route, request) => {
        if (request.method() !== 'GET') {
            await route.continue();
            return;
        }
        const response = await route.fetch();
        const contentType = response.headers()['content-type'] ?? '';
        if (!response.ok() || !contentType.includes('application/json')) {
            await route.fulfill({ response });
            return;
        }
        const body = await response.json() as Record<string, unknown>;
        if (typeof body.id !== 'number' || typeof body.name !== 'string') {
            await route.fulfill({ response });
            return;
        }
        body.name = `${body.name} ${'UNBROKEN'.repeat(18)}`;
        if ('description' in body) {
            body.description = `Long localized description\nSecond authored line ${'DETAIL'.repeat(24)}`;
        }
        if (typeof body.risk_id_code === 'string') body.risk_id_code = `RISK-${'IDENTIFIER'.repeat(14)}`;
        if (typeof body.registration_id === 'string') body.registration_id = `REG-${'IDENTIFIER'.repeat(14)}`;
        await route.fulfill({ response, json: body });
    });
}

test.describe('Supported desktop resilience (#156)', () => {
    test('states the honest desktop-only boundary in English and Czech and records F-01 as accepted', async ({ riskManagerPage }) => {
        test.info().annotations.push({
            type: 'accepted-limitation',
            description: 'F-01: effective widths below 1024 at 200%/400% zoom present this notice; Resize Text and Reflow remain accepted deviations, not passes.',
        });

        for (const locale of ['en', 'cs'] as const) {
            await setLocale(riskManagerPage, locale);
            await riskManagerPage.setViewportSize({ width: 1023, height: 900 });
            await riskManagerPage.reload();
            const notice = riskManagerPage.getByTestId('desktop-only-notice');
            await expect(notice).toBeVisible();
            await expect(notice).toContainText(locale === 'en'
                ? 'workflows are unavailable'
                : 'Pracovní postupy RiskHubu nejsou dostupné');
            await expect(notice).toContainText(locale === 'en' ? 'administrator' : 'správce');
            await expect(notice).not.toContainText(/zoom|přiblíž|oddal|lupa|WCAG|conform/i);
            await expect(riskManagerPage.getByRole('main')).toBeHidden();
        }
    });

    for (const viewport of SUPPORTED_VIEWPORTS) {
        test(`keeps every authorized CRO sidebar destination keyboard-visible with text spacing at ${viewport.width}x${viewport.height}`, async ({ croPage }) => {
            await setLocale(croPage, 'en');
            await croPage.setViewportSize(viewport);
            await croPage.reload();
            await croPage.waitForLoadState('networkidle');
            await waitForDataLoad(croPage, 30_000);
            await applyTextSpacing(croPage);

            await croPage.locator('body').evaluate((body) => {
                body.tabIndex = -1;
                body.focus();
            });
            await croPage.keyboard.press('Tab');
            const skipLink = croPage.getByRole('link', { name: 'Skip to main content' });
            await expect(skipLink).toBeFocused();
            await croPage.keyboard.press('Enter');
            await expect(croPage.getByRole('main')).toBeFocused();

            const navigation = croPage.getByRole('navigation', { name: 'Primary navigation' });
            const links = navigation.getByRole('link');
            const footer = croPage.getByTestId('logout-button').locator('..');
            if (viewport.width === 1024 && viewport.height === 600) {
                const overflowCue = croPage.getByText('More destinations below', { exact: true });
                await expect(overflowCue).toBeVisible();
                expect(Number.parseFloat(await overflowCue.evaluate((element) => getComputedStyle(element).fontSize)))
                    .toBeGreaterThanOrEqual(12);
                const [navigationBox, cueBox, footerBox] = await Promise.all([
                    navigation.boundingBox(),
                    overflowCue.boundingBox(),
                    footer.boundingBox(),
                ]);
                expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(cueBox!.y + 1);
                expect(cueBox!.y + cueBox!.height).toBeLessThanOrEqual(footerBox!.y + 1);

                await links.last().focus();
                await expect(overflowCue).toHaveCount(0);
                await expectContained(links.last(), navigation, 'last focused sidebar destination');

                await links.first().focus();
                await expect(overflowCue).toBeVisible();
                await navigation.hover();
                await croPage.mouse.wheel(0, 10_000);
                await expect(overflowCue).toHaveCount(0);
                await croPage.mouse.wheel(0, -10_000);
                await expect(overflowCue).toBeVisible();
            }
            const expectedHrefs = await links.evaluateAll((items) => items.map((item) => item.getAttribute('href')));
            const reached = new Set<string>();
            await croPage.locator('body').evaluate((body) => body.focus());
            for (let step = 0; step < expectedHrefs.length + 12; step += 1) {
                await croPage.keyboard.press('Tab');
                const activeHref = await croPage.evaluate(() => document.activeElement?.getAttribute('href'));
                if (activeHref && expectedHrefs.includes(activeHref)) {
                    reached.add(activeHref);
                    await expectContained(croPage.locator(':focus'), navigation, `focused sidebar ${activeHref}`);
                }
            }
            expect([...reached].sort()).toEqual([...new Set(expectedHrefs.filter(Boolean) as string[])].sort());

            for (const link of await links.all()) {
                await link.scrollIntoViewIfNeeded();
                await expectContained(link, navigation, 'pointer-reachable sidebar destination');
                const linkGeometry = await link.evaluate((element) => ({
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                }));
                expect(linkGeometry.scrollWidth, 'sidebar destination text clipping')
                    .toBeLessThanOrEqual(linkGeometry.clientWidth + 1);
            }
            const lastLink = links.last();
            const [navBox, footerBox] = await Promise.all([navigation.boundingBox(), footer.boundingBox()]);
            expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(footerBox!.y + 1);
            const scrolling = await navigation.evaluate((element) => ({
                clientHeight: element.clientHeight,
                overflowY: getComputedStyle(element).overflowY,
                scrollHeight: element.scrollHeight,
                scrollbarGutter: getComputedStyle(element).scrollbarGutter,
            }));
            if (scrolling.scrollHeight > scrolling.clientHeight + 1) {
                expect(scrolling.overflowY).toBe('auto');
                expect(scrolling.scrollbarGutter).toContain('stable');
            }
            await lastLink.scrollIntoViewIfNeeded();
            await expectNoDocumentHorizontalOverflow(croPage, `shell ${viewport.width}x${viewport.height}`);

            if (viewport.width === 1024 && viewport.height === 600) {
                await setLocale(croPage, 'cs');
                await croPage.reload();
                await croPage.waitForLoadState('networkidle');
                await waitForDataLoad(croPage, 30_000);
                await applyTextSpacing(croPage);
                await expect(croPage.getByText('Další cíle navigace níže', { exact: true })).toBeVisible();
                await expectNoDocumentHorizontalOverflow(croPage, 'Czech shell 1024x600');
            }
        });
    }

    test('updates the Risks table overflow contract across live resizes without reload', async ({ riskManagerPage }) => {
        await setLocale(riskManagerPage, 'en');
        await riskManagerPage.setViewportSize({ width: 2600, height: 900 });
        await visit(riskManagerPage, '/risks');
        const viewport = riskManagerPage.getByRole('region', { name: 'Scrollable data table' });
        await expect(viewport).toHaveAttribute('tabindex', '-1');
        await expect(riskManagerPage.getByText('More columns to the right')).toHaveCount(0);

        await riskManagerPage.setViewportSize({ width: 1440, height: 900 });
        await expect(viewport).toHaveAttribute('tabindex', '0');
        await expect(riskManagerPage.getByText('More columns to the right')).toBeVisible();

        await riskManagerPage.setViewportSize({ width: 2600, height: 900 });
        await expect(viewport).toHaveAttribute('tabindex', '-1');
        await expect(riskManagerPage.getByText('More columns to the right')).toHaveCount(0);
    });

    test('reveals the final seeded Risks column using literal Arrow keys', async ({ riskManagerPage }) => {
        await setLocale(riskManagerPage, 'en');
        await riskManagerPage.setViewportSize({ width: 1440, height: 900 });
        await expectTableKeyboardReach(riskManagerPage, '/risks');
    });

    test('reveals the final seeded Threats column using literal Arrow keys', async ({ riskManagerPage }) => {
        await setLocale(riskManagerPage, 'en');
        await riskManagerPage.setViewportSize({ width: 1440, height: 900 });
        await expectTableKeyboardReach(riskManagerPage, '/threats');
    });

    test('keeps Department metrics contained in both locales, long text, and all supported geometries', async ({ riskManagerPage }) => {
        for (const locale of ['en', 'cs'] as const) {
            await setLocale(riskManagerPage, locale);
            await riskManagerPage.setViewportSize({ width: 1024, height: 900 });
            await visit(riskManagerPage, '/departments');
            const listCard = riskManagerPage.getByRole('main').getByRole('button').filter({
                has: riskManagerPage.getByRole('heading', { level: 3 }),
            }).first();
            await expect(listCard).toBeVisible();
            await applyTextSpacing(riskManagerPage);
            const firstMetricLabel = listCard.getByText(locale === 'en' ? 'People' : 'Lidé', { exact: true });
            await firstMetricLabel.evaluate((element) => {
                element.textContent = `${element.textContent} ${'DELIBERATELYLONGLOCALIZEDMETRIC'.repeat(4)}`;
            });
            const departmentName = listCard.getByRole('heading', { level: 3 });
            const departmentCode = listCard.locator('p').first();
            const departmentStatus = listCard.getByText(
                locale === 'en' ? /\d+\s+CRITICAL/i : /\d+\s+KRITICK/i,
            ).first();
            await departmentName.evaluate((element) => {
                element.textContent = `${element.textContent}${'DELIBERATELYLONGDEPARTMENTNAME'.repeat(6)}`;
            });
            await departmentCode.evaluate((element) => {
                element.textContent = `${element.textContent}${'DELIBERATELYLONGDEPARTMENTCODE'.repeat(6)}`;
            });
            await departmentStatus.evaluate((element) => {
                element.textContent = `${element.textContent}${'DELIBERATELYLONGDEPARTMENTSTATUS'.repeat(6)}`;
            });

            const listCardGeometry = await listCard.evaluate((element) => ({
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
            }));
            expect(listCardGeometry.scrollWidth, `${locale} Department list card horizontal overflow`)
                .toBeLessThanOrEqual(listCardGeometry.clientWidth + 1);
            const metricTextBoxes = await listCard.locator('span').evaluateAll((elements) => {
                const metricParents = [...new Set(elements
                    .map((element) => element.parentElement)
                    .filter((parent): parent is HTMLElement => parent !== null
                        && [...parent.children].filter((child) => child.tagName === 'SPAN').length === 2))];
                return elements
                    .filter((element) => metricParents.includes(element.parentElement as HTMLElement))
                    .map((element) => {
                        const bounds = element.getBoundingClientRect();
                        return {
                            bottom: bounds.bottom,
                            left: bounds.left,
                            metric: metricParents.indexOf(element.parentElement as HTMLElement),
                            right: bounds.right,
                            text: element.textContent ?? '',
                            top: bounds.top,
                        };
                    });
            });
            expect(metricTextBoxes, `${locale} Department list metric text nodes`).toHaveLength(10);
            const intersections: string[] = [];
            for (let leftIndex = 0; leftIndex < metricTextBoxes.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < metricTextBoxes.length; rightIndex += 1) {
                    const left = metricTextBoxes[leftIndex];
                    const right = metricTextBoxes[rightIndex];
                    if (left.metric === right.metric) continue;
                    const intersects = left.left < right.right - 1
                        && left.right > right.left + 1
                        && left.top < right.bottom - 1
                        && left.bottom > right.top + 1;
                    if (intersects) intersections.push(`${left.text} / ${right.text}`);
                }
            }
            expect(intersections, `${locale} Department list metric label/value intersections`).toEqual([]);
            const headerTextBoxes = await Promise.all([
                departmentName.boundingBox(),
                departmentCode.boundingBox(),
                departmentStatus.boundingBox(),
            ]);
            expect(headerTextBoxes.every((bounds) => bounds !== null), `${locale} Department header text bounds`).toBe(true);
            const headerIntersections: string[] = [];
            for (let leftIndex = 0; leftIndex < headerTextBoxes.length; leftIndex += 1) {
                for (let rightIndex = leftIndex + 1; rightIndex < headerTextBoxes.length; rightIndex += 1) {
                    const left = headerTextBoxes[leftIndex]!;
                    const right = headerTextBoxes[rightIndex]!;
                    const intersects = left.x < right.x + right.width - 1
                        && left.x + left.width > right.x + 1
                        && left.y < right.y + right.height - 1
                        && left.y + left.height > right.y + 1;
                    if (intersects) headerIntersections.push(`${leftIndex}/${rightIndex}`);
                }
            }
            expect(headerIntersections, `${locale} Department name/code/status intersections`).toEqual([]);
            await expectContained(departmentName, listCard, `${locale} Department list name`);
            await expectContained(departmentCode, listCard, `${locale} Department list code`);
            await expectContained(departmentStatus, listCard, `${locale} Department list status`);
            await expectNoDocumentHorizontalOverflow(riskManagerPage, `${locale} Department list 1024x900`);

            for (const viewport of SUPPORTED_VIEWPORTS) {
                await riskManagerPage.setViewportSize(viewport);
                await visit(riskManagerPage, '/departments');
                const departmentCard = riskManagerPage.getByRole('main').getByRole('button').filter({
                    has: riskManagerPage.getByRole('heading', { level: 3 }),
                }).first();
                await departmentCard.click();
                await waitForDataLoad(riskManagerPage);
                const grid = riskManagerPage.getByTestId('department-stats-grid');
                await expect(grid).toBeVisible();

                await applyTextSpacing(riskManagerPage);
                await grid.locator('article').first().locator('button').last().evaluate((element) => {
                    element.textContent = `123 ${'DELIBERATELYLONGLOCALIZEDMETRIC'.repeat(4)}`;
                });

                for (const card of await grid.locator('article').all()) {
                    await expectContained(card, grid, `${locale} Department card`);
                    const horizontalOverflow = await card.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
                    expect(horizontalOverflow, `${locale} Department card horizontal overflow`).toBe(false);
                    for (const button of await card.getByRole('button').all()) {
                        await expectContained(button, card, `${locale} Department metric`);
                    }
                }
                await expectNoDocumentHorizontalOverflow(riskManagerPage, `${locale} Department ${viewport.width}x${viewport.height}`);
            }
        }
    });

    test('keeps Vendor, Risk, Control, and Asset headers semantic and contained for CRO with text spacing', async ({ croPage }) => {
        await setLocale(croPage, 'en');
        await croPage.setViewportSize(DETAIL_HEADER_VIEWPORTS[0]);
        await installLongDetailFixture(croPage, 'vendors');
        await installLongDetailFixture(croPage, 'risks');
        await installLongDetailFixture(croPage, 'controls');
        await installLongDetailFixture(croPage, 'assets');

        const vendor = await getVendorByRegistration(E2E_VENDORS.ACTIVE_PRIMARY.registration_id);
        const risk = await getRiskByCode(E2E_RISKS.PRIORITY_PRIVILEGED_APPROVAL.code);
        const control = await getControlByName(E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name);
        const assetId = await firstEntityId(croPage, `/api/v1/assets?search=${encodeURIComponent(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name)}&limit=1`);
        expect(vendor?.id).toBeTruthy();
        expect(risk?.id).toBeTruthy();
        expect(control?.id).toBeTruthy();

        const routes = [
            `/vendors/${vendor!.id}`,
            `/risks/${risk!.id}`,
            `/controls/${control!.id}`,
            `/assets/${assetId}`,
        ];
        for (const locale of ['en', 'cs'] as const) {
            await setLocale(croPage, locale);
            for (const viewport of DETAIL_HEADER_VIEWPORTS) {
                await croPage.setViewportSize(viewport);
                for (const route of routes) {
                    await visit(croPage, route);
                    await applyTextSpacing(croPage);
                    const header = croPage.locator('main header').filter({ has: croPage.getByRole('heading', { level: 1 }) }).first();
                    await expect(header).toBeVisible();
                    await expect(header.getByRole('heading', { level: 1 })).toHaveCount(1);
                    await expectContained(
                        header.getByRole('heading', { level: 1 }),
                        header,
                        `${locale} ${route} ${viewport.width}x${viewport.height} heading`,
                    );
                    if (route.startsWith('/assets/')) {
                        const description = header.getByText(/^Long localized description/);
                        await expect(description).toContainText('Second authored line');
                        expect(await description.evaluate((element) => ({
                            text: element.textContent,
                            whiteSpace: getComputedStyle(element).whiteSpace,
                        }))).toMatchObject({
                            text: expect.stringContaining('description\nSecond authored line'),
                            whiteSpace: 'pre-wrap',
                        });
                    }
                    const headerButtons = header.getByRole('button');
                    await expect(headerButtons).not.toHaveCount(0);
                    await headerButtons.last().evaluate((element) => {
                        element.textContent = 'DELIBERATELYLONGUNBROKENACTION'.repeat(6);
                    });
                    for (const button of await headerButtons.all()) {
                        await expectContained(
                            button,
                            header,
                            `${locale} ${route} ${viewport.width}x${viewport.height} action`,
                        );
                    }
                    const headerGeometry = await header.evaluate((element) => ({
                        clientWidth: element.clientWidth,
                        scrollWidth: element.scrollWidth,
                    }));
                    expect(headerGeometry.scrollWidth, `${locale} ${route} header text clipping`)
                        .toBeLessThanOrEqual(headerGeometry.clientWidth + 1);
                    await expectNoDocumentHorizontalOverflow(
                        croPage,
                        `${locale} ${route} ${viewport.width}x${viewport.height} header`,
                    );
                }
            }
            await croPage.setViewportSize(DETAIL_HEADER_VIEWPORTS[0]);
            await visit(croPage, `/vendors/${vendor!.id}`);
            await applyTextSpacing(croPage);
            const vendorHeader = croPage.locator('main header').filter({ has: croPage.getByRole('heading', { level: 1 }) }).first();
            await expect(vendorHeader.getByRole('heading', { level: 1 })).toContainText(E2E_VENDORS.ACTIVE_PRIMARY.name);
            await expect(vendorHeader.getByText(/^REG-IDENTIFIER/)).toBeVisible();
            await expect(vendorHeader.getByRole('separator', {
                name: locale === 'en' ? 'Identifier separator' : 'Oddělovač identifikátoru',
            })).toBeVisible();
        }
    });
});
