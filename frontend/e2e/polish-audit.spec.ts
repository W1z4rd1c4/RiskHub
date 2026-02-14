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

async function firstNumericIdFromLinks(page: Page, hrefPrefix: string): Promise<string | null> {
    const hrefs = await page
        .locator(`a[href^="${hrefPrefix}"]`)
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''));

    for (const href of hrefs) {
        const remainder = href.slice(hrefPrefix.length);
        const id = remainder.split('/')[0];
        if (/^\\d+$/.test(id)) return id;
    }
    return null;
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

                    await seedLocalStorage(page, theme, language);
                    await mockPreferencesApi(page, theme, language);

                    const runId = `${new Date().toISOString()}_${role}_${theme}_${language}`;
                    const records: RouteAudit[] = [];
                    const visited = new Set<string>();

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

                        finalizeCurrent();

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

                        await page.goto(routePath);
                        await waitForDataLoad(page, 45000);

                        current.finalUrl = page.url();

                        const takeScreenshot = async (label: string) => {
                            const screenshotPath = testInfo.outputPath(
                                'polish-audit',
                                'screenshots',
                                `${safeFilename(routePath)}_${safeFilename(label)}.png`,
                            );
                            await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
                            await page.screenshot({ path: screenshotPath, fullPage: true });
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
                        if (routePath === '/approvals') {
                            const approveBtn = page.locator('[data-testid^="approval-resolve-approve-"]').first();
                            const legacyApproveBtn = page.locator('button[title="Approve"]').first();
                            const approve = (await approveBtn.isVisible().catch(() => false)) ? approveBtn : legacyApproveBtn;
                            if (await approve.isVisible().catch(() => false)) {
                                await approve.click();
                                await page.waitForTimeout(250);
                                await takeScreenshot('approval_resolution_dialog');

                                const cancelBtn = page.locator('[data-testid="approval-resolution-cancel"]').first();
                                if (await cancelBtn.isVisible().catch(() => false)) {
                                    await cancelBtn.click();
                                } else {
                                    // Click the backdrop to close (reliable even when translated)
                                    await page.mouse.click(5, 5);
                                }
                            }
                        }

                        // Admin docs: open first doc, then go back
                        if (routePath === '/admin/docs') {
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
                            routePath.startsWith('/controls') ||
                            routePath.startsWith('/risks') ||
                            routePath.startsWith('/vendors')
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
                        if (theme === 'light') {
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
                        const numericIdFindings = await page.evaluate(() => {
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
                            for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
                                const text = (el.textContent || '').trim();
                                if (!text) continue;

                                if (/\bRisk\s+#\d+\b/i.test(text) || /^#\d+$/.test(text)) {
                                    results.push({ selector: toSelector(el), text: text.slice(0, 120) });
                                }

                                if (results.length >= 25) break;
                            }

                            return results;
                        });

                        if (numericIdFindings.length > 0) {
                            current.notes.push(`numeric-id guardrail flagged ${numericIdFindings.length} element(s)`);
                        }
                        expect(numericIdFindings, 'No numeric DB IDs should be displayed as user-facing fallbacks').toEqual([]);
                    };

                    // Pre-login public pages
                    await auditRoute('/landing', 'public');
                    await auditRoute('/login', 'public');

                    // Login (demo account picker)
                    await loginAsDemoUser(page, accountName);

                    // Post-login: core routes per role
                    const baseRoutes: string[] = role === 'ADMIN'
                        ? [
                            '/',
                            '/admin',
                            '/admin/docs',
                            '/settings',
                            '/users',
                        ]
                        : [
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
                        if (routePath === '/controls') {
                            const id = await firstNumericIdFromLinks(page, '/controls/');
                            if (id) {
                                toVisit.splice(i + 1, 0, `/controls/${id}`, `/controls/${id}/edit`);
                            }
                        }
                        if (routePath === '/risks') {
                            const id = await firstNumericIdFromLinks(page, '/risks/');
                            if (id) {
                                toVisit.splice(i + 1, 0, `/risks/${id}`, `/risks/${id}/edit`);
                            }
                        }
                        if (routePath === '/issues') {
                            const id = await firstNumericIdFromLinks(page, '/issues/');
                            if (id) {
                                toVisit.splice(i + 1, 0, `/issues/${id}`);
                            }
                        }
                        if (routePath === '/kris') {
                            const id = await firstNumericIdFromLinks(page, '/kris/');
                            if (id) {
                                toVisit.splice(i + 1, 0, `/kris/${id}`);
                            }
                        }
                        if (routePath === '/departments') {
                            const id = await firstNumericIdFromLinks(page, '/departments/');
                            if (id) {
                                toVisit.splice(i + 1, 0, `/departments/${id}`);
                            }
                        }
                        if (routePath === '/vendors') {
                            const id = await firstNumericIdFromLinks(page, '/vendors/');
                            if (id) {
                                toVisit.splice(i + 1, 0, `/vendors/${id}`, `/vendors/${id}/edit`);
                            }
                        }
                        if (routePath === '/users') {
                            const id = await firstNumericIdFromLinks(page, '/users/');
                            if (id) {
                                toVisit.splice(i + 1, 0, `/users/${id}`);
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
