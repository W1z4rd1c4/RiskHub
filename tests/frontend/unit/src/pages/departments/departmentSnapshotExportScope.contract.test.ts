import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Department alternate evidence exports', () => {
    it.each([
        ['Risk', 'src/pages/risks/useRisksPageState.ts', 'exportRiskSnapshot'],
        ['Control', 'src/pages/controls/useControlsPageState.ts', 'exportControlSnapshot'],
        ['KRI', 'src/pages/kris/useKrisPageState.ts', 'exportKriSnapshot'],
        ['Issue', 'src/pages/issues/useIssuesPageState.ts', 'exportIssueEvaluation'],
    ])('%s dated export retains the immutable Department', (_name, path, exportName) => {
        const source = readFileSync(resolve(ROOT, path), 'utf8');
        const exportStart = source.indexOf(`const ${exportName}`);
        expect(exportStart).toBeGreaterThan(-1);
        const callback = source.slice(exportStart, exportStart + 1_500);
        if (_name === 'Risk') {
            const planner = source.slice(source.indexOf('const listParams'), source.indexOf('const configuredRangeIdentity'));
            expect(planner).toContain('...apiSemanticFilters,\n            department_id: departmentScope?.departmentId,');
            expect(callback).toContain('departmentId: listParams.department_id');
        } else {
            expect(callback).toContain('departmentId: departmentScope?.departmentId');
        }
    });
});
