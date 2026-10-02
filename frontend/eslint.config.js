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
// The precise invariant is: every enabled recommended rule is enforced as an
// error. The strict-zero gate in scripts/a11y/jsx-a11y-baseline.mjs rejects every
// finding, non-empty baseline, or suppression entry. There is no update path;
// future exceptions require a separate policy change and tracked approval.

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

const RAW_ID_LABEL_RESTRICTION = {
  selector: "TemplateElement[value.raw=/\\b(USR|RISK|RSK|CTL|KRI|VND)-/]",
  message: "Do not render raw database IDs in user-facing labels; use a display-name resolver or Unknown <entity> fallback.",
};

// ADR-008 (PG-02): risk-score bands come only from useRiskThresholds(). A
// relational comparison (either operand order) between a risk-score operand
// (identifier or non-computed member property) and an integer literal is a
// hard-coded threshold:
// - `net_score` / `gross_score` / `risk_score`: any positive integer;
// - generic `score` / `level`: integers 6+ only, i.e. above the 1-5 axis, so
//   1-5 vendor scores and 1-4 control levels stay legal.
// `> 0` presence guards are never flagged.
// Matches on `raw` because esquery regex attributes only test string values.
const RISK_SCORE_NAMES = "/^(net_score|gross_score|risk_score)$/";
const GENERIC_SCORE_NAMES = "/^(score|level)$/";
const POSITIVE_INTEGER = "/^[1-9]\\d*$/";
const MATRIX_RANGE_INTEGER = "/^([6-9]|[1-9]\\d+)$/";
const scoreOperand = (side, names) =>
  `:matches([${side}.type='Identifier'][${side}.name=${names}], ` +
  `[${side}.type='MemberExpression'][${side}.computed=false][${side}.property.name=${names}])`;
const integerOperand = (side, pattern) => `[${side}.type='Literal'][${side}.raw=${pattern}]`;
const relationalComparison = (names, pattern) => [
  `BinaryExpression[operator=/^[<>]=?$/]${scoreOperand("left", names)}${integerOperand("right", pattern)}`,
  `BinaryExpression[operator=/^[<>]=?$/]${integerOperand("left", pattern)}${scoreOperand("right", names)}`,
];
const ADR008_THRESHOLD_RESTRICTIONS = [
  ...relationalComparison(RISK_SCORE_NAMES, POSITIVE_INTEGER),
  ...relationalComparison(GENERIC_SCORE_NAMES, MATRIX_RANGE_INTEGER),
].map((selector) => ({
  selector,
  message: "Do not hardcode risk-score thresholds (ADR-008); use useRiskThresholds() with riskScoreVariantClass() from @/lib/severity.",
}));

