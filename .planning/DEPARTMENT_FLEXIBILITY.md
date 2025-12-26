# Department Flexibility Strategy

## The Challenge

Organizational structures change over time:
- Departments can be created
- Departments can be merged or dissolved
- Departments can be renamed
- Users can move between departments

## Current Implementation

### ✅ What's Already Flexible

**1. Department Management**
- Departments are stored in the `departments` table
- Can be created/updated/deleted via API (when implemented)
- No hardcoded department lists in application code

**2. User-Department Relationships**
- Users have `department_id` (nullable foreign key)
- Users can be reassigned to different departments
- Users can exist without a department (C-Suite, governance roles)

**3. Permission Filtering**
- Uses `get_user_department_ids(user)` which queries the database
- Returns empty list for privileged users (see all data)
- Returns `[user.department_id]` for department-scoped users
- No hardcoded department IDs in permission logic

### ⚠️ Current Limitations

**1. Seed Script Hardcoding**
The `seed_departments.py` script has hardcoded department names:
```python
departments_data = [
    ("Operations", "OPS", "Operations and business processes"),
    ("Underwriting", "UW", "Underwriting and risk assessment"),
    # ... etc
]
```

**Impact**: LOW - Seed scripts are for initial setup only, not production

**2. No Department Lifecycle Management UI**
- No frontend UI to create/edit/delete departments
- No API endpoints for department CRUD (they exist but need permission checks)

## Recommended Solutions

### Short-term (Immediate)

**1. Document Department Management Process**
Create admin documentation for:
- How to add new departments (SQL or API)
- How to merge departments (reassign users, update risks/controls)
- How to archive departments (soft delete, preserve history)

**2. Add Department CRUD Endpoints** (Already exist, need permission checks)
```python
# backend/app/api/v1/endpoints/departments.py
POST   /api/v1/departments      # Create new department
PUT    /api/v1/departments/{id} # Update department
DELETE /api/v1/departments/{id} # Soft delete (set is_active=False)
```

**3. Soft Delete Pattern**
Add `is_active` column to departments table:
```sql
ALTER TABLE departments ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
```

Benefits:
- Preserve historical data
- Prevent orphaned users/risks/controls
- Allow department reactivation

### Medium-term (1-2 months)

**1. Department Management UI**
Create admin interface for:
- Creating new departments
- Editing department details
- Archiving departments (soft delete)
- Viewing department hierarchy
- Bulk user reassignment

**2. Department Merge Workflow**
```
1. Select source and target departments
2. Preview affected users, risks, controls
3. Confirm merge
4. Reassign all data to target department
5. Archive source department
```

**3. Audit Trail**
Log all department changes:
- Who created/modified/deleted
- When it happened
- What changed
- Affected users/data

### Long-term (3+ months)

**1. Department Hierarchy**
Support parent-child relationships:
```python
class Department(Base):
    parent_id: int | None  # Self-referential FK
    children: list["Department"]  # Relationship
```

Benefits:
- Organizational chart
- Cascading permissions
- Flexible restructuring

**2. Effective Dating**
Track when departments existed:
```python
class Department(Base):
    effective_from: datetime
    effective_to: datetime | None
```

Benefits:
- Historical reporting
- Time-travel queries
- Compliance auditing

**3. Department Templates**
Pre-configured department types:
- Standard insurance departments
- Custom department creation
- Role/permission templates

## Handling Specific Scenarios

### Scenario 1: New Department Created

**Current System**: ✅ Fully Supported
1. Admin creates department via API or SQL
2. Department appears in dropdown lists
3. Users can be assigned to new department
4. Permission filtering works automatically

**No Code Changes Required**

### Scenario 2: Department Dissolved

**Current System**: ⚠️ Partially Supported

**Recommended Approach**:
1. Reassign all users to other departments
2. Update all risks/controls to new department
3. Soft delete department (`is_active = FALSE`)
4. Preserve historical data for auditing

**Required Changes**:
- Add `is_active` column to departments
- Filter queries to show only active departments
- Admin UI for reassignment workflow

### Scenario 3: Department Renamed

**Current System**: ✅ Fully Supported
1. Update department name in database
2. Change propagates automatically
3. No code changes needed

### Scenario 4: Department Merged

**Current System**: ⚠️ Requires Manual Work

**Recommended Approach**:
1. Identify source and target departments
2. Bulk update users: `UPDATE users SET department_id = target_id WHERE department_id = source_id`
3. Bulk update risks: `UPDATE risks SET department_id = target_id WHERE department_id = source_id`
4. Bulk update controls: `UPDATE controls SET department_id = target_id WHERE department_id = source_id`
5. Soft delete source department

**Future Enhancement**: Create merge workflow API endpoint

### Scenario 5: User Changes Department

**Current System**: ✅ Fully Supported
1. Update user's `department_id`
2. Permission filtering updates automatically
3. User sees new department's data
4. No code changes needed

## Database Constraints

### Current Foreign Keys
```sql
users.department_id → departments.id (nullable, cascade)
risks.department_id → departments.id (nullable, cascade)
controls.department_id → departments.id (nullable, cascade)
```

### Recommended Changes
```sql
-- Add soft delete
ALTER TABLE departments ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- Add audit fields
ALTER TABLE departments ADD COLUMN archived_at TIMESTAMP;
ALTER TABLE departments ADD COLUMN archived_by INTEGER REFERENCES users(id);

-- Change FK constraints to RESTRICT instead of CASCADE
-- This prevents accidental data loss
ALTER TABLE users DROP CONSTRAINT users_department_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_department_id_fkey 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
```

## Migration Strategy

If you need to change department structure:

**Option A: SQL Migration**
```sql
-- Example: Merge "Claims" into "Operations"
BEGIN;
UPDATE users SET department_id = (SELECT id FROM departments WHERE name = 'Operations') 
WHERE department_id = (SELECT id FROM departments WHERE name = 'Claims');

UPDATE risks SET department_id = (SELECT id FROM departments WHERE name = 'Operations') 
WHERE department_id = (SELECT id FROM departments WHERE name = 'Claims');

UPDATE controls SET department_id = (SELECT id FROM departments WHERE name = 'Operations') 
WHERE department_id = (SELECT id FROM departments WHERE name = 'Claims');

UPDATE departments SET is_active = FALSE WHERE name = 'Claims';
COMMIT;
```

**Option B: API Endpoint** (Future)
```python
POST /api/v1/departments/merge
{
    "source_id": 3,
    "target_id": 1,
    "archive_source": true
}
```

## Key Principles

1. **No Hardcoded Departments**: All department logic queries the database
2. **Soft Deletes**: Never hard delete departments (preserve history)
3. **Cascading Updates**: Use database transactions for multi-table updates
4. **Audit Trail**: Log all structural changes
5. **Permission Flexibility**: Permission filtering adapts automatically

## Summary

**Your system is already quite flexible!** The main gaps are:
1. No soft delete mechanism (easy to add)
2. No admin UI for department management (future enhancement)
3. No automated merge workflow (future enhancement)

The core architecture supports organizational changes without code modifications.

---

**Next Steps**:
1. Add `is_active` column to departments table
2. Update department queries to filter by `is_active = TRUE`
3. Create admin documentation for manual department management
4. (Future) Build department management UI
