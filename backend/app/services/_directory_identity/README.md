# _directory_identity

## Purpose

Directory identity normalization and lifecycle decisions shared by SSO, directory import, deprovision, and access workflows.

## Public Surface

- `DirectoryIdentityConflictError`
- `DirectoryProfileUpdateOutcome`
- `DirectoryReenableOutcome`
- `apply_directory_profile`
- `has_auto_deprovision_reason`
- `normalize_business_role`
- `requires_break_glass_for_reenable`
- `resolve_directory_email`
- `resolve_or_create_department`
- `apply_directory_profile_outcome`
- `directory_reenable_outcome`

## Notes

Import `apply_directory_profile_outcome` and `directory_reenable_outcome` from `_directory_identity.lifecycle`; the other names are exported by the package root.
