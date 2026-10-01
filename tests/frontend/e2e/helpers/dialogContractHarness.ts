import { expect, type Locator, type Page, type Route } from '@playwright/test';

/**
 * Shared driver for the `frontend/dialog-contract.html` owner harness: the
 * deterministic GET-only API contract, the parent render-site ids, how each
 * owner is arranged and which control opens its dialog. Used by
 * `dialog-render-sites.spec.ts` (dialog contract) and
 * `theme-rendered-contrast.spec.ts` (G-RENDER measured contrast).
 */

export interface DialogContractPreferences {
  theme: string;
  language: string;
}

export const dialogContractDepartment = {
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
const roleFixture = {
  id: 1,
  name: 'auditor',
  display_name: 'Auditor',
  description: 'Read-only auditor role',
  is_system: false,
  is_active: true,
  user_count: 0,
  permissions: [],
  capabilities: { can_update: true, can_delete: true, can_restore: false },
};

export function fulfillJson(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function installDialogContractApi(
  page: Page,
  unexpected: string[],
  preferences: DialogContractPreferences = { theme: 'riskhub', language: 'en' },
) {
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
        await fulfillJson(route, { auth_mode: 'hybrid_dev', demo_login_enabled: true }); return;
      case '/api/v1/preferences':
        await fulfillJson(route, preferences); return;
      case '/api/v1/riskhub/capabilities':
        await fulfillJson(route, {
          risk_types: panelCapabilities,
          departments: panelCapabilities,
          roles: panelCapabilities,
          approval_scenarios: panelCapabilities,
          system_settings: panelCapabilities,
          questionnaires: panelCapabilities,
        }); return;
      case '/api/v1/riskhub/departments':
        await fulfillJson(route, [dialogContractDepartment]); return;
      case '/api/v1/riskhub/risk-types':
        await fulfillJson(route, [riskType]); return;
      case '/api/v1/riskhub/public-risk-types':
        await fulfillJson(route, [{
          code: riskType.code,
          display_name: riskType.display_name,
          color: riskType.color,
          icon: riskType.icon,
          sort_order: riskType.sort_order,
        }]); return;
      case '/api/v1/riskhub/approval-scenarios':
        await fulfillJson(route, [{
          id: 5,
          key: 'risk_update',
          display_name: 'Risk update',
          description: 'Approve risk updates',
          requires_approval: true,
          approver_roles: ['risk_owner'],
          fixed_policy: false,
          updated_at: '2026-04-01T00:00:00Z',
          updated_by_name: null,
          capabilities: { can_update: true },
        }]); return;
      case '/api/v1/riskhub/roles':
      case '/api/v1/access/roles':
        await fulfillJson(route, [roleFixture]); return;
      case '/api/v1/permissions':
      case '/api/v1/access/permissions':
      case '/api/v1/riskhub/permissions':
        await fulfillJson(route, []); return;
      case '/api/v1/access/users':
      case '/api/v1/users':
      case '/api/v1/users/lookup':
      case '/api/v1/users/lookup/risk-owners':
      case '/api/v1/users/lookup/control-owners':
      case '/api/v1/users/lookup/vendor-owners':
        await fulfillJson(route, []); return;
      case '/api/v1/departments':
        await fulfillJson(route, [dialogContractDepartment]); return;
      case '/api/v1/lookups/risk-filters':
        await fulfillJson(route, { processes: [], categories: [], subprocesses_by_process: {} }); return;
      case '/api/v1/vendors':
        await fulfillJson(route, { items: [], total: 0, offset: 0, limit: 25 }); return;
      case '/api/v1/controls':
      case '/api/v1/risks':
        await fulfillJson(route, {
          items: url.pathname.endsWith('/risks') ? [{
            id: 1,
            risk_id_code: 'R-0001',
            name: 'Authentication Drift',
            process: 'Authentication',
            risk_type: 'operational',
            category: 'IT',
            description: 'Risk detail',
            gross_score: 12,
            gross_probability: 3,
            gross_impact: 4,
            net_score: 6,
            status: 'active',
            is_archived: false,
            is_priority: false,
            department_id: 1,
            department_name: 'IT',
          }] : [],
          total: url.pathname.endsWith('/risks') ? 1 : 0,
          offset: 0,
          limit: 100,
        }); return;
      case '/api/v1/controls/1/executions':
        await fulfillJson(route, [{
          id: 1,
          control_id: 1,
          executed_at: '2026-01-01T00:00:00Z',
          executed_by_id: 1,
          executed_by: { id: 1, name: 'Ada Owner', email: 'ada@example.test' },
          result: 'failed',
          findings: 'Missing evidence',
          evidence_reference: null,
          notes: null,
          next_scheduled: null,
          created_at: '2026-01-01T00:00:00Z',
        }]); return;
      case '/api/v1/risks/1/questionnaires':
        await fulfillJson(route, [{
          id: 1,
          risk_id: 1,
          status: 'in_progress',
          due_at: '2026-12-31T00:00:00Z',
          sent_at: '2026-01-01T00:00:00Z',
          assigned_to_user_id: 9,
          sent_by_user_id: 2,
          template_key: 'risk_owner_reassessment',
          template_version: 'v1',
          answers: {},
          capabilities: {
            can_open: true,
            can_save_draft: false,
            can_submit: false,
            can_request_clarification: false,
            can_respond_to_clarifications: false,
          },
        }]); return;
      case '/api/v1/risks/1/questionnaires/latest-submitted':
        await fulfillJson(route, null); return;
      case '/api/v1/assets/1/process-links':
        await fulfillJson(route, [{
          id: 1,
          asset_id: 1,
          process_id: 1,
          process_name: 'Claims',
          process_business_edit_blocked: false,
          is_primary: true,
          created_at: '2026-01-01T00:00:00Z',
        }]); return;
      case '/api/v1/assets/1/asset-links':
        await fulfillJson(route, []); return;
      case '/api/v1/assets/1/vendor-links':
      case '/api/v1/vendors/1/linked-risks':
        await fulfillJson(route, []); return;
      case '/api/v1/vendors/1/contracts':
        await fulfillJson(route, [{
          id: 1,
          vendor_id: 1,
          contract_reference: 'DIALOG-CONTRACT-1',
          is_archived: false,
          capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }]); return;
      case '/api/v1/vendors/1/sub-outsourcing':
        await fulfillJson(route, [{
          id: 1,
          vendor_id: 1,
          contract_id: 1,
          predecessor_id: null,
          sub_provider_name: 'DIALOG-SUB-1',
          is_archived: false,
          capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }]); return;
      case '/api/v1/ict-register/reference/closed-lists':
        await fulfillJson(route, { lists: [] }); return;
      case '/api/v1/ict-register/reference/ict-service-taxonomy':
        await fulfillJson(route, { services: [] }); return;
      case '/api/v1/kris/breaches':
      case '/api/v1/kris/overdue':
      case '/api/v1/kris/due-soon':
        await fulfillJson(route, []); return;
      case '/api/v1/kris':
        await fulfillJson(route, { items: [], total: 0, offset: 0, limit: 25 }); return;
      case '/api/v1/processes':
      case '/api/v1/assets':
        await fulfillJson(route, { items: [], total: 0, offset: 0, limit: 25 }); return;
      case '/api/v1/risks/1':
        await fulfillJson(route, {
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
        await fulfillJson(route, [{ id: 41, risk_id_code: 'R-0041', name: 'Matrix Risk', description: 'Loaded', net_score: 16, department_name: 'IT', owner_name: 'Ada' }]); return;
      case '/api/v1/questionnaires/1':
        await fulfillJson(route, {
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
        await fulfillJson(route, []); return;
      default:
        if (url.pathname.startsWith('/api/v1/riskhub/public-config/')) {
          const key = url.pathname.split('/').at(-1) ?? '';
          const values: Record<string, number> = {
            critical_risk_min_net_score: 16,
            high_risk_min_net_score: 10,
            medium_risk_min_net_score: 5,
            total_assets_value: 1_000_000,
          };
          await fulfillJson(route, { key, value: values[key] ?? 0, value_type: 'number' });
          return;
        }
        unexpected.push(endpoint);
        await route.fulfill({ status: 500, body: `unexpected request: ${endpoint}` });
    }
  });
}

export const DIALOG_CONTRACT_PARENT_SITE_IDS: ReadonlySet<string> = new Set([
  'confirm.link-management',
  'issue.execution-history',
  'mismatch.kri-form',
  'role-modal.roles-panel',
  'role-delete.roles-panel',
  'questionnaire.risk-detail-tab',
  'link.risk-linked-controls',
  'control-create.risk-linked-controls',
  'link.vendor-linked-entities',
  'confirm.asset-links',
  'confirm.vendor-contracts',
  'confirm.vendor-sub-outsourcing',
  'confirm.governed-mutation-reason',
  'confirm.pending-change-cancellation',
  'confirm.dirty-task-guard',
  'link.control-overview',
  'risk-view.control-overview',
  'risk-drilldown.dashboard',
  'issue.contextual-action',
  'inline.departments-delete',
  'inline.risk-types-delete',
  'frame.departments',
  'frame.risk-types',
  'frame.approval-scenarios',
]);

export async function arrangeDialogContractSite(page: Page, siteId: string) {
  await page.goto(`/dialog-contract.html?site=${encodeURIComponent(siteId)}`);
  await expect(page.getByTestId('dialog-owner-ready')).toHaveAttribute('data-render-site', siteId);
  if (siteId === 'mismatch.kri-form') {
    const next = page.getByRole('button', { name: /next/i });
    await next.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole('button', { name: /create kri/i })).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  }
}

export const dialogContractOpeners: Readonly<Record<string, (page: Page) => Locator>> = {
  'confirm.link-management': (page) => page.getByRole('dialog').getByRole('button', { name: /unlink/i }).first(),
  'issue.execution-history': (page) => page.getByRole('button', { name: /new issue/i }).first(),
  'mismatch.kri-form': (page) => page.getByRole('button', { name: /create kri/i }).first(),
  'role-modal.roles-panel': (page) => page.getByRole('button', { name: /add role/i }).first(),
  'role-delete.roles-panel': (page) => page.getByRole('button', { name: /delete/i }).first(),
  'questionnaire.risk-detail-tab': (page) => page.getByRole('button', { name: /open/i }).first(),
  'link.risk-linked-controls': (page) => page.getByRole('button', { name: /link existing/i }).first(),
  'control-create.risk-linked-controls': (page) => page.getByRole('button', { name: /add control/i }).first(),
  'link.vendor-linked-entities': (page) => page.getByTestId('vendor-linked-kris-link-existing'),
  'confirm.asset-links': (page) => page.getByTestId('asset-process-link-remove-1'),
  'confirm.vendor-contracts': (page) => page.getByTestId('vendor-contract-archive-1'),
  'confirm.vendor-sub-outsourcing': (page) => page.getByTestId('vendor-sub-outsourcing-archive-1'),
  'confirm.governed-mutation-reason': (page) => page.getByRole('button', { name: /open governed mutation reason/i }),
  'confirm.pending-change-cancellation': (page) => page.getByRole('button', { name: /open pending cancellation/i }),
  'confirm.dirty-task-guard': (page) => page.getByRole('button', { name: /leave dirty task/i }),
  'link.control-overview': (page) => page.getByRole('button', { name: /link.*risk|manage.*risk|controls:detail/i }).first(),
  'risk-view.control-overview': (page) => page.getByRole('button', { name: /authentication drift/i }).first(),
  'risk-drilldown.dashboard': (page) => page.getByRole('button', { name: /1.*probability.*4.*impact.*4/i }).first(),
  'issue.contextual-action': (page) => page.getByRole('button', { name: /new issue/i }).first(),
  'inline.departments-delete': (page) => page.getByRole('button', { name: /delete/i }).first(),
  'inline.risk-types-delete': (page) => page.getByRole('button', { name: /delete/i }).first(),
  'frame.departments': (page) => page.getByRole('button', { name: /edit/i }).first(),
  'frame.risk-types': (page) => page.getByRole('button', { name: /edit/i }).first(),
  'frame.approval-scenarios': (page) => page.getByRole('button', { name: /configure/i }).first(),
};

/** Sites whose opener needs more than a keyboard activation. */
export function dialogContractActivation(siteId: string): ((opener: Locator) => Promise<void>) | undefined {
  if (siteId !== 'confirm.dirty-task-guard') return undefined;
  return async (opener) => {
    await opener.page().getByTestId('dirty-task-contract-input').fill('Unsaved contract draft');
    await opener.click();
  };
}
