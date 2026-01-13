# Summary 179-11: Deterministic Cross-Department Scenarios

## Objective Completed
Created deterministic cross-department ownership scenarios with known user-entity relationships for predictable E2E tests.

---

## Changes Made

### New Files
- `backend/scripts/seed_e2e_cross_dept.py` - Cross-department scenarios seeding script

### Modified Files
- `backend/scripts/seed_e2e_all.py` - Added Step 10 for cross-department seeding

---

## Data Seeded

Created 4 cross-department entities with deterministic owner-department mismatches:

| Scenario | Entity Type | Owner | Entity Dept | Purpose |
|----------|-------------|-------|-------------|---------|
| fin_owns_ops_risk | Risk | Finance Head | Operations | Finance user accessing Ops risk |
| it_owns_fin_risk | Risk | IT Head | Finance | IT user accessing Finance risk |
| ops_owns_it_control | Control | Ops Analyst | IT | Ops user accessing IT control |
| it_owns_ops_control | Control | IT Analyst | Operations | IT user accessing Ops control |

All entities:
- Named with `E2E-XDEPT-*` prefix for isolation
- Have user ownership from different department than entity's department
- Enable predictable cross-department access testing

---

## Test Mapping Reference

| Test Scenario | Login As | Should Have Access To |
|---------------|----------|----------------------|
| Owner can view their risk | fin.head | E2E-XDEPT-FIN-OPS-RISK |
| Owner can edit their risk | it.head | E2E-XDEPT-IT-FIN-RISK |
| Owner can view their control | ops.analyst | E2E-XDEPT-OPS-IT-CTRL |
| Owner can edit their control | it.analyst | E2E-XDEPT-IT-OPS-CTRL |

---

## Verification

```bash
cd backend && python -m scripts.seed_e2e_cross_dept
# Output: ✅ Created 4 cross-department entities
```

Idempotency verified - script skips if entries already exist.

---

*Completed: 2026-01-13*
