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
