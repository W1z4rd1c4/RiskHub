import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('controlFormUtils.ts is inlined into consumers', () => {
    it('does not exist on disk', () => {
        const target = path.resolve(
            __dirname,
            '../../../../../../frontend/src/components/control-form/controlFormUtils.ts',
        );
        expect(fs.existsSync(target)).toBe(false);
    });
});
