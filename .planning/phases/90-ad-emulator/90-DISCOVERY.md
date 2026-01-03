# Phase 90 AD Emulator - User Mapping & Sync Rules

## Current RiskHub User Schema (Source of Truth)

**Model**: `backend/app/models/user.py` + `backend/app/schemas/user.py`

| Field | Type | Notes |
| --- | --- | --- |
| id | int | Primary key |
| email | string | Unique, indexed, required |
| name | string | Required |
| is_active | bool | Default true |
| role_id | int | FK to roles.id (required) |
| department_id | int? | FK to departments.id (optional) |
| manager_id | int? | FK to users.id (optional) |
| hashed_password | string? | Nullable (allows external auth) |
| created_at / updated_at | datetime | Timestamps |

## Directory Emulator Attributes

| Directory Field | Description |
| --- | --- |
| external_id | Immutable ID from directory (GUID-like) |
| user_principal_name (UPN) | Typically email-form username |
| email | Primary email (preferred match) |
| display_name | Display name (preferred for RiskHub name) |
| given_name / surname | Fallback for name composition |
| department | Department name (string) |
| job_title | Informational only (not mapped yet) |
| manager_external_id | External ID of manager |
| account_enabled | Active flag (maps to is_active) |
| source_payload | Raw directory JSON for debugging |

## Matching & Conflict Rules

**Matching order**
1. If `DirectoryUser.user_id` is already linked, use that user.
2. Else match by `email` (lowercased).
3. Else match by `user_principal_name` (lowercased, treated as email).
4. If no match key, skip and log error.

**Conflict rules**
- Directory is the source of truth for: **name, email, is_active, department, manager**.
- **Never overwrite `role_id`** unless a future explicit role-mapping config is added.
- If email conflict occurs (target email already used by another user), skip and log error.

## Default Values

- **Role assignment** for new users:
  - Prefer role `employee` if it exists.
  - Fallback to `control_owner` or `viewer` if `employee` is missing.
  - If no roles exist, sync should error (seed required).
- **Name**: `display_name` → `given_name + surname` → `email` → `external_id`.
- **is_active**: `account_enabled` (false disables the user).

## Department Resolution

- Match departments by **name (case-insensitive)**.
- If not found during APPLY, create a new department with a generated code.
- Department code generation:
  - Use initials of words (e.g., "Risk Management" → "RM").
  - If too short, fallback to first 3-4 alphanumeric chars of the name.
  - Ensure uniqueness by appending numeric suffix.

## Manager Resolution

- Use `manager_external_id` to find a DirectoryUser and its linked RiskHub user.
- If resolved, set `manager_id` to that user ID.
- If unresolved, leave `manager_id` null and log warning.

## Sync Actions

| Action | Condition | Result |
| --- | --- | --- |
| Create | No matching user found | Create User with default role, link DirectoryUser.user_id |
| Update | Matching user + field changes | Update name/email/department/manager/is_active |
| Deactivate | account_enabled=false and user.is_active=true | Set is_active=false |
| No-op | No changes | Skip |
| Error | Missing match key, email conflict, invalid email | Log error, skip |

## Error Handling

- Missing email/UPN → error (cannot match or create).
- Duplicate email across directory users → error (skip duplicate).
- Invalid email format → error (skip).
- Manager external_id not found → warning (manager_id remains null).

