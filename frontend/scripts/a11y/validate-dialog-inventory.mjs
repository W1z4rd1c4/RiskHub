#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const sourceRoot = resolve(repoRoot, 'frontend/src');
const manifestPath = resolve(repoRoot, 'tests/frontend/contracts/dialog-surfaces.json');
const matrixPath = resolve(repoRoot, 'tests/frontend/unit/src/components/dialogInteractionMatrix.test.tsx');

function fail(message) {
    throw new Error(`Dialog inventory contract failed: ${message}`);
}

function repoPath(path) {
    return relative(repoRoot, path).replaceAll('\\', '/');
}

function collectTsxFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return collectTsxFiles(path);
        return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
    });
}

function componentOwner(node) {
    let current = node;
    while (current) {
        if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
        if (
            (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
            && ts.isVariableDeclaration(current.parent)
            && ts.isIdentifier(current.parent.name)
        ) {
            return current.parent.name.text;
        }
        current = current.parent;
    }
    return null;
}

function jsxTag(node) {
    const tagName = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
        ? node.tagName
        : null;
    return tagName && ts.isIdentifier(tagName) ? tagName.text : null;
}

function multiset(items) {
    const counts = new Map();
    for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
    return counts;
}

function compareMultisets(label, expectedItems, observedItems) {
    const expected = multiset(expectedItems);
    const observed = multiset(observedItems);
    const missing = [];
    const stale = [];
    for (const [key, count] of expected) {
        const actual = observed.get(key) ?? 0;
        if (actual < count) missing.push(`${key} (${actual}/${count})`);
    }
    for (const [key, count] of observed) {
        const expectedCount = expected.get(key) ?? 0;
        if (count > expectedCount) stale.push(`${key} (${count}/${expectedCount})`);
    }
    if (missing.length || stale.length) {
        fail(`${label}\nmissing: ${missing.join(', ') || 'none'}\nuntracked: ${stale.join(', ') || 'none'}`);
    }
}

function assertUnique(items, label) {
    const duplicates = [...multiset(items)].filter(([, count]) => count > 1).map(([value]) => value);
    if (duplicates.length) fail(`duplicate ${label}: ${duplicates.join(', ')}`);
}

if (!existsSync(manifestPath)) fail(`missing manifest ${repoPath(manifestPath)}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const implementations = manifest.implementationSurfaces;
const renderSites = manifest.applicationRenderSites;
const nonDialogs = manifest.nonDialogSurfaces;
if (!Array.isArray(implementations) || !Array.isArray(renderSites) || !Array.isArray(nonDialogs)) {
    fail('manifest must contain implementationSurfaces, applicationRenderSites, and nonDialogSurfaces arrays');
}

assertUnique(implementations.map((entry) => entry.id), 'implementation id');
assertUnique(renderSites.map((entry) => entry.id), 'render-site id');
assertUnique(nonDialogs.map((entry) => entry.id), 'non-dialog id');

// DialogShell v2 lives in `components/ui/dialog.tsx` (audit 2026-09-30 §4.11,
// O8). The legacy `components/DialogShell.tsx` re-export shim was removed once
// its last consumer migrated (W6); an optional `primitive.legacyShim` is still
// validated as re-export-only if one is ever declared again.
const primitive = manifest.primitive;
if (!primitive?.file) fail('manifest must declare primitive.file');
for (const path of [primitive.file, primitive.legacyShim].filter(Boolean)) {
    if (!existsSync(resolve(repoRoot, path))) fail(`primitive references missing file ${path}`);
}

const delegates = implementations.filter((entry) => entry.kind === 'delegate');
const directImplementations = implementations.filter((entry) => entry.kind !== 'delegate');
for (const entry of delegates) {
    const target = directImplementations.find((candidate) => candidate.component === entry.delegatesTo);
    if (!target || target.kind !== 'semantic') {
        fail(`${entry.id} delegates to ${entry.delegatesTo ?? '(missing delegatesTo)'}, which is not a semantic DialogShell owner`);
    }
}

const registeredComponents = new Set(implementations.map((entry) => entry.component));
for (const entry of [...implementations, ...renderSites, ...nonDialogs]) {
    if (!entry.id || !entry.component || !entry.file) fail(`malformed entry ${JSON.stringify(entry)}`);
    // Roadmap 4.3: the deprecated DialogShell class props were deleted from the API (TypeScript now
    // rejects them), so the former `legacyClassProps` ratchet field is retired.
    if ('legacyClassProps' in entry) fail(`${entry.id} records the retired legacyClassProps field`);
    if (!existsSync(resolve(repoRoot, entry.file))) fail(`${entry.id} references missing file ${entry.file}`);
}
for (const entry of renderSites) {
    if (!registeredComponents.has(entry.component)) fail(`${entry.id} uses unregistered owner ${entry.component}`);
    if (!entry.verificationCaseId) fail(`${entry.id} has no verificationCaseId`);
}

const semanticComponents = new Set(
    implementations
        .filter((entry) => ['semantic', 'transparent-wrapper', 'delegate'].includes(entry.kind))
        .map((entry) => entry.component),
);
const directOwners = [];
const semanticRenderSites = [];
const delegateRenderSites = [];
const dialogShellDefinitions = [];
const delegateKeys = new Set(delegates.map((entry) => `${entry.delegatesTo}|${entry.file}|${entry.component}`));

function definesDialogShell(node) {
    return (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
        && node.name
        && ts.isIdentifier(node.name)
        && node.name.text === 'DialogShell';
}

for (const path of collectTsxFiles(sourceRoot)) {
    const file = repoPath(path);
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
        if (definesDialogShell(node)) dialogShellDefinitions.push(file);
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = jsxTag(node);
            if (tag === 'DialogShell') {
                const owner = componentOwner(node);
                if (!owner) fail(`cannot determine DialogShell owner in ${file}`);
                directOwners.push(`${owner}|${file}`);
            }
            if (tag && semanticComponents.has(tag)) {
                const owner = componentOwner(node);
                if (delegateKeys.has(`${tag}|${file}|${owner}`)) {
                    delegateRenderSites.push(`${tag}|${file}|${owner}`);
                } else {
                    semanticRenderSites.push(`${tag}|${file}`);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}

if (dialogShellDefinitions.length !== 1 || dialogShellDefinitions[0] !== primitive.file) {
    fail(`DialogShell must be defined once, in ${primitive.file}; found: ${dialogShellDefinitions.join(', ') || 'none'}`);
}

if (primitive.legacyShim) {
    const shimPath = resolve(repoRoot, primitive.legacyShim);
    const shimSource = ts.createSourceFile(shimPath, readFileSync(shimPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const primitiveModule = resolve(repoRoot, primitive.file).replace(/\.tsx?$/, '');
    for (const statement of shimSource.statements) {
        const specifier = ts.isExportDeclaration(statement) && statement.moduleSpecifier
            && ts.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : null;
        const target = specifier?.startsWith('@/')
            ? resolve(sourceRoot, specifier.slice(2))
            : specifier ? resolve(dirname(shimPath), specifier) : null;
        if (target !== primitiveModule) {
            fail(`${primitive.legacyShim} may only re-export ${primitive.file}`);
        }
    }
}

compareMultisets(
    'DialogShell implementation owners drifted',
    directImplementations.map((entry) => `${entry.component}|${entry.file}`),
    directOwners,
);
compareMultisets(
    'delegate implementations drifted',
    delegates.map((entry) => `${entry.delegatesTo}|${entry.file}|${entry.component}`),
    delegateRenderSites,
);

compareMultisets(
    'application render sites drifted',
    renderSites
        .filter((entry) => semanticComponents.has(entry.component))
        .map((entry) => `${entry.component}|${entry.file}`),
    semanticRenderSites,
);

const expectedCaseIds = new Set([
    ...implementations.flatMap((entry) => entry.verificationCaseIds ?? []),
    ...nonDialogs.flatMap((entry) => entry.verificationCaseId ? [entry.verificationCaseId] : []),
]);
const matrixSource = ts.createSourceFile(
    matrixPath,
    readFileSync(matrixPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
);
const observedCaseIds = [];
const visitMatrix = (node) => {
    if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'it'
        && node.arguments.length > 0
        && ts.isStringLiteral(node.arguments[0])
    ) {
        const match = node.arguments[0].text.match(/^\[([^\]]+)\]/);
        if (match) observedCaseIds.push(match[1]);
    }
    ts.forEachChild(node, visitMatrix);
};
visitMatrix(matrixSource);
assertUnique(observedCaseIds, 'matrix verificationCaseId');
compareMultisets('matrix verification cases drifted', [...expectedCaseIds], observedCaseIds);

console.log(
    `Dialog inventory verified: ${implementations.length} implementation owners, `
    + `${renderSites.length} application render sites, ${nonDialogs.length} non-dialog surfaces, `
    + `${expectedCaseIds.size} executable contract cases.`,
);
