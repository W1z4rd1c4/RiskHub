# Summary 179-15: Deterministic Archive Matrix Seeding

## Objective Completed
Implemented a deterministic archive matrix across Risk, Control, KRI, Vendor, and Vendor SLA entities.

---

## Changes Made

### New Files
- `backend/scripts/seed_e2e_archives.py`

### Modified Files
- `backend/scripts/seed_e2e_risks.py`
- `backend/scripts/seed_e2e_controls.py`
- `backend/scripts/seed_e2e_kris.py`
- `backend/scripts/seed_e2e_all.py`

### Archive Matrix Coverage
- Risks: `E2E-ARCH-RISK-*` active + archived pair
- Controls: `E2E-ARCH-CTRL*` active + archived pair
- KRIs: `E2E-ARCH-KRI*` active + archived pair
- Vendors: deterministic active/inactive enforcement (`E2E-VREG-001`, `E2E-VREG-004`)
- Vendor SLAs: deterministic active/archived enforcement (`E2E-SLA-001`, `E2E-SLA-004`)

### Determinism Improvements
- Risk/control/KRI seed scripts now use explicit required mapping helpers.
- Deterministic seeding now fails fast when required linked entities are missing.

---

## Verification

```bash
cd backend && venv/bin/python -m scripts.seed_e2e_all
# Archive matrix output:
# Risks active/archived: 1/1
# Controls active/archived: 1/1
# KRIs active/archived: 1/1
# Vendors active/inactive: 1/1
# Vendor SLAs active/archived: 1/1
```

---

*Completed: 2026-02-07*
