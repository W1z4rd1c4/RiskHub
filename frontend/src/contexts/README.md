# frontend/src/contexts

## Purpose

Folder for `frontend/src/contexts` implementation assets.

## Contents

- `__tests__/`
- `AuthActionsContext.tsx`
- `AuthContext.tsx`
- `DashboardFilterContext.tsx`
- `FeedbackContext.tsx` — `FeedbackProvider` (mounted once in `App.tsx`
  `RouteScope`, so toasts survive navigation inside the signed-in app; it
  remounts on a principal change or a public ↔ protected route switch) renders the toast queue from
  `components/ui/toast.tsx`; durations, the 3-toast cap and translated default
  titles live here. Read it through `hooks/useFeedback.ts`.
- `PreferencesContext.tsx`
- `SessionContext.tsx`
- `ThemeContext.tsx`

## Notes

`AuthContext.tsx` is a compatibility shim over independent session,
preferences, and auth-action providers. Keep this README updated when
responsibilities or structure in this folder change.
