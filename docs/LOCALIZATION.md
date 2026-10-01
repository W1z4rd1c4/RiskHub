# RiskHub Localization Guide

> **Version**: 1.3
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

```bash
cd ""
python3 scripts/check_docs_contract.py

cd backend
venv/bin/pytest tests/test_admin_docs.py -q

cd ../frontend
npm run i18n:validate:strict
npx tsc --noEmit
```
