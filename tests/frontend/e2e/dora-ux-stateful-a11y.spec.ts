/**
 * DORA UX — STATEFUL accessibility sweep (ADR-013 · FR-P1-5 · N10).
 *
 * The resting-DOM route scan in accessibility-smoke.spec.ts is necessary but not
 * sufficient (N10): "Route-level scans alone are insufficient." This suite drives
 * the DORA surfaces into the interactive states axe never sees at rest and scans
 * each with the SAME pinned WCAG tags the smoke uses (WCAG_TAGS) — zero-tolerance,
 * enforce-only (there is no baseline/capture path; every finding is a hard
 * failure fixed at the component source, never re-recorded — see
 * helpers/axeBaseline.ts).
 *
 * The five stateful drivers (N10), each axe-scanned across riskhub/light/dark:
 *   1. Opened DORA dialog (archive ConfirmDialog → DialogShell alertdialog):
 *      focus is trapped inside and RESTORED to the opener on Escape. Opened and
 *      Escaped only — never confirmed — so no seeded row is archived.
 *   2. Invalid DORA form submission (ProcessForm at /processes/new): the
 *      role="alert" summary + per-field Field errors are scanned.
 *   3. Open Radix listbox (the /processes ThemedSelect status filter).
 *   4. Expanded disclosure (the vendor sub-outsourcing chain group panel).
 *   5. Data-Quality + ICT-Committee loading AND error states, driven by
 *      intercepting each page's backing request (delay → loading, 500 → error).
 *
 * Assigned to the `ci` project only (playwright.config.ts CI_ONLY_SPECS), the
 * project e2e.yml runs and whose focus/timing behaviour these assertions target —
 * mirroring the smoke's N8 restriction.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { DEMO_ACCOUNTS, loginAsDemoUser, logout } from './helpers/login';
import { waitForDataLoad } from './helpers/wait';
import { WCAG_TAGS, toFindings } from './helpers/axeBaseline';
import {
    getApiBaseUrl,
    getControlByName,
    getDemoTokenByAccountName,
    getVendorByRegistration,
} from './helpers/api-auth';
import { getProcessByL1 } from './helpers/ict-register';
import { E2E_CONTROLS, E2E_ICT_VENDOR, E2E_PROCESSES } from './fixtures/e2e-data';

type AuditTheme = 'riskhub' | 'light' | 'dark';
const THEMES: AuditTheme[] = ['riskhub', 'light', 'dark'];
const NEXT_THEME: Record<AuditTheme, AuditTheme> = {
    riskhub: 'light',
    light: 'dark',
    dark: 'riskhub',
};

// DORA loading/error surfaces (State 5). The frontend calls same-origin,
// relative `/api/v1/...` (services/api/apiConfig.ts), so a glob route intercepts
// cleanly. The page routes differ from the API paths: `/ict-register/dq` backs
// the /ict-register/data-quality page; `/ict-register/committee` backs the
// /?view=ict-committee dashboard tab.
const DQ_PAGE = '/ict-register/data-quality';
const COMMITTEE_PAGE = '/?view=ict-committee';
const DQ_ENDPOINT = '**/api/v1/ict-register/dq**';
const COMMITTEE_ENDPOINT = '**/api/v1/ict-register/committee**';
const TABLE_LOAD_ERROR = "We couldn't load this table. Please try again.";

type Ux157Locale = 'en' | 'cs';

interface Ux157JourneyConfig {
    locale: Ux157Locale;
    theme: AuditTheme;
    viewport: { width: number; height: number };
    labels: {
        acceptanceApprover: string;
        acceptanceDate: string;
        acceptanceJustification: string;
        activityFrom: string;
        activityTo: string;
        adminTabs: [string, string, string, string];
        appearanceTab: string;
        approvalsTabs: [string, string, string, string];
        archive: string;
        back: string;
        breakGlass: string;
        breakGlassEnable: string;
        breakGlassReason: string;
        category: string;
        checkDirectory: string;
        checkDirectoryStatus: string;
        createRisk: string;
        directoryImport: string;
        directoryAdd: string;
        directorySearch: string;
        directorySetupGuidance: RegExp;
        departmentPlaceholder: string;
        grossImpact: string;
        grossMatrix: string;
        grossProbability: string;
        markAllRead: string;
        markRead: string;
        markUnread: string;
        mainProcess: string;
        namePlaceholder: string;
        netImpact: string;
        netMatrix: string;
        netProbability: string;
        notificationBell: string;
        notificationFailure: string;
        ownerSearchPlaceholder: string;
        refresh: string;
        retryGuidance: string;
        sessionsTab: string;
        subprocess: string;
        theme: string;
        themeDark: string;
        themeLight: string;
        themeRiskHub: string;
        vendorYear: string;
    };
}

const UX157_EN_LABELS: Ux157JourneyConfig['labels'] = {
    acceptanceApprover: 'Acceptance approver',
    acceptanceDate: 'Acceptance date',
    acceptanceJustification: 'Acceptance justification',
    activityFrom: 'From date',
    activityTo: 'To date',
    adminTabs: ['System Health', 'Application Logs', 'Audit Logs', 'Active Sessions'],
    appearanceTab: 'Appearance',
    approvalsTabs: ['Pending Queue', 'My Requests', 'Risk Assessment', 'History'],
    archive: 'Archive',
    back: 'Back',
    breakGlass: 'Break-glass',
    breakGlassEnable: 'Break-glass enable',
    breakGlassReason: 'Reason',
    category: 'Category',
    checkDirectory: 'Check AD',
    checkDirectoryStatus: 'Check directory status',
    createRisk: 'Create Risk',
    directoryImport: 'Import',
    directoryAdd: 'Add from AD',
    directorySearch: 'Search by name or email',
    directorySetupGuidance: /Directory provider is not configured.*Configure ENTRA_TENANT_ID.*retry\./,
    departmentPlaceholder: 'Select Department',
    grossImpact: 'Gross impact',
    grossMatrix: 'Gross Risk',
    grossProbability: 'Gross probability',
    markAllRead: 'Mark all as read',
    markRead: 'Mark as read',
    markUnread: 'Mark as unread',
    mainProcess: 'Main Process',
    namePlaceholder: 'Enter a short, descriptive name for this risk...',
    netImpact: 'Net impact',
    netMatrix: 'Net Risk',
    netProbability: 'Net probability',
    notificationBell: 'Notifications',
    notificationFailure: 'Could not update this notification. Try again.',
    ownerSearchPlaceholder: 'Search by name...',
    refresh: 'Refresh',
    retryGuidance: 'Try again.',
    sessionsTab: 'Active Sessions',
    subprocess: 'Subprocess (Optional)',
    theme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeRiskHub: 'RiskHub Theme',
    vendorYear: 'Year',
};

