# Phase 15 Research: Settings Documentation Simplification

## Scope Map

### Current Settings Documentation UX

- `frontend/src/components/settings/DocumentationSettings.tsx`
- `frontend/src/pages/DocumentationPage.tsx`
- `frontend/src/services/adminApi.ts`
- `frontend/src/i18n/locales/en/settings.json`
- `frontend/src/i18n/locales/cs/settings.json`

### Current Backend Documentation Contract

- `backend/app/api/v1/endpoints/admin/docs.py`
- `backend/app/schemas/admin.py`

### Documentation Source Trees

- `docs/admin/`
- `docs/user/`
- `docs/admin-cs/`
- `docs/user-cs/`

## Findings Summary

1. Current backend contract mixes audiences for privileged users.
   - `/backend/app/api/v1/endpoints/admin/docs.py:55-83` serves admin docs for `admin|cro` and always appends user docs.
   - Result: admin/CRO users receive both sets; this conflicts with requested strict separation.

2. Settings documentation cards have no navigation metadata (tags/categories) and no filtering.
   - `/frontend/src/components/settings/DocumentationSettings.tsx:92-119` renders cards with title + content snippet only.
   - Result: users cannot quickly scan by topic and must open cards one by one.

3. Audience boundary in frontend authz is already explicit and can be reused.
   - `/frontend/src/authz/policy.ts:39-50` defines `isPlatformAdmin` and `canViewAdminConsole` as admin-only.
   - Result: docs audience split can align to existing platform-admin boundary without adding a new role model.

4. Documentation directories are already physically separated.
   - `docs/admin*` and `docs/user*` exist and can be treated as independent libraries.
   - Result: implementation can enforce split via source selection rather than heavy content migration.

5. Locale parity is incomplete for one user document.
   - `docs/user/vendors.md` exists, but `docs/user-cs/vendors.md` is missing.
   - Result: per-file locale fallback should be part of the contract to prevent accidental doc loss in Czech.

## Requirement Translation (Acceptance Targets)

- Settings docs must be simpler to scan and use.
- Each documentation bubble/card must show topic tags.
- Users must be able to navigate quickly via tag-based filtering.
- Platform admin must see only admin documentation.
- Non-admin users must see only user documentation.

## Risks and Mitigations

- Risk: Breaking existing admin docs page while refactoring shared contract.
  - Mitigation: Keep one API shape and apply the same metadata in both Settings and `/admin/docs`.

- Risk: Role ambiguity for CRO could regress permissions.
  - Mitigation: Explicitly align docs audience to `isPlatformAdmin` boundary (admin-only admin docs; CRO in user docs set).

- Risk: Locale-specific files missing in `*-cs` trees.
  - Mitigation: Implement per-file fallback to English, not only directory-level fallback.

## Recommended Plan Shape

- Single execution plan (`15-06`) with three tasks:
  - backend audience contract + metadata,
  - frontend UX simplification + tag navigation,
  - targeted tests and docs reconciliation.

## Open Decision to Lock During Execution

- Confirm CRO audience: treat CRO as user-documentation audience (not admin-documentation audience) to match existing `canViewAdminConsole` platform-admin boundary.
