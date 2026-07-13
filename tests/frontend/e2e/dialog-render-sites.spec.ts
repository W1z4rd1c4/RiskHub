import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

interface RenderSite {
  id: string;
  component: string;
  file: string;
}

interface ImplementationSurface {
  component: string;
  role: 'dialog' | 'alertdialog';
}

const contractPath = path.resolve(__dirname, '../contracts/dialog-surfaces.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as {
  implementationSurfaces: ImplementationSurface[];
  applicationRenderSites: RenderSite[];
};
const roles = new Map(contract.implementationSurfaces.map((surface) => [surface.component, surface.role]));

const department = {
  id: 1,
  name: 'IT',
  code: 'IT',
  manager_id: null,
  manager_name: null,
  is_active: true,
  user_count: 0,
  risk_count: 0,
  high_risk_count: 0,
  control_count: 0,
  kri_count: 0,
  vendor_count: 0,
  pending_orphan_count: 0,
  breaching_kri_count: 0,
  total_net_score: 0,
  capabilities: { can_update: true, can_delete: true, can_restore: false },
};
const riskType = {
  id: 1,
  code: 'operational',
  display_name: 'Operational',
  description: 'Operational risks',
  color: '#3b82f6',
  icon: null,
  sort_order: 1,
  is_active: true,
  is_system: false,
  risk_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  capabilities: { can_create: true, can_update: true, can_delete: true, can_restore: false },
};
const panelCapabilities = { can_create: true, can_update: true, can_batch_send: false };

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installApiContract(page: Page, unexpected: string[]) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = `${request.method()} ${url.pathname}`;
    if (request.method() !== 'GET') {
      unexpected.push(endpoint);
      await route.fulfill({ status: 500, body: 'unexpected mutation' });
      return;
    }
    switch (url.pathname) {
      case '/api/v1/auth/config':
        await json(route, { auth_mode: 'hybrid_dev', demo_login_enabled: true }); return;
      case '/api/v1/preferences':
        await json(route, { theme: 'riskhub', language: 'en' }); return;
      case '/api/v1/riskhub/capabilities':
        await json(route, {
          risk_types: panelCapabilities,
          departments: panelCapabilities,
          roles: panelCapabilities,
          approval_scenarios: panelCapabilities,
          system_settings: panelCapabilities,
          questionnaires: panelCapabilities,
        }); return;
      case '/api/v1/riskhub/departments':
        await json(route, [department]); return;
      case '/api/v1/riskhub/risk-types':
        await json(route, [riskType]); return;
      case '/api/v1/riskhub/approval-scenarios':
        await json(route, [{
          id: 5,
          key: 'risk_update',
          display_name: 'Risk update',
          description: 'Approve risk updates',
          requires_approval: true,
          approver_roles: ['risk_owner'],
          updated_at: '2026-04-01T00:00:00Z',
          updated_by_name: null,
          capabilities: { can_update: true },
        }]); return;
      case '/api/v1/riskhub/roles':
      case '/api/v1/access/roles':
        await json(route, []); return;
      case '/api/v1/access/users':
      case '/api/v1/users':
      case '/api/v1/users/lookup':
        await json(route, []); return;
      case '/api/v1/departments':
        await json(route, [department]); return;
      case '/api/v1/lookups/risk-filters':
        await json(route, { processes: [], categories: [] }); return;
      case '/api/v1/vendors':
        await json(route, { items: [], total: 0, offset: 0, limit: 25 }); return;
      case '/api/v1/controls':
      case '/api/v1/risks':
        await json(route, { items: [], total: 0, offset: 0, limit: 100 }); return;
      case '/api/v1/risks/1':
        await json(route, {
          id: 1,
          risk_id_code: 'R-0001',
          name: 'Authentication Drift',
          process: 'Authentication',
          risk_type: 'operational',
          category: 'IT',
          description: 'Risk detail',
          department_id: 1,
          owner_id: 1,
          gross_probability: 3,
          gross_impact: 4,
          gross_score: 12,
          net_probability: 2,
          net_impact: 3,
          net_score: 6,
          status: 'active',
          is_archived: false,
          is_priority: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }); return;
      case '/api/v1/dashboard/risks-by-cell':
        await json(route, [{ id: 41, risk_id_code: 'R-0041', name: 'Matrix Risk', description: 'Loaded', net_score: 16, department_name: 'IT', owner_name: 'Ada' }]); return;
      case '/api/v1/questionnaires/1':
        await json(route, {
          id: 1,
          risk_id: 1,
          risk_name: 'Authentication Drift',
          assigned_to_user_id: 9,
          sent_by_user_id: 2,
          status: 'in_progress',
          template_key: 'risk_owner_reassessment',
          template_version: 'v1',
          sent_at: '2026-01-01T00:00:00Z',
          due_at: '2026-12-31T00:00:00Z',
          answers: {},
          capabilities: { can_open: false, can_save_draft: false, can_submit: false, can_request_clarification: false, can_respond_to_clarifications: false },
        }); return;
      case '/api/v1/questionnaires/1/clarifications':
        await json(route, []); return;
      default:
        if (url.pathname.startsWith('/api/v1/riskhub/public-config/')) {
          const key = url.pathname.split('/').at(-1) ?? '';
          const values: Record<string, number> = {
            critical_risk_min_net_score: 16,
            high_risk_min_net_score: 10,
            medium_risk_min_net_score: 5,
            total_assets_value: 1_000_000,
          };
          await json(route, { key, value: values[key] ?? 0, value_type: 'number' });
          return;
        }
        unexpected.push(endpoint);
        await route.fulfill({ status: 500, body: `unexpected request: ${endpoint}` });
    }
  });
}

