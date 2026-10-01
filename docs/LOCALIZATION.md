# RiskHub Localization Guide

> **Version**: 1.4
> **Last Updated**: 2026-10-01
> **Audience**: Engineering, QA, Documentation Owners
> **Source of Truth**: `frontend/src/i18n/`, `backend/app/i18n/`, `backend/app/api/v1/endpoints/admin/docs.py`

This guide defines how localization works across UI, backend messages, reports, and Markdown documentation.

## Supported Locales

- `en` - default locale
- `cs` - Czech locale

## Localization Surfaces

- Frontend UI strings (`frontend/src/i18n/locales/{lang}`)
- Backend API message catalogs (`backend/app/i18n/{lang}.py`)
- Report translation dictionaries (`backend/app/services/report_translations.py`)
- Documentation content (`docs/admin*`, `docs/user*`)

## Frontend Rules

- App-wide frontend i18n fallback/default behavior remains English (`en`).
- Add new keys in English first, then mirror in Czech.
- Keep namespace structure aligned between locales.
- Production login exception:
  - The production `/login` screen (`AUTH_MODE=microsoft_sso`) uses a page-local `CZ / EN` switch before authentication.
  - That login screen defaults to Czech (`cs`).
  - The pre-auth switch does not read or write the shared `riskhub-language` storage key.
  - Persistent language preference remains part of the authenticated settings flow after sign-in.
- Strings that interpolate `{{count}}` are i18next plural families with whole-phrase forms:
  `cs` needs `_one`, `_few` and `_other` (optional `_many`), `en` needs `_one` and `_other`.
  Strict key parity still applies, so `en` mirrors any `cs`-only suffix (for example `_few`).
  Count-free values (`Active filters: {{count}}`, `Archived risks ({{count}})`, `{{count}}%`)
  are exempt through `frontend/scripts/i18n/plural-allowlist.json`. `i18n:validate:plurals`
  ratchets the remaining legacy families in `frontend/scripts/i18n/plural-baseline.json`: new
  violations fail, and fixed ones are locked in with `npm run i18n:validate:plurals -- --update-baseline`.
- `i18n:scan` flags single-word JSX text (`<span>Uncategorised</span>`, `Limit:`). Genuine
  non-words go in `frontend/scripts/i18n/allowlist.json`: `tokenPatterns` for global tokens
  (codes, units, symbols) and `scopedExceptions` (`path`, `text`, `reason`) for file-local cases
  such as the split `Risk`+`Hub` wordmark; stale scoped exceptions fail the scan.
- Run UI localization checks before merging (`npm run i18n:test` runs all of them):

```bash
cd frontend
npm run i18n:validate:strict
npm run i18n:validate:usage
npm run i18n:validate:plurals
npm run i18n:scan
```

- Scanner scope (`i18n:scan`, `frontend/scripts/i18n/scan-hardcoded-ui.mjs`): it reads
  `frontend/src/**` except tests, `__tests__/`, `test/`, `*.d.ts` and the locale files, and flags
  literal JSX text, literals in JSX expressions and in `||` / `??` fallbacks, the UI attributes
  `label`, `placeholder`, `title`, `aria-label`, `aria-placeholder`, `alt`, `description`,
  `caption`, `helperText`, `emptyMessage`, `emptyLabel`, `actionLabel`, the same names as object
  keys (plus `subtitle`, `text`, `empty`, `emptyText`, `tooltip`) and as destructured parameter
  defaults. It does **not** see strings assigned to a variable before rendering, other prop or
  attribute names (`aria-description`, `aria-valuetext`, custom `*Label` props), template literals
  with substitutions, string concatenation, `document.title`, thrown `Error` messages or text
  built from `.toUpperCase()` — review those by hand.

## Formatting and plurals

Source of truth: `frontend/src/i18n/formatters.ts` (pure functions) and `frontend/src/i18n/hooks.ts`
(audit 2026-09-30 §4.17–4.18).

- **Locale:** formatting follows the active UI language (`en` / `cs`, normalised exactly like
  `LanguageProvider`). Never hard-code `cs-CZ` or `en-US`, and never call `toLocaleString(`,
  `toLocaleDateString(`, `toLocaleTimeString(` or `new Intl.*(` outside `frontend/src/i18n/`.
