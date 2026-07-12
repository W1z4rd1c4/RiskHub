import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// ADR-013 (N4): eslint-plugin-jsx-a11y is added to the lint gate. Each recommended
// rule KEEPS the severity the plugin ships and we upgrade ONLY `warn` -> `error`;
// rules the plugin ships as `off` STAY off. In particular the two `off` rules
// `jsx-a11y/label-has-for` (deprecated) and `jsx-a11y/control-has-associated-label`
// are NOT force-promoted — doing so would manufacture violations the plugin itself
// disables, while the modern `jsx-a11y/label-has-associated-control` (shipped
// `error`) already covers real control labeling. Option tuples are preserved.
// Existing violations of the genuinely-`error` rules are NOT fixed here — they are
// held by the committed fingerprinted baseline in `scripts/a11y/jsx-a11y-baseline.json`
// and enforced (subset-fails-new, stale-fails-shrink) by
// `scripts/a11y/jsx-a11y-baseline.mjs`, the authoritative gate. The committed
// `eslint-suppressions.json` (ESLint-native, count-keyed) only lets `eslint .` exit 0
// on the still-broken app; both files are regenerated together by the validator's
// `--write` mode. This is NOT a bare `--max-warnings` total (N6).

/**
 * Preserve a jsx-a11y recommended rule's SHIPPED severity, upgrading only `warn`
 * (or numeric `1`) to `error`; `off`/`error` pass through unchanged and any options
 * tuple is preserved. Exported for the config-normalization unit test.
 */
export function promoteJsxA11yWarnToError(value) {
  const [severity, ...options] = Array.isArray(value) ? value : [value];
  const upgraded = severity === "warn" || severity === 1 ? "error" : severity;
  return options.length > 0 ? [upgraded, ...options] : upgraded;
}

const jsxA11yBaselineRules = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, value]) => [
    rule,
    promoteJsxA11yWarnToError(value),
  ]),
);

const maintainedModulePaths = [
  "src/components/kri-form/**/*.{ts,tsx}",
  "src/components/vendor-form/**/*.{ts,tsx}",
  "src/pages/issues/issue-detail/**/*.{ts,tsx}",
  "src/pages/dashboard/**/*.{ts,tsx}",
  "src/pages/shared/collectionPageState.ts",
  "src/components/riskhub/riskQuestionnairePanelState.ts",
  "src/services/api/**/*.{ts,tsx}",
  "src/services/admin/**/*.{ts,tsx}",
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
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateElement[value.raw=/\\b(USR|RISK|RSK|CTL|KRI|VND)-/]",
          message: "Do not render raw database IDs in user-facing labels; use a display-name resolver or Unknown <entity> fallback.",
        },
        {
          selector: "BinaryExpression[operator='>='][left.property.name=/^(net_score|gross_score)$/][right.value=/^(5|10|15|16)$/]",
          message: "Do not hardcode risk-score thresholds; use useRiskThresholds() with riskScoreVariantClass().",
        },
      ],
    },
  },
  {
    // ADR-013 (FR-P1-4, N4): author-time accessibility rules. Scoped to the same
    // application source the primary lint pass covers. Held in baseline mode — see
    // the header comment and scripts/a11y/jsx-a11y-baseline.mjs.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: jsxA11yBaselineRules,
  },
  {
    files: [
      "src/components/dashboard/**/*.{ts,tsx}",
      "src/components/tables/MiniHeatmap.tsx",
      "src/pages/departments/**/*.{ts,tsx}",
      "src/pages/risks/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateElement[value.raw=/\\b(USR|RISK|RSK|CTL|KRI|VND)-/]",
          message: "Do not render raw database IDs in user-facing labels; use a display-name resolver or Unknown <entity> fallback.",
        },
        {
          selector: "BinaryExpression[operator='>='][left.property.name=/^(net_score|gross_score)$/][right.value=/^(5|10|15|16)$/]",
          message: "Do not hardcode risk-score thresholds; use useRiskThresholds() with riskScoreVariantClass().",
        },
        {
          selector: "BinaryExpression[operator='>='][left.name='score'][right.value=/^(5|10|15|16)$/]",
          message: "Do not hardcode risk-score thresholds; use useRiskThresholds() with riskScoreVariantClass().",
        },
      ],
    },
  },
  {
    files: [
      "src/contexts/**/*.{ts,tsx}",
      "src/routing/**/*.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
      "src/components/ui/**/*.{ts,tsx}",
      "src/components/forms/FormStepContext.tsx",
      "src/components/notifications/notificationPresentation.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: maintainedModulePaths,
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
    files: ["src/services/api/schemas/**/*.ts"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      complexity: "off",
    },
  },
]);
