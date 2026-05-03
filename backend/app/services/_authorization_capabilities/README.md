# backend/app/services/_authorization_capabilities

## Purpose

Resource-specific backend capability builders used by the public authorization capability facade.

## Contents

- `approvals.py` - approval request capabilities.
- `common.py` - shared capability helper functions.
- `controls.py` - control capabilities.
- `issues.py` - issue capabilities.
- `kris.py` - KRI capabilities.
- `risks.py` - risk capabilities.
- `vendors.py` - vendor capabilities.

## Notes

Keep `backend/app/services/authorization_capabilities.py` as the stable facade. New resource capability logic should live here with matching backend and frontend contract tests.