const UX157_JOURNEYS: Ux157JourneyConfig[] = [
    {
        locale: 'en',
        theme: 'riskhub',
        viewport: { width: 1024, height: 900 },
        labels: UX157_EN_LABELS,
    },
    {
        locale: 'cs',
        theme: 'dark',
        viewport: { width: 1440, height: 900 },
        labels: {
            acceptanceApprover: 'Akceptace: schvalovatel',
            acceptanceDate: 'Akceptace: datum',
            acceptanceJustification: 'Akceptace: odůvodnění',
            activityFrom: 'Datum od',
            activityTo: 'Datum do',
            adminTabs: ['Stav systému', 'Aplikační logy', 'Auditní logy', 'Aktivní relace'],
            appearanceTab: 'Vzhled',
            approvalsTabs: ['Fronta čekajících', 'Moje žádosti', 'Hodnocení rizik', 'Historie'],
            archive: 'Archivovat',
            back: 'Zpět',
            breakGlass: 'Break-glass',
            breakGlassEnable: 'Povolit break-glass',
            breakGlassReason: 'Důvod',
            category: 'Kategorie',
            checkDirectory: 'Zkontrolovat AD',
            checkDirectoryStatus: 'Zkontrolovat stav v adresáři',
            createRisk: 'Vytvořit riziko',
            directoryImport: 'Importovat',
            directoryAdd: 'Přidat z AD',
            directorySearch: 'Hledat podle jména nebo e-mailu',
            directorySetupGuidance: /Poskytovatel adresáře není nakonfigurován.*Nakonfigurujte ENTRA_TENANT_ID.*zkuste to znovu\./,
            departmentPlaceholder: 'Vyberte oddělení',
            grossImpact: 'Hrubý dopad',
            grossMatrix: 'Hrubé riziko',
            grossProbability: 'Hrubá pravděpodobnost',
            markAllRead: 'Označit vše jako přečtené',
            markRead: 'Označit jako přečtené',
            markUnread: 'Označit jako nepřečtené',
            mainProcess: 'Hlavní proces',
            namePlaceholder: 'Zadejte krátký, popisný název rizika...',
            netImpact: 'Čistý dopad',
            netMatrix: 'Čisté riziko',
            netProbability: 'Čistá pravděpodobnost',
            notificationBell: 'Oznámení',
            notificationFailure: 'Oznámení se nepodařilo aktualizovat. Zkuste to znovu.',
            ownerSearchPlaceholder: 'Hledat podle názvu...',
            refresh: 'Obnovit',
            retryGuidance: 'Zkuste to znovu.',
            sessionsTab: 'Aktivní relace',
            subprocess: 'Podproces (volitelné)',
            theme: 'Motiv',
            themeDark: 'Tmavý',
            themeLight: 'Světlý',
            themeRiskHub: 'RiskHub motiv',
            vendorYear: 'Rok',
        },
    },
    {
        locale: 'en',
        theme: 'light',
        viewport: { width: 1440, height: 900 },
        labels: UX157_EN_LABELS,
    },
];

function syntheticRiskLookup(index: number) {
    const ordinal = String(index + 1).padStart(2, '0');
    return {
        id: 9700 + index,
        risk_id_code: `UX157-${ordinal}`,
        name: `UX-157 lookup risk ${ordinal}`,
        process: `UX-157 Process ${ordinal}`,
        subprocess: `UX-157 Subprocess ${ordinal}`,
        risk_type: 'operational',
        category: `UX-157 Category ${ordinal}`,
        description: `Synthetic browser lookup ${ordinal}`,
        gross_score: 9,
        gross_probability: 3,
        gross_impact: 3,
        net_score: 4,
        status: 'active',
        is_archived: false,
        is_priority: false,
    };
}

async function seedUx157Preferences(
    page: Page,
    config: Ux157JourneyConfig,
): Promise<{ themeUpdates: AuditTheme[] }> {
    let currentTheme = config.theme;
    const themeUpdates: AuditTheme[] = [];
    await page.addInitScript(({ theme, locale }) => {
        localStorage.setItem('riskhub-theme', theme);
        localStorage.setItem('riskhub-language', locale);
    }, { theme: config.theme, locale: config.locale });

    await page.route('**/api/v1/preferences', async (route, request) => {
        if (request.method() === 'GET') {
            await route.fulfill({
                status: 200,
                json: { theme: currentTheme, language: config.locale },
            });
            return;
        }
        if (request.method() === 'PUT') {
            const body = request.postDataJSON() as { theme?: AuditTheme };
            currentTheme = body.theme ?? currentTheme;
            if (body.theme) themeUpdates.push(body.theme);
            await route.fulfill({
                status: 200,
                json: { theme: currentTheme, language: config.locale },
            });
            return;
        }
        await route.continue();
    });
    return { themeUpdates };
}

async function optionGeometryIsWithinListbox(option: Locator, listbox: Locator): Promise<boolean> {
    const [optionBox, listboxBox] = await Promise.all([option.boundingBox(), listbox.boundingBox()]);
    if (!optionBox || !listboxBox) return false;
    const tolerance = 1;
    return optionBox.y >= listboxBox.y - tolerance
        && optionBox.y + optionBox.height <= listboxBox.y + listboxBox.height + tolerance;
}

