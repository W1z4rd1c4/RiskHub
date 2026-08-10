# _ict_register_reference

ICT Register reference data (issue #41): the workbook's 45 closed lists, the
S01-S19 ICT service taxonomy, country categories, the CZ->EN RoI conversion
maps, and the 23 workbook parameters as a seeded, versioned, read-only
parameter set.

- **Source of truth**: `docs/dora-ict-register/dora-excel-functional-spec.md`
  sections 3.1-3.4 (closed lists, S-codes, RoI maps, static tables) and 6
  (parameters). Values are verbatim; never edit them independently of that spec.
- **ADR-007 class**: read-shape. The package projects workbook constants and
  seeded `global_config` rows; it owns no commits. Seeding lives in
  `app/db/seed.py::seed_ict_workbook_parameter_config` and the forward-only
  migration `o2p3q4r5s6t7_add_ict_register_parameter_config.py`.
- **Parameters follow ADR-008**: verbatim defaults in code, seeded
  `global_config` rows (category `ict_register_parameters`, non-editable)
  authoritative when present, read through
  `load_ict_workbook_parameter_set(db)`. The set is versioned by `P_Verze`.
- **RoI fallback rule**: `roi_en_value` reproduces the workbook's
  `IFERROR(INDEX/MATCH, src)` — unmapped source values pass through unchanged.
- **HTTP surface**: `backend/app/api/v1/endpoints/ict_register.py`
  (`/api/v1/ict-register/...`), read-only, gated by `vendors:read`.
- Later ICT Register slices import closed-list enforcement
  (`is_closed_list_value`) and parameters from this package instead of
  re-declaring reference data.
