import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import {
  E2E_ASSETS,
  E2E_CONTROLS,
  E2E_KRIS,
  E2E_PROCESSES,
  E2E_RISKS,
  E2E_THREATS,
  E2E_VENDORS,
} from './fixtures/e2e-data';
import { DEMO_ACCOUNTS, loginAsDemoUser } from './helpers/login';
import {
  describeLiveNetworkFailure,
  describeLiveNetworkResponse,
} from './helpers/renderSiteOwnerMonitoring';
import { AssetsPage } from './pages/AssetsPage';
import { ControlsPage } from './pages/ControlsPage';
import { KRIsPage } from './pages/KRIsPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { RisksPage } from './pages/RisksPage';
import { VendorsPage } from './pages/VendorsPage';

interface RenderSite {
  id: string;
  component: string;
  file: string;
}

interface ImplementationSurface {
  component: string;
  role: 'dialog' | 'alertdialog';
}

interface RenderSiteDriver {
  mode: 'live' | 'parent';
  account?: string;
  allowedNetworkFailures?: readonly string[];
  allowedNetworkErrors?: readonly string[];
  arrange: (page: Page, site: RenderSite) => Promise<void>;
  opener: (page: Page) => Locator;
  ownerSentinel: (page: Page, site: RenderSite) => Locator;
  activate?: (opener: Locator) => Promise<void>;
  ready?: (page: Page, surface: Locator) => Promise<void>;
}

const contractPath = path.resolve(__dirname, '../contracts/dialog-surfaces.json');
const loginHandoffFailure = 'GET /api/v1/users/me/shell-summary net::ERR_ABORTED';
const governanceRefreshFailure = 'GET /api/v1/orphaned-items/overview?status=pending net::ERR_ABORTED';
const adminSectionHandoffFailures = [
  'GET /api/v1/admin/health net::ERR_ABORTED',
  'GET /api/v1/admin/jobs/status net::ERR_ABORTED',
  'GET /api/v1/admin/outbox/status net::ERR_ABORTED',
] as const;
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

const governanceOrphan = {
  id: 1,
  item_type: 'risk',
  item_id: 1,
  item_name: 'Authentication Drift',
  item_description: 'Risk detail',
  item_identifier: 'R-0001',
  department_name: 'IT',
  previous_owner_name: 'Jo Owner',
  previous_owner_email: 'jo@example.test',
  orphaned_at: '2026-01-01T00:00:00Z',
  status: 'pending',
  request_reason_required: true,
  capabilities: {
    can_resolve: true,
    can_view_detail: true,
    requires_owner: true,
    requires_risk: false,
    requires_department: false,
  },
};

