import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Department alternate snapshot exports', () => {
    it.each([
        ['Risk', 'src/pages/risks/useRisksPageState.ts', 'exportRiskSnapshot'],
        ['Control', 'src/pages/controls/useControlsPageState.ts', 'exportControlSnapshot'],
        ['KRI', 'src/pages/kris/useKrisPageState.ts', 'exportKriSnapshot'],
        ['Issue', 'src/pages/issues/useIssuesPageState.ts', 'exportIssueSnapshot'],
    ])('%s snapshot export retains the immutable Department', (_name, path, exportName) => {
        const source = readFileSync(resolve(ROOT, path), 'utf8');
        const exportStart = source.indexOf(`const ${exportName}`);
        expect(exportStart).toBeGreaterThan(-1);
        expect(source.slice(exportStart, exportStart + 1_500)).toContain(
            'departmentId: departmentScope?.departmentId',
        );
    });
});