// G-ESLINT (audit 2026-09-30 §4.1, D15, §5.5 per-module exit): hard design bans on
// the paths that reached zero for the G-RATCHET patterns. The list only grows: a
// module joins once its ratchet counts are 0. The regexes mirror
// scripts/quality/ui-consistency-ratchet.mjs and run on both string literals and
// template-literal chunks, so class strings built with `cn()` or templates are
// covered. Flat-config rule arrays replace each other, so the block re-includes
// the raw-ID and ADR-008 selectors of the base block.
const classBan = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];
const DESIGN_CLASS_RESTRICTIONS = [
  ...classBan("(?<![\\w-])(?:[a-z-]+:)*text-white(?![\\w/-])", "Use text-foreground or a *-foreground token (§4.3)."),
  ...classBan(
    "(?<![\\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|placeholder|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b",
    "Raw palette colour. Use a semantic token (§4.2-4.4).",
  ),
  ...classBan(
    "(?<![\\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|from|to|via|fill|stroke)-(?:white|black)\\/[\\w.\\[\\]]+",
    "White/black alpha. Use tint/overlay tokens (§4.2).",
  ),
  ...classBan("text-\\[(?:[0-9]|10)(?:\\.\\d+)?px\\]", "Below the 11px floor. Use text-eyebrow or text-xs (§4.5)."),
  ...classBan("(?<![\\w-])(?:[a-z-]+:)*font-black(?![\\w-])", "font-black is retired (D6). Use font-semibold or font-bold (§4.5)."),
  ...classBan("(?<![\\w-])dark:(?=[!a-z\\[-])", "No dark: variants. Theme through tokens (§4.2)."),
  ...classBan("-\\[[^\\] \"]*(?:#[0-9a-fA-F]{3}|rgba?\\(|hsla?\\()", "Arbitrary colour literal. Add a token (§4.2)."),
];
// Raw elements outside the primitives (components/ui and components/tables are
// never clean paths). `<input>` stays legal only for types without a drop-in
// primitive: range sliders, colour pickers, hidden/file inputs and the
// sr-only radios of custom card pickers.
const DESIGN_ELEMENT_RESTRICTIONS = [
  { selector: "JSXOpeningElement[name.name='button']", message: "Use <Button> from components/ui/button (§4.7)." },
  {
    selector: "JSXOpeningElement[name.name='input']:not(:has(> JSXAttribute[name.name='type'][value.value=/^(?:radio|hidden|range|color|file)$/]))",
    message: "Use <Input> or <Checkbox> inside <Field> (§4.8).",
  },
  { selector: "JSXOpeningElement[name.name='textarea']", message: "Use <Textarea> inside <Field> (§4.8)." },
  { selector: "JSXOpeningElement[name.name='select']", message: "Use <ThemedSelect> or <NativeSelect> inside <Field> (§4.8)." },
  { selector: "JSXOpeningElement[name.name='table']", message: "Use <SortableTable> or ui/table (§4.13)." },
  {
    selector: "JSXOpeningElement[name.name='tr'] > JSXAttribute[name.name='onClick']",
    message: "Mouse-only row activation (AX-02). Use SortableTable row activation.",
  },
  {
    selector:
      "JSXElement[openingElement.name.name='label']:not(:has(JSXAttribute[name.name='htmlFor'])):not(:has(JSXOpeningElement[name.name=/^(?:input|select|textarea|Input|NativeSelect|ThemedSelect|Textarea|Checkbox|Switch)$/]))",
    message: "Unassociated label (AX-04). Use <Field>.",
  },
];
const DESIGN_CLEAN_PATHS = [
  "src/pages/native/**/*.{ts,tsx}",
  // 3a Risk Hub admin
  "src/components/riskhub/**/*.{ts,tsx}",
  "src/pages/RiskHubPage.tsx",
  // 3b Risk, Control, KRI, Issue
  "src/components/risks/**/*.{ts,tsx}",
  "src/components/risk-form/**/*.{ts,tsx}",
  "src/components/RiskForm.tsx",
  "src/components/RiskQuickViewModal.tsx",
  "src/components/RiskScoreMatrix.tsx",
  "src/components/controls/**/*.{ts,tsx}",
  "src/components/control-form/**/*.{ts,tsx}",
  "src/components/ControlCreateDialog.tsx",
  "src/components/kri/**/*.{ts,tsx}",
  "src/components/kri-form/**/*.{ts,tsx}",
  "src/components/kris/**/*.{ts,tsx}",
  "src/components/issues/**/*.{ts,tsx}",
  "src/components/history/**/*.{ts,tsx}",
  "src/components/ict-register/RegisterFilterCard.tsx",
  "src/components/ict-register/registerFilterChips.ts",
  "src/pages/risks/**/*.{ts,tsx}",
  "src/pages/controls/**/*.{ts,tsx}",
  "src/pages/kris/**/*.{ts,tsx}",
  "src/pages/issues/**/*.{ts,tsx}",
  "src/pages/{Risks,RiskDetail,RiskNew,RiskEdit}Page.tsx",
  "src/pages/{Controls,ControlDetail,ControlNew,ControlEdit}Page.tsx",
  "src/pages/{KRIs,KRIDetail,KRINew}Page.tsx",
  "src/pages/{Issues,IssueDetail,IssueNew}Page.tsx",
  "src/lib/{humanizeCode,kriUnits,roleLabels}.ts",
  // 3c Settings, Users, Access, Admin console
  "src/components/settings/**/*.{ts,tsx}",
  "src/components/users/**/*.{ts,tsx}",
  "src/components/access/**/*.{ts,tsx}",
  "src/pages/admin-console/**/*.{ts,tsx}",
  "src/pages/users/**/*.{ts,tsx}",
  "src/pages/{Settings,Users,UserNew,AdminConsole}Page.tsx",
  // 3d Asset, Process, Threat and link sections
  "src/pages/assets/**/*.{ts,tsx}",
  "src/pages/processes/**/*.{ts,tsx}",
  "src/pages/threats/**/*.{ts,tsx}",
  "src/pages/detail/**/*.{ts,tsx}",
  "src/pages/shared/**/*.{ts,tsx}",
  "src/pages/{Assets,AssetDetail,Processes,ProcessDetail,Threats,ThreatDetail}Page.tsx",
  "src/components/linking/**/*.{ts,tsx}",
  "src/components/LinkManagementDialog.tsx",
  "src/components/approvals/**/*.{ts,tsx}",
];
// Inside the clean directories, files that migrate with a later module (W9 3e:
// risk questionnaires and the legacy approval diff).
const DESIGN_CLEAN_PATH_EXCEPTIONS = [
  "src/components/risks/QuestionnaireAssessmentSummary.tsx",
  "src/components/risks/RiskDetailQuestionnairesTab.tsx",
  "src/components/risks/risk-questionnaire-detail/**",
  "src/components/approvals/GovernedMutationDiff.tsx",
];

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
    linterOptions: {
      noInlineConfig: true,
    },
  },
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
        RAW_ID_LABEL_RESTRICTION,
        ...ADR008_THRESHOLD_RESTRICTIONS,
      ],
    },
  },
  {
    // ADR-013 (FR-P1-4, N4): author-time accessibility rules. Scoped to the same
    // application source the primary lint pass covers. Every enabled recommended
    // rule is an error, with direct strict-zero enforcement in the a11y gate.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: jsxA11yBaselineRules,
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
    files: DESIGN_CLEAN_PATHS,
    ignores: DESIGN_CLEAN_PATH_EXCEPTIONS,
    rules: {
      "no-restricted-syntax": [
        "error",
        RAW_ID_LABEL_RESTRICTION,
        ...ADR008_THRESHOLD_RESTRICTIONS,
        ...DESIGN_CLASS_RESTRICTIONS,
        ...DESIGN_ELEMENT_RESTRICTIONS,
      ],
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
