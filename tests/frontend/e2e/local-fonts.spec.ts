import { expect, test } from '@playwright/test';

test('production serves the local font license notices', async ({ request }) => {
    for (const family of ['Inter', 'Outfit']) {
        const response = await request.get(`/fonts/licenses/${family}-OFL-1.1.txt`);
        expect(response.status(), family).toBe(200);
        await expect(response.text()).resolves.toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
});

test('production UI loads local Inter and Outfit fonts without Google requests', async ({ page }) => {
    const externalFontRequests: string[] = [];
    page.on('request', (request) => {
        if (/fonts\.(?:googleapis|gstatic)\.com/i.test(request.url())) {
            externalFontRequests.push(request.url());
        }
    });

    await page.goto('/login');
    await page.evaluate(() => document.fonts.ready);

    const fonts = await page.evaluate(async () => {
        const [inter, outfit] = await Promise.all([
            document.fonts.load("400 16px 'Inter Variable'"),
            document.fonts.load("700 24px 'Outfit Variable'"),
        ]);
        return {
            inter: inter.length > 0 && document.fonts.check("400 16px 'Inter Variable'"),
            outfit: outfit.length > 0 && document.fonts.check("700 24px 'Outfit Variable'"),
            bodyFamily: getComputedStyle(document.body).fontFamily,
        };
    });

    expect(externalFontRequests).toEqual([]);
    expect(fonts.inter).toBe(true);
    expect(fonts.outfit).toBe(true);
    expect(fonts.bodyFamily).toContain('Inter Variable');
});
