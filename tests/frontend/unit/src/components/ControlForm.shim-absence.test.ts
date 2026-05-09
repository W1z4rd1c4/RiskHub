import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('ControlForm.tsx 1-line shim is deleted', () => {
    it('shim file does not exist', () => {
        const shim = path.resolve(__dirname, '../../../../../frontend/src/components/ControlForm.tsx');
        expect(fs.existsSync(shim)).toBe(false);
    });

    it('canonical ControlFormContainer exports ControlForm', async () => {
        const mod = await import('@/components/control-form/ControlFormContainer');
        expect(typeof mod.ControlForm).toBe('function');
    });
});
