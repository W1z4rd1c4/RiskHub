import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TARGET = path.resolve(process.cwd(), 'src/components/riskhub/useRiskHubConfigResource.ts');

describe('useRiskHubConfigResource refactored to thin wrapper (#67)', () => {
    it('file is <= 60 lines', () => {
        const src = fs.readFileSync(TARGET, 'utf8');
        expect(src.split('\n').length).toBeLessThanOrEqual(60);
    });

    it('imports useResourcePanelQuery and useRiskHubConfigPanelState', () => {
        const src = fs.readFileSync(TARGET, 'utf8');
        expect(src).toMatch(/from '@\/hooks\/useResourcePanelQuery'/);
        expect(src).toMatch(/from '\.\/useRiskHubConfigPanelState'/);
    });
});