const lifecycleAccessUser = {
  id: 200,
  email: 'directory.user@example.test',
  name: 'Directory User',
  is_active: false,
  role_id: 5,
  role: { id: 5, name: 'employee', display_name: 'Employee', description: null },
  department_id: 1,
  department_name: 'IT',
  manager_id: null,
  manager_name: null,
  access_scope: 'department',
  scope_label: 'Department',
  effective_permissions: [],
  external_id: 'oid-dialog-contract',
  directory_sync_status: 'disabled',
  deprovision_reason: 'directory_disabled',
  capabilities: {
    can_edit_identity: true,
    can_edit_business_access: false,
    can_edit_role: true,
    can_deactivate: true,
    can_change_active_status: true,
    can_break_glass_enable: true,
    can_revoke_sessions: true,
  },
};

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
          fixed_policy: false,
          updated_at: '2026-04-01T00:00:00Z',
          updated_by_name: null,
          capabilities: { can_update: true },
        }]); return;
      case '/api/v1/riskhub/roles':
      case '/api/v1/access/roles':
        await json(route, [roleFixture]); return;
      case '/api/v1/permissions':
      case '/api/v1/access/permissions':
      case '/api/v1/riskhub/permissions':
        await json(route, []); return;
      case '/api/v1/access/users':
      case '/api/v1/users':
      case '/api/v1/users/lookup':
      case '/api/v1/users/lookup/risk-owners':
      case '/api/v1/users/lookup/control-owners':
      case '/api/v1/users/lookup/vendor-owners':
        await json(route, []); return;
      case '/api/v1/departments':
        await json(route, [department]); return;
      case '/api/v1/lookups/risk-filters':
        await json(route, { processes: [], categories: [] }); return;
      case '/api/v1/vendors':
        await json(route, { items: [], total: 0, offset: 0, limit: 25 }); return;
      case '/api/v1/controls':
      case '/api/v1/risks':
        await json(route, {
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
        await json(route, [{
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
        await json(route, [{
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
        await json(route, null); return;
      case '/api/v1/assets/1/process-links':
        await json(route, [{
          id: 1,
          asset_id: 1,
          process_id: 1,
          process_name: 'Claims',
          process_business_edit_blocked: false,
          is_primary: true,
          created_at: '2026-01-01T00:00:00Z',
        }]); return;
      case '/api/v1/assets/1/asset-links':
        await json(route, []); return;
      case '/api/v1/assets/1/vendor-links':
      case '/api/v1/vendors/1/linked-risks':
        await json(route, []); return;
      case '/api/v1/vendors/1/contracts':
        await json(route, [{
          id: 1,
          vendor_id: 1,
          contract_reference: 'DIALOG-CONTRACT-1',
          is_archived: false,
          capabilities: { can_read: true, can_update: true, can_archive: true, can_restore: false },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }]); return;
      case '/api/v1/vendors/1/sub-outsourcing':
        await json(route, [{
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
        await json(route, { lists: [] }); return;
      case '/api/v1/ict-register/reference/ict-service-taxonomy':
        await json(route, { services: [] }); return;
      case '/api/v1/kris/breaches':
      case '/api/v1/kris/overdue':
      case '/api/v1/kris/due-soon':
        await json(route, []); return;
      case '/api/v1/kris':
        await json(route, { items: [], total: 0, offset: 0, limit: 25 }); return;
      case '/api/v1/processes':
      case '/api/v1/assets':
        await json(route, { items: [], total: 0, offset: 0, limit: 25 }); return;
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

const parentSiteIds = new Set([
  'confirm.link-management',
  'issue.execution-history',
  'mismatch.kri-form',
  'confirm.kri-modal',
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

async function arrangeParent(page: Page, site: RenderSite) {
  await page.goto(`/dialog-contract.html?site=${encodeURIComponent(site.id)}`);
  await expect(page.getByTestId('dialog-owner-ready')).toHaveAttribute('data-render-site', site.id);
  if (site.id === 'mismatch.kri-form') {
    const next = page.getByRole('button', { name: /next/i });
    await next.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole('button', { name: /create kri/i })).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  }
}

async function gotoOwnerRoute(page: Page, route: string) {
  if (new URL(page.url()).pathname !== route) {
    const sidebarLink = page.locator(`a[href="${route}"]`).first();
    if (await sidebarLink.isVisible()) {
      await Promise.all([
        page.waitForURL((url) => url.pathname === route),
        sidebarLink.click(),
      ]);
    } else {
      await page.goto(route);
    }
  }
  await expect(page.locator('main')).toBeVisible();
}

async function arrangeGovernance(page: Page) {
  await page.route('**/api/v1/orphaned-items/overview**', (route) => json(route, {
    stats: {
      risk_count: 1,
      control_count: 0,
      kri_count: 0,
      threat_count: 0,
      process_count: 0,
      asset_count: 0,
      vendor_count: 0,
      total_count: 1,
    },
    items: [governanceOrphan],
    last_scan_at: '2026-01-01T00:00:00Z',
    scan_status: 'complete',
  }));
  await page.route('**/api/v1/users?**', (route) => json(route, []));
  await page.route('**/api/v1/departments', (route) => json(route, [department]));
  await gotoOwnerRoute(page, '/governance');
  await expect(page.getByText(governanceOrphan.item_name)).toBeVisible();
}

async function arrangeUserLifecycle(page: Page) {
  await page.route('**/api/v1/access/users', (route) => json(route, [lifecycleAccessUser]));
  await gotoOwnerRoute(page, '/users');
  await expect(page.getByText(lifecycleAccessUser.name)).toBeVisible();
}

async function arrangeKriWithHistory(page: Page) {
  await page.route('**/api/v1/kris/*/history**', (route) => json(route, {
    items: [{
      id: 9001,
      kri_id: 1,
      period_start: '2026-01-01T00:00:00Z',
      period_end: '2026-01-31T00:00:00Z',
      recorded_at: '2026-02-01T00:00:00Z',
      value: 7,
      lower_limit: 5,
      upper_limit: 10,
      unit: '%',
      breach_status: 'within',
      recorded_by_id: 2,
      recorded_by_name: 'Petra Svobodová',
    }],
    total: 1,
    offset: 0,
    limit: 50,
    capabilities: { can_request_correction: true },
  }));
  const register = new KRIsPage(page);
  await gotoOwnerRoute(page, '/kris');
  await register.search(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
  await register.openRowByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
  await page.waitForURL(/\/kris\/\d+$/, { timeout: 15_000 });
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.getByRole('button', { name: /history/i }).click();
}

async function gotoFirstDetail(page: Page, listRoute: string, detailPattern: RegExp) {
  await gotoOwnerRoute(page, listRoute);
  if (listRoute === '/assets') {
    const register = new AssetsPage(page);
    await register.search(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
    await register.openRowByText(E2E_ASSETS.CORE_CLAIMS_SYSTEM.name);
  } else if (listRoute === '/controls') {
    const register = new ControlsPage(page);
    await register.search(E2E_CONTROLS.ARCHIVE_ACTIVE_PAIR.name);
    await register.openRowByText(E2E_CONTROLS.ARCHIVE_ACTIVE_PAIR.name);
  } else if (listRoute === '/kris') {
    const register = new KRIsPage(page);
    await register.search(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
    await register.openRowByText(E2E_KRIS.ARCHIVE_ACTIVE_PAIR.metric_name);
  } else if (listRoute === '/processes') {
    const register = new ProcessesPage(page);
    await register.search(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
    await register.openRowByText(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
  } else if (listRoute === '/risks') {
    const register = new RisksPage(page);
    await register.search(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);
    await register.openRowByText(E2E_RISKS.ARCHIVE_ACTIVE_PAIR.name);
  } else if (listRoute === '/vendors') {
    const register = new VendorsPage(page);
    await register.search(E2E_VENDORS.ACTIVE_PRIMARY.name);
    await register.openRowByText(E2E_VENDORS.ACTIVE_PRIMARY.name);
  } else if (listRoute === '/threats') {
    await page.getByTestId('threats-search-input').fill(E2E_THREATS.RANSOMWARE.name);
    const row = page.locator('tbody tr').filter({ hasText: E2E_THREATS.RANSOMWARE.name }).first();
    await expect(row).toBeVisible();
    await row.click();
  } else {
    throw new Error(`No deterministic detail driver for ${listRoute}`);
  }
  await page.waitForURL(detailPattern, { timeout: 15_000 });
  await expect(page.locator('main h1, main h2').first()).toBeVisible();
}

const parentOpeners: Record<string, (page: Page) => Locator> = {
  'confirm.link-management': (page) => page.getByRole('dialog').getByRole('button', { name: /unlink/i }).first(),
  'issue.execution-history': (page) => page.getByRole('button', { name: /new issue/i }).first(),
  'mismatch.kri-form': (page) => page.getByRole('button', { name: /create kri/i }).first(),
  'confirm.kri-modal': (page) => page.getByRole('dialog').getByRole('button', { name: /delete/i }).first(),
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

function parentDriver(siteId: string): RenderSiteDriver {
  return {
    mode: 'parent',
    arrange: arrangeParent,
    opener: parentOpeners[siteId]!,
    ownerSentinel: (page, site) => page.locator(`[data-testid="dialog-owner-ready"][data-render-site="${site.id}"]`),
  };
}

function liveDriver(
  account: string,
  arrange: (page: Page) => Promise<void>,
  opener: (page: Page) => Locator,
  ready?: (page: Page, surface: Locator) => Promise<void>,
  allowedNetworkFailures: readonly string[] = [],
): RenderSiteDriver {
  return {
    mode: 'live',
    account,
    allowedNetworkFailures: [loginHandoffFailure, ...allowedNetworkFailures],
    arrange: async (page) => arrange(page),
    opener,
    ownerSentinel: (page) => page.locator('main'),
    ready,
  };
}

const RM = DEMO_ACCOUNTS.RISK_MANAGER;
const CRO = DEMO_ACCOUNTS.CRO;
const ADMIN = DEMO_ACCOUNTS.ADMIN;
const list = (route: string) => (page: Page) => gotoOwnerRoute(page, route);
const detail = (route: string, pattern: RegExp) => (page: Page) => gotoFirstDetail(page, route, pattern);

const drivers: Record<string, RenderSiteDriver> = Object.fromEntries(
  [...parentSiteIds].map((siteId) => [siteId, parentDriver(siteId)]),
);

Object.assign(drivers, {
  'approval-resolution.approvals-page': liveDriver(
    CRO,
    (page) => gotoOwnerRoute(page, '/approvals'),
    (page) => page.getByRole('button', { name: /approve/i }).first(),
  ),
  'confirm.approvals-page': liveDriver(DEMO_ACCOUNTS.EMPLOYEE_OPERATIONS, async (page) => {
    await gotoOwnerRoute(page, '/approvals');
    const [response] = await Promise.all([
      page.waitForResponse((candidate) => {
        const url = new URL(candidate.url());
        return candidate.request().method() === 'GET'
          && url.pathname === '/api/v1/approvals'
          && url.searchParams.get('my_requests') === 'true';
      }),
      page.getByRole('button', { name: /my requests/i }).click(),
    ]);
    expect(response.ok()).toBe(true);
  },
  (page) => page.getByRole('button', { name: /cancel request/i }).first(),
  ),
  'confirm.asset-detail': liveDriver(
    RM,
    detail('/assets', /\/assets\/\d+$/),
    (page) => page.getByTestId('asset-detail-archive'),
  ),
  'execution-log.control-detail': liveDriver(RM, async (page) => {
    await detail('/controls', /\/controls\/\d+$/)(page);
    await page.getByRole('button', { name: /execution history/i }).click();
  }, (page) => page.getByRole('button', { name: /log execution/i })),
  'archive.control-detail': liveDriver(RM, detail('/controls', /\/controls\/\d+$/), (page) => page.locator('main button').filter({ has: page.locator('svg.lucide-trash-2') }).first()),
  'export.controls-page': liveDriver(RM, list('/controls'), (page) => page.getByTestId('controls-export-button')),
  'resolve.governance-page': liveDriver(
    CRO,
    arrangeGovernance,
    (page) => page.getByRole('button', { name: /resolve/i }).first(),
    async (page) => expect(page.getByTestId('resolve-orphan-ready')).toBeVisible(),
    [governanceRefreshFailure],
  ),
  'orphan-view.governance-page': liveDriver(
    CRO,
    arrangeGovernance,
    (page) => page.getByRole('button', { name: /view authentication drift/i }),
    async (page) => expect(page.getByTestId('orphan-quick-view-ready')).toBeVisible(),
    [governanceRefreshFailure],
  ),
  'export.issues-page': liveDriver(RM, list('/issues'), (page) => page.getByRole('button', { name: /^export$/i }).first()),
  'export.assets-page': liveDriver(RM, list('/assets'), (page) => page.getByTestId('assets-export-button')),
  'kri-modal.kri-detail': liveDriver(RM, detail('/kris', /\/kris\/\d+$/), (page) => page.getByRole('button', { name: /^edit$/i }).first()),
  'kri-value.kri-detail': liveDriver(RM, detail('/kris', /\/kris\/\d+$/), (page) => page.getByRole('button', { name: /record value|add value/i }).first()),
  'kri-history.kri-detail': liveDriver(RM, arrangeKriWithHistory, (page) => page.getByRole('button', { name: /request correction/i }).first()),
  'issue.kri-detail': liveDriver(RM, detail('/kris', /\/kris\/\d+$/), (page) => page.getByRole('button', { name: /new issue/i }).first()),
  'confirm.kri-detail': liveDriver(RM, detail('/kris', /\/kris\/\d+$/), (page) => page.getByRole('button', { name: /^delete$/i }).first()),
  'export.kris-page': liveDriver(RM, list('/kris'), (page) => page.getByTestId('kris-export-button')),
  'confirm.process-detail': liveDriver(RM, detail('/processes', /\/processes\/\d+$/), (page) => page.getByTestId('process-detail-archive')),
  'confirm.risk-detail': liveDriver(RM, detail('/risks', /\/risks\/\d+$/), (page) => page.getByRole('button', { name: /^archive$/i }).first()),
  'export.risks-page': liveDriver(RM, list('/risks'), (page) => page.getByTestId('risks-export-button')),
  'export.processes-page': liveDriver(RM, list('/processes'), (page) => page.getByTestId('processes-export-button')),
  'confirm.threat-detail': liveDriver(RM, detail('/threats', /\/threats\/\d+$/), (page) => page.getByTestId('threat-detail-archive')),
  'export.threats-page': liveDriver(RM, list('/threats'), (page) => page.getByTestId('threats-export-button')),
  'access-edit.users-page': liveDriver(CRO, (page) => gotoOwnerRoute(page, '/users'), (page) => page.getByRole('button', { name: /edit access/i }).first()),
  'confirm.users-page': liveDriver(ADMIN, arrangeUserLifecycle, (page) => page.getByRole('button', { name: /deactivate|reactivate|activate/i }).first(), undefined, adminSectionHandoffFailures),
  'ad-picker.users-page': liveDriver(ADMIN, (page) => gotoOwnerRoute(page, '/users'), (page) => page.getByRole('button', { name: /add from ad/i }).first(), undefined, adminSectionHandoffFailures),
  'break-glass.users-page': liveDriver(ADMIN, arrangeUserLifecycle, (page) => page.getByRole('button', { name: /break.?glass/i }).first(), undefined, adminSectionHandoffFailures),
  'issue.vendor-detail': liveDriver(RM, detail('/vendors', /\/vendors\/\d+$/), (page) => page.getByRole('button', { name: /new issue/i }).first()),
  'confirm.vendor-detail': liveDriver(RM, detail('/vendors', /\/vendors\/\d+$/), (page) => page.getByRole('button', { name: /^archive$/i }).first()),
  'export.vendors-page': liveDriver(RM, list('/vendors'), (page) => page.getByTestId('vendors-export-button')),
  'audit-details.audit-logs': liveDriver(ADMIN, async (page) => {
    await gotoOwnerRoute(page, '/admin');
    await page.getByRole('button', { name: /audit logs/i }).click();
  }, (page) => page.getByRole('button', { name: /^view$/i }).first(), undefined, adminSectionHandoffFailures),
  'confirm.sessions-panel': liveDriver(ADMIN, async (page) => {
    await gotoOwnerRoute(page, '/admin');
    await page.getByRole('button', { name: /active sessions/i }).click();
  }, (page) => page.getByRole('button', { name: /revoke/i }).first(), undefined, adminSectionHandoffFailures),
});

async function assertFocusInside(page: Page, surface: Locator) {
  await expect.poll(async () => surface.evaluate((node) => node.contains(document.activeElement))).toBe(true);
}

async function getVisibleFocusableControls(surface: Locator): Promise<Locator[]> {
  const focusable = surface.locator([
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(','));
  const visibleFocusable: Locator[] = [];
  for (let index = 0; index < await focusable.count(); index += 1) {
    const candidate = focusable.nth(index);
    if (await candidate.isVisible()) visibleFocusable.push(candidate);
  }
  return visibleFocusable;
}

test.describe('validated application dialog render sites', () => {
  test('driver registry exactly covers the machine inventory', async () => {
    expect(Object.keys(drivers).sort()).toEqual(contract.applicationRenderSites.map((site) => site.id).sort());
  });

  for (const site of contract.applicationRenderSites) {
    test(`[render-site:${site.id}] ${site.component} via ${site.file}`, async ({ page }) => {
      const driver = drivers[site.id];
      expect(driver, `source-linked driver registered for ${site.id}`).toBeTruthy();
      const unexpectedNetwork: string[] = [];
      const unexpectedOutput: string[] = [];

      if (driver.mode === 'live') {
        if (!driver.account) throw new Error(`Live render-site driver ${site.id} has no account`);
        await loginAsDemoUser(page, driver.account);
      }

      page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          unexpectedOutput.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => unexpectedOutput.push(`pageerror: ${error.message}`));
      if (driver.mode === 'parent') {
        await installApiContract(page, unexpectedNetwork);
      } else {
        page.on('requestfailed', (request) => {
          const failure = describeLiveNetworkFailure({
            method: request.method(),
            url: request.url(),
            failureText: request.failure()?.errorText ?? 'unknown failure',
          }, driver.allowedNetworkFailures);
          if (failure) unexpectedNetwork.push(failure);
        });
        page.on('response', (response) => {
          const failure = describeLiveNetworkResponse({
            method: response.request().method(),
            url: response.url(),
            status: response.status(),
          }, driver.allowedNetworkErrors);
          if (failure) unexpectedNetwork.push(failure);
        });
      }
      await driver.arrange(page, site);
      await expect(driver.ownerSentinel(page, site)).toBeVisible();
      if (driver.mode === 'live') {
        expect(new URL(page.url()).pathname).not.toBe('/dialog-contract.html');
      }

      const opener = driver.opener(page);
      await opener.waitFor({ state: 'visible', timeout: 15_000 });
      await opener.focus();
      await expect(opener).toBeFocused();
      if (driver.activate) {
        await driver.activate(opener);
      } else {
        await opener.press('Space');
      }

      const role = site.id.startsWith('inline.') ? 'alertdialog' : roles.get(site.component);
      expect(role, `role registered for ${site.component}`).toBeTruthy();
      const surface = page.locator(`[role="${role}"]`).last();
      await expect(surface).toBeVisible();
      await driver.ready?.(page, surface);
      await expect(surface).toHaveAttribute('aria-modal', 'true');
      const accessibleName = await surface.evaluate((node) => {
        const ids = node.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
        return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      });
      expect(accessibleName.length).toBeGreaterThan(0);
      await assertFocusInside(page, surface);

      let visibleFocusable = await getVisibleFocusableControls(surface);
      expect(visibleFocusable.length, 'dialog must expose at least one tabbable control').toBeGreaterThan(0);
      let firstFocusable = visibleFocusable[0]!;
      let lastFocusable = visibleFocusable.at(-1)!;

      await lastFocusable.focus();
      await page.keyboard.press('Tab');
      await expect(firstFocusable).toBeFocused();

      visibleFocusable = await getVisibleFocusableControls(surface);
      firstFocusable = visibleFocusable[0]!;
      lastFocusable = visibleFocusable.at(-1)!;
      await firstFocusable.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(lastFocusable).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(surface).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(unexpectedNetwork).toEqual([]);
      expect(unexpectedOutput).toEqual([]);
    });
  }
});
