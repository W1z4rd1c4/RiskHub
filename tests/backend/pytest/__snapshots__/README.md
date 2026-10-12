# tests/backend/pytest/__snapshots__

## Purpose

Pytest backend coverage for `__snapshots__`.

## Contents

- `test_w0_harness_contract_red.ambr`
- `test_ict_register_committee.ambr`

## Notes

The custom `SnapshotAssertion` fixture uses `RedactingSnapshotExtension`, an
Amber extension. It recursively redacts identity and timestamp keys in nested
dictionaries, lists, tuples, and dataclass instances without changing the source
objects. Dataclasses are normalized to dictionaries before Amber serialization
so redaction does not depend on Syrupy's repr-versus-structured dataclass format.

When upgrading Syrupy, run the harness redaction negative cases and both stored
snapshot assertions before considering individual snapshot changes. These
snapshots use Amber, not the JSON extension; a change to JSON date serialization
is not a reason to regenerate them. Inspect each failure rather than accepting a
bulk snapshot update.
