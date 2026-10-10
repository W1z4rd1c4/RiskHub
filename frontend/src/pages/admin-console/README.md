# Admin Console Module

This module contains the `AdminConsolePage` implementation split from
`frontend/src/pages/AdminConsolePage.tsx`
to keep route imports stable while isolating admin console internals.

The panels use design tokens and the `ui/table`, `Card`, `Badge`, `InlineMessage` and state primitives;
the former route-local colour stylesheet (`adminConsoleRoute.css`) was removed.
