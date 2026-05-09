import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('S3.11: kriFormWorkflow.ts removal', () => {
    it('source file is deleted', () => {
        const path = resolve(process.cwd(), 'src/components/kri-form/kriFormWorkflow.ts');
        expect(existsSync(path)).toBe(false);
    });
});
