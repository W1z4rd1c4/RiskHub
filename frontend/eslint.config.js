import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const phase252OwnedPaths = [
  "src/components/kri-form/**/*.{ts,tsx}",
  "src/components/vendor-form/**/*.{ts,tsx}",
  "src/pages/issues/issue-detail/**/*.{ts,tsx}",
  "src/pages/dashboard/**/*.{ts,tsx}",
  "src/services/api/**/*.{ts,tsx}",
  "src/services/admin/**/*.{ts,tsx}",
];

const phase252FacadePaths = [
  "src/components/KRIForm.tsx",
  "src/components/VendorForm.tsx",
  "src/pages/IssueDetailPage.tsx",
  "src/pages/DashboardPage.tsx",
  "src/services/apiClient.ts",
  "src/services/adminApi.ts",
];

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/require-await": "error",
      // Keep the rule enabled but non-blocking; the codebase still has a few
      // legitimate escape hatches where `unknown` is not ergonomic.
      "@typescript-eslint/no-explicit-any": "warn",
      // This is a React guidance rule; in this codebase it produces false positives
      // (e.g. page-reset patterns) and blocks lint.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: [
      "src/contexts/**/*.{ts,tsx}",
      "src/routing/**/*.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
      "src/components/ui/**/*.{ts,tsx}",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: phase252OwnedPaths,
    rules: {
      "no-console": "error",
      "max-lines": [
        "error",
        { max: 250, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ["error", 20],
    },
  },
  {
    files: phase252FacadePaths,
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["src/components/KRIForm.tsx"],
    rules: {
      "max-lines": [
        "error",
        { max: 25, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 25, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ["error", 2],
    },
  },
  {
    files: ["src/components/VendorForm.tsx"],
    rules: {
      "max-lines": [
        "error",
        { max: 550, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["src/pages/IssueDetailPage.tsx"],
    rules: {
      "max-lines": [
        "error",
        { max: 410, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["src/pages/DashboardPage.tsx"],
    rules: {
      "max-lines": [
        "error",
        { max: 480, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["src/services/apiClient.ts"],
    rules: {
      "max-lines": [
        "error",
        { max: 310, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    files: ["src/services/adminApi.ts"],
    rules: {
      "max-lines": [
        "error",
        { max: 225, skipBlankLines: true, skipComments: true },
      ],
    },
  },
]);
