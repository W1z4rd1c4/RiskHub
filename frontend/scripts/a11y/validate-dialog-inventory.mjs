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

const registeredComponents = new Set(implementations.map((entry) => entry.component));
for (const entry of [...implementations, ...renderSites, ...nonDialogs]) {
    if (!entry.id || !entry.component || !entry.file) fail(`malformed entry ${JSON.stringify(entry)}`);
    if (!existsSync(resolve(repoRoot, entry.file))) fail(`${entry.id} references missing file ${entry.file}`);
}
for (const entry of renderSites) {
    if (!registeredComponents.has(entry.component)) fail(`${entry.id} uses unregistered owner ${entry.component}`);
    if (!entry.verificationCaseId) fail(`${entry.id} has no verificationCaseId`);
}

const semanticComponents = new Set(
    implementations
        .filter((entry) => entry.kind === 'semantic' || entry.kind === 'transparent-wrapper')
        .map((entry) => entry.component),
);
const directOwners = [];
const semanticRenderSites = [];

for (const path of collectTsxFiles(sourceRoot)) {
    const file = repoPath(path);
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = jsxTag(node);
            if (tag === 'DialogShell') {
                const owner = componentOwner(node);
                if (!owner) fail(`cannot determine DialogShell owner in ${file}`);
                directOwners.push(`${owner}|${file}`);
            }
            if (tag && semanticComponents.has(tag)) semanticRenderSites.push(`${tag}|${file}`);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}

compareMultisets(
    'DialogShell implementation owners drifted',
    implementations.map((entry) => `${entry.component}|${entry.file}`),
    directOwners,
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
