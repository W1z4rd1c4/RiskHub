# Private API boundary pilot (#254)

This is a bounded first migration, not completion of the 69-test classification.
It covers `_risk_questionnaires` and `_control_execution`, plus the service-to-HTTP
adapter inversion assertion. Existing unrelated architecture, transaction, policy,
uniqueness and delegation assertions remain in force.

## Declaration and compatibility

Each package owns one literal `CALLER_EXPORTS` map. Its keys generate `__all__`.
All 38 Questionnaire and 21 Control-execution pre-existing exports remain available
to service callers as an explicit compatibility decision. This is not a claim that
the surface has been minimized or that low-level operations are endpoint-safe.
The Questionnaire compatibility facade shares the declaration and actual bindings.

HTTP adapters have a restrictive default. Lifecycle/governed operations form that
default surface. Explicit query, administrative-send and execution-record caller
roles preserve the existing specialized adapters. A new or renamed HTTP adapter
cannot silently fall through to unrestricted service access. Other packages'
existing narrower dependency restrictions remain applicable.

The checker scans Python files throughout `backend/app`, `backend/scripts` and
repository `scripts`, including code outside service and endpoint directories.
It resolves absolute/relative imports, aliases, module-member access, simple
namespace assignments and module globals used by later-called functions. Boundary
bindings are conservatively retained across branch traversal. Ambiguous boundary
aliases fail closed. External namespace reflection/escape and unresolved dynamic
imports are unsupported and rejected; known relative dynamic imports use their
actual package argument. Finite literal target maps are trusted only while their
references remain in supported read-only forms and the target has one direct,
unconditional tuple binding in its lexical module/function body. Conditional or
multiply bound targets, global/nonlocal escape, reassignment, branch/function
mutation, alias escape, parameter shadowing and a shadowed metadata `list` call
invalidate that inference and force an unresolved-target rejection. Inference
is fresh in nested lexical scopes; no general branch-state simulation is claimed.
This is a static import/member contract, not a sandbox
for arbitrary Python metaprogramming or a replacement for runtime authorization.

Two existing capability-projection leaf imports are retained in a manually reviewed
caller/symbol-specific exception file, with reasons and a 2026-12-05 expiry.
Endpoint exceptions are forbidden. The existing capability allowlist and its expiry
checks are separate and unchanged. No exception list is generated from current
imports.

## Replaced assertions and preserved invariants

- Questionnaire route lock: replace three exact private-module symbol-placement
  assertions with declaration, resolution and caller-boundary checks. Preserve the
  existing lifecycle delegation and forbidden low-level adapter assertions.
- Control route lock: replace three exact private-module symbol-placement assertions
  with the same declaration-driven checks. Preserve governed operation delegation,
  output projection and forbidden low-level adapter assertions.
- Service-to-endpoint inversion: replace a raw text substring search with normalized
  import/member checking. Metadata strings naming callers are allowed; actual
  absolute, relative, aliased or module-qualified endpoint dependencies fail.
  Unparseable in-scope source fails rather than disappearing from the scan.

The rest of the original deepening assertions are unchanged. In particular this
pilot does not replace transaction ownership, canonical policy identity, unique
implementation, frontend behavior or shell composition proofs with an export list.

## Executable evidence

Three initial seeded aliases evade the old endpoint locks and fail the new RED
assertions. The replacement rejects them. Additional negative fixtures cover
undeclared names, implementation imports, new endpoint defaults, branch rebinding,
late module globals, star imports, reflective namespace access, dynamic imports,
outside-services callers and expiring exceptions.

The positive move test copies the real application and unchanged HTTP tests to an
isolated temporary repository, renames the entire Questionnaire lifecycle module,
and changes only initializer wiring. The implementation bytes, caller declaration
and HTTP test bytes remain identical. It executes both the existing eligible,
idempotent open journey and the forbidden-user journey through the mounted API.
No expectation is rewritten to follow a renamed implementation path.

Local source/test approval is distinct from future exact-head hosted, PostgreSQL
and integrated-main acceptance. Issue #254 remains open for the remaining mapped
assertions and packages.
