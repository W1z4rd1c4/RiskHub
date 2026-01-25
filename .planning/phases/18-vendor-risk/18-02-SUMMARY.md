---
phase: 18-vendor-risk
plan: 18-02
subsystem: api
tags: [vendors, risks, controls, rbac, alembic, fastapi, react]

requires:
  - phase: 18-vendor-risk
    provides: vendor catalog + scoping rules (18-01)
provides:
  - PI-aligned vendor risk taxonomy keys (stable, v1 constant)
  - Vendor risk factors (qualitative, no scoring)
  - Vendor ↔ Risk links (many-to-many) + Risk detail “Linked Vendors”
  - Vendor ↔ Control links (many-to-many)
affects: [18-vendor-risk, vendors, risks, controls]

key-files:
  created:
    - backend/app/api/v1/endpoints/vendor_risk_factors.py
    - backend/app/api/v1/endpoints/vendor_links.py
    - backend/app/schemas/vendor_links.py
    - backend/tests/test_vendor_links.py
    - frontend/src/services/vendorRiskFactorApi.ts
    - frontend/src/services/vendorLinkApi.ts
    - frontend/src/types/vendorRisk.ts
    - frontend/src/types/vendorLink.ts
    - frontend/src/components/vendors/VendorRiskFactorsTab.tsx
    - frontend/src/components/vendors/VendorLinkedRisksTab.tsx
    - frontend/src/components/vendors/VendorLinkedControlsTab.tsx
  modified:
    - backend/app/api/v1/router.py
    - frontend/src/components/LinkManagementDialog.tsx
    - frontend/src/pages/VendorDetailPage.tsx
    - frontend/src/i18n/locales/en/vendors.json
    - frontend/src/i18n/locales/cs/vendors.json

key-decisions:
  - "Taxonomy keys are stable (backend constant + frontend i18n labels); no DB taxonomy table in v1."
  - "Risk factors are qualitative notes only (no automatic scoring in MVP)."
  - "Link/unlink requires authorization to both sides to avoid cross-department existence leakage."

completed: 2026-01-25
---

# Phase 18: Vendor Risk Management — Plan 18-02 Summary

## Taxonomy (stable keys)
PI‑18‑03 aligned `category_key` values (v1 constants):
- `regulatory_legal`
- `info_security_data`
- `cyber_supply_chain`
- `operational_continuity`
- `service_quality`
- `financial`
- `strategic_reputational`
- `governance_oversight`
- `technology_lockin`
- `human_factor`
- `concentration`

## Backend: Vendor risk factors
Endpoints:
- `GET /vendors/{vendor_id}/risk-factors`
- `POST /vendors/{vendor_id}/risk-factors`
- `PATCH /vendor-risk-factors/{id}`
- `DELETE /vendor-risk-factors/{id}`

Rules:
- All endpoints require `vendors:read` and vendor visibility (`can_read_vendor`).
- Create/update/delete require `vendors:write` **or** vendor outsourcing owner.

## Backend: Vendor links (Risks + Controls)
Endpoints:
- Vendor ↔ Risk:
  - `GET /vendors/{vendor_id}/linked-risks`
  - `POST /vendors/{vendor_id}/linked-risks`
  - `DELETE /vendors/{vendor_id}/linked-risks/{risk_id}`
- Vendor ↔ Control:
  - `GET /vendors/{vendor_id}/linked-controls`
  - `POST /vendors/{vendor_id}/linked-controls`
  - `DELETE /vendors/{vendor_id}/linked-controls/{control_id}`

Scoping / “no leak” behavior:
- Listing returns only linked Risks/Controls the caller is authorized to read (department access or existing cross-dept ownership rules).
- Link/unlink requires:
  - vendor is readable (`vendors:read` + `can_read_vendor`)
  - vendor is modifiable (`vendors:write` **or** outsourcing owner)
  - linked Risk/Control is readable (same scoping rules as their GET endpoints)
- If the caller can’t read the linked Risk/Control, endpoints respond with **404** (avoid existence leakage).

Risk Register integration:
- `GET /risks/{risk_id}/vendors` returns only vendors the caller can see (filtered by vendor visibility rules).
- If caller lacks `vendors:read`, the endpoint returns `[]` (explicit “no leak” behavior).

## Frontend: Vendor detail tabs
Added tabs on Vendor detail:
- “Risk Factors” — grouped by taxonomy category; create/edit/delete (owner or `vendors:write`).
- “Linked Risks” — list + manage links using the existing linking UX, with navigation to Risk detail.
- “Linked Controls” — list + manage links using the existing linking UX, with navigation to Control detail.

## Verification
- `cd backend && alembic upgrade head`
- `cd backend && pytest -q tests/test_vendor_links.py`
- `cd frontend && npx tsc --noEmit`

