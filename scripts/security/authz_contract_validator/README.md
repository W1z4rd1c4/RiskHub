# scripts/security/authz_contract_validator

## Purpose

Folder for `scripts/security/authz_contract_validator` implementation assets.

## Contents

- `__init__.py`
- `capability_catalog.py`
- `cli.py`
- `contract_manifest.py`
- `discovery.py`
- `frontend_local_gates.py`
- `frontend_routes.py`
- `git_inputs.py`
- `markdown_validation.py`
- `models.py`
- `runner.py`

## Notes

Keep this README updated when responsibilities or structure in this folder change.

## Public validation and review metadata (#268 companion)

Run `python scripts/security/validate_authz_capability_contract.py --base-ref <ref>`
to obtain findings for a real comparison base. `--skip-doc-touch` skips only the
paired-file change requirement; structural, catalog and review-date checks still run.
The exact Markdown `> Last reviewed:` declaration and top-level JSON
`last_reviewed` must each appear once, contain a valid ISO calendar date, and agree.
Duplicate equal declarations are errors. Prose dates and the separate architecture
review date do not replace these fields. Markdown remains canonical and JSON remains
its mirror; matrix, actor scope, findings, attestation and expiry ratchets remain
hand-maintained. No #269 authority reversal is included.

## Catalog coverage (RID-08 criterion reconciliation)

The catalog is opt-in per surface. For registered schema surfaces, the current
source comparison recognizes boolean fields and boolean maps, plus string arrays
explicitly declared with `string_array_fields`. The latter preserve the reviewed
identity field-ownership metadata; describing current coverage as boolean-only
would be incorrect. Backend `list[str]` and frontend `z.array(z.string())` must
agree for opted-in arrays. Existing explicitly registered interface entries check
class/method presence. The catalog is not an exhaustive validator of every response
field, every unregistered surface or runtime authorization. This companion changes
none of those supported types or opt-in boundaries.

New review-date tests invoke the real public CLI against synthetic git repositories,
including both modes, paired updates, duplicate/malformed dates and typed-array
negative controls. Only shim aliases with no repository references were retired;
existing supported/test-used compatibility exports remain. Broader legacy test
interface migration, catalog-lock restatement removal and structure-count tooling
remain separate #268 criteria, so this companion does not close the whole issue.


## Subsequent compatibility cleanup and retained evidence (#268)

After the public-fixture migration, a full tracked-readable token inventory found
13 more adapter bridges with no callers. Only those shim bindings are retired;
the same-name deep catalog, discovery and manifest implementations remain. The
frontend parser test continues importing its extractor from the deep catalog owner.
`validate`, `main`, runner-used adapters and the defensive no-diff seam are retained.

Public CLI tests now cover synthetic base-ref findings, paired dates, typed catalog
failures and the supported entrypoints after retirement. A small lower-level set
remains intentional: actual policy/sensitive-path registration, canonical import
identity, adapter ownership, directory authority, defensive no-diff behavior and
installed hook/CI wiring cannot all be established by synthetic public fixtures.
Structure inventory markers retain strict coverage, date and malformed/duplicate
checks, and any retained numeric claims must match measured Git-index facts. These
markers are observed inventory declarations, not acceptance budgets. Whole-issue
acceptance must acknowledge these retained implementation-only controls and the
explicit opt-in string-array criterion correction; it must not claim all tests are
public-only or change Markdown's documentation authority.
