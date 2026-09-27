import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { renderedContrast } from './helpers/renderedContrast';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/config', route => route.fulfill({
    json: {
      auth_mode: 'hybrid_dev',
      demo_login_enabled: true,
      password_login_enabled: false,
      sso: { enabled: false, provider: 'entra', scopes: [] },
    },
  }));
});

const states = {
  history: ['normal', 'empty', 'breach', 'same'],
  approval: ['normal', 'reject', 'error', 'pending'],
  owner: ['normal', 'selected', 'error', 'empty', 'loading', 'lookup-error', 'limited'],
  questionnaire: ['normal', 'pending', 'submitting', 'readonly'],
};

async function computedPair(element: Locator) {
  return element.evaluate(e => {
    const backgrounds: string[] = [];
    for (let node: Element | null = e; node; node = node.parentElement) {
      backgrounds.push(getComputedStyle(node).backgroundColor);
    }
    return { label: e.textContent?.slice(0, 65), foreground: getComputedStyle(e).color, backgrounds };
  });
}

for (const theme of ['light', 'riskhub', 'dark']) {
  for (const locale of ['en', 'cs']) {
    for (const width of [1024, 1440]) {
      test(`${theme} ${locale} ${width}: workflow foregrounds and states`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const pairs: unknown[] = [];
        for (const [family, familyStates] of Object.entries(states)) {
          for (const state of familyStates) {
            await page.emulateMedia({ reducedMotion: state === 'same' ? 'no-preference' : 'reduce' });
            await page.goto(`/workflow-contrast.html?theme=${theme}&locale=${locale}&family=${family}&state=${state}`);
            const root = family === 'approval' ? page.getByRole('dialog') : page.locator('main');
            await expect(root.locator('h3, button').first()).toBeVisible();
            if (family === 'history' && state === 'same') {
              const currentPeriod = await root.getByRole('combobox').last().innerText();
              await root.getByRole('combobox').first().click();
              await page.getByRole('option', { name: currentPeriod, exact: true }).click();
              expect(await root.locator('.bg-warning\\/10').evaluate(e => getComputedStyle(e).opacity)).toBe('1');
              await expect(page.getByRole('listbox')).toHaveCount(0);
            }
            await page.evaluate(async () => {
              await document.fonts.ready;
            });
            await expect(root).toHaveCSS('opacity', '1');
            await expect.poll(() => root.locator('.glass-card').evaluateAll(cards => (
              cards.every(card => getComputedStyle(card).opacity === '1')
            )), { message: 'history card entrance animations settle' }).toBe(true);
            const text = root.locator('h3, h4, p, button, input:not([type="checkbox"]), textarea, dt, dd, time, span').filter({ visible: true });
            for (const element of await text.all()) {
              if (!(await element.textContent())?.trim() && !['INPUT', 'TEXTAREA'].includes(await element.evaluate(e => e.tagName))) continue;
              const colors = await computedPair(element);
              const ratio = await renderedContrast(element);
              pairs.push({ family, state, ...colors, ratio });
              expect.soft(ratio, `${family}/${state} ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(4.5);
            }
            for (const icon of await root.locator('svg.lucide').all()) {
              expect.soft(await renderedContrast(icon), `${family}/${state} icon`).toBeGreaterThanOrEqual(3);
            }
            for (const button of await root.locator('button:enabled').all()) {
              await button.hover();
              if ((await button.textContent())?.trim()) {
                expect.soft(await renderedContrast(button), `${family}/${state} hovered action`).toBeGreaterThanOrEqual(4.5);
              }
            }
            const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
            expect.soft(axe.violations, `${family}/${state} axe contrast`).toEqual([]);
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

            if (family === 'approval') {
              const notes = root.locator('textarea');
              if (state === 'pending') {
                await expect(notes).toBeDisabled();
                for (const button of await root.locator('button').all()) {
                  await expect(button).toBeDisabled();
                  expect(await button.evaluate(e => getComputedStyle(e).borderStyle)).toBe('dashed');
                }
                expect(await notes.evaluate(e => getComputedStyle(e).borderStyle)).toBe('dashed');
              } else {
                if (state === 'normal') {
                  await root.getByRole('button').last().click();
                  await expect(root.getByRole('alert')).toBeVisible();
                  await expect(notes).toBeFocused();
                }
                await notes.fill('Reviewed and confirmed.');
                await expect(notes).toHaveValue('Reviewed and confirmed.');
                expect(await renderedContrast(notes)).toBeGreaterThanOrEqual(4.5);
                expect(await notes.evaluate(e => getComputedStyle(e).boxShadow)).not.toBe('none');
                await root.getByRole('button').last().click();
                await expect(page.locator('output')).toHaveText('resolved');
              }
            }
            if (family === 'owner' && state === 'normal') {
              const search = root.locator('input[type="text"]');
              await search.fill('Alice');
              await expect(search).toHaveValue('Alice');
              expect(await renderedContrast(search)).toBeGreaterThanOrEqual(4.5);
              expect(await search.evaluate(e => getComputedStyle(e).boxShadow)).not.toBe('none');
              await root.getByRole('button', { name: 'Alice Novak risk_manager' }).click();
              await expect(root.locator('p').filter({ hasText: /^Alice Novak$/ })).toBeVisible();
            }
            if (family === 'questionnaire' && state === 'normal') {
              await root.getByRole('button').nth(0).click();
              await expect(page.locator('output')).toHaveText('saved');
              await root.getByRole('button').nth(1).click();
              await expect(page.locator('output')).toHaveText('submitted');
              await root.getByRole('button').last().click();
              await expect(page.locator('output')).toHaveText('closed');
            }
            if (family === 'questionnaire' && ['pending', 'submitting'].includes(state)) {
              await expect(root.getByRole('button').nth(0)).toBeDisabled();
              await expect(root.getByRole('button').nth(1)).toBeDisabled();
              for (const action of await root.locator('button:disabled').all()) {
                expect(await action.evaluate(e => getComputedStyle(e).borderStyle)).toBe('dashed');
              }
              await expect(root.getByRole('button').last()).toBeEnabled();
            }
          }
        }
        await testInfo.attach('computed-pairs', { body: JSON.stringify(pairs, null, 2), contentType: 'application/json' });
      });
    }
  }
}

// Uses the existing production owner harness, including real schema validation.
for (const theme of ['light', 'riskhub', 'dark']) {
  for (const locale of ['en', 'cs']) {
    for (const width of [1024, 1440]) {
      test(`${theme} ${locale} ${width}: archived link-search typography after animations`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(({ theme, locale }) => {
          localStorage.setItem('riskhub-theme', theme);
          localStorage.setItem('riskhub-language', locale);
        }, { theme, locale });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.route('**/api/v1/departments', route => route.fulfill({ json: [] }));
        await page.route('**/api/v1/lookups/risk-filters', route => route.fulfill({
          json: { processes: [], categories: [], subprocesses_by_process: {} },
        }));
        await page.route('**/api/v1/controls?*', route => route.fulfill({
          json: {
            items: [{
              id: 9906, name: 'Archived search fixture', description: '',
              frequency: 'quarterly', risk_level: 3, status: 'inactive', is_archived: true,
              control_form: 'manual',
              control_owner_name: 'Archived Control Owner', department_name: 'Operations',
              capabilities: {
                can_read: true, can_update: false, can_update_sensitive_fields: false,
                can_request_update_approval: false, can_archive_immediately: false,
                can_request_archive_approval: false, can_restore: true, can_log_execution: false,
                can_view_executions: true, can_link_risk: false, can_unlink_risk: false,
                can_view_linked_risks: true, can_view_linked_vendors: true, can_create_issue: false,
                has_pending_delete_approval: false, has_pending_update_approval: false,
                requires_privileged_update_approval: false, requires_privileged_delete_approval: false,
                is_archived: true, is_executable: false,
              },
            }],
            total: 1, offset: 0, limit: 20,
          },
        }));
        await page.goto('/dialog-contract.html?site=link.risk-linked-controls');
        await page.getByRole('button', { name: locale === 'en' ? 'Link Existing' : 'Propojit existující', exact: true }).click();
        const dialog = page.getByTestId('link-management-dialog');
        const owner = dialog.getByText('Archived Control Owner', { exact: true });
        await expect(owner).toBeVisible();
        await dialog.evaluate(async node => {
          await Promise.all(node.getAnimations({ subtree: true })
            .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => undefined)));
        });
        await expect(dialog.getByText(locale === 'en' ? 'Archived' : 'Archivované', { exact: true })).toBeVisible();
        const level = locale === 'en' ? 'Level' : 'Úroveň';
        const frequency = locale === 'en' ? 'Freq' : 'Frekv.';
        for (const label of [owner, dialog.getByText(level, { exact: true }), dialog.getByText(frequency, { exact: true })]) {
          expect(await renderedContrast(label), `${theme}/${locale} archived caption contrast`).toBeGreaterThanOrEqual(4.5);
        }
        const axe = await new AxeBuilder({ page }).include('[data-testid="link-management-dialog"]')
          .withRules(['color-contrast']).analyze();
        expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);
        expect(await owner.evaluate(element => {
          let opacity = 1;
          for (let node: Element | null = element; node; node = node.parentElement) {
            opacity *= Number(getComputedStyle(node).opacity);
          }
          return opacity;
        }), 'archived text retains full opacity after entrance').toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect(errors).toEqual([]);
      });
    }
  }
}
