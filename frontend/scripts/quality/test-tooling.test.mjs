import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { ESLint } from 'eslint';
import ts from 'typescript';

const frontendRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.dirname(frontendRoot);
function loadProject(name) {
  const configPath = path.join(frontendRoot, name);
  const rawConfig = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(rawConfig.error, undefined);
  return ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, frontendRoot, {}, configPath);
}
const projects = {
  unit: loadProject('tsconfig.tests.json'),
  e2e: loadProject('tsconfig.e2e.json'),
  tools: loadProject('tsconfig.test-tools.json'),
};
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: path.join(frontendRoot, 'eslint.tests.config.js'),
});

test('runner-specific projects include every centralized TypeScript suite and helper', () => {
  const files = ts.sys.readDirectory(path.join(repoRoot, 'tests/frontend'), ['.ts', '.tsx'], ['**/node_modules/**']);
  assert.ok(files.length > 0);
  const included = new Set(Object.values(projects).flatMap(project => project.fileNames));
  for (const file of files) {
    assert.ok(included.has(file), `Missing from test projects: ${file}`);
    assert.equal(Object.values(projects).filter(project => project.fileNames.includes(file)).length, 1,
      `Centralized test/config must have exactly one runner project: ${file}`);
  }
  for (const file of ['vitest.config.ts', 'vitest.setup.ts', 'playwright.config.ts', 'src/env.d.ts']) {
    assert.ok(included.has(path.join(frontendRoot, file)), `Missing harness input: ${file}`);
  }
  for (const project of Object.values(projects)) {
    assert.deepEqual(project.errors, []);
    assert.equal(project.options.strict, true);
    assert.equal(project.options.noEmit, true);
    assert.equal(project.options.noCheck, undefined);
  }
  assert.ok(projects.unit.options.types.includes('vitest/globals'));
  for (const project of [projects.e2e, projects.tools]) {
    assert.equal(project.options.types.includes('vitest/globals'), false);
    assert.equal(project.options.types.includes('@testing-library/jest-dom'), false);
  }
});

test('sibling suites resolve real dependency declarations and application/test aliases', () => {
  const importer = path.join(repoRoot, 'tests/frontend/unit/src/test/render.tsx');
  for (const name of [
    'react', 'react/jsx-runtime', 'react-dom/client', 'vitest', '@playwright/test',
    '@testing-library/react', 'msw/node', '@typescript-eslint/parser',
  ]) {
    const resolved = ts.resolveModuleName(name, importer, projects.unit.options, ts.sys).resolvedModule;
    assert.ok(resolved?.resolvedFileName.match(/\.d\.[cm]?ts$/), `${name} must resolve to declarations, not untyped JS`);
  }
  for (const [name, target] of [
    ['@/lib/utils', path.join(frontendRoot, 'src/lib/utils.ts')],
    ['@test/mocks/server', path.join(repoRoot, 'tests/frontend/unit/src/test/mocks/server.ts')],
  ]) {
    const resolved = ts.resolveModuleName(name, importer, projects.unit.options, ts.sys).resolvedModule;
    assert.equal(resolved?.resolvedFileName, target);
  }
});

test('test lint covers unit, E2E and harness files with real type-aware rules', async () => {
  for (const [file, project] of [
    ['tests/frontend/unit/src/test/render.tsx', './tsconfig.tests.json'],
    ['tests/frontend/unit/src/authz/useAuthz.invariant.test.ts', './tsconfig.tests.json'],
    ['tests/frontend/e2e/helpers/login.ts', './tsconfig.e2e.json'],
    ['tests/frontend/e2e/auth.spec.ts', './tsconfig.e2e.json'],
    ['frontend/vitest.setup.ts', './tsconfig.tests.json'],
    ['frontend/vitest.config.ts', './tsconfig.test-tools.json'],
    ['frontend/playwright.config.ts', './tsconfig.test-tools.json'],
    ['tests/frontend/unit/vitest.config.ts', './tsconfig.test-tools.json'],
    ['tests/frontend/e2e/playwright.config.ts', './tsconfig.test-tools.json'],
  ]) {
    const config = await eslint.calculateConfigForFile(path.join(repoRoot, file));
    assert.ok(config, `ESLint ignored ${file}`);
    assert.equal(config.languageOptions.parserOptions.project, project);
    if (project === './tsconfig.test-tools.json') {
      assert.equal(config.languageOptions.globals.window, 'off');
      assert.equal(config.languageOptions.globals.document, 'off');
    }
    assert.equal(config.rules['@typescript-eslint/no-floating-promises'][0], 2);
    assert.equal(config.rules['@typescript-eslint/no-unsafe-assignment'][0], 2);
    assert.equal(config.linterOptions.noInlineConfig, true);
    assert.equal(config.rules['no-restricted-syntax'], undefined);
    assert.equal(config.rules['jsx-a11y/label-has-associated-control'], undefined);
    assert.equal(config.rules['react-refresh/only-export-components'], undefined);
  }
});

