import path from "node:path";

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Centralized suites are siblings of the frontend package. An absolute basePath
// anchors matching; lint:tests also runs from the repository root so ESLint does
// not discard sibling files as outside its base directory.
// Fixtures deliberately do not inherit application-only design/a11y/refresh bans.
export default defineConfig([
  {
    name: "riskhub/frontend-tests",
    basePath: path.resolve(import.meta.dirname, ".."),
    files: [
      "tests/frontend/**/*.{ts,tsx}",
      "frontend/{vitest.config,vitest.setup,playwright.config}.ts",
    ],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    linterOptions: { noInlineConfig: true },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: "./tsconfig.tests.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Match the production policy for explicit escape hatches. Unsafe use of
      // those values still fails the recommended type-aware rules above.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    name: "riskhub/playwright-test-environment",
    basePath: path.resolve(import.meta.dirname, ".."),
    files: ["tests/frontend/e2e/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { project: "./tsconfig.e2e.json" },
    },
  },
  {
    name: "riskhub/test-config-environment",
    basePath: path.resolve(import.meta.dirname, ".."),
    files: [
      "frontend/{vitest,playwright}.config.ts",
      "tests/frontend/unit/vitest.config.ts",
      "tests/frontend/e2e/playwright.config.ts",
    ],
    languageOptions: {
      globals: {
        ...Object.fromEntries(Object.keys(globals.browser).map((name) => [name, "off"])),
        ...globals.node,
      },
      parserOptions: { project: "./tsconfig.test-tools.json" },
    },
  },
]);