- **Components use `useFormat()`:** `date`, `dateTime`, `time`, `relative`, `number`, `metric`
  (optional Intl unit such as `day`), `percent` (the value is a ratio: `0.42` → "42%" / "42 %"),
  `currency` (whole units, `CZK` by default) and `count`. Empty, null or invalid input (an
  unparseable or impossible date, `NaN`) returns `''`,
  so the caller supplies the fallback: `format.dateTime(issue.due_at) || t('fallbacks.not_set')`.
  Builders that are not components (column factories, presentation helpers) receive the `format`
  object (or the plain functions from `formatters.ts` plus the language) from their caller.
  `useFormattedDate` / `useFormattedNumber` are deprecated aliases.
- **Default styles:** dates `{ year: 'numeric', month: 'short', day: 'numeric' }`; date-times add
  `hour` / `minute` (`2-digit`). Do not add private `Intl.DateTimeFormat` helpers per module.
- **Numbers in tables** use `tabular-nums`; currency is right-aligned. Inputs that show grouped
  digits strip every separator before saving (see `SystemSettingsPanel`).
- **Plurals:** any string with `{{count}}` is a plural family rendered with `t(key, { count })`
  or `format.count(count, 'ns:key')`; i18next picks the form (`cs`: 1 → `_one`, 2–4 → `_few`,
  0 and 5+ → `_other`; `en`: `_one` / `_other`). Czech fractions (`1.5`) select `_many`, and a
  family without `_many` then renders its raw key, so counts must be whole numbers (round first)
  or the family must add `_many`. Never choose the form in code (`count === 1 ? … : …`) and never
  build the phrase by concatenation.
- **Calendar dates:** a date-only value (`YYYY-MM-DD`) formats as that calendar day in every
  timezone (it is parsed as local midnight, not UTC midnight); timestamps with a time part keep
  their instant semantics.
- **Whole phrases:** interpolate (`"back_to_register": "Back to {{name}}"`) instead of joining
  translated fragments with `+` or `' — '`, and let CSS (`uppercase`) change case instead of
  `.toUpperCase()` on translated text.
- **Messages and error keys:** render anything that may be an `errorKeys.*` key (from
  `apiClient.toUiMessageKey()`), a namespaced key (`kris:errors.save_failed`), a key in the
  caller's namespace or already-translated text with `translateUiMessage(t, keyOrMessage)`.
  Unknown `errorKeys.*` keys fall back to `errorKeys.unknown`.
- **Document language:** `LanguageProvider` keeps `<html lang>` in sync with the UI language on
  every route (AX-09); pages rendered inside it must not set `document.documentElement.lang`
  themselves. The standalone production-login preview entry (`prod-login-preview.tsx`) has no
  `LanguageProvider` and is the only page that sets it locally.

## Backend Rules

- Register new locale catalogs in `backend/app/i18n/__init__.py`.
- Keep key parity between locale catalogs.
- Use translator helpers (`t`, `get_translator`) instead of hardcoded strings.

## Documentation Locale Rules

Docs endpoint behavior (`GET /api/v1/admin/docs`) is strict:

1. Audience is selected by role:
- `admin` -> `docs/admin` or `docs/admin-cs`
- non-admin -> `docs/user` or `docs/user-cs`

2. Locale resolution is per file:
- If localized file exists, return localized content.
- If localized file is missing, return the English file for that same filename.
- Fallback uses that selected file end-to-end: content and frontmatter metadata (`version`, `last_updated`, `source_of_truth`, tags-derived fields).

3. The endpoint always returns metadata:
- `audience`
- `tags`

## EN/CS Parity Requirements

- Keep filename parity between `admin` and `admin-cs`.
- Keep filename parity between `user` and `user-cs`.
- Update Czech docs in the same change set as English docs for admin/user guides.

## Adding a New Locale (Process)

1. Frontend:
- Create `frontend/src/i18n/locales/<locale>/`
- Mirror namespace files from `en`
- Register locale in frontend i18n bootstrap

2. Backend:
- Create `backend/app/i18n/<locale>.py`
- Register locale in `backend/app/i18n/__init__.py`

3. Reports:
- Add report translation dictionary
- Register dictionary lookup in report translation service

4. Docs:
- Create `docs/admin-<locale>/` and `docs/user-<locale>/`
- Mirror file names from English trees

## Verification

Run from the repository root:

```bash
python3 scripts/check_docs_contract.py

cd backend
venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q

cd ../frontend
npm run i18n:test
npx tsc -b
```
