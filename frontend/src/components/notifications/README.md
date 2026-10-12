# frontend/src/components/notifications

## Purpose

UI components for `notifications` area.

## Contents

- `__tests__/`
- `NotificationBell.tsx`
- `notificationPresentation.tsx`

## Notes

`NotificationBell` is a popover (AX-10): the bell exposes `aria-haspopup` / `aria-expanded` /
`aria-controls`, the panel is a named `role="dialog"`, and Escape closes it and returns focus to the bell.
The complete panel is bounded by the remaining viewport height; its header/footer stay fixed while
the list scrolls. `notification-dropdown-layout.spec.ts` covers loaded and pending lists, resizing,
keyboard access and inbox navigation on short screens with the real application shell.

Keep this README updated when responsibilities or structure in this folder change.
