import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(process.cwd(), 'src/components/dashboard');

const FILTER_CONSUMERS = [
    'CategoryBreakdownCharts.tsx',
    'DepartmentTable.tsx',
    'RiskDrilldownModal.tsx',
    'FilterBar.tsx',
    'KRIStatusWidget.tsx',
    'KRIBreachWidget.tsx',
];

describe('dashboard filter consumers', () => {
    it.each(FILTER_CONSUMERS)('%s imports WidgetShell', (file) => {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');

        expect(src).toMatch(/from '@\/components\/dashboard\/WidgetShell'/);
    });
});
