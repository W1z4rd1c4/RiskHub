# Vendor canonical values

Vendor controlled meaning is stored and returned as locale-independent codes.
Czech workbook labels are accepted only by the controlled import adapter;
ordinary API writes reject them. UI and standard exports use explicit English
or Czech labels. Formal DORA/RoI exports use the separate regulatory adapter.

The executable source of truth is
`backend/app/services/_ict_register_reference/vendor_values.py`. Migration
`j1e2f3g4h5i6` converts known Czech values and the retired `easy`, `medium`,
`hard`, and `IČO (CRN)` aliases. Unknown nullable values are cleared instead
of guessed; an unknown non-null `vendor_type` becomes `other`.

## Stored field catalog

| Field group | Canonical codes |
|---|---|
| `vendor_type` | `ict`, `outsourcing`, `professional_services`, `partner`, `other` |
| `country` | workbook ISO codes `CZ`, `SK`, `DE`, `AT`, `NL`, `PL`, `GB`, `US`, `IE`, `FR`, `LU` |
| `person_type` | `legal_person`, `individual_acting_in_business_capacity` |
| `identifier_type` | `LEI`, `EUID`, `CRN`, `VAT`, `PNR`, `NIN` |
| `data_sensitivity` | `low`, `medium`, `high` |
| `replaceability` | `not_substitutable`, `highly_complex`, `medium_complexity`, `easily_substitutable` |
| `substitutability_reason` | `limited_market_alternatives`, `migration_difficulties`, `both` |
| `exit_plan_state` | `not_required`, `required_missing`, `draft`, `approved`, `tested`, `review_required`, `not_assessed` |
| `reintegration` | `easy`, `difficult`, `highly_complex` |
| `service_disruption_impact` | `low`, `medium`, `high`, `not_assessed` |
| `alternative_providers` | `yes`, `no`, `not_assessed` |
| `ctpp_designation` | `yes`, `no`, `undetermined` |
| nine `ex_ante_*` assessment fields | `ok`, `risk`, `not_applicable` |
| `assessment_phase` | `ex_ante`, `ongoing`, `not_applicable` |
| `due_diligence_state` | `not_applicable`, `not_started`, `in_progress`, `completed_without_reservations`, `completed_with_reservations`, `review_required`, `not_assessed` |
| six `significance_*` fields | `yes`, `no`, `not_applicable` |

The derived Vendor API also returns codes: country category
`domestic|eu|non_eu|unknown`, CIF and significance `yes|no`, criticality
`low|medium|high|critical`, and tier `critical|significant|standard`.
Chain level remains the workbook's stable `A|B|C` code. The main-contract
arrangement projection uses `standalone|overarching_master|subsequent_associated`.

## Boundary rules

- `vendor_controlled_value_code` maps source/workbook terminology during import.
- `vendor_workbook_value` bridges canonical persistence into the
  workbook-faithful derivation and DQ engine.
- `canonicalize_vendor_derived` converts engine output at the Vendor API
  projection boundary.
- `vendor_value_label(..., locale="en"|"cs")` is the ordinary presentation
  adapter. Standard Vendor CSV emits both the code and this label.
- `vendor_regulatory_value` is the formal export adapter and reproduces the
  ITS/RoI terminology in `roi_maps.py`; for example `highly_complex` becomes
  `Highly complex substitutability`, not the ordinary UI label.
- Import never resolves or guesses an Outsourcing Owner from a workbook name.
  Accountability identifiers are supplied by the authorized import workflow.
