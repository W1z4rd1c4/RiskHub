import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/auth.fixture';
import { E2E_ASSETS } from './fixtures/e2e-data';
import { cleanupGovernedProcessFixture, cleanupWithoutMaskingPrimaryFailure, getAssetByName } from './helpers/ict-register';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { waitForDataLoad } from './helpers/wait';
import { ApprovalsPage } from './pages/ApprovalsPage';

interface LocaleJourney {
    language: 'en' | 'cs';
    title: string;
    assetType: string;
    oppositeAssetType: string;
    yes: string;
    oppositeYes: string;
    myRequests: string;
    oppositeMyRequests: string;
}

const journeys: LocaleJourney[] = [
    {
        language: 'en',
        title: 'English register and governed approval keep controlled labels language-pure and free text unchanged',
        assetType: 'Application',
        oppositeAssetType: 'Aplikace',
        yes: 'Yes',
        oppositeYes: 'Ano',
        myRequests: 'My Requests',
        oppositeMyRequests: 'Moje žádosti',
    },
    {
        language: 'cs',
        title: 'Czech register and governed approval keep controlled labels language-pure and free text unchanged',
        assetType: 'Aplikace',
        oppositeAssetType: 'Application',
        yes: 'Ano',
        oppositeYes: 'Yes',
        myRequests: 'Moje žádosti',
        oppositeMyRequests: 'My Requests',
    },
];

async function selectLanguage(page: Page, language: 'en' | 'cs'): Promise<void> {
    if (new URL(page.url()).pathname === '/login') {
        await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
    }
    await page.goto('/settings');
    await waitForDataLoad(page);
    await page.getByTestId('settings-tab-localization').click();
    const saved = page.waitForResponse((response) => (
        response.request().method() === 'PUT'
        && new URL(response.url()).pathname === '/api/v1/preferences'
    ));
    await page.getByTestId(`language-${language}`).click();
    expect((await saved).status()).toBe(200);
    await page.reload();
    if (new URL(page.url()).pathname === '/login') {
        await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);
    }
}

async function cleanupLocaleJourney(page: Page, processName: string): Promise<void> {
    const failures: unknown[] = [];
    for (const cleanup of [
        () => cleanupGovernedProcessFixture({ processName }),
        () => selectLanguage(page, 'en'),
    ]) {
        try {
            await cleanup();
        } catch (error) {
            failures.push(error);
        }
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Failed to clean up the localized DORA journey');
    }
}

test.describe('DORA localized register and governed approval journeys', () => {
    for (const journey of journeys) {
        test(journey.title, async ({ riskManagerPage }) => {
            const processName = `E2E-LOCALE-${journey.language}-${Date.now()}`;
            const reason = `Locale evidence ${journey.language} ${processName}`;
            const asset = await getAssetByName(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
            expect(asset).not.toBeNull();
            let primaryFailure: unknown;

            try {
                await selectLanguage(riskManagerPage, journey.language);

                await riskManagerPage.goto(`/assets/${asset!.id}`);
                await waitForDataLoad(riskManagerPage);
                await expect(riskManagerPage.getByRole('heading', {
                    name: E2E_ASSETS.CORE_CLAIMS_SYSTEM.name,
                })).toBeVisible();
                await expect(riskManagerPage.getByText(journey.assetType, { exact: true }).first())
                    .toBeVisible();
                await expect(riskManagerPage.getByText(journey.oppositeAssetType, { exact: true }))
                    .toHaveCount(0);

                await riskManagerPage.goto('/processes/new');
                await waitForDataLoad(riskManagerPage);
                await riskManagerPage.getByTestId('process-form-l0-area').fill('Locale evidence');
                await riskManagerPage.getByTestId('process-form-l1-process').fill(processName);
                await riskManagerPage.getByTestId('process-form-owner').click();
                await riskManagerPage.getByRole('option')
                    .filter({ hasText: 'ops.analyst@riskhub.local' })
                    .first()
                    .click();
                await riskManagerPage.getByTestId('process-form-cif-override').click();
                await expect(riskManagerPage.getByRole('option', { name: journey.yes, exact: true }))
                    .toBeVisible();
                await riskManagerPage.getByRole('option', { name: journey.yes, exact: true }).click();
                await riskManagerPage.getByTestId('process-form-request-reason').fill(reason);
                const submitted = riskManagerPage.waitForResponse((response) => (
                    response.request().method() === 'POST'
                    && new URL(response.url()).pathname === '/api/v1/processes'
                ));
                await riskManagerPage.getByTestId('process-form-submit').click();
                expect((await submitted).status()).toBe(202);

                const approvals = new ApprovalsPage(riskManagerPage);
                await expect(riskManagerPage).toHaveURL(/\/approvals\?tab=mine&approvalId=\d+$/, {
                    timeout: 15000,
                });
                await approvals.waitForApprovalsReady();
                await expect(riskManagerPage.getByRole('tab', { name: journey.myRequests, exact: true }))
                    .toBeVisible();
                await expect(riskManagerPage.getByRole('tab', {
                    name: journey.oppositeMyRequests,
                    exact: true,
                })).toHaveCount(0);
                const requestIndex = await approvals.findCardByReason(reason);
                const card = approvals.getCard(requestIndex);
                await expect(card).toContainText(processName);
                await expect(card).toContainText(reason);
                const approvalId = new URL(riskManagerPage.url()).searchParams.get('approvalId');
                expect(approvalId).not.toBeNull();
                const governedDiff = riskManagerPage.getByTestId(`approval-governed-mutation-${approvalId}`);
                await expect(governedDiff).toBeVisible();
                await expect(governedDiff.getByText(journey.yes, { exact: true }).first()).toBeVisible();
                await expect(governedDiff.getByText(journey.oppositeYes, { exact: true })).toHaveCount(0);
                const cancelled = riskManagerPage.waitForResponse((response) => (
                    response.request().method() === 'POST'
                    && /\/api\/v1\/approvals\/\d+\/cancel$/.test(new URL(response.url()).pathname)
                ));
                await card.locator(
                    'button[title="Cancel Request"], button[title="Zrušit požadavek"]',
                ).click();
                await riskManagerPage.getByRole('alertdialog')
                    .getByRole('button', { name: /Confirm|Potvrdit/, exact: true })
                    .click();
                expect((await cancelled).status()).toBe(200);
            } catch (error) {
                primaryFailure = error;
                throw error;
            } finally {
                await cleanupWithoutMaskingPrimaryFailure(
                    primaryFailure,
                    () => cleanupLocaleJourney(riskManagerPage, processName),
                    test.info(),
                );
            }
        });
    }
});
