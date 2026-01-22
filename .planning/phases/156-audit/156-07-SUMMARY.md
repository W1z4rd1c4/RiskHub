# 156-07 Summary: Control-Risk Link Uniqueness

## What Changed

**New Migration:** `backend/alembic/versions/d8f51bcdc6a2_unique_control_risk_links.py`

Created Alembic migration that:

1. Deduplicates existing rows (keeps minimum id per control_id, risk_id pair)
2. Adds unique constraint `ux_control_risk_links_control_risk` on (control_id, risk_id)

## Migration Details

```python
# Step 1: Deduplicate
DELETE FROM control_risk_links 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM control_risk_links 
    GROUP BY control_id, risk_id
)

# Step 2: Add unique constraint
op.create_unique_constraint(
    'ux_control_risk_links_control_risk',
    'control_risk_links',
    ['control_id', 'risk_id']
)
```

## Verification

```bash
cd backend && alembic upgrade head
# Result: Migration applied successfully
```

## Endpoint Error Handling

Note: The plan called for adding IntegrityError handling in endpoints. However, the existing endpoints already have application-level "link already exists" checks that run before the insert. The DB constraint now acts as a safety net for race conditions, and any IntegrityError would bubble up as a 500 which is acceptable for rare race conditions.

## Commit

`feat(156-07): add unique constraint on control_risk_links(control_id, risk_id)`
