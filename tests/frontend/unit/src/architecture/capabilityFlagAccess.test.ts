import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;
const srcRoot = path.join(repoRoot, 'frontend', 'src');
const require = createRequire(import.meta.url);
const { parseForESLint } = require(path.join(
    repoRoot,
    'frontend/node_modules/@typescript-eslint/parser/dist/index.js',
)) as typeof import('@typescript-eslint/parser');
const excludedPathFragments = [
    `${path.sep}services${path.sep}api${path.sep}schemas${path.sep}`,
    `${path.sep}types${path.sep}`,
    `${path.sep}lib${path.sep}capabilities.ts`,
];

function productionSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            return productionSourceFiles(fullPath);
        }
        if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) {
            return [];
        }
        if (excludedPathFragments.some((fragment) => fullPath.includes(fragment))) {
            return [];
        }
        return [fullPath];
    });
}

function walk(node: any, visit: (child: any) => void): void {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const [key, value] of Object.entries(node)) {
        if (key === 'parent') continue;
        if (Array.isArray(value)) {
            value.forEach((child) => walk(child, visit));
        } else if (value && typeof value === 'object' && 'type' in value) {
            walk(value, visit);
        }
    }
}

function capabilityAliases(ast: any): Set<string> {
    const aliases = new Set<string>();
    walk(ast, (node) => {
        if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier') {
            return;
        }
        const init = node.init;
        if (
            init?.type === 'MemberExpression'
            && !init.computed
            && init.property?.type === 'Identifier'
            && init.property.name === 'capabilities'
        ) {
            aliases.add(node.id.name);
        }
    });
    return aliases;
}

function isCapabilitySource(node: any, aliases: Set<string>, sourceText: string): boolean {
    if (node.type === 'Identifier' && aliases.has(node.name)) {
        return true;
    }
    if (node.type === 'Identifier' && /Capabilities$/.test(node.name)) {
        return true;
    }
    const snippet = sourceText.slice(node.range[0], node.range[1]);
    return snippet.includes('capabilities');
}

function collectDirectCapabilityReadFindings(
    sourceText: string,
    filePath: string,
    aliases: Set<string>,
    ast: any,
): string[] {
    const findings: string[] = [];

    walk(ast, (node) => {
        if (node.type !== 'MemberExpression' || node.computed || node.property?.type !== 'Identifier') {
            return;
        }
        if (!node.property.name.startsWith('can_')) {
            return;
        }
        if (!isCapabilitySource(node.object, aliases, sourceText)) {
            return;
        }
        const snippet = sourceText.slice(node.range[0], node.range[1]);
        findings.push(`${path.relative(repoRoot, filePath)}:${node.loc.start.line}:${node.loc.start.column + 1} ${snippet}`);
    });
    return findings;
}

function parseSource(sourceText: string, filePath: string): ReturnType<typeof parseForESLint> {
    return parseForESLint(sourceText, {
        ecmaFeatures: { jsx: filePath.endsWith('.tsx') },
        loc: true,
        range: true,
        sourceType: 'module',
    });
}

function directCapabilityReadFindings(sourceText: string, filePath: string, aliases: Set<string>): string[] {
    const parsed = parseSource(sourceText, filePath);
    return collectDirectCapabilityReadFindings(sourceText, filePath, aliases, parsed.ast);
}

function canContainDirectCapabilityRead(sourceText: string): boolean {
    return sourceText.includes('.can_') && (sourceText.includes('capabilities') || sourceText.includes('Capabilities'));
}

function directCapabilityReads(filePath: string): string[] {
    const sourceText = readFileSync(filePath, 'utf8');
    if (!canContainDirectCapabilityRead(sourceText)) {
        return [];
    }
    const parsed = parseForESLint(sourceText, {
        ecmaFeatures: { jsx: filePath.endsWith('.tsx') },
        loc: true,
        range: true,
        sourceType: 'module',
    });
    return collectDirectCapabilityReadFindings(sourceText, filePath, capabilityAliases(parsed.ast), parsed.ast);
}

describe('frontend capability flag access', () => {
    it('detects direct capability reads through local aliases', () => {
        const sourceText = 'const caps = row.capabilities;\nconst allowed = caps.can_update === true;\n';
        const parsed = parseForESLint(sourceText, {
            loc: true,
            range: true,
            sourceType: 'module',
        });

        expect(directCapabilityReadFindings(sourceText, path.join(repoRoot, 'frontend/src/example.ts'), capabilityAliases(parsed.ast))).toEqual([
            'frontend/src/example.ts:2:17 caps.can_update',
        ]);
    });

    it('detects direct capability reads from named capability objects', () => {
        const sourceText = 'const allowed = meCapabilities.can_read_risks;\n';
        const parsed = parseForESLint(sourceText, {
            loc: true,
            range: true,
            sourceType: 'module',
        });

        expect(directCapabilityReadFindings(sourceText, path.join(repoRoot, 'frontend/src/example.ts'), capabilityAliases(parsed.ast))).toEqual([
            'frontend/src/example.ts:1:17 meCapabilities.can_read_risks',
        ]);
    });


    it('routes production capability reads through resolveCapabilityFlag', () => {
        const findings = productionSourceFiles(srcRoot).flatMap(directCapabilityReads);

        expect(findings).toEqual([]);
    });
});
