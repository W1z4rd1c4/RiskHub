# Summary 179-09: Sensitive Field Approval Data

## Objective Completed
Seeded pending approvals for sensitive field changes (owner_id, department_id, category, is_priority) for E2E tests.

---

## Changes Made

### New Files
- `backend/scripts/seed_e2e_sensitive_approvals.py` - Sensitive field approvals seeding script

### Modified Files
- `backend/scripts/seed_e2e_all.py` - Added Step 8 for sensitive field approvals seeding

---

## Data Seeded

Created 7 sensitive field approval requests per BUSINESS_LOGIC.md §6:

| Entity | Field | Description |
|--------|-------|-------------|
| Risk | owner_id | Change risk owner from Ops Head to Finance Head |
| Risk | department_id | Move risk from Operations to Finance department |
| Risk | category | Change from Operational to Strategic |
| Risk | is_priority | Downgrade priority risk to non-priority |
| Control | control_owner_id | Change control owner to different department |
| Control | department_id | Move control from IT to Operations department |
| Risk | owner_id | Clear owner (set to NULL) |

All entries:
- Prefixed with `E2E-SENSITIVE:` in reason field for isolation
- Status is PENDING for approval workflow testing
- Include pending_changes JSON with old/new values

---

## Verification

```bash
cd backend && python -m scripts.seed_e2e_sensitive_approvals
# Output: ✅ Created 7 sensitive field approval requests
```

Idempotency verified - script skips if entries already exist.

---

*Completed: 2026-01-13*
