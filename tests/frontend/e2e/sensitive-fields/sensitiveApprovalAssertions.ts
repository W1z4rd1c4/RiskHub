import { expect, type Page } from '@playwright/test';

import { ApprovalsPage } from '../pages/ApprovalsPage';

interface SensitiveApprovalFixture {
    reason: string;
    resourceType: string;
    action: string;
    status: string;
    fieldLabel: string;
    oldDisplayValue: string;
    newDisplayValue: string;
}

export async function expectSensitiveApproval(page: Page, fixture: SensitiveApprovalFixture): Promise<void> {
    const approvalsPage = new ApprovalsPage(page);
    await approvalsPage.navigate();

    const index = await approvalsPage.findCardByReason(fixture.reason);
    expect(index, `Expected seeded approval reason: ${fixture.reason}`).toBeGreaterThanOrEqual(0);

    const card = approvalsPage.getCard(index);
    await expect(card).toContainText(new RegExp(fixture.resourceType, 'i'));
    await expect(card).toContainText(fixture.reason);
    await approvalsPage.expectStatus(index, fixture.status);
    expect(await approvalsPage.getActionType(index)).toContain(fixture.action);

    await approvalsPage.expandChanges(index);
    const changes = card.getByTestId(/^approval-legacy-changes-/);
    const field = changes.getByText(fixture.fieldLabel, { exact: true }).locator('..');
    await expect(field).toBeVisible();
    await expect(field.getByRole('deletion')).toHaveText(`Old Value: ${fixture.oldDisplayValue}`);
    await expect(field.getByRole('insertion')).toHaveText(`New Value: ${fixture.newDisplayValue}`);
}
