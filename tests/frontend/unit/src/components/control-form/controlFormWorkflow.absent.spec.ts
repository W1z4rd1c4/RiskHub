import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('FE-deadcode-1: controlFormWorkflow.ts removal', () => {
    it('source file is deleted', () => {
        const path = resolve(process.cwd(), 'src/components/control-form/controlFormWorkflow.ts');
        expect(existsSync(path)).toBe(false);
    });
});
