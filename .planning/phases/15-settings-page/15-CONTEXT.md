# Phase 15: Settings Page — Context

## Vision

A clean, professional settings page that shows users their identity and permissions within the system, and allows personalization of the interface appearance.

## How It Works

### Profile Tab (Read-Only)
User sees their identity as synced from Active Directory:
- **Name** and **Email** (not editable — AD is source of truth)
- **Department** they belong to
- **Role** (CRO, Department Head, Risk Manager, etc.)
- **Permissions** — clear list of what they can do (read risks, write controls, approve deletions, etc.)

> No password change, no email edit — everything comes from AD. This is intentional.

### Appearance Tab
Personal preferences for the interface:
- **Color theme** — light/dark/system (functional)
- Persisted in localStorage

### Localization Tab
Language and format preferences:
- **Language switch** — English/Czech (placeholder for now, i18n deferred)
- Persisted in localStorage

## What's Essential (Must Have)

1. Tabs that actually switch (like RiskHubPage.tsx pattern)
2. Profile info pulled from the logged-in user via useAuth() hook (not hardcoded)
3. Role and permissions displayed clearly
4. Theme toggle that persists (localStorage)
5. Language switch UI exists (placeholder for future i18n)

## What's Out of Scope

- Password/email changes (AD-managed)
- Notification preferences (existing notification system is sufficient)
- Session management (future enhancement)
- Dashboard layout memory
- Keyboard shortcuts (future enhancement)
- Full i18n implementation (just language switch UI for now)
- **Delegation settings** — deferred to future phase (see ROADMAP.md)

## Technical Notes

### Existing Patterns to Follow
- **Tab Pattern**: See `RiskHubPage.tsx` lines 8-16 and 44-67
  - Define tabs array with `as const`
  - Create `type TabId = typeof tabs[number]['id']`
  - Use `useState<TabId>('first-tab')` for state
  - Use `cn()` from `@/lib/utils` for conditional classes
- **User Data**: Available via `useAuth()` hook from `@/contexts/AuthContext`
  - `user.name`, `user.email`, `user.role`, `user.role_display_name`
  - `user.department_name`, `user.access_scope`, `user.scope_label`
  - `user.permissions[]`, `user.effective_permissions[]`
- **Styling**: Use `glass-card` class for containers, existing button patterns
- **Icons**: Import from `lucide-react`

### localStorage Keys
- `riskhub-theme`: 'dark' | 'light' | 'system'
- `riskhub-language`: 'en' | 'cs'

---

*Captured: 2026-01-06*
