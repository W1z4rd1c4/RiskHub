import { expect, test, type APIRequestContext } from '@playwright/test';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import { E2E_CONTROLS, E2E_KRIS, E2E_RISKS, E2E_VENDORS } from './fixtures/e2e-data';

type ListPayload = { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;

function getItems(payload: ListPayload): Array<Record<string, unknown>> {
    return Array.isArray(payload) ? payload : payload.items ?? [];
}

async function resolveEntityId(
    request: APIRequestContext,
    headers: Record<string, string>,
    endpoint: string,
    params: Record<string, string | number | boolean>,
    matcher: (item: Record<string, unknown>) => boolean
): Promise<number> {
    const response = await request.get(endpoint, { headers, params });
    expect(response.ok(), await response.text()).toBeTruthy();
    const payload = (await response.json()) as ListPayload;
    const match = getItems(payload).find(matcher);
    expect(match).toBeTruthy();
    return Number(match?.id);
}

test.describe('issues contextual create', () => {
    test('create issue from risk/control/kri/vendor detail pages', async ({ page, request }) => {
        await page.addInitScript(() => {
            localStorage.setItem('riskhub-language', 'en');
        });
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);

        const token = await page.evaluate(() => localStorage.getItem('access_token'));
        test.skip(!token, 'Token not available after login');

        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        const riskId = await resolveEntityId(
            request,
            headers,
            '/api/v1/risks',
            { search: E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.name, include_archived: true, limit: 50 },
            (item) => item.name === E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.name
        );

        const controlId = await resolveEntityId(
            request,
            headers,
            '/api/v1/controls',
            { search: E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name, include_archived: true, limit: 50 },
            (item) => item.name === E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name
        );

        const kriId = await resolveEntityId(
            request,
            headers,
            '/api/v1/kris',
            { search: E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name, include_archived: true, size: 50 },
            (item) => item.metric_name === E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name
        );

        const vendorId = await resolveEntityId(
            request,
            headers,
            '/api/v1/vendors',
            { search: E2E_VENDORS.ACTIVE_PRIMARY.name, include_archived: true, limit: 50 },
            (item) => item.name === E2E_VENDORS.ACTIVE_PRIMARY.name
        );

        const cases = [
            { path: `/risks/${riskId}`, label: E2E_RISKS.CROSS_DEPT_FIN_OWNS_OPS.name, prefix: 'E2E Risk Context Issue' },
            { path: `/controls/${controlId}`, label: E2E_CONTROLS.CROSS_DEPT_OPS_OWNS_IT.name, prefix: 'E2E Control Context Issue' },
            { path: `/kris/${kriId}`, label: E2E_KRIS.CROSS_DEPT_FIN_REPORTS_IT.metric_name, prefix: 'E2E KRI Context Issue' },
            { path: `/vendors/${vendorId}`, label: E2E_VENDORS.ACTIVE_PRIMARY.name, prefix: 'E2E Vendor Context Issue' },
        ];

        for (const entry of cases) {
            await page.goto(entry.path);

            const createIssueButton = page.getByRole('button', { name: /New Issue|Nový nález/i }).first();
            await expect(createIssueButton).toBeVisible({ timeout: 15000 });
            await createIssueButton.click();

            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible({ timeout: 10000 });
            await expect(dialog.getByText(entry.label)).toBeVisible({ timeout: 10000 });

            await page.getByPlaceholder(/Issue title|Název nálezu/i).fill(`${entry.prefix} ${Date.now()}`);
            await page.getByRole('button', { name: /Create Issue|Vytvořit nález/i }).click();
            await expect(page).toHaveURL(/\/issues\/\d+$/);
        }
    });
});
