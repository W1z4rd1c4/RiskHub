# frontend/src/components/layout

## Purpose

UI components for `layout` area.

## Contents

- `__tests__/`
- `index.ts`
- `MainLayout.tsx` — the app shell. Its `<main>` owns the page gutter; the routed `Outlet` sits in a
  `<Suspense fallback={<LoadingState layout="page" />}>` so a lazy page loads inside the shell (NAV-04).
  After a pathname change `useRouteFocus` moves focus to the new page's `h1` and announces the new
  `document.title` through a polite live region (NAV-01, D14).
- `useRouteFocus.ts` — route-change focus + announcement for `MainLayout`: waits (up to 5 s) for
  `[data-page-title]` inside `<main>`, focuses it unless the user already moved focus into the page, and
  returns the text for the live region. When a state-shell `h1` (loading / denied) is replaced by the
  loaded record's `h1` and that swap dropped focus to the body, focus follows the new `h1`. Search-param
  and in-page tab changes are not route changes.
- `Sidebar.tsx` — grouped navigation; the active item follows `resolveActiveSidebarHref` (including a
  route's `activeNavHref`, NAV-02). Count badges keep the number visual-only and add sr-only context
  (`navigation:sidebar_badges.*`, AX-14); the notification bell carries the unread count in its name and
  `aria-current="page"` on `/notifications`.
- `AuthFrame.tsx` — frame for public / pre-auth pages (audit 2026-09-30 §4.20, DS-24): `<main>` that
  scrolls instead of clipping (RS-02), header with `BrandWordmark` + `LanguageSwitch`, one card with the
  focused `h1` (mirrored into `document.title`), focused `role="alert"` error and a polite status line.
  Without an explicit app theme (signed out, nothing stored under `riskhub-theme`) it follows the OS colour
  scheme (D14: dark → `theme-riskhub`, light → `theme-light`) by scoping the theme class to its subtree; a
  signed-in session (e.g. `/auth/local/security`) or a stored theme keeps the app theme `ThemeProvider` puts on
  `<html>` (`data-theme-source="system" | "app"`). `busy` marks the page content `aria-busy`, never the status
  line. First consumer: `pages/native/NativeFrame`.
- `BrandWordmark.tsx` — the single "Risk" + accented "Hub" wordmark (NAV-07); the only i18n-scanner
  exception for the product name.
- `LanguageSwitch.tsx` — CS / EN `aria-pressed` segmented `Button` pair in a named group (GAP-C-22); the
  caller owns the language change.
- `PageHeader.tsx` — page header for registers, dashboards, settings, admin, approvals and New/Edit
  forms (audit §4.14, D7): the one `h1` (`PAGE_TITLE_CLASS` = `font-heading text-3xl font-bold
  tracking-tight text-foreground`, `tabIndex={-1}` + `data-page-title` for route-change focus), `eyebrow`,
  `description`, decorative `icon`, `actions`, a destination-labelled `back` (`{ label, to }` or
  `{ label, onClick }` → `BackButton`, D14/AX-06), `breadcrumbs`, and `document.title` through
  `hooks/usePageTitle` (`documentTitle`, else a string `title`). Also exports `PageBackButton` /
  `PageHeaderNavigation`, shared with `pages/detail/EntityDetailHeader`.
- `PageContainer.tsx` — the single page container (D11, DS-16): `size` `default` (`max-w-page`, 1520px),
  `form` (`max-w-form`, 960px) or `prose`; page-section rhythm `space-y-8`. `MainLayout`'s `<main>` owns
  the gutter, so pages add no outer padding.
- `Breadcrumbs.tsx` — `nav` landmark named `common:breadcrumbs.label` with an ordered list; the last item
  is the current page (`aria-current="page"`, never a link) (D14, NAV-02).

Import the public-frame pieces by file path, never through `index.ts`: the barrel re-exports
`MainLayout`, and the cold login chunk must not pull protected code (`npm run quality:login-graph`).

## Notes

Keep this README updated when responsibilities or structure in this folder change.