async function driveUx157RiskAuthoring(page: Page, config: Ux157JourneyConfig): Promise<void> {
    const lookupRisks = Array.from({ length: 18 }, (_, index) => syntheticRiskLookup(index));
    let submittedPayload: Record<string, unknown> | null = null;

    await page.route('**/api/v1/risks**', async (route, request) => {
        const url = new URL(request.url());
        if (url.pathname !== '/api/v1/risks') {
            await route.continue();
            return;
        }
        if (request.method() === 'GET') {
            const requestedLimit = Number(url.searchParams.get('limit') ?? 100);
            const requestedOffset = Number(url.searchParams.get('offset') ?? 0);
            const items = lookupRisks.slice(requestedOffset, requestedOffset + requestedLimit);
            await route.fulfill({
                status: 200,
                json: {
                    items,
                    total: lookupRisks.length,
                    offset: requestedOffset,
                    limit: requestedLimit,
                    capabilities: { can_create: true, can_export: true, can_view_vendor_contexts: true },
                    facets: {},
                },
            });
            return;
        }
        if (request.method() === 'POST') {
            submittedPayload = request.postDataJSON() as Record<string, unknown>;
            await route.fulfill({
                status: 202,
                json: {
                    status: 'approval_required',
                    message: `UX-157 ${config.locale.toUpperCase()} risk creation queued for approval.`,
                    approval_id: 15700 + (config.locale === 'en' ? 1 : 2),
                    action_type: 'create',
                    resource_id: null,
                    pending_fields: ['name', 'process', 'category'],
                    pending_changes: null,
                },
            });
            return;
        }
        await route.continue();
    });

    await page.goto('/risks/new');
    await waitForDataLoad(page);

    const process = page.getByRole('combobox', { name: config.labels.mainProcess });
    const subprocess = page.getByRole('combobox', { name: config.labels.subprocess });
    const category = page.getByRole('combobox', { name: config.labels.category });
    await expect(process).toBeVisible();
    await expect(subprocess).toBeVisible();
    await expect(category).toBeVisible();

    // Public RED state: required creatable fields remain queryable and are wired
    // to their localized errors before any valid values are entered.
    await page.getByTestId('risk-form-next-button').click();
    await expect(process).toHaveAttribute('aria-invalid', 'true');
    await expect(category).toHaveAttribute('aria-invalid', 'true');
    await axeScanZero(page, ['main'], `UX-157 risk identity validation (${config.locale})`);

    await page.getByPlaceholder(config.labels.namePlaceholder).fill(`UX-157 ${config.locale.toUpperCase()} governed risk`);
    await page.getByTestId('risk-description-input').fill(`UX-157 ${config.locale.toUpperCase()} browser evidence`);

    // Home/End remain native text-editing keys; they never enter the listbox.
    await process.fill('UX-157');
    await process.press('Home');
    await expect.poll(() => process.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(0);
    await process.press('End');
    await expect.poll(() => process.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(6);
    await expect(process).not.toHaveAttribute('aria-activedescendant', /.+/);

    // Arrow navigation activates and scrolls a deep option into the bounded popup.
    for (let index = 0; index < 15; index += 1) {
        await process.press('ArrowDown');
    }
    const processListbox = page.getByRole('listbox');
    await expect(processListbox).toBeVisible();
    const activeId = await process.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    const activeOption = page.locator(`#${activeId}`);
    await expect(activeOption).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => optionGeometryIsWithinListbox(activeOption, processListbox)).toBe(true);
    await axeScanZero(page, ['main'], `UX-157 long creatable combobox (${config.locale})`);
    await process.press('Enter');
    await expect(process).toHaveValue('UX-157 Process 15');
    await expect(processListbox).toHaveCount(0);

    await subprocess.click();
    const subprocessOption = page.getByRole('option', { name: 'UX-157 Subprocess 15' });
    await expect(subprocessOption).toBeVisible();
    await subprocessOption.click();
    await expect(subprocess).toHaveValue('UX-157 Subprocess 15');

    await category.click();
    const categoryOption = page.getByRole('option', { name: 'UX-157 Category 04' });
    await categoryOption.click();
    await expect(category).toHaveValue('UX-157 Category 04');
    await category.fill(`UX-157 ${config.locale.toUpperCase()} free category`);
    await category.press('Escape');
    await expect(category).toHaveValue(`UX-157 ${config.locale.toUpperCase()} free category`);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await category.click();
    await category.press('Tab');
    await expect(category).toHaveValue(`UX-157 ${config.locale.toUpperCase()} free category`);
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await page.getByTestId('risk-form-next-button').click();
    const department = page.getByRole('combobox', { name: config.labels.departmentPlaceholder });
    await expect(department).toBeVisible();
    const ownerSearch = page.getByPlaceholder(config.labels.ownerSearchPlaceholder);
    await ownerSearch.fill('Petra');
    // Selecting the owner through the public result list also selects her
    // authoritative Department; choosing an unrelated Department first would
    // correctly scope Petra out of the owner results.
    await page.getByRole('button', { name: /Petra Svobodová/ }).click({ timeout: 10000 });
    await expect(department).not.toHaveText(config.labels.departmentPlaceholder);
    await page.getByTestId('risk-form-next-button').click();

    const grossProbability = page.getByRole('slider', { name: config.labels.grossProbability });
    const grossImpact = page.getByRole('slider', { name: config.labels.grossImpact });
    const netProbability = page.getByRole('slider', { name: config.labels.netProbability });
    const netImpact = page.getByRole('slider', { name: config.labels.netImpact });
    const acceptanceApprover = page.getByRole('textbox', { name: config.labels.acceptanceApprover });
    const acceptanceDate = page.getByRole('textbox', { name: config.labels.acceptanceDate });
    const acceptanceJustification = page.getByRole('textbox', { name: config.labels.acceptanceJustification });
    for (const field of [
        grossProbability,
        grossImpact,
        netProbability,
        netImpact,
        acceptanceApprover,
        acceptanceDate,
        acceptanceJustification,
    ]) {
        await expect(field).toBeVisible();
    }

    const grossGroup = page.getByRole('group', { name: config.labels.grossMatrix });
    const netGroup = page.getByRole('group', { name: config.labels.netMatrix });
    await expect(grossGroup.getByRole('radio')).toHaveCount(25);
    await expect(netGroup.getByRole('radio')).toHaveCount(25);

    // A native radio group contributes one keyboard stop; the following Tab
    // leaves the group without walking the other 24 matrix cells.
    await grossImpact.focus();
    await page.keyboard.press('Tab');
    await expect(grossGroup.getByRole('radio', { checked: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const grossSelected = grossGroup.getByRole('radio', {
        name: config.locale === 'en'
            ? 'Probability 3, impact 4, score 12'
            : 'Pravděpodobnost 3, dopad 4, skóre 12',
    });
    await expect(grossSelected).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(netProbability).toBeFocused();

    await netImpact.focus();
    await page.keyboard.press('Tab');
    await expect(netGroup.getByRole('radio', { checked: true })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    const netSelected = netGroup.getByRole('radio', {
        name: config.locale === 'en'
            ? 'Probability 2, impact 1, score 2'
            : 'Pravděpodobnost 2, dopad 1, skóre 2',
    });
    await expect(netSelected).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(acceptanceApprover).toBeFocused();

    await acceptanceApprover.fill('UX-157 Governance Board');
    await acceptanceDate.fill('2026-08-30');
    await acceptanceJustification.fill('Bounded browser evidence for the approval-queued status.');
    const selectedScoreLabels = grossGroup.locator('span.text-foreground.font-black')
        .or(netGroup.locator('span.text-foreground.font-black'));
    await expect(selectedScoreLabels).toHaveCount(2);
    await expect.poll(async () => selectedScoreLabels.evaluateAll((labels) => labels.every((label) => {
        let current: Element | null = label;
        while (current) {
            if (Number(getComputedStyle(current).opacity) < 1) return false;
            current = current.parentElement;
        }
        return true;
    }))).toBe(true);
    await axeScanZero(page, ['main'], `UX-157 selected risk scoring (${config.locale})`);

    const submit = page.getByRole('button', { name: config.labels.createRisk });
    await submit.focus();
    await expect(submit).toBeFocused();
    await submit.click();

    const queuedStatus = page.getByRole('status');
    await expect(queuedStatus).toHaveCount(1);
    await expect(queuedStatus).toContainText(`UX-157 ${config.locale.toUpperCase()} risk creation queued for approval.`);
    await expect(submit).toBeFocused();
    expect(submittedPayload).toMatchObject({
        process: 'UX-157 Process 15',
        subprocess: 'UX-157 Subprocess 15',
        category: `UX-157 ${config.locale.toUpperCase()} free category`,
        gross_probability: 3,
        gross_impact: 4,
        net_probability: 2,
        net_impact: 1,
    });
    await axeScanZero(page, ['main'], `UX-157 approval-queued risk status (${config.locale})`);
    await page.unroute('**/api/v1/risks**');
}

async function getRuntimeDepartmentId(): Promise<number> {
    const token = await getDemoTokenByAccountName(DEMO_ACCOUNTS.CRO);
    const response = await fetch(`${getApiBaseUrl()}/api/v1/departments`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok, 'authenticated department list is available').toBe(true);
    const body = await response.json() as Array<{ id: number }> | { items: Array<{ id: number }> };
    const departments = Array.isArray(body) ? body : body.items;
    expect(departments.length, 'runtime department list is populated').toBeGreaterThan(0);
    return departments[0].id;
}

async function driveUx157NamedRouteControls(
    page: Page,
    config: Ux157JourneyConfig,
    controlId: number,
    departmentId: number,
): Promise<void> {
    await page.goto('/activity-log');
    await waitForDataLoad(page);
    await expect(page.getByLabel(config.labels.activityFrom)).toBeVisible();
    await expect(page.getByLabel(config.labels.activityTo)).toBeVisible();

    await page.goto('/vendor-reports');
    await waitForDataLoad(page);
    await expect(page.getByLabel(config.labels.vendorYear)).toBeVisible();

    await page.goto(`/controls/${controlId}`);
    await waitForDataLoad(page);
    const archive = page.getByRole('button', { name: config.labels.archive, exact: true });
    await expect(archive).toBeVisible();
    await expect(archive.locator('svg')).toHaveAttribute('aria-hidden', 'true');

    await page.goto(`/departments/${departmentId}`);
    await waitForDataLoad(page);
    for (const name of [config.labels.back, config.labels.refresh]) {
        const button = page.getByRole('button', { name, exact: true });
        await expect(button).toBeVisible();
        await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    }
}

async function assertContentTabs(
    page: Page,
    labels: readonly string[],
    label: string,
): Promise<void> {
    const tablist = page.getByRole('tablist');
    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(labels.length);
    const assertState = async (selectedIndex: number) => {
        for (let index = 0; index < labels.length; index += 1) {
            const tab = page.getByRole('tab', { name: labels[index], exact: true });
            await expect(tab).toHaveAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
            await expect(tab).toHaveAttribute('tabindex', index === selectedIndex ? '0' : '-1');
        }
        const visiblePanel = page.locator('[role="tabpanel"]:visible');
        await expect(visiblePanel).toHaveCount(1);
        await expect(visiblePanel).not.toBeEmpty();
    };

    const first = page.getByRole('tab', { name: labels[0], exact: true });
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await assertState(1);
    await page.keyboard.press('End');
    await assertState(labels.length - 1);
    await page.keyboard.press('Home');
    await assertState(0);
    const animatedCards = page.locator('[role="tabpanel"]:visible .glass-card');
    if (await animatedCards.count() > 0) {
        await expect.poll(async () => animatedCards.evaluateAll((cards) => cards.every(
            (card) => getComputedStyle(card).opacity === '1',
        ))).toBe(true);
    }
    await axeScanZero(page, ['[role="tablist"]', '[role="tabpanel"]'], label);
}

async function driveUx157ApprovalsAndTheme(
    page: Page,
    config: Ux157JourneyConfig,
    themeUpdates: AuditTheme[],
): Promise<void> {
    await page.goto('/approvals');
    await waitForDataLoad(page);
    await assertContentTabs(page, config.labels.approvalsTabs, `UX-157 approvals tabs (${config.locale})`);

    await page.goto('/settings');
    await waitForDataLoad(page);
    await page.getByRole('button', { name: config.labels.appearanceTab, exact: true }).click();
    const group = page.getByRole('group', { name: config.labels.theme });
    const themeLabels: Record<AuditTheme, string> = {
        riskhub: config.labels.themeRiskHub,
        light: config.labels.themeLight,
        dark: config.labels.themeDark,
    };
    const initial = group.getByRole('radio', {
        name: themeLabels[config.theme],
    });
    await expect(initial).toBeChecked();
    await initial.focus();
    await page.keyboard.press('ArrowRight');
    const keyboardTheme = NEXT_THEME[config.theme];
    await expect(group.getByRole('radio', { name: themeLabels[keyboardTheme] })).toBeChecked();
    await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${keyboardTheme}`));
    await expect.poll(() => page.evaluate(() => localStorage.getItem('riskhub-theme'))).toBe(keyboardTheme);

    const pointerTheme = NEXT_THEME[keyboardTheme];
    await page.getByTestId(`theme-${pointerTheme}`).click({ timeout: 10000 });
    await expect(group.getByRole('radio', { name: themeLabels[pointerTheme] })).toBeChecked();
    await expect(page.locator('html')).toHaveClass(new RegExp(`theme-${pointerTheme}`));
    await expect.poll(() => page.evaluate(() => localStorage.getItem('riskhub-theme'))).toBe(pointerTheme);
    expect(themeUpdates).toEqual([keyboardTheme, pointerTheme]);
    await axeScanZero(page, ['main'], `UX-157 selected theme (${config.locale})`);
}

async function driveUx157Notifications(
    page: Page,
    config: Ux157JourneyConfig,
    controlId: number,
): Promise<void> {
    let unread = true;
    let failMutations = false;
    let mutations = 0;
    const notificationId = 15701;
    await page.route('**/api/v1/notifications**', async (route, request) => {
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/v1/notifications')) {
            await route.continue();
            return;
        }
        if (request.method() === 'GET') {
            await route.fulfill({
                status: 200,
                json: {
                    items: [{
                        id: notificationId,
                        type: 'issue_assigned',
                        title: 'UX-157 linked control',
                        message: 'Public navigation must not mark this notification read.',
                        resource_type: 'control',
                        resource_id: controlId,
                        is_read: !unread,
                        created_at: '2026-08-30T08:00:00Z',
                        expires_at: null,
                    }],
                    total: 1,
                    skip: 0,
                    limit: 20,
                    unread_count: unread ? 1 : 0,
                },
            });
            return;
        }
        mutations += 1;
        if (failMutations) {
            await route.fulfill({ status: 500, json: { detail: 'UX-157 injected failure' } });
            return;
        }
        if (url.pathname.endsWith('/read')) unread = false;
        if (url.pathname.endsWith('/unread')) unread = true;
        if (url.pathname.endsWith('/read-all')) unread = false;
        await route.fulfill({
            status: 200,
            json: url.pathname.endsWith('/read-all') ? null : { unread_count: unread ? 1 : 0 },
        });
    });

    await page.goto('/notifications');
    await waitForDataLoad(page);
    const link = page.getByRole('link', { name: /UX-157 linked control/ });
    await link.hover();
    await link.focus();
    expect(mutations).toBe(0);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/controls/${controlId}$`));
    expect(mutations).toBe(0);

    await page.goto('/notifications');
    await waitForDataLoad(page);
    await page.getByRole('button', { name: config.labels.markRead }).click();
    await expect(page.getByRole('button', { name: config.labels.markUnread })).toBeVisible();
    await page.getByRole('button', { name: config.labels.markUnread }).click();
    await expect(page.getByRole('button', { name: config.labels.markRead })).toBeVisible();

    failMutations = true;
    const rowAction = page.getByRole('button', { name: config.labels.markRead });
    await rowAction.focus();
    await rowAction.click();
    const rowAlert = page.getByRole('alert');
    await expect(rowAlert).toHaveCount(1);
    await expect(rowAlert).toHaveText(config.labels.notificationFailure);
    await expect(rowAction).toBeFocused();
    await expect(page.getByRole('button', { name: config.labels.markRead })).toBeVisible();
    await axeScanZero(page, ['main'], `UX-157 notification row failure (${config.locale})`);

    const markAll = page.getByRole('button', { name: config.labels.markAllRead });
    await markAll.focus();
    await markAll.click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText(config.labels.retryGuidance);
    await expect(markAll).toBeFocused();
    await expect(page.getByRole('button', { name: config.labels.markRead })).toBeVisible();
    await axeScanZero(page, ['main'], `UX-157 notification mark-all failure (${config.locale})`);

    await page.goto(`/controls/${controlId}`);
    await waitForDataLoad(page);
    await page.getByRole('button', { name: config.labels.notificationBell, exact: true }).click();
    const dropdown = page.getByTestId('notification-dropdown-panel');
    await expect(dropdown).toBeVisible();

    const bellRowAction = dropdown.getByRole('button', { name: config.labels.markRead });
    await bellRowAction.focus();
    await bellRowAction.click();
    await expect(dropdown.getByRole('alert')).toHaveCount(1);
    await expect(dropdown.getByRole('alert')).toHaveText(config.labels.notificationFailure);
    await expect(bellRowAction).toBeFocused();
    await expect(bellRowAction).toBeEnabled();

    const bellMarkAll = dropdown.getByRole('button', { name: config.labels.markAllRead });
    await bellMarkAll.focus();
    await bellMarkAll.click();
    await expect(dropdown.getByRole('alert')).toHaveCount(1);
    await expect(dropdown.getByRole('alert')).toContainText(config.labels.retryGuidance);
    await expect(bellMarkAll).toBeFocused();
    await expect(bellMarkAll).toBeEnabled();
    await axeScanZero(page, ['[data-testid="notification-dropdown-panel"]'], `UX-157 notification bell failures (${config.locale})`);
    await page.unroute('**/api/v1/notifications**');
}

async function driveUx157UsersAndAdmin(page: Page, config: Ux157JourneyConfig): Promise<void> {
    let failDirectoryCheck = false;
    let failDirectoryImport = true;
    await page.route('**/api/v1/access/users**', async (route) => {
        await route.fulfill({
            status: 200,
            json: [{
                id: 9757,
                email: 'ux157@example.test',
                name: 'UX-157 Directory User',
                is_active: true,
                role_id: 4,
                role: { id: 4, name: 'employee', display_name: 'Employee', description: null },
                department_id: 10,
                department_name: 'Risk Management',
                manager_id: null,
                manager_name: null,
                access_scope: 'department',
                scope_label: 'Risk Management',
                effective_permissions: ['risks:read'],
                external_id: 'ux157-directory',
                directory_sync_status: 'active',
                capabilities: {
                    can_edit_identity: true,
                    can_edit_business_access: true,
                    can_edit_role: true,
                    can_deactivate: true,
                    can_change_active_status: true,
                    can_break_glass_enable: true,
                    can_revoke_sessions: true,
                },
            }],
        });
    });
    await page.route('**/api/v1/users/directory**', async (route) => {
        await route.fulfill({
            status: 200,
            json: {
                items: [],
                available_roles: [{ name: 'admin', display_name: 'Admin', count: 1 }],
                total: 0,
                skip: 0,
                limit: 50,
                capabilities: {
                    can_read_directory: true,
                    can_view_access_details: true,
                    can_use_role_facets: true,
                    can_create_local_user: true,
                    can_import_directory_user: true,
                },
            },
        });
    });
    await page.route('**/api/v1/directory/users/search**', async (route, request) => {
        const query = new URL(request.url()).searchParams.get('q') ?? '';
        if (query.includes('provider')) {
            await route.fulfill({ status: 503, json: { detail: 'No directory provider configured' } });
            return;
        }
        await route.fulfill({
            status: 200,
            json: [{
                external_id: 'ux157-directory',
                display_name: 'UX-157 Directory User',
                email: 'ux157@example.test',
                user_principal_name: 'ux157@example.test',
                department: 'Risk Management',
                job_title: 'Analyst',
                account_enabled: true,
                source: 'ad_emulator',
            }],
        });
    });
    await page.route('**/api/v1/directory/users/ux157-directory/import', async (route) => {
        if (failDirectoryImport) {
            await route.fulfill({ status: 500, json: { detail: 'UX-157 injected import failure' } });
            return;
        }
        await route.fulfill({
            status: 200,
            json: {
                status: 'created', user_id: 9757, email: 'ux157@example.test',
                name: 'UX-157 Directory User', external_id: 'ux157-directory',
                department_id: null, department_name: 'Risk Management', entra_business_role: null,
                role_id: 4, role_name: 'employee', directory_sync_status: 'active',
            },
        });
    });
    await page.route('**/api/v1/admin/directory/check-all', async (route) => {
        if (failDirectoryCheck) {
            await route.fulfill({ status: 500, json: { detail: 'UX-157 injected check failure' } });
            return;
        }
        await route.fulfill({
            status: 200,
            json: { checked: 1, deprovisioned: 0, active: 1, errors: 0, skipped: 0, results: [] },
        });
    });
    await page.route('**/api/v1/admin/directory/check-user/9757', async (route) => {
        await route.fulfill({ status: 500, json: { detail: 'UX-157 injected single-check failure' } });
    });
    await page.route('**/api/v1/admin/directory/break-glass-enable/9757', async (route) => {
        await route.fulfill({ status: 500, json: { detail: 'UX-157 injected break-glass failure' } });
    });
    await page.route('**/api/v1/admin/capabilities', async (route) => {
        await route.fulfill({
            status: 200,
            json: {
                can_revoke_sessions: true,
                can_run_directory_check_all: true,
                can_update_log_config: true,
                can_export_loaded_audit_logs: true,
            },
        });
    });
    await page.route('**/api/v1/admin/sessions', async (route) => {
        await route.fulfill({
            status: 200,
            json: [{
                user_id: 9757,
                user_name: 'UX-157 Directory User',
                user_email: 'ux157@example.test',
                role: 'employee',
                department: 'Risk Management',
                last_activity: '2026-08-30T08:00:00Z',
                is_active: true,
                active_sessions: 1,
                last_login: '2026-08-30T07:00:00Z',
            }],
        });
    });

    await page.goto('/users');
    await waitForDataLoad(page);
    await page.getByRole('button', { name: config.labels.directoryAdd, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const search = dialog.getByRole('textbox', { name: config.labels.directorySearch });
    await search.fill('provider failure');
    await expect(dialog.getByRole('alert')).toHaveCount(1);
    await expect(dialog.getByRole('alert')).toHaveText(config.labels.directorySetupGuidance);
    await expect(search).toBeFocused();
    await axeScanZero(page, ['[role="dialog"]'], `UX-157 directory provider failure (${config.locale})`);

    await search.fill('UX-157');
    const importButton = dialog.getByRole('button', { name: config.labels.directoryImport, exact: true });
    await expect(importButton).toBeVisible();
    await importButton.focus();
    await importButton.click();
    await expect(dialog.getByRole('alert')).toHaveCount(1);
    await expect(dialog.getByRole('alert')).toContainText(config.labels.retryGuidance);
    await expect(importButton).toBeFocused();
    await expect(importButton).toBeEnabled();
    await axeScanZero(page, ['[role="dialog"]'], `UX-157 directory import failure (${config.locale})`);

    failDirectoryImport = false;
    await importButton.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(1);

    const usersCheck = page.getByRole('button', { name: config.labels.checkDirectory, exact: true }).first();
    await usersCheck.click();
    await expect(page.getByRole('status')).toHaveCount(1);
    failDirectoryCheck = true;
    await usersCheck.focus();
    await usersCheck.click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText(config.labels.retryGuidance);
    await expect(usersCheck).toBeFocused();
    await axeScanZero(page, ['main'], `UX-157 users directory failure (${config.locale})`);

    const directoryUserRow = page.getByRole('row', { name: /UX-157 Directory User/ });
    const singleCheck = directoryUserRow.getByTitle(config.labels.checkDirectoryStatus);
    await singleCheck.focus();
    await singleCheck.click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText(config.labels.retryGuidance);
    await expect(singleCheck).toBeFocused();
    await expect(singleCheck).toBeEnabled();
    await axeScanZero(page, ['main'], `UX-157 single-user directory failure (${config.locale})`);

    await directoryUserRow.getByRole('button', { name: config.labels.breakGlass, exact: true }).click();
    const breakGlassDialog = page.getByRole('dialog', { name: config.labels.breakGlassEnable });
    const breakGlassReason = breakGlassDialog.getByRole('textbox', { name: config.labels.breakGlassReason });
    await breakGlassReason.fill('UX-157 governed emergency handoff');
    const breakGlassSubmit = breakGlassDialog.getByRole('button', { name: config.labels.breakGlassEnable });
    await breakGlassSubmit.focus();
    await breakGlassSubmit.click();
    await expect(breakGlassDialog).toBeVisible();
    await expect(breakGlassReason).toHaveValue('UX-157 governed emergency handoff');
    await expect(breakGlassDialog.getByRole('alert')).toHaveCount(1);
    await expect(breakGlassDialog.getByRole('alert')).toHaveText('UX-157 injected break-glass failure');
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(breakGlassSubmit).toBeFocused();
    await expect(breakGlassSubmit).toBeEnabled();
    await axeScanZero(page, ['[role="dialog"]'], `UX-157 break-glass failure (${config.locale})`);
    await page.keyboard.press('Escape');
    await expect(breakGlassDialog).toHaveCount(0);

    failDirectoryCheck = false;
    await page.goto('/admin');
    await waitForDataLoad(page);
    await assertContentTabs(page, config.labels.adminTabs, `UX-157 admin tabs (${config.locale})`);
    const sessionsTab = page.getByRole('tab', { name: config.labels.sessionsTab, exact: true });
    await sessionsTab.click();
    const adminCheck = page.getByRole('button', { name: config.labels.checkDirectory, exact: true });
    await expect(adminCheck).toBeVisible();
    await adminCheck.click();
    await expect(page.getByRole('status')).toHaveCount(1);
    failDirectoryCheck = true;
    await adminCheck.focus();
    await adminCheck.click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toContainText(config.labels.retryGuidance);
    await expect(adminCheck).toBeFocused();
    await axeScanZero(page, ['main'], `UX-157 admin sessions failure (${config.locale})`);

    for (const endpoint of [
        '**/api/v1/users/directory**',
        '**/api/v1/access/users**',
        '**/api/v1/directory/users/search**',
        '**/api/v1/directory/users/ux157-directory/import',
        '**/api/v1/admin/directory/check-all',
        '**/api/v1/admin/directory/check-user/9757',
        '**/api/v1/admin/directory/break-glass-enable/9757',
        '**/api/v1/admin/capabilities',
        '**/api/v1/admin/sessions',
    ]) {
        await page.unroute(endpoint);
    }
}

// Mirror the smoke's deterministic theming: seed the theme into localStorage
// before first paint AND stub the preferences GET, so every navigation renders
// in the target theme (ThemeContext reads both). addInitScript re-applies on
// each page.goto in this test.
async function seedTheme(page: Page, theme: AuditTheme): Promise<void> {
    await page.addInitScript(({ themeValue }) => {
        localStorage.setItem('riskhub-theme', themeValue);
        localStorage.setItem('riskhub-language', 'en');
    }, { themeValue: theme });

    await page.route('**/api/v1/preferences', async (route, request) => {
        if (request.method() !== 'GET') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ theme, language: 'en' }),
        });
    });
}

// Zero-tolerance enforce (N9): fail on EVERY violation the pinned WCAG tags
// select — NOT filtered by axe impact/severity, and with NO per-scan rule
// disables. There is no baseline for these states, so any finding must be fixed
// at the component source. `include` scopes the scan to the state under test
// where practical.
async function axeScanZero(page: Page, include: string[], label: string): Promise<void> {
    let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
    for (const selector of include) {
        builder = builder.include(selector);
    }
    const analysis = await builder.analyze();
    const findings = toFindings(analysis.violations);
    const details = analysis.violations
        .flatMap((violation) => violation.nodes.map((node) => {
            const checks = [...node.any, ...node.all, ...node.none]
                .map((check) => `${check.message}; data=${JSON.stringify(check.data)}`)
                .join(' | ');
            return `  [${violation.id}] ${JSON.stringify(node.target)} ${checks}`;
        }))
        .join('\n');
    expect(
        findings,
        `axe WCAG violations on "${label}" — zero-tolerance, enforce-only ` +
            `(fix at the component source; there is no baseline/capture path):\n` +
            findings.map((f) => `  [${f.rule}] impact=${f.impact ?? 'n/a'} ${f.selector}`).join('\n') +
            (details ? `\n${details}` : ''),
    ).toEqual([]);
}

// STATE 3 — Open Radix listbox (ThemedSelect on a DORA surface). The /processes
// status filter is a real <ThemedSelect> the risk manager can read.
async function driveRadixListbox(page: Page, theme: AuditTheme): Promise<void> {
    await page.goto('/processes');
    await waitForDataLoad(page);

    const trigger = page.getByTestId('processes-status-filter-trigger');
    await trigger.waitFor({ state: 'visible' });
    await trigger.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();

    await axeScanZero(
        page,
        ['[data-testid="processes-status-filter-trigger"]', '[role="listbox"]'],
        `Radix listbox open (${theme})`,
    );

    await page.keyboard.press('Escape');
    await expect(listbox).toHaveCount(0);
}

// STATE 2 — Invalid DORA form submission. Whitespace-only required identity
// fields on ProcessForm (noValidate, JS validation) surface the role="alert"
// summary + per-field Field errors (N11–N13).
async function driveInvalidForm(page: Page, theme: AuditTheme): Promise<void> {
    await page.goto('/processes/new');
    await waitForDataLoad(page);

    await page.getByTestId('process-form-l0-area').fill('   ');
    await page.getByTestId('process-form-l1-process').fill('   ');
    await page.getByTestId('process-form-submit').click();

    // The accessible error state (N12): a role="alert" summary AND per-field
    // Field wiring — the required inputs carry aria-invalid="true" (asserted by
    // attribute, not a localized string). Submission is suppressed (stays on /new).
    await expect(page.locator('[role="alert"]').first()).toBeVisible();
    await expect(page.getByTestId('process-form-l0-area')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('process-form-l1-process')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/.*processes\/new$/);

    // Scope to the content landmark (MainLayout <main>) — the form, its alert
    // summary, and the aria-invalid fields, without the shared chrome.
    await axeScanZero(page, ['main'], `Invalid form error state (${theme})`);
}

// STATE 1 — Opened DORA dialog: focus trapping + restoration on the DialogShell
// alertdialog (the archive confirm is the only DORA-reachable DialogShell modal
// for the risk manager). Opened and Escaped ONLY — never confirmed — so the
// seeded process is not archived.
async function driveDialogFocusTrap(page: Page, theme: AuditTheme, processId: number): Promise<void> {
    await page.goto(`/processes/${processId}`);
    await waitForDataLoad(page);

    const opener = page.getByTestId('process-detail-archive');
    await opener.waitFor({ state: 'visible' });
    await opener.focus();
    await expect(opener).toBeFocused();
    await opener.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    const focusInsideDialog = () =>
        page.evaluate(() => {
            const surface = document.querySelector('[role="alertdialog"]');
            return !!surface && surface.contains(document.activeElement);
        });

    // Focus is moved INTO the dialog on open. DialogShell defers the initial
    // focus via setTimeout(0), so poll rather than sampling once (avoids a race).
    await expect
        .poll(focusInsideDialog, { message: 'focus is moved into the dialog on open', timeout: 5000 })
        .toBe(true);

    // Full zero-tolerance scan of the opened dialog — structure, ARIA, accessible
    // names, focus order AND color-contrast. The ConfirmDialog danger button was
    // fixed at source (dark-red #ba3535 bg + white text-[#fff] that survives the
    // light-theme .text-white override), so color-contrast is enforced here like
    // every other state.
    await axeScanZero(page, ['[role="alertdialog"]'], `Open DORA dialog (${theme})`);

    // Focus TRAP: repeated Tab never escapes the dialog (DialogShell wraps
    // first<->last). Six presses cycle past the dialog's focusable count.
    for (let i = 1; i <= 6; i++) {
        await page.keyboard.press('Tab');
        await expect
            .poll(focusInsideDialog, { message: `focus stays trapped inside the dialog after Tab #${i}`, timeout: 3000 })
            .toBe(true);
    }

    // Escape closes (no confirm → no mutation) and RESTORES focus to the opener.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener, 'focus is restored to the opener on close').toBeFocused();
}

// STATE 4 — Expanded disclosure: the vendor sub-outsourcing chain group panel.
// Groups render expanded by default; toggle the disclosure closed→open to
// exercise it, then scan the expanded chain.
async function driveDisclosureChain(page: Page, theme: AuditTheme, vendorId: number): Promise<void> {
    await page.goto(`/vendors/${vendorId}?tab=sub-outsourcing`);
    await waitForDataLoad(page);

    const section = page.locator('#vendor-sub-outsourcing');
    await expect(section).toBeVisible();

    const group = page.locator('[data-testid^="vendor-sub-outsourcing-group-"]').first();
    await expect(group).toBeVisible();

    // Collapse if open, then expand — so the scan always targets a freshly
    // expanded panel and the aria-expanded/aria-controls disclosure is exercised.
    if ((await group.getAttribute('aria-expanded')) === 'true') {
        await group.click();
        await expect(group).toHaveAttribute('aria-expanded', 'false');
    }
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'true');

    const panelId = await group.getAttribute('aria-controls');
    if (panelId) {
        await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
    }

    await axeScanZero(page, ['#vendor-sub-outsourcing'], `Expanded sub-outsourcing chain (${theme})`);
}

