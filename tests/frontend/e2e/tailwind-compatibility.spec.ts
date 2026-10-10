import { expect, test } from '@playwright/test';

// CI screenshots are review evidence, not an auto-updated visual baseline.
// Computed-style assertions independently lock the v3 behaviors retained by v4.
for (const theme of ['light', 'riskhub', 'dark']) {
  for (const width of [1024, 1440]) {
    test(`${theme} ${width}: Tailwind migration primitives and screenshots`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/design-system.html?theme=${theme}&locale=en`);
      await expect(page.getByTestId('design-system-ready')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const focusTarget = page.locator('[data-ds-section="buttons"] button:enabled').first();
      await focusTarget.focus();
      await expect(focusTarget).toBeFocused();
      expect(await focusTarget.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await testInfo.attach(`tailwind4-primitives-${theme}-${width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      });

      const measured = await page.evaluate(() => {
        const fixture = document.createElement('div');
        fixture.innerHTML = '<div class="space-y-2"><label>Label</label><span hidden>Hidden</span><input class="block" /></div><div class="divide-y divide-border"><div>First</div><div hidden>Hidden</div><div>Second</div></div><div class="shadow-sm backdrop-blur-sm rounded-sm">Surface</div><div class="space-y-2 flex flex-col"><div class="mt-3 mb-4">First</div><div hidden>Hidden</div><div class="mt-1">Second</div></div>';
        document.body.append(fixture);
        const spacing = fixture.children[0];
        const rows = fixture.children[1];
        const surface = getComputedStyle(fixture.children[2]);
        const marginChildren = fixture.children[3].children;
        const result = {
          labelBottom: getComputedStyle(spacing.children[0]).marginBottom,
          controlTop: getComputedStyle(spacing.children[2]).marginTop,
          firstBorder: getComputedStyle(rows.children[0]).borderBottomWidth,
          secondBorder: getComputedStyle(rows.children[2]).borderTopWidth,
          shadow: surface.boxShadow,
          blur: surface.backdropFilter,
          radius: surface.borderRadius,
          firstTopMargin: getComputedStyle(marginChildren[0]).marginTop,
          firstBottomMargin: getComputedStyle(marginChildren[0]).marginBottom,
          followingMargin: getComputedStyle(marginChildren[2]).marginTop,
          followingGap: marginChildren[2].getBoundingClientRect().top - marginChildren[0].getBoundingClientRect().bottom,
          dividerGap: rows.children[2].getBoundingClientRect().top - rows.children[0].getBoundingClientRect().bottom,
        };
        fixture.remove();
        return result;
      });
      expect(measured.labelBottom).toBe('0px');
      expect(measured.controlTop).toBe('8px');
      expect(measured.firstBorder).toBe('0px');
      expect(measured.secondBorder).toBe('1px');
      expect(measured.shadow).toContain('rgba(0, 0, 0, 0.05) 0px 1px 2px 0px');
      expect(measured.blur).toBe('blur(4px)');
      expect(measured.radius).toBe('8px');
      expect(measured.firstTopMargin).toBe('12px');
      expect(measured.firstBottomMargin).toBe('16px');
      expect(measured.followingMargin).toBe('8px');
      expect(measured.followingGap).toBe(24);
      expect(measured.dividerGap).toBe(0);

      await page.goto(`/design-system.html?theme=${theme}&locale=en&dialog=shell`);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await testInfo.attach(`tailwind4-dialog-${theme}-${width}`, {
        body: await page.screenshot(), contentType: 'image/png',
      });
    });
  }
}
