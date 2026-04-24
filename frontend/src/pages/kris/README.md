# KRI Page Helpers

KRI-specific page helpers and subcomponents used by `KRIDetailPage` and related route-level KRI views.

Keep KRI workflow decisions aligned with backend response metadata:

- history correction visibility should prefer `capabilities.can_request_correction`
- stale `403`/`409` mutation responses should refresh history state before retry
- period-based value behavior is documented in `docs/BUSINESS_LOGIC.md` and `docs/user/kris.md`
