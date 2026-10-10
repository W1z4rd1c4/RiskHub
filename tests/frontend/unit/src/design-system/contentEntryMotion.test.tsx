import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type * as TypeScript from 'typescript';

import { QuarterMetricCard } from '@/components/dashboard/QuarterMetricCard';
import { RiskSummaryCards } from '@/components/risks/detail-overview/RiskSummaryCards';
import type { Risk } from '@/types/risk';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../frontend');
const require = createRequire(resolve(frontendRoot, 'package.json'));
const ts: typeof TypeScript = require('typescript');

// Mechanical entry-opacity contract, not a substitute for rendered contrast.
// Geometry, stagger, hover and exit motion remain independently testable.
function unreadableEntries(source: string, path: string): string[] {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const failures: string[] = [];
    const belowFullOpacity = (object: TypeScript.ObjectLiteralExpression): boolean => object.properties.some((property) => (
        ts.isPropertyAssignment(property)
        && property.name.getText(file) === 'opacity'
        && ts.isNumericLiteral(property.initializer)
        && Number(property.initializer.text) < 1
    ));
    const visit = (node: TypeScript.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const initial = node.attributes.properties.find((attribute) => (
                ts.isJsxAttribute(attribute) && attribute.name.getText(file) === 'initial'
            ));
            const expression = initial && ts.isJsxAttribute(initial)
                && initial.initializer && ts.isJsxExpression(initial.initializer)
                ? initial.initializer.expression : undefined;
            const backdrop = path === 'components/ui/dialog.tsx'
                && ts.isJsxSelfClosingElement(node)
                && node.attributes.properties.some((attribute) => (
                    ts.isJsxAttribute(attribute)
                    && attribute.name.getText(file) === 'data-dialog-backdrop'
                    && attribute.initializer && ts.isStringLiteral(attribute.initializer)
                    && attribute.initializer.text === 'true'
                ));
            if (expression && ts.isObjectLiteralExpression(expression) && belowFullOpacity(expression) && !backdrop) {
                failures.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: initial opacity`);
            }
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'hidden'
            && ts.isObjectLiteralExpression(node.initializer) && belowFullOpacity(node.initializer)) {
            failures.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: hidden entry variant`);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return failures;
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.tsx') ? [path] : [];
    });
}

describe('readable content entry motion', () => {
    it('rejects transparent and partially transparent entry targets and variants', () => {
        expect(unreadableEntries('<motion.div initial={{ opacity: 0, y: 20 }}>Text</motion.div>', 'card.tsx')).toHaveLength(1);
        expect(unreadableEntries('<motion.div initial={{ opacity: 0.5 }}>Text</motion.div>', 'card.tsx')).toHaveLength(1);
        expect(unreadableEntries('const variants = { hidden: { opacity: 0, y: 20 } };', 'card.tsx')).toHaveLength(1);
        expect(unreadableEntries('<motion.div initial={{ opacity: 1, y: 20 }} exit={{ opacity: 0 }}>Text</motion.div>', 'card.tsx')).toEqual([]);
    });

    it('allows only the empty canonical dialog backdrop to fade on entry', () => {
        const backdrop = '<motion.div initial={{ opacity: 0 }} data-dialog-backdrop="true" />';
        expect(unreadableEntries(backdrop, 'components/ui/dialog.tsx')).toEqual([]);
        expect(unreadableEntries(backdrop, 'card.tsx')).toHaveLength(1);
        expect(unreadableEntries('<motion.div initial={{ opacity: 0 }} data-dialog-backdrop="true">Text</motion.div>', 'components/ui/dialog.tsx')).toHaveLength(1);
    });

    it('keeps readable source entry targets opaque without disabling movement or exits', () => {
        const root = resolve(frontendRoot, 'src');
        const failures = sourceFiles(root).flatMap((path) => unreadableEntries(readFileSync(path, 'utf8'), relative(root, path)));
        expect(failures).toEqual([]);
    });

    it('renders Risk summary text fully opaque while retaining its initial translation', () => {
        const { container } = render(
            <MemoryRouter>
                <RiskSummaryCards
                    risk={{ id: 1, name: 'Risk', risk_type: 'operational', category: 'Operational', process: 'Review' } as Risk}
                    activeControlCount={0} linkedKriCount={0} linkedVendorCount={0}
                    getColor={() => '#0088ff'} getDisplayName={() => 'Operational'}
                />
            </MemoryRouter>,
        );
        const cards = container.querySelectorAll('.glass-card');
        expect(cards).toHaveLength(3);
        expect(cards[0].parentElement).toHaveStyle({ opacity: '1' });
        for (const card of cards) {
            expect(card).toHaveStyle({ opacity: '1' });
            expect((card as HTMLElement).style.transform).toContain('translateY(20px)');
        }
    });

    it('renders Dashboard metric text fully opaque while retaining its entry scale', () => {
        render(<QuarterMetricCard
            label="Open issues" keyName="open_issues" thisValue={4} lastValue={3}
            isSnapshotMetric={false} currentSnapshotAvailable compareSnapshotAvailable
            missingCurrentSnapshotMetric={false} missingCompareSnapshotMetric={false}
            t={(key) => key}
        />);
        const card = screen.getByLabelText('Open issues');
        expect(card).toHaveStyle({ opacity: '1' });
        expect(card.style.transform).toContain('scale(0.95)');
    });
});
