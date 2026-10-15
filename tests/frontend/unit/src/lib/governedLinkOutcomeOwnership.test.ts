import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type * as TS from 'typescript';
import { describe, expect, it } from 'vitest';
const root = path.resolve(__dirname, '../../../../..');
const ts = createRequire(path.join(root, 'frontend/package.json'))('typescript') as typeof TS;
const registerLanes = [
    ['pages/assets/AssetLinkSections.tsx', ['addProcessLink', 'setPrimaryProcess', 'removeProcessLink', 'addAssetLink', 'removeAssetLink', 'addVendorLink', 'removeVendorLink']],
    ['pages/processes/ProcessVendorLinksSection.tsx', ['addVendorLink', 'removeVendorLink']],
    ['pages/vendors/VendorRegisterLinksSection.tsx', ['addAssetLink', 'removeAssetLink', 'addProcessLink', 'removeProcessLink']],
    ['pages/threats/ThreatRiskLinksSection.tsx', ['addRiskLink', 'removeRiskLink']],
    ['components/risks/detail-overview/RiskRegisterLinksSection.tsx', ['addThreatLink', 'removeThreatLink', 'addProcessLink', 'removeProcessLink', 'addAssetLink', 'removeAssetLink']],
] as const;
function read(file: string) { return fs.readFileSync(path.join(root, 'frontend/src', file), 'utf8'); }
function declaration(source: string, name: string) {
    const tree = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found: TS.VariableDeclaration | undefined;
    function visit(node: TS.Node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = node;
        ts.forEachChild(node, visit);
    }
    visit(tree);
    return { node: found, tree };
}
function assertOwnedLane(source: string, name: string) {
    const { node, tree } = declaration(source, name);
    expect(node, `missing mutation lane ${name}`).toBeDefined();
    expect(node?.initializer && ts.isCallExpression(node.initializer)).toBe(true);
    const call = node!.initializer as TS.CallExpression;
    expect(call.expression.getText(tree), `${name} must own its submitted generation`).toBe('useOwnedGovernedMutation');
    expect(call.arguments).toHaveLength(2);
    expect(ts.isObjectLiteralExpression(call.arguments[1])).toBe(true);
    const options = call.arguments[1] as TS.ObjectLiteralExpression;
    expect(options.properties.some((property) => property.name?.getText(tree) === 'mutationFn')).toBe(true);
}

describe('governed Link relation outcome ownership (#248)', () => {
    for (const [file, lanes] of registerLanes) {
        it(`delegates every executable lane in ${file}`, () => {
            const source = read(file);
            lanes.forEach((lane) => assertOwnedLane(source, lane));
            expect(source).not.toMatch(/isProcessApprovalQueuedResponse|isApprovalCreatedResponse|parseUpdateResult/);
            expect(source).not.toMatch(/\/approvals\?/);
        });
    }
    it('detects a seeded lane bypass rather than merely requiring a helper import', () => {
        const source = read(registerLanes[0][0]);
        const bypass = source.replace('const addProcessLink = useOwnedGovernedMutation(asset.id,', 'const addProcessLink = useMutation(');
        expect(bypass).not.toBe(source);
        expect(() => assertOwnedLane(bypass, 'addProcessLink')).toThrow();
    });
    it('delegates both Risk-Control continuation lanes to the canonical outcome owner', () => {
        const source = read('pages/detail/useRiskDetailState.ts');
        for (const lane of ['handleLinkControl', 'handleUnlinkControl']) {
            const { node, tree } = declaration(source, lane);
            expect(node?.getText(tree), lane).toContain('executeGovernedMutation(');
        }
    });
    it('routes all six Vendor adapter instances through one classified relation operation', () => {
        const source = read('components/vendors/useVendorLinkedEntities.ts');
        const { node, tree } = declaration(source, 'mutateRelation');
        expect(node?.getText(tree)).toContain('executeGovernedMutation(');
        for (const lane of ['link', 'unlink']) {
            const current = declaration(source, lane);
            expect(current.node?.getText(current.tree)).toContain(`mutateRelation('${lane}'`);
        }
        expect(source).not.toMatch(/isProcessApprovalQueuedResponse|isApprovalCreatedResponse/);
        for (const [file, family] of [['VendorLinkedRisksTab', 'Risk'], ['VendorLinkedControlsTab', 'Control'], ['VendorLinkedKRIsTab', 'KRI']]) {
            const tab = read(`components/vendors/${file}.tsx`);
            expect(tab).toContain('<VendorLinkedEntitiesTab');
            expect(tab).toContain(`vendorLinkApi.link${family}`);
            expect(tab).toContain(`vendorLinkApi.unlink${family}`);
        }
    });
});
