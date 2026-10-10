import type { Locator, Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApprovalsPage } from '../../../e2e/pages/ApprovalsPage';

// Exercise the helper's selector union against DOM states using the classes
// rendered by ApprovalList. No background waiter may outlive the ready state.
function pageForMarkup(markup: string) {
    document.body.innerHTML = markup;
    const waits = vi.fn();
    const queries = new WeakMap<object, () => Element[]>();
    const makeLocator = (query: () => Element[]): Locator => {
        const locator = {
            first: () => makeLocator(() => query().slice(0, 1)),
            or: (other: Locator) => makeLocator(() => [...query(), ...queries.get(other)!()]),
            waitFor: async (options: { state: string; timeout: number }) => {
                waits(options);
                if (query().length === 0) throw new Error('No approval cards or empty state');
            },
        } as unknown as Locator;
        queries.set(locator, query);
        return locator;
    };
    const page = {
        locator: vi.fn((selector: string) => makeLocator(() => Array.from(document.querySelectorAll(selector)))),
        waitForSelector: vi.fn().mockResolvedValue(null),
    } as unknown as Page;
    return { page, waits };
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('ApprovalsPage list readiness', () => {
    it.each([
        ['cards', '<div class="space-y-4"><div class="glass-card">Approval request</div></div>'],
        ['empty state', '<div class="border-dashed">All caught up</div>'],
    ])('accepts %s through one completed locator wait', async (_state, markup) => {
        const { page, waits } = pageForMarkup(markup);

        await new ApprovalsPage(page).waitForApprovalsReady();

        expect(page.locator).toHaveBeenCalledWith('.space-y-4 .glass-card');
        expect(page.locator).toHaveBeenCalledWith('.border-dashed');
        expect(waits).toHaveBeenCalledExactlyOnceWith({ state: 'visible', timeout: 15000 });
    });

    it.each([
        ['loading', '<div role="status" aria-busy="true">Loading</div>'],
        ['error', '<div role="alert">Failed to load approvals</div>'],
    ])('does not treat %s as a ready list', async (_state, markup) => {
        const { page, waits } = pageForMarkup(markup);

        await expect(new ApprovalsPage(page).waitForApprovalsReady(4321))
            .rejects.toThrow('No approval cards or empty state');

        expect(waits).toHaveBeenCalledExactlyOnceWith({ state: 'visible', timeout: 4321 });
    });
});
