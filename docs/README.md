# RiskHub Documentation Index

> **Version**: 1.1
> **Last Updated**: 2026-02-16
> **Audience**: Product, Engineering, QA, Operations
> **Source of Truth**: `docs/BUSINESS_LOGIC.md`, `backend/app/api/v1/endpoints/admin/docs.py`

This file defines documentation ownership, structure, and quality rules for all product-facing docs in `/docs`.

## Structure

- `docs/admin/` - platform administrator documentation (admin role only)
- `docs/admin-cs/` - Czech equivalent of `docs/admin/`
- `docs/user/` - end-user/business documentation (all non-admin roles)
- `docs/user-cs/` - Czech equivalent of `docs/user/`
- Root docs (`BUSINESS_LOGIC.md`, `TESTING.md`, `LOCALIZATION.md`, etc.) - canonical policy and engineering guidance

## Audience Boundary Rules

- `admin` users see **admin docs only**.
- All non-admin users (`cro`, `risk_manager`, `department_head`, `employee`, etc.) see **user docs only**.
- Admin docs must focus on platform administration and system governance.
- User docs must focus on business workflows and day-to-day usage.

## EN/CS Parity Rules

- `docs/admin/` and `docs/admin-cs/` must have the same filenames.
- `docs/user/` and `docs/user-cs/` must have the same filenames.
- If an English guide is added, renamed, or removed, mirror the change in Czech in the same change set.
- Content can differ in wording but must remain functionally equivalent.

## Header Standard

All refreshed docs must include a metadata block under the title.

English docs:
- `Version`
- `Last Updated`
- `Audience` or `Who uses this`
- `Source of Truth`

Czech docs:
- `Verze`
- `Poslední aktualizace`
- `Cílová skupina`
- `Zdroj pravdy`

## Linking Rules

- Use relative Markdown links for files inside `docs/`.
- Keep links stable when possible; if renaming files, update all linked references in EN and CS docs in the same change.
- Prefer section anchors for long references when they improve navigation.

## Maintenance Workflow

1. Update the relevant doc(s).
2. Update corresponding Czech docs for parity.
3. Run `python3 scripts/check_docs_contract.py`.
4. Run targeted docs endpoint and frontend docs tests when behavior-related docs are changed.

## Verification Commands

```bash
cd "."
python3 scripts/check_docs_contract.py

cd backend
venv/bin/pytest tests/test_admin_docs.py -q

cd ../frontend
npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx
npx tsc --noEmit
```