function panelOpener(page: Page, site: RenderSite): Locator {
  if (site.id.includes('approval-scenarios')) return page.getByRole('button', { name: 'Configure' }).first();
  if (site.id.startsWith('inline.')) return page.getByRole('button', { name: 'Delete' }).first();
  return page.getByRole('button', { name: 'Edit' }).first();
}

async function assertFocusInside(page: Page, surface: Locator) {
  await expect.poll(async () => surface.evaluate((node) => node.contains(document.activeElement))).toBe(true);
}

test.describe('validated application dialog render sites', () => {
  for (const site of contract.applicationRenderSites) {
    test(`[render-site:${site.id}] ${site.component} via ${site.file}`, async ({ page }) => {
      const unexpectedRequests: string[] = [];
      const unexpectedOutput: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          unexpectedOutput.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => unexpectedOutput.push(`pageerror: ${error.message}`));
      await installApiContract(page, unexpectedRequests);
      await page.goto(`/dialog-contract.html?site=${encodeURIComponent(site.id)}&component=${encodeURIComponent(site.component)}`);

      const panel = site.component === 'DepartmentsPanel' || site.component === 'RiskTypesPanel' || site.component === 'RiskHubModalFrame';
      const opener = panel ? panelOpener(page, site) : page.getByTestId('dialog-contract-opener');
      await opener.waitFor({ state: 'visible' });
      await opener.focus();
      await opener.click();

      const role = site.id.startsWith('inline.') ? 'alertdialog' : roles.get(site.component);
      expect(role, `role registered for ${site.component}`).toBeTruthy();
      const surface = page.locator(`[role="${role}"]`).last();
      await expect(surface).toBeVisible();
      await expect(surface).toHaveAttribute('aria-modal', 'true');
      const accessibleName = await surface.evaluate((node) => {
        const ids = node.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
        return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      });
      expect(accessibleName.length).toBeGreaterThan(0);
      await assertFocusInside(page, surface);

      for (let index = 0; index < 8; index += 1) {
        await page.keyboard.press('Tab');
        await assertFocusInside(page, surface);
      }
      for (let index = 0; index < 8; index += 1) {
        await page.keyboard.press('Shift+Tab');
        await assertFocusInside(page, surface);
      }

      await page.keyboard.press('Escape');
      await expect(surface).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(unexpectedRequests).toEqual([]);
      expect(unexpectedOutput).toEqual([]);
    });
  }
});
