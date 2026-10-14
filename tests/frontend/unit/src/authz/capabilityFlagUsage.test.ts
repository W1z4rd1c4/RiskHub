import type * as Parser from '@typescript-eslint/parser';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;
const frontendSrc = path.join(repoRoot, 'frontend/src');
const require = createRequire(import.meta.url);
const { parseForESLint } = require(path.join(
    repoRoot,
    'frontend/node_modules/@typescript-eslint/parser/dist/index.js',
)) as typeof Parser;

function listProductionFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            if (['schemas', 'types'].includes(entry)) {
                return [];
            }
            return listProductionFiles(fullPath);
        }
        return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
    });
}

function isNode(node: unknown): node is TSESTree.Node {
    return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string' && 'range' in node && Array.isArray(node.range);
}

function walk(node: unknown, visit: (child: TSESTree.Node) => void): void {
    if (!isNode(node)) return;
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

function capabilityAliases(ast: TSESTree.Node): Set<string> {
    const aliases = new Set<string>();
    walk(ast, (node) => {
        if (node.type !== AST_NODE_TYPES.VariableDeclarator || node.id?.type !== AST_NODE_TYPES.Identifier) {
            return;
        }
        const init = node.init;
        if (
            init?.type === AST_NODE_TYPES.MemberExpression
            && !init.computed
            && init.property?.type === AST_NODE_TYPES.Identifier
            && init.property.name === 'capabilities'
        ) {
            aliases.add(node.id.name);
        }
    });
    return aliases;
}

function isCapabilitySource(node: TSESTree.Node, aliases: Set<string>, source: string): boolean {
    if (node.type === AST_NODE_TYPES.Identifier && aliases.has(node.name)) {
        return true;
    }
    if (node.type === AST_NODE_TYPES.Identifier && /Capabilities$/.test(node.name)) {
        return true;
    }
    return source.slice(node.range[0], node.range[1]).includes('capabilities');
}

function directCapabilityReads(source: string, relativePath: string, ast: TSESTree.Node): string[] {
    const aliases = capabilityAliases(ast);
    const violations: string[] = [];
    walk(ast, (node) => {
        if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed || node.property?.type !== AST_NODE_TYPES.Identifier) {
            return;
        }
        if (!node.property.name.startsWith('can_')) {
            return;
        }
        if (!isCapabilitySource(node.object, aliases, source)) {
            return;
        }
        const snippet = source.slice(node.range[0], node.range[1]);
        violations.push(`${relativePath}:${node.loc.start.line}:${node.loc.start.column + 1} ${snippet}`);
    });
    return violations;
}

function shouldParseForCapabilityReads(source: string): boolean {
    return source.includes('can_') && (source.includes('capabilities') || /\b\w+Capabilities\b/.test(source));
}

describe('capability flag usage', () => {
    it('detects direct capability reads through aliases', () => {
        const source = 'const caps = row.capabilities;\nconst allowed = caps.can_update === true;\n';
        const parsed = parseForESLint(source, {
            loc: true,
            range: true,
            sourceType: 'module',
        });

        expect(directCapabilityReads(source, 'frontend/src/example.ts', parsed.ast)).toEqual([
            'frontend/src/example.ts:2:17 caps.can_update',
        ]);
    });

    it('detects direct capability reads from named capability objects', () => {
        const source = 'const allowed = meCapabilities.can_read_risks;\n';
        const parsed = parseForESLint(source, {
            loc: true,
            range: true,
            sourceType: 'module',
        });

        expect(directCapabilityReads(source, 'frontend/src/example.ts', parsed.ast)).toEqual([
            'frontend/src/example.ts:1:17 meCapabilities.can_read_risks',
        ]);
    });

    it('uses resolveCapabilityFlag for production capability booleans', () => {
        const violations: string[] = [];

        for (const filePath of listProductionFiles(frontendSrc)) {
            const relativePath = path.relative(repoRoot, filePath);
            if (relativePath === 'frontend/src/lib/capabilities.ts') {
                continue;
            }
            const source = readFileSync(filePath, 'utf8');
            if (!shouldParseForCapabilityReads(source)) {
                continue;
            }
            const parsed = parseForESLint(source, {
                ecmaFeatures: { jsx: filePath.endsWith('.tsx') },
                loc: true,
                range: true,
                sourceType: 'module',
            });

            violations.push(...directCapabilityReads(source, relativePath, parsed.ast));
        }

        expect(violations).toEqual([]);
    });
});
