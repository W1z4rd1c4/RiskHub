import type { Locator } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_ICT_VENDOR } from './fixtures/e2e-data';
import { getVendorByRegistration } from './helpers/api-auth';
import { waitForDataLoad } from './helpers/wait';
import { VendorDetailPage } from './pages/VendorDetailPage';

const DESKTOP_BREAKPOINT = 1024;
const TEST_VIEWPORT_HEIGHT = 900;

interface HorizontalScrollSnapshot {
    clientWidth: number;
    finalColumnHorizontallyVisible: boolean;
    overflowX: string;
    scrollLeft: number;
    scrollWidth: number;
}

async function horizontalScrollSnapshot(table: Locator): Promise<HorizontalScrollSnapshot> {
    return table.evaluate((node) => {
        const htmlTable = node as HTMLTableElement;
        const scroller = htmlTable.parentElement;
        if (!scroller) throw new Error('Seeded table has no direct scroll container.');

        const finalColumn = htmlTable.tHead?.rows[0]?.cells.item(htmlTable.tHead.rows[0].cells.length - 1);
        if (!finalColumn) throw new Error('Seeded table has no final column header.');
        const scrollerRect = scroller.getBoundingClientRect();
        const finalColumnRect = finalColumn.getBoundingClientRect();

        return {
            clientWidth: scroller.clientWidth,
            finalColumnHorizontallyVisible:
                finalColumnRect.left >= scrollerRect.left - 1 && finalColumnRect.right <= scrollerRect.right + 1,
            overflowX: getComputedStyle(scroller).overflowX,
            scrollLeft: scroller.scrollLeft,
            scrollWidth: scroller.scrollWidth,
        };
    });
}

async function expectTableToScrollToFinalColumn(table: Locator, label: string): Promise<void> {
    await expect(table).toBeVisible();
    await table.scrollIntoViewIfNeeded();

    const before = await horizontalScrollSnapshot(table);
    expect(before.overflowX, `${label} must use its direct parent as the horizontal scroller`).toBe('auto');
    expect(before.scrollWidth, `${label} seed must exercise real horizontal overflow`).toBeGreaterThan(
        before.clientWidth,
    );

    await table.evaluate((node) => {
        const scroller = (node as HTMLTableElement).parentElement;
        if (!scroller) throw new Error('Seeded table has no direct scroll container.');
        scroller.scrollLeft = scroller.scrollWidth;
    });

    await expect.poll(async () => (await horizontalScrollSnapshot(table)).scrollLeft).toBeGreaterThan(0);
    const after = await horizontalScrollSnapshot(table);
    expect(after.finalColumnHorizontallyVisible, `${label} final column must be revealed after scrolling`).toBe(true);
}

async function seededVendorId(): Promise<number> {
    const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
    if (!vendor) {
        throw new Error(`Vendor '${E2E_ICT_VENDOR.registration_id}' not found — run the deterministic E2E seed first.`);
    }
    return vendor.id;
}

test.describe('Desktop boundary and dense-table overflow (#67)', () => {
    test('replaces the application shell only below the 1024px desktop boundary', async ({ riskManagerPage }) => {
        const notice = riskManagerPage.getByTestId('desktop-only-notice');
        const shell = riskManagerPage.locator('main').locator('xpath=../..');

        await riskManagerPage.setViewportSize({ width: DESKTOP_BREAKPOINT - 1, height: TEST_VIEWPORT_HEIGHT });
        await expect(notice).toBeVisible();
        await expect(shell).toBeHidden();
        await expect(notice).not.toContainText(/zoom|přiblíž|oddal|lupa/i);

        await riskManagerPage.setViewportSize({ width: DESKTOP_BREAKPOINT, height: TEST_VIEWPORT_HEIGHT });
        await expect(shell).toBeVisible();
        await expect(notice).toBeHidden();
    });

    test('scrolls the seeded DepartmentTable to its final column at 1024px', async ({ riskManagerPage }) => {
        await riskManagerPage.setViewportSize({ width: DESKTOP_BREAKPOINT, height: TEST_VIEWPORT_HEIGHT });
        await riskManagerPage.goto('/');
        await waitForDataLoad(riskManagerPage);

        const table = riskManagerPage.locator('table').filter({
            has: riskManagerPage.getByRole('columnheader', { name: /Quick Actions|Rychlé akce/i }),
        });
        await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
        expect(await table.locator('tbody tr').count(), 'department seed must render multiple metric rows').toBeGreaterThan(1);

        await expectTableToScrollToFinalColumn(table, 'DepartmentTable');
    });

    test('scrolls the seeded VendorSubOutsourcingChainTable to its final column at 1024px', async ({
        riskManagerPage,
    }) => {
        await riskManagerPage.setViewportSize({ width: DESKTOP_BREAKPOINT, height: TEST_VIEWPORT_HEIGHT });
        const detailPage = new VendorDetailPage(riskManagerPage);
        await detailPage.navigateToSection(await seededVendorId(), 'sub-outsourcing');

        const table = detailPage.subOutsourcingSection.locator('table').filter({
            has: riskManagerPage.getByTestId(/^vendor-sub-outsourcing-provider-/).first(),
        });
        await expect(table).toHaveCount(1);
        expect(
            await table.getByTestId(/^vendor-sub-outsourcing-provider-/).count(),
            'sub-outsourcing seed must render the dense chain rows',
        ).toBeGreaterThanOrEqual(4);

        await expectTableToScrollToFinalColumn(table, 'VendorSubOutsourcingChainTable');
    });
});
