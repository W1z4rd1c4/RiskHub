/**
 * RiskHub Polish Audit Runner
 *
 * Purpose:
 * - Systematically visit pages across roles + themes + languages
 * - Capture console/page errors, API calls, and screenshots for review
 *
 * Notes:
 * - This spec is intentionally "audit-style": it tries to keep assertions light,
 *   except for a small set of access-control guardrails (e.g. /governance redirects).
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loginAsDemoUser, DEMO_ACCOUNTS } from './helpers/login';
import { waitForDataLoad } from './helpers/wait';
import { navigateSpa } from './helpers/spaNavigate';

type AuditTheme = 'riskhub' | 'light';
type AuditLanguage = 'en' | 'cs';
type AuditRole = 'RISK_MANAGER' | 'CRO' | 'ADMIN';

type ConsoleEntry = {
    type: string;
    text: string;
    location?: { url?: string; lineNumber?: number; columnNumber?: number };
};

type ApiCallEntry = {
    method: string;
    path: string;
    status: number;
};

type RouteAudit = {
    route: string;
    finalUrl: string;
    startedAtIso: string;
    console: ConsoleEntry[];
    pageErrors: string[];
    apiCalls: ApiCallEntry[];
    apiCallSummary: Array<ApiCallEntry & { count: number }>;
    screenshots: string[];
    notes: string[];
    domHeuristics?: {
        lowContrastLightTheme?: Array<{ selector: string; fg: string; bg: string }>;
    };
};

type AuditArtifact = {
    runId: string;
    role: AuditRole;
    theme: AuditTheme;
    language: AuditLanguage;
    records: RouteAudit[];
};

const THEMES: AuditTheme[] = ['riskhub', 'light'];
const LANGUAGES: AuditLanguage[] = ['en', 'cs'];

const ROLE_CASES: Array<{ role: AuditRole; accountName: string }> = [
    { role: 'RISK_MANAGER', accountName: DEMO_ACCOUNTS.RISK_MANAGER },
    { role: 'CRO', accountName: DEMO_ACCOUNTS.CRO },
    { role: 'ADMIN', accountName: DEMO_ACCOUNTS.ADMIN },
];

function safeFilename(input: string): string {
    return input
        .replace(/^https?:\/\//, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function apiUrlForPage(page: Page, apiPath: string): string {
    const fallbackOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
    const origin = (() => {
        try {
            return new URL(page.url()).origin;
        } catch {
            return fallbackOrigin;
        }
    })();

    return new URL(apiPath, origin).toString();
}

function firstNumericIdFromItemsPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const items = (payload as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0] as { id?: unknown };
    const idValue = first?.id;
    if (typeof idValue === 'number' && Number.isFinite(idValue)) return String(idValue);
    if (typeof idValue === 'string' && /^\\d+$/.test(idValue)) return idValue;
    return null;
}

function firstNumericIdFromArrayPayload(payload: unknown): string | null {
    if (!Array.isArray(payload) || payload.length === 0) return null;
    const first = payload[0] as { id?: unknown };
    const idValue = first?.id;
    if (typeof idValue === 'number' && Number.isFinite(idValue)) return String(idValue);
    if (typeof idValue === 'string' && /^\\d+$/.test(idValue)) return idValue;
    return null;
}

async function firstIdFromApi(page: Page, authToken: string, routePath: string): Promise<string | null> {
    const headers = { Authorization: `Bearer ${authToken}` };
    const getJson = async (apiPath: string): Promise<unknown | null> => {
        const resp = await page.request.get(apiUrlForPage(page, apiPath), { headers });
        if (!resp.ok()) return null;
        return await resp.json().catch(() => null);
    };

    switch (routePath) {
        case '/controls': {
            const data = await getJson('/api/v1/controls?skip=0&limit=1');
            return firstNumericIdFromItemsPayload(data);
        }
        case '/risks': {
            const data = await getJson('/api/v1/risks?skip=0&limit=1');
            return firstNumericIdFromItemsPayload(data);
        }
        case '/issues': {
            const data = await getJson('/api/v1/issues?skip=0&limit=1');
            return firstNumericIdFromItemsPayload(data);
        }
        case '/kris': {
            const data = await getJson('/api/v1/kris?page=1&size=1');
            return firstNumericIdFromItemsPayload(data);
        }
        case '/departments': {
            const data = await getJson('/api/v1/departments');
            return firstNumericIdFromArrayPayload(data);
        }
        case '/vendors': {
            const data = await getJson('/api/v1/vendors?skip=0&limit=1');
            return firstNumericIdFromItemsPayload(data);
        }
        case '/users': {
            const data = await getJson('/api/v1/users/lookup?skip=0&limit=1');
            return firstNumericIdFromArrayPayload(data);
        }
        default:
            return null;
    }
}

async function seedLocalStorage(page: Page, theme: AuditTheme, language: AuditLanguage): Promise<void> {
    await page.addInitScript(
        ({ themeValue, languageValue }) => {
            localStorage.setItem('riskhub-theme', themeValue);
            localStorage.setItem('riskhub-language', languageValue);
        },
        { themeValue: theme, languageValue: language },
    );
}

async function mockPreferencesApi(page: Page, theme: AuditTheme, language: AuditLanguage): Promise<void> {
    await page.route('**/api/v1/preferences', async (route, request) => {
        if (request.method() !== 'GET') return route.continue();

        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ theme, language }),
        });
    });
}

