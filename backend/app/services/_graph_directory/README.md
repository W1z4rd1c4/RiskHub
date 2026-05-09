# _graph_directory

## Purpose

Microsoft Graph directory provider adapter package.

## Contents

- `auth.py` owns client-credential token acquisition and cache reset support.
- `errors.py` defines the Graph provider exception hierarchy.
- `service.py` maps Graph users into directory schemas.
- `transport.py` owns guarded Graph HTTP GET calls.

## Notes

This package is an ADR-007 adapter. It contains transport and provider integration code, while identity lifecycle policy remains in `_directory_identity`.