// STATE 5 — DQ + Committee loading AND error states. Both screens render the
// full-screen loading/error branch only on the FIRST load (isLoading && !hasData
// / showErrorBlock), so route BEFORE each page.goto and never pre-warm.
async function driveLoadingAndError(
    page: Page,
    theme: AuditTheme,
    endpoint: string,
    route: string,
    loadingTestId: string,
    errorTestId: string,
    falseContentSelector: string,
    label: string,
): Promise<void> {
    // LOADING — hold the backing request open, scan the aria-busy spinner state.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const holdHandler = async (r: Route): Promise<void> => {
        await gate;
        try {
            await r.continue();
        } catch {
            /* the loading page was navigated away from — nothing to continue */
        }
    };
    await page.route(endpoint, holdHandler);
    // Do NOT waitForDataLoad here: [data-loading="true"] is intentionally held.
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const loadingState = page.getByTestId(loadingTestId);
    await expect(loadingState).toBeVisible({ timeout: 20000 });
    await expect(loadingState).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator(falseContentSelector)).toHaveCount(0);
    await axeScanZero(page, [`[data-testid="${loadingTestId}"]`], `${label} loading state (${theme})`);
    release();

    // ERROR — a terminal 500 handler registered on top (LIFO wins over the held
    // handler), on a fresh first load, renders the shared TableErrorState alert.
    const errorHandler = async (r: Route): Promise<void> => {
        try {
            await r.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ detail: 'E2E injected 500 (RN10 stateful a11y)' }),
            });
        } catch {
            /* superseded by a later navigation */
        }
    };
    await page.route(endpoint, errorHandler);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const errorState = page.getByTestId(errorTestId);
    await expect(errorState).toBeVisible({ timeout: 20000 });
    await expect(errorState).toContainText(TABLE_LOAD_ERROR);
    await expect(errorState.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.locator(falseContentSelector)).toHaveCount(0);
    await axeScanZero(page, [`[data-testid="${errorTestId}"]`], `${label} error state (${theme})`);

    await page.unroute(endpoint);
}

