import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page, type Request } from '@playwright/test';

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
import { renderedContrast } from './helpers/renderedContrast';
import {
  arrangeDialogContractSite,
  dialogContractActivation,
  dialogContractDepartment,
  dialogContractOpeners,
  DIALOG_CONTRACT_PARENT_SITE_IDS,
  fulfillJson,
  installDialogContractApi,
} from './helpers/dialogContractHarness';
import {
  createOwnedAbortAccounting,
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
  dismissed?: (page: Page) => Promise<void>;
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

async function gotoOwnerRoute(page: Page, route: string) {
  if (new URL(page.url()).pathname !== route) {
    const sidebarLink = page.locator(`a[href="${route}"]`).first();
    if (await sidebarLink.isVisible()) {
      await sidebarLink.focus();
      await Promise.all([
        page.waitForURL((url) => url.pathname === route),
        sidebarLink.press('Enter'),
      ]);
    } else {
      await page.goto(route);
    }
  }
  await expect(page.locator('main')).toBeVisible();
}

async function arrangeGovernance(page: Page) {
  await page.route('**/api/v1/orphaned-items/overview**', (route) => fulfillJson(route, {
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
  await page.route('**/api/v1/users?**', (route) => fulfillJson(route, []));
  await page.route('**/api/v1/departments', (route) => fulfillJson(route, [dialogContractDepartment]));
  await gotoOwnerRoute(page, '/governance');
  await expect(page.getByText(governanceOrphan.item_name)).toBeVisible();
}

async function arrangeUserLifecycle(page: Page) {
  await page.route('**/api/v1/access/users', (route) => fulfillJson(route, [lifecycleAccessUser]));
  await gotoOwnerRoute(page, '/users');
  await expect(page.getByText(lifecycleAccessUser.name)).toBeVisible();
}

async function arrangeKriWithHistory(page: Page) {
  await page.route('**/api/v1/kris/*/history**', (route) => fulfillJson(route, {
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
  await page.waitForURL((url) => /\/kris\/\d+$/.test(url.pathname), { timeout: 15_000 });
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.getByRole('tab', { name: /history/i }).click();
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
  await page.waitForURL((url) => detailPattern.test(url.pathname), { timeout: 15_000 });
  await expect(page.locator('main h1, main h2').first()).toBeVisible();
}

function parentDriver(siteId: string): RenderSiteDriver {
  return {
    mode: 'parent',
    arrange: (page, site) => arrangeDialogContractSite(page, site.id),
    opener: dialogContractOpeners[siteId]!,
    ownerSentinel: (page, site) => page.locator(`[data-testid="dialog-owner-ready"][data-render-site="${site.id}"]`),
    activate: dialogContractActivation(siteId),
    ready: siteId === 'confirm.pending-change-cancellation'
      ? async (_page, surface) => {
        await expect(surface).toContainText('Claims Platform');
        await expect(surface).not.toContainText(/\b\d+\b/);
      }
      : undefined,
    dismissed: siteId === 'confirm.pending-change-cancellation'
      ? async (page) => {
        await expect(page.getByTestId('pending-change-cancellation-owner'))
          .toHaveAttribute('data-confirmation-count', '0');
      }
      : undefined,
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
  [...DIALOG_CONTRACT_PARENT_SITE_IDS].map((siteId) => [siteId, parentDriver(siteId)]),
);

Object.assign(drivers, {
  'destination-launcher.sidebar': liveDriver(
    RM,
    list('/'),
    (page) => page.getByRole('button', { name: /^(go to|přejít)$/i }),
  ),
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
      page.getByRole('tab', { name: /my requests/i }).click(),
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
    await page.getByRole('tab', { name: /execution history/i }).click();
  }, (page) => page.getByRole('button', { name: /log execution/i })),
  'archive.control-detail': liveDriver(RM, detail('/controls', /\/controls\/\d+$/), (page) => page.getByRole('button', { name: /^archive$/i }).first()),
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
  'confirm.kri-detail': liveDriver(RM, detail('/kris', /\/kris\/\d+$/), (page) => page.getByRole('button', { name: /^archive$/i }).first()),
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
    await page.getByRole('tab', { name: /audit logs/i }).click();
  }, (page) => page.getByRole('button', { name: /^view$/i }).first(), undefined, adminSectionHandoffFailures),
  'confirm.sessions-panel': liveDriver(ADMIN, async (page) => {
    await gotoOwnerRoute(page, '/admin');
    await page.getByRole('tab', { name: /active sessions/i }).click();
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
      const ownedAborts = createOwnedAbortAccounting<Request>();

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
        await installDialogContractApi(page, unexpectedNetwork);
      } else {
        page.on('request', (request) => {
          ownedAborts.requestStarted(request, `${request.method()} ${request.url()}`);
        });
        page.on('requestfinished', (request) => {
          ownedAborts.requestFinished(request);
        });
        page.on('requestfailed', (request) => {
          const failureText = request.failure()?.errorText ?? 'unknown failure';
          if (ownedAborts.consumeExpectedAbort(request, failureText)) return;
          const failure = describeLiveNetworkFailure({
            method: request.method(),
            url: request.url(),
            failureText,
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
      // Snapshot only the old owner's requests; requests started by the final owner remain strict.
      ownedAborts.markCurrentRequestsAsExpectedAborts();
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
      if (site.id === 'archive.control-detail') {
        const reasonInput = surface.locator('textarea').first();
        const reasonLabel = reasonInput.locator('xpath=ancestor::label[1]/span[1]');
        await expect(reasonLabel).toBeVisible();
        const fontSize = await reasonLabel.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize, 'required archive reason label readability').toBeGreaterThanOrEqual(12);
        await reasonInput.fill('Contrast verification');
        const archiveAction = surface.locator('button[type="submit"]');
        await expect(archiveAction).toBeEnabled();
        const normalBackground = await archiveAction.evaluate((node) => getComputedStyle(node).backgroundColor);
        expect(await renderedContrast(archiveAction), 'archive action normal contrast').toBeGreaterThanOrEqual(4.5);
        await archiveAction.hover();
        await expect.poll(
          () => archiveAction.evaluate((node) => getComputedStyle(node).backgroundColor),
          { message: 'archive action reaches its hover treatment' },
        ).not.toBe(normalBackground);
        expect(await renderedContrast(archiveAction), 'archive action hover contrast').toBeGreaterThanOrEqual(4.5);
      }
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

      // Snapshot only requests already active before the intentional dialog teardown.
      ownedAborts.markCurrentRequestsAsExpectedAborts();
      await page.keyboard.press('Escape');
      await expect(surface).toHaveCount(0);
      await expect(opener).toBeFocused();
      await driver.dismissed?.(page);
      expect(unexpectedNetwork).toEqual([]);
      expect(unexpectedOutput).toEqual([]);
    });
  }
});
