import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('FE-deadcode-3: notifications/resourcePath.ts removal', () => {
    it('re-export file is deleted', () => {
        const path = resolve(process.cwd(), 'src/components/notifications/resourcePath.ts');
        expect(existsSync(path)).toBe(false);
    });
});