test.describe('DORA UX stateful accessibility (WCAG 2.2 AA tags, enforce-only)', () => {
    for (const theme of THEMES) {
        test(`DORA stateful surfaces have no axe violations in ${theme}`, async ({ page }) => {
            // ~8 navigations + login across five stateful surfaces; the default
            // 60s per-test budget is too tight for a serial single-worker walk.
            test.setTimeout(180000);

            await seedTheme(page, theme);
            await loginAsDemoUser(page, DEMO_ACCOUNTS.RISK_MANAGER);

            // Deterministic seeded anchors (Node-side, direct to BACKEND_URL).
            const process = await getProcessByL1(E2E_PROCESSES.CLAIMS_INTAKE.l1_process);
            expect(process, 'seeded process E2E-PROC-001 Claims Intake is present').not.toBeNull();
            const vendor = await getVendorByRegistration(E2E_ICT_VENDOR.registration_id);
            expect(vendor, 'seeded ICT vendor E2E-VREG-ICT-001 is present').not.toBeNull();

            await driveRadixListbox(page, theme); // State 3
            await driveInvalidForm(page, theme); // State 2
            await driveDialogFocusTrap(page, theme, process!.id); // State 1
            await driveDisclosureChain(page, theme, vendor!.id); // State 4
            // State 5 (last — it adds/removes route handlers).
            await driveLoadingAndError(
                page, theme, DQ_ENDPOINT, DQ_PAGE, 'dq-loading', 'dq-error',
                '[data-testid^="dq-summary-"]', 'Data-Quality',
            );
            await driveLoadingAndError(
                page, theme, COMMITTEE_ENDPOINT, COMMITTEE_PAGE, 'committee-loading', 'committee-error',
                '[data-testid^="committee-state-"], [data-testid^="committee-metric-"], [data-testid^="committee-kpi-"]',
                'ICT Committee',
            );
        });
    }

    test('a real dialog keeps a portalled ThemedSelect in the active interaction layer', async ({ page }) => {
        await seedTheme(page, 'riskhub');
        await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
        await page.goto('/users');
        await waitForDataLoad(page);

        const opener = page.getByRole('button', { name: /edit access/i }).first();
        await opener.waitFor({ state: 'visible' });
        await opener.focus();
        await opener.click();

        const dialogRole = page.getByRole('dialog', { name: /edit access settings/i });
        await expect(dialogRole).toBeVisible();
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog.getByTestId('access-edit-ready')).toBeVisible();

        const selectTrigger = dialog.getByRole('combobox').first();
        await selectTrigger.click();

        // Radix renders the listbox in a portal outside the DialogShell DOM,
        // while the modal itself remains open and semantically active.
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();
        await expect(dialog).toBeVisible();
        await expect.poll(async () => listbox.evaluate((node) => node.contains(document.activeElement)))
            .toBe(true);

        await axeScanZero(page, [], 'Access edit dialog with portalled ThemedSelect (riskhub)');

        await page.keyboard.press('Tab');
        await expect.poll(async () => page.evaluate(() => {
            const active = document.activeElement;
            const modal = document.querySelector('[role="dialog"]');
            const popup = document.querySelector('[role="listbox"]');
            return Boolean(active && (modal?.contains(active) || popup?.contains(active)));
        })).toBe(true);

        await page.keyboard.press('Escape');
        await expect(listbox).toHaveCount(0);
        await expect(dialog).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
    });
});

test.describe('UX-157 localized desktop interaction evidence', () => {
    for (const config of UX157_JOURNEYS) {
        test(`complete ${config.locale.toUpperCase()} journey at ${config.viewport.width}x${config.viewport.height}`, async ({ page }) => {
            test.setTimeout(360000);
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.setViewportSize(config.viewport);
            const { themeUpdates } = await seedUx157Preferences(page, config);
            await loginAsDemoUser(page, DEMO_ACCOUNTS.CRO);
            const [control, departmentId] = await Promise.all([
                getControlByName(E2E_CONTROLS.ARCHIVE_ACTIVE_PAIR.name),
                getRuntimeDepartmentId(),
            ]);
            expect(control, 'runtime active control is present').not.toBeNull();
            await driveUx157NamedRouteControls(page, config, control!.id, departmentId);
            await driveUx157RiskAuthoring(page, config);
            await driveUx157ApprovalsAndTheme(page, config, themeUpdates);
            await driveUx157Notifications(page, config, control!.id);
            await logout(page);
            await loginAsDemoUser(page, DEMO_ACCOUNTS.ADMIN);
            await driveUx157UsersAndAdmin(page, config);
        });
    }
});