// Typecheck/lint only a virtual fixture using the selected project's real
// compiler options. Do not build or run the application's suites for this probe.
async function checkFixture(file, code, project) {
  const filePath = path.join(repoRoot, file);
  const host = ts.createCompilerHost(project.options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...args) => name === filePath
    ? ts.createSourceFile(name, code, languageVersion, true)
    : getSourceFile(name, languageVersion, ...args);
  const program = ts.createProgram([filePath], project.options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const fixtureLinter = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(frontendRoot, 'eslint.tests.config.js'),
    overrideConfig: [{
      files: ['**/*.ts'],
      languageOptions: { parserOptions: { project: null, programs: [program] } },
    }],
  });
  const [result] = await fixtureLinter.lintText(code, { filePath });
  assert.equal(result.fatalErrorCount, 0, 'A parsing failure must not masquerade as global isolation');
  return { diagnostics, errors: result.messages.filter(message => message.severity === 2) };
}

test('Vitest globals are valid only in unit tests, and fail TypeScript and ESLint elsewhere', async () => {
  const code = "describe('runtime', () => { expect(vi.fn()).toBeDefined(); });";
  const unit = await checkFixture('tests/frontend/unit/src/runtime-probe.ts', code, projects.unit);
  assert.deepEqual(unit.diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
  assert.deepEqual(unit.errors, []);

  for (const [file, project] of [
    ['tests/frontend/e2e/runtime-probe.ts', projects.e2e],
    ['frontend/playwright.config.ts', projects.tools],
    ['frontend/vitest.config.ts', projects.tools],
  ]) {
    const result = await checkFixture(file, code, project);
    const messages = result.diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
    for (const name of ['describe', 'expect', 'vi']) {
      assert.ok(messages.some(message => message.includes(`'${name}'`)), `${file} accepted undeclared ${name}`);
    }
    assert.ok(result.errors.some(message => message.ruleId === '@typescript-eslint/no-unsafe-call'),
      `${file} did not reject undeclared runner calls`);
  }
});

test('Playwright tests with explicit runner imports remain valid', async () => {
  const result = await checkFixture('tests/frontend/e2e/runtime-probe.ts',
    "import { expect, test } from '@playwright/test'; test('runtime', () => { expect(1).toBe(1); });",
    projects.e2e);
  assert.deepEqual(result.diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
  assert.deepEqual(result.errors, []);
});

// Read literal coverage policy without loading Vite or running application tests.
const source = ts.createSourceFile('vitest.config.ts', fs.readFileSync(path.join(frontendRoot, 'vitest.config.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const exported = source.statements.find(ts.isExportAssignment);
assert.ok(exported && ts.isCallExpression(exported.expression));
function property(object, name) {
  assert.ok(ts.isObjectLiteralExpression(object));
  const entry = object.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(source) === name);
  assert.ok(entry, `Missing literal config property: ${name}`);
  return entry.initializer;
}
const coverage = property(property(exported.expression.arguments[0], 'test'), 'coverage');
function patterns(name) {
  const value = property(coverage, name);
  assert.ok(ts.isArrayLiteralExpression(value));
  return value.elements.map(item => {
    assert.ok(ts.isStringLiteral(item));
    return item.text;
  });
}

test('coverage includes unimported executable source, including schemas and entrypoints', () => {
  const include = patterns('include');
  const exclude = patterns('exclude');
  const eligible = file => include.some(glob => path.matchesGlob(file, glob))
    && !exclude.some(glob => path.matchesGlob(file, glob));
  for (const file of ['src/unimported.ts', 'src/pages/unimported.tsx', 'src/main.tsx', 'src/services/api/schemas/runtime.ts']) {
    assert.ok(eligible(file), `Missing coverage obligation: ${file}`);
  }
  for (const file of ['src/types/localAuth.generated.d.ts', 'src/env.d.ts', 'src/test/helper.ts', 'src/lib/example.test.ts', 'src/__tests__/fixture.tsx']) {
    assert.equal(eligible(file), false, `Non-runtime input counted: ${file}`);
  }
});

test('coverage retains all existing floors and failure evidence', () => {
  const thresholds = property(coverage, 'thresholds');
  for (const [name, floor] of Object.entries({ statements: 57, branches: 47, functions: 47, lines: 58 })) {
    assert.ok(Number(property(thresholds, name).getText(source)) >= floor, `${name} floor was lowered`);
  }
  assert.equal(property(coverage, 'reportOnFailure').kind, ts.SyntaxKind.TrueKeyword);
});
