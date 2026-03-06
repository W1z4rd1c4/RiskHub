import { expect, test } from '@playwright/test';
import { getDemoTokenByAccountName } from './helpers/api-auth';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';

test.describe('issues workflow', () => {
    test('issues workflow lifecycle reflects in dashboard', async ({ page, request }) => {
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);

        const token = await getDemoTokenByAccountName(DEMO_ACCOUNTS.CRO);

        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        const meResponse = await request.get('/api/v1/auth/me', { headers });
        expect(meResponse.ok()).toBeTruthy();
        const me = (await meResponse.json()) as { id: number; department_id: number | null };
        expect(me.department_id).not.toBeNull();

        const issueTitle = `E2E issues workflow ${Date.now()}`;
        const createResponse = await request.post('/api/v1/issues', {
            headers,
            data: {
                title: issueTitle,
                description: 'Created by Playwright issues workflow',
                severity: 'high',
                source_type: 'manual',
                department_id: me.department_id,
                owner_user_id: me.id,
                due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
        });
        expect(createResponse.ok()).toBeTruthy();
        const createdIssue = (await createResponse.json()) as { id: number };

        const assignResponse = await request.post(`/api/v1/issues/${createdIssue.id}/assign`, {
            headers,
            data: {
                owner_user_id: me.id,
                due_at: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
                target_date: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
            },
        });
        expect(assignResponse.ok()).toBeTruthy();

        const startResponse = await request.post(`/api/v1/issues/${createdIssue.id}/start-remediation`, {
            headers,
            data: {},
        });
        expect(startResponse.ok()).toBeTruthy();

        const progressResponse = await request.post(`/api/v1/issues/${createdIssue.id}/update-progress`, {
            headers,
            data: {
                progress_percent: 100,
                completion_notes: 'E2E completed',
            },
        });
        expect(progressResponse.ok()).toBeTruthy();

        const exceptionRequestResponse = await request.post(`/api/v1/issues/${createdIssue.id}/request-exception`, {
            headers,
            data: {
                reason: 'E2E exception path validation',
            },
        });
        if (exceptionRequestResponse.ok()) {
            const exception = (await exceptionRequestResponse.json()) as { id: number };
            const approveResponse = await request.post(`/api/v1/issues/${createdIssue.id}/approve-exception`, {
                headers,
                data: {
                    exception_id: exception.id,
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                },
            });
            expect(approveResponse.ok(), await approveResponse.text()).toBeTruthy();
        }

        const closeResponse = await request.post(`/api/v1/issues/${createdIssue.id}/close`, {
            headers,
            data: {
                validation_note: 'E2E validation complete',
                completion_notes: 'Validated by automated test',
            },
        });
        expect(closeResponse.ok()).toBeTruthy();

        await page.goto('/issues');
        await expect(page.getByRole('heading', { name: /Issues|Nálezy/i })).toBeVisible({ timeout: 15000 });

        // Closed issues are hidden by default; include them so we can validate the full workflow end-state.
        const includeClosed = page.getByRole('checkbox', { name: /Include closed|Zahrnout uzavřené|Včetně uzavřených/i });
        if (await includeClosed.count()) {
            await includeClosed.check();
        }

        await expect(page.locator('tr').filter({ hasText: issueTitle }).first()).toBeVisible({ timeout: 15000 });

        await page.goto('/');
        await expect(page.getByRole('heading', { name: /Open Issues by Severity|Otevřené nálezy podle závažnosti/i })).toBeVisible({ timeout: 15000 });
    });
});