test.describe('Polish Audit (page-by-page)', () => {
    test.describe.configure({ mode: 'serial' });

    for (const { role, accountName } of ROLE_CASES) {
        for (const theme of THEMES) {
            for (const language of LANGUAGES) {
                test(`${role} / theme=${theme} / lang=${language}`, async ({ page }, testInfo) => {
                    test.setTimeout(10 * 60 * 1000);

                    const runAllBrowsers = process.env.POLISH_AUDIT_ALL_BROWSERS === '1';
                    if (!runAllBrowsers && testInfo.project.name !== 'chromium') {
                        test.skip(true, 'polish-audit runs on chromium only by default (set POLISH_AUDIT_ALL_BROWSERS=1 to enable all browsers).');
                    }

                    // Default to lightweight audit for CI speed; enable full audit locally when needed.
                    const deepAudit = process.env.POLISH_AUDIT_DEEP === '1';

                    await seedLocalStorage(page, theme, language);
                    await mockPreferencesApi(page, theme, language);

                    const runId = `${new Date().toISOString()}_${role}_${theme}_${language}`;
                    const records: RouteAudit[] = [];
                    const visited = new Set<string>();
                    let lightContrastHeuristicRan = false;

                    let current: RouteAudit | null = null;

                    page.on('console', (msg) => {
                        if (!current) return;
                        current.console.push({
                            type: msg.type(),
                            text: msg.text(),
                            location: msg.location(),
                        });
                    });

                    page.on('pageerror', (err) => {
                        if (!current) return;
                        current.pageErrors.push(err instanceof Error ? err.message : String(err));
                    });

                    page.on('response', async (resp) => {
                        if (!current) return;

                        const url = resp.url();
                        if (!url.includes('/api/v1/')) return;

                        let pathname = url;
                        try {
                            const parsed = new URL(url);
                            pathname = parsed.pathname;
                        } catch {
                            // Keep best-effort string.
                        }

                        current.apiCalls.push({
                            method: resp.request().method(),
                            path: pathname,
                            status: resp.status(),
                        });
                    });

                    const finalizeCurrent = () => {
                        if (!current) return;
                        const counts = new Map<string, number>();
                        for (const call of current.apiCalls) {
                            const key = `${call.method} ${call.path} ${call.status}`;
                            counts.set(key, (counts.get(key) || 0) + 1);
                        }
                        current.apiCallSummary = Array.from(counts.entries())
                            .map(([key, count]) => {
                                const [method, pathValue, statusStr] = key.split(' ');
                                return {
                                    method,
                                    path: pathValue,
                                    status: Number(statusStr),
                                    count,
                                };
                            })
                            .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method) || a.status - b.status);
                    };

                    const auditRoute = async (routePath: string, note?: string) => {
                        if (visited.has(routePath)) return;
                        visited.add(routePath);

                        // Ensure previous route record is closed before starting a new one.
                        finalizeCurrent();
                        current = null;

                        current = {
                            route: routePath,
                            finalUrl: '',
                            startedAtIso: new Date().toISOString(),
                            console: [],
                            pageErrors: [],
                            apiCalls: [],
                            apiCallSummary: [],
                            screenshots: [],
                            notes: note ? [note] : [],
                        };
                        records.push(current);

                        const timeoutMs = deepAudit ? 45000 : 20000;
                        const isPublicRoute = routePath === '/landing' || routePath === '/login';

                        if (isPublicRoute) {
                            await page.goto(routePath);
                            await waitForDataLoad(page, timeoutMs);
                        } else {
                            await navigateSpa(page, routePath, {
                                timeout: timeoutMs,
                                onFallbackGoto: (reason) => {
                                    current?.notes.push(`navigation: fell back to hard page.goto (SPA nav failed): ${reason}`);
                                },
                            });
                        }

                        current.finalUrl = page.url();

                        const takeScreenshot = async (label: string) => {
                            const screenshotPath = testInfo.outputPath(
                                'polish-audit',
                                'screenshots',
                                `${safeFilename(routePath)}_${safeFilename(label)}.png`,
                            );
                            await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
                            // viewport screenshots are significantly faster and reduce audit timeouts
                            await page.screenshot({ path: screenshotPath, fullPage: false });
                            current?.screenshots.push(screenshotPath);
                        };

                        await takeScreenshot('page');

                        // =====================================================================
                        // Step 4 interactions: open common overlays + a small set of page surfaces
                        // =====================================================================

                        // Sidebar hover states (if present)
                        const sidebarLinks = page.locator('aside a');
                        const sidebarCount = await sidebarLinks.count().catch(() => 0);
                        for (let j = 0; j < Math.min(sidebarCount, 5); j++) {
                            await sidebarLinks.nth(j).hover().catch(() => { });
                        }

                        // NotificationBell dropdown open/close (if present)
                        const bellButton = page.locator('[data-testid="notification-bell-button"]').first();
                        const legacyBellButton = page.locator('button[aria-label="Notifications"]').first();
                        const bell = (await bellButton.isVisible().catch(() => false)) ? bellButton : legacyBellButton;
                        if (await bell.isVisible().catch(() => false)) {
                            await bell.click().catch(() => { });
                            await page.waitForTimeout(250);
                            await takeScreenshot('notification_dropdown');
                            await bell.click().catch(() => { });
                        }

                        // Approvals: open resolution dialog (approve + cancel)
                        if (deepAudit && routePath === '/approvals') {
                            const approveBtn = page.locator('[data-testid^="approval-resolve-approve-"]').first();
                            const legacyApproveBtn = page.locator('button[title="Approve"]').first();
                            const approve = (await approveBtn.isVisible().catch(() => false)) ? approveBtn : legacyApproveBtn;
                            if (await approve.isVisible().catch(() => false)) {
                                await approve.click();
                                await page.waitForTimeout(250);
                                await takeScreenshot('approval_resolution_dialog');

                                // Close the resolution dialog in a language-safe way.
                                const dialogRoot = page.locator('div.fixed.inset-0.z-50').first();
                                if (await dialogRoot.isVisible().catch(() => false)) {
                                    await dialogRoot.locator('button').first().click().catch(() => { });
                                    await dialogRoot.waitFor({ state: 'detached', timeout: 2000 }).catch(async () => {
                                        // Fallback: click the backdrop
                                        await page.mouse.click(5, 5);
                                    });
                                } else {
                                    // Fallback: click the backdrop (should hit overlay)
                                    await page.mouse.click(5, 5);
                                }
                            }
                        }

                        // Admin docs: open first doc, then go back
                        if (deepAudit && routePath === '/admin/docs') {
                            const docCard = page.locator('main .grid button').first();
                            if (await docCard.isVisible().catch(() => false)) {
                                await docCard.click();
                                await page.waitForTimeout(250);
                                await takeScreenshot('doc_detail');

                                const backBtn = page.locator('main button').first();
                                await backBtn.click().catch(() => { });
                            }
                        }

                        // Controls/Risks/Vendors: open first combobox/select popover (if present)
                        if (
                            deepAudit && (
                            routePath.startsWith('/controls') ||
                            routePath.startsWith('/risks') ||
                            routePath.startsWith('/vendors')
                            )
                        ) {
                            const combobox = page.locator('[role="combobox"]').first();
                            if (await combobox.isVisible().catch(() => false)) {
                                await combobox.click().catch(() => { });
                                await page.waitForTimeout(250);
                                await takeScreenshot('combobox_open');
                                await page.keyboard.press('Escape').catch(() => { });
                            }
                        }

                        // =====================================================================
                        // Step 6 runtime heuristic (light theme): flag likely low-contrast elements
                        // =====================================================================
                        if (theme === 'light' && routePath === '/' && !lightContrastHeuristicRan) {
                            lightContrastHeuristicRan = true;
                            const candidates = await page.evaluate(() => {
                                const clamp = (n: number) => Math.max(0, Math.min(255, n));
                                const parseRgb = (value: string) => {
                                    const m = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([0-9.]+))?\\)/);
                                    if (!m) return null;
                                    return { r: clamp(Number(m[1])), g: clamp(Number(m[2])), b: clamp(Number(m[3])), a: m[4] ? Number(m[4]) : 1 };
                                };
                                const luminance = (rgb: { r: number; g: number; b: number }) => {
                                    // Relative luminance approximation in [0,1]
                                    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
                                };

                                const withClass = Array.from(document.querySelectorAll<HTMLElement>('[class*="hover:text-white"],[class*="group-hover:text-white"],[class*="text-white/"]'));
                                const results: Array<{ selector: string; fg: string; bg: string }> = [];

                                const toSelector = (el: Element) => {
                                    const id = (el as HTMLElement).id;
                                    if (id) return `#${CSS.escape(id)}`;
                                    const testid = (el as HTMLElement).getAttribute('data-testid');
                                    if (testid) return `[data-testid="${testid.replace(/"/g, '\\"')}"]`;
                                    const tag = el.tagName.toLowerCase();
                                    const cls = ((el as HTMLElement).className || '').split(/\\s+/).filter(Boolean).slice(0, 3);
                                    return cls.length ? `${tag}.${cls.map((c) => CSS.escape(c)).join('.')}` : tag;
                                };

                                const effectiveBg = (el: Element) => {
                                    let node: Element | null = el;
                                    while (node) {
                                        const bg = getComputedStyle(node).backgroundColor;
                                        const parsed = parseRgb(bg);
                                        if (parsed && parsed.a !== 0) return bg;
                                        node = node.parentElement;
                                    }
                                    return 'rgb(255, 255, 255)';
                                };

                                for (const el of withClass) {
                                    const style = getComputedStyle(el);
                                    const fg = style.color;
                                    const bg = effectiveBg(el);
                                    const fgRgb = parseRgb(fg);
                                    const bgRgb = parseRgb(bg);
                                    if (!fgRgb || !bgRgb) continue;
                                    if (luminance(fgRgb) > 0.9 && luminance(bgRgb) > 0.9) {
                                        results.push({ selector: toSelector(el), fg, bg });
                                    }
                                }

                                return results.slice(0, 25);
                            });
                            if (candidates.length > 0) {
                                current.domHeuristics = { ...(current.domHeuristics || {}), lowContrastLightTheme: candidates };
                                current.notes.push(`light-theme heuristic flagged ${candidates.length} potential low-contrast elements`);
                            }
                        }

                        // =====================================================================
                        // Step 11 guardrail: no numeric DB IDs rendered as user-facing fallbacks
                        // =====================================================================
                        const { findings: numericIdFindings, scanned, total } = await page.evaluate(() => {
                            const results: Array<{ selector: string; text: string }> = [];

                            const toSelector = (el: Element) => {
                                const id = (el as HTMLElement).id;
                                if (id) return `#${CSS.escape(id)}`;
                                const testid = (el as HTMLElement).getAttribute('data-testid');
                                if (testid) return `[data-testid="${testid.replace(/"/g, '\\"')}"]`;
                                const tag = el.tagName.toLowerCase();
                                const cls = ((el as HTMLElement).className || '').split(/\s+/).filter(Boolean).slice(0, 3);
                                return cls.length ? `${tag}.${cls.map((c) => CSS.escape(c)).join('.')}` : tag;
                            };

                            const root = document.querySelector('main') || document.body;
                            const elements = root.querySelectorAll<HTMLElement>('*');
                            const maxElements = 2500;
                            let scannedCount = 0;

                            for (const el of elements) {
                                scannedCount += 1;
                                if (scannedCount > maxElements) break;
                                const text = (el.textContent || '').trim();
                                if (!text) continue;

                                if (/\bRisk\s+#\d+\b/i.test(text) || /^#\d+$/.test(text)) {
                                    results.push({ selector: toSelector(el), text: text.slice(0, 120) });
                                }

                                if (results.length >= 25) break;
                            }

                            return {
                                findings: results,
                                scanned: Math.min(scannedCount, maxElements),
                                total: elements.length,
                            };
                        });

                        if (total > scanned) {
                            current.notes.push(`numeric-id scan truncated (${scanned}/${total} elements scanned)`);
                        }
                        if (numericIdFindings.length > 0) {
                            current.notes.push(`numeric-id guardrail flagged ${numericIdFindings.length} element(s)`);
                        }
                        expect(numericIdFindings, 'No numeric DB IDs should be displayed as user-facing fallbacks').toEqual([]);

                        finalizeCurrent();
                        current = null;
                    };

                    // Pre-login public pages
                    await auditRoute('/landing', 'public');
                    await auditRoute('/login', 'public');

                    // Login (demo account picker)
                    await loginAsDemoUser(page, accountName);

                    const authToken = await page.evaluate(() => localStorage.getItem('access_token'));
                    if (!authToken) {
                        throw new Error('polish-audit: missing access_token after login');
                    }

                    // Post-login: core routes per role
                    const baseRoutes: string[] = role === 'ADMIN'
                        ? [
                            '/',
                            '/admin',
                            '/admin/docs',
                            '/settings',
                            '/users',
                        ]
                        : deepAudit
                            ? [
                                '/',
                                '/approvals',
                                '/notifications',
                                '/controls',
                                '/controls/new',
                                '/risks',
                                '/risks/new',
                                '/issues',
                                '/issues/new',
                                '/kris',
                                '/kris/new',
                                '/departments',
                                '/vendors',
                                '/vendors/new',
                                '/vendor-reports',
                                '/audit-trail',
                                '/activity-log',
                                '/users',
                                '/settings',
                            ]
                            : [
                                '/',
                                '/approvals',
                                '/controls',
                                '/risks',
                                '/issues',
                                '/kris',
                                '/departments',
                                '/vendors',
                                '/activity-log',
                                '/users',
                                '/settings',
                            ];

                    // Forced navigation to restricted routes to verify redirects / guards.
                    const forcedRestrictedRoutes = [
                        '/governance',
                        '/risk-hub',
                        '/admin',
                        '/admin/docs',
                    ];

                    const toVisit = [...baseRoutes, ...forcedRestrictedRoutes];
                    for (let i = 0; i < toVisit.length; i++) {
                        const routePath = toVisit[i];
                        await auditRoute(routePath, baseRoutes.includes(routePath) ? 'expected-visible' : 'forced-direct');

                        // Access-control guardrail: governance is CRO/Admin only (should redirect for others).
                        if (routePath === '/governance' && role === 'RISK_MANAGER') {
                            await expect(page).not.toHaveURL(/\/governance/);
                        }

                        // Expand dynamic routes from list pages (first discovered entity id).
                        if (deepAudit) {
                            if (routePath === '/controls') {
                                const id = await firstIdFromApi(page, authToken, routePath);
                                if (id) {
                                    toVisit.splice(i + 1, 0, `/controls/${id}`, `/controls/${id}/edit`);
                                }
                            }
                            if (routePath === '/risks') {
                                const id = await firstIdFromApi(page, authToken, routePath);
                                if (id) {
                                    toVisit.splice(i + 1, 0, `/risks/${id}`, `/risks/${id}/edit`);
                                }
                            }
                            if (routePath === '/issues') {
                                const id = await firstIdFromApi(page, authToken, routePath);
                                if (id) {
                                    toVisit.splice(i + 1, 0, `/issues/${id}`);
                                }
                            }
                            if (routePath === '/kris') {
                                const id = await firstIdFromApi(page, authToken, routePath);
                                if (id) {
                                    toVisit.splice(i + 1, 0, `/kris/${id}`);
                                }
                            }
                            if (routePath === '/departments') {
                                const id = await firstIdFromApi(page, authToken, routePath);
                                if (id) {
                                    toVisit.splice(i + 1, 0, `/departments/${id}`);
                                }
                            }
                            if (routePath === '/vendors') {
                                const id = await firstIdFromApi(page, authToken, routePath);
                                if (id) {
                                    toVisit.splice(i + 1, 0, `/vendors/${id}`, `/vendors/${id}/edit`);
                                }
                            }
                            if (routePath === '/users') {
                                const id = await firstIdFromApi(page, authToken, routePath);
                                if (id) {
                                    toVisit.splice(i + 1, 0, `/users/${id}`);
                                }
                            }
                        }
                    }

                    finalizeCurrent();

                    const artifact: AuditArtifact = {
                        runId,
                        role,
                        theme,
                        language,
                        records,
                    };

                    const artifactPath = testInfo.outputPath('polish-audit', `audit_${safeFilename(runId)}.json`);
                    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
                    await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf-8');
                    await testInfo.attach('polish-audit', {
                        path: artifactPath,
                        contentType: 'application/json',
                    });
                });
            }
        }
    }
});
