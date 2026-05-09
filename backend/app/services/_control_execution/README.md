# backend/app/services/_control_execution

## Purpose

Shared service-layer workflow for control execution creation, execution capabilities, and linked-risk visibility.

## Contents

- `__init__.py`
- `capabilities.py`
- `workflow.py`

## Notes

Control execution routes should use this package so archived-control conflicts, next-scheduled calculation, and linked-risk serialization stay consistent. Linked-risk display names use `Risk.name`; `Risk.process` remains a legacy process field and must not be serialized as the linked-risk label.
