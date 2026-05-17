import { expect, type Page } from '@playwright/test';

import { ApprovalsPage } from '../pages/ApprovalsPage';

interface SensitiveApprovalFixture {
    reason: string;
    resourceType: string;
    action: string;
    status: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
}

function displayedValue(value: unknown): string {
    return value === null ? 'null' : String(value);
}

export async function expectSensitiveApproval(page: Page, fixture: SensitiveApprovalFixture): Promise<void> {
    const approvalsPage = new ApprovalsPage(page);
    await approvalsPage.navigate();

    const index = await approvalsPage.findCardByReason(fixture.reason);
    expect(index, `Expected seeded approval reason: ${fixture.reason}`).toBeGreaterThanOrEqual(0);

    const card = approvalsPage.getCard(index);
    await expect(card).toContainText(fixture.resourceType);
    await expect(card).toContainText(fixture.reason);
    await approvalsPage.expectStatus(index, fixture.status);
    expect(await approvalsPage.getActionType(index)).toContain(fixture.action);

    await approvalsPage.expandChanges(index);
    await expect(card).toContainText(fixture.field);
    await expect(card).toContainText(displayedValue(fixture.oldValue));
    await expect(card).toContainText(displayedValue(fixture.newValue));
}
