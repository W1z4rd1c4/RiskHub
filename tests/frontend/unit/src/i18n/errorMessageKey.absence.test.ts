import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const I18N = path.resolve(__dirname, '../../../../../frontend/src/i18n');

describe('legacy split error files are deleted', () => {
    it('getErrorMessageKey.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'getErrorMessageKey.ts'))).toBe(false);
    });

    it('errorCodeMap.ts is gone', () => {
        expect(fs.existsSync(path.join(I18N, 'errorCodeMap.ts'))).toBe(false);
    });
});
