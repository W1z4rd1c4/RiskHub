import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { renderedContrast } from './helpers/renderedContrast';

const capabilityNames = [
  'can_read', 'can_update', 'can_update_sensitive_fields', 'can_request_update_approval',
  'can_archive_immediately', 'can_request_archive_approval', 'can_restore', 'can_submit_value',
  'can_submit_backdated_value', 'can_request_value_submission_approval', 'can_view_history',
  'can_request_history_correction', 'can_apply_history_correction_immediately', 'can_link_vendors',
  'can_unlink_vendors', 'can_view_linked_vendors', 'can_create_issue', 'has_pending_delete_approval',
  'has_pending_update_approval', 'has_pending_value_submission_approval', 'has_pending_history_correction_approval',
  'requires_privileged_update_approval', 'requires_privileged_delete_approval',
];
function record(archived: boolean) {
  return {
    id: 180, risk_id: 1, metric_name: 'Liquidity buffer', description: '', current_value: 3,
    lower_limit: 0, upper_limit: 5, unit: '%', breach_status: 'within', frequency: 'monthly',
    last_updated: '2026-09-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z', is_archived: archived,
    capabilities: { ...Object.fromEntries(capabilityNames.map(key => [key, false])), can_read: true,
      can_restore: archived, can_archive_immediately: !archived, can_view_history: true },
  };
}

for (const theme of ['riskhub', 'dark', 'light']) {
  for (const locale of ['en', 'cs']) {
    test(`restore pending, rejection, unknown reconciliation and success: ${theme} ${locale}`, async ({ page }) => {
      const labels = locale === 'en'
        ? { restore: 'Unarchive', pending: 'Restoring…', retry: 'Retry restore', refresh: 'Refresh record', success: 'KRI restored.', rejected: 'Restore was rejected. Review the record and retry if appropriate.' }
        : { restore: 'Obnovit z archivu', pending: 'Obnovování…', retry: 'Zkusit obnovení znovu', refresh: 'Načíst záznam znovu', success: 'KRI byl obnoven.', rejected: 'Obnovení bylo odmítnuto. Zkontrolujte záznam a případně akci opakujte.' };
      const permissions = ['kris:read', 'risks:read'];
      const user = { id: 180, email: 'restore@example.test', name: 'Restore operator', role: 'cro',
        role_display_name: 'CRO', department_id: null, department_name: null, permissions,
        effective_permissions: permissions, access_scope: 'global', scope_label: 'Global' };
      let requests = 0;
      let reads = 0;
      let restored = false;
      let release!: () => void;
      const delayed = new Promise<void>(resolve => { release = resolve; });
      await page.addInitScript(({ theme, locale }) => {
        localStorage.setItem('riskhub-theme', theme);
        localStorage.setItem('riskhub-language', locale);
      }, { theme, locale });
      await page.route('**/api/v1/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
        if (path === '/api/v1/auth/config') return json({ auth_mode: 'hybrid_dev', demo_login_enabled: true,
          password_login_enabled: false, demo_personas: [{ section: 'privileged', name: 'Restore operator', email: 'restore@example.test', role_key: 'cro', dept_key: null, color: 'purple' }], sso: { enabled: false, provider: 'entra', scopes: [] } });
        if (path === '/api/v1/auth/refresh' || path === '/api/v1/auth/demo-login') return json({ access_token: 'restore-token', token_type: 'bearer', post_login_redirect_to: '/kris/180', user });
        if (path === '/api/v1/auth/me') return json(user);
        if (path === '/api/v1/auth/csrf') return route.fulfill({ status: 204 });
        if (path === '/api/v1/preferences') return json({ theme, language: locale });
        if (path === '/api/v1/users/me/shell-summary') return json({ unread_notifications_count: 0,
          pending_approvals_count: 0, questionnaire_inbox_count: 0, orphan_total_count: 0,
          can_view_governance: false, generated_at: '2026-09-01T00:00:00Z' });
        if (path === '/api/v1/kris/180') { reads++; return json(record(!restored)); }
        if (path === '/api/v1/kris/180/history') return json({ items: [], total: 0, page: 1, size: 50 });
        if (path === '/api/v1/kris/180/restore') {
          requests++;
          if (requests === 1) { await delayed; return json({ detail: 'Restore rejected' }, 422); }
          restored = true;
          return route.abort('connectionreset'); // commit may have happened, response was lost
        }
        if (path === '/api/v1/risks/1') return json({ detail: 'Not found' }, 404);
        throw new Error(`Unexpected fixture request: ${route.request().method()} ${path}`);
      });
      await page.goto('/login');
      await page.getByRole('button', { name: /Restore operator/ }).click();
      await expect(page.getByRole('heading', { name: 'Liquidity buffer' })).toBeVisible();
      const restore = page.getByRole('button', { name: labels.restore, exact: true });
      const initialReads = reads;
      await restore.click();
      const pending = page.getByRole('button', { name: labels.pending, exact: true });
      await expect(pending).toBeDisabled();
      await expect(pending).toHaveAttribute('aria-busy', 'true');
      await pending.evaluate(button => (button as HTMLButtonElement).click());
      expect(requests).toBe(1);
      expect(await renderedContrast(pending)).toBeGreaterThanOrEqual(4.5);
      release();
      // The outcome is one InlineMessage whose own role follows the tone (alert / status).
      const feedback = page.locator('#kri-restore-feedback');
      await expect(feedback).toBeVisible();
      await expect(feedback).toHaveAttribute('role', 'alert');
      expect(await renderedContrast(feedback.getByText(labels.rejected, { exact: true }))).toBeGreaterThanOrEqual(4.5);
      await page.getByRole('button', { name: labels.retry, exact: true }).click();
      await expect(feedback.getByRole('button', { name: labels.refresh })).toBeVisible();
      await expect(page.getByRole('button', { name: labels.restore, exact: true })).toBeDisabled();
      expect(requests).toBe(2);
      const axe = await new AxeBuilder({ page }).include('#kri-restore-feedback').analyze();
      expect(axe.violations).toEqual([]);
      await feedback.getByRole('button', { name: labels.refresh }).click();
      await expect(feedback).toHaveAttribute('role', 'status');
      await expect(feedback).toHaveText(labels.success);
      expect(await renderedContrast(feedback.getByText(labels.success, { exact: true }))).toBeGreaterThanOrEqual(4.5);
      await expect(page.getByRole('button', { name: labels.restore, exact: true })).toHaveCount(0);
      expect(requests).toBe(2);
      expect(reads).toBe(initialReads + 1);
    });
  }
}
