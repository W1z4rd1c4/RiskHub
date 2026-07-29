// @vitest-environment node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const frontendRoot = process.cwd();
const repoRoot = resolve(frontendRoot, '..');
const manifestPath = resolve(frontendRoot, 'src/assets/fonts/manifest.json');

describe('production font assets', () => {
    it('has no Google Fonts execution origin in production HTML, CSS, or CSP', () => {
        const productionFiles = [
            'frontend/index.html',
            'frontend/src/index.css',
            'frontend/src/assets/fonts/fonts.css',
            'frontend/nginx.conf',
            'backend/app/middleware/security_headers.py',
            'scripts/deploy/templates/linux/nginx-site.conf.tmpl',
            '.github/workflows/e2e.yml',
        ];

        for (const relativePath of productionFiles) {
            const source = readFileSync(resolve(repoRoot, relativePath), 'utf8');
            expect(source, relativePath).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
        }
    });

    it('pins every repository-vendored WOFF2 file to the checksum manifest', () => {
        expect(existsSync(manifestPath), manifestPath).toBe(true);
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            fonts: Array<{
                family: string;
                css: string;
                license: string;
                assets: Array<{ path: string; sha256: string }>;
            }>;
        };
        const stylesheets = new Set(manifest.fonts.map((font) => font.css));
        expect(stylesheets.size).toBe(1);
        expect(manifest.fonts.map((font) => font.license).sort()).toEqual([
            'public/fonts/licenses/Inter-OFL-1.1.txt',
            'public/fonts/licenses/Outfit-OFL-1.1.txt',
        ]);
        const [stylesheet] = stylesheets;
        const css = readFileSync(resolve(frontendRoot, stylesheet), 'utf8');
        const fontFaces = Array.from(css.matchAll(/@font-face\s*{([^}]*)}/g), (match) => {
            const block = match[1];
            const family = block.match(/font-family:\s*['"]([^'"]+)['"]\s*;/)?.[1];
            const assets = Array.from(block.matchAll(/url\((?:\.\/)?([^)'\"]+\.woff2)\)/g), (url) =>
                resolve(frontendRoot, stylesheet, '..', url[1])
            );
            return { family, assets };
        });
        const declaredAssets = fontFaces.flatMap((fontFace) => fontFace.assets).sort();
        const manifestAssets = manifest.fonts
            .flatMap((font) => font.assets)
            .map((asset) => resolve(frontendRoot, asset.path))
            .sort();

        expect(declaredAssets).toEqual(manifestAssets);

        for (const font of manifest.fonts) {
            expect(font.css).toBe(stylesheet);
            const licensePath = resolve(frontendRoot, font.license);
            expect(existsSync(licensePath), font.license).toBe(true);
            expect(readFileSync(licensePath, 'utf8'), font.license).toContain(
                'SIL OPEN FONT LICENSE Version 1.1'
            );
            for (const asset of font.assets) {
                expect(asset.path).toMatch(/^src\/assets\/fonts\/files\/[^/]+\.woff2$/);
            }

            const familyAssets = fontFaces
                .filter((fontFace) => fontFace.family === font.family)
                .flatMap((fontFace) => fontFace.assets)
                .sort();
            const expectedFamilyAssets = font.assets
                .map((asset) => resolve(frontendRoot, asset.path))
                .sort();
            expect(familyAssets, font.family).toEqual(expectedFamilyAssets);

            for (const asset of font.assets) {
                const assetPath = resolve(frontendRoot, asset.path);
                expect(existsSync(assetPath), asset.path).toBe(true);
                const digest = createHash('sha256').update(readFileSync(assetPath)).digest('hex');
                expect(digest, asset.path).toBe(asset.sha256);
            }
        }
    });
});
