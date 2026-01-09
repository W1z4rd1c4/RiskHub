# Phase 72-06: Granular Permissions - Context

**Gathered:** 2026-01-05
**Status:** Ready for planning

<vision>
## How This Should Work

When a CRO configures permissions in Risk Hub, they should have fine-grained control over who can submit KRI values and who can log control executions. Currently, `risks:write` automatically grants KRI submission ability, and `controls:write` automatically grants execution logging ability.

The user wants these to be independent - so someone could have access to edit controls but NOT log executions (or vice versa), and someone could have access to edit risks but NOT submit KRI values.

</vision>

<essential>
## What Must Be Nailed

- **Independent permissions** - KRI submission separated from `risks:write`, execution logging separated from `controls:write`
- **CRO configurability** - These new permissions should be editable via Risk Hub Roles UI
- **Direct action** - Logging control executions should be direct (no approval workflow)

</essential>

<boundaries>
## What's Out of Scope

- Approval workflows for execution logging (direct action only)
- Changes to existing `controls:write` or `risks:write` semantics
- New UI pages (small frontend permission-gate alignment is in scope)

</boundaries>

<specifics>
## Specific Ideas

- Rename `kri:record` to `kri:submit` for clarity
- Add new `controls:execute` permission
- Default assignments:
  - CRO, Risk Manager, Department Head: `kri:submit`
  - CRO, Risk Manager, Internal Audit, Compliance: `controls:execute`
  - Control Owner: loses `kri:submit` (must be explicitly granted)

</specifics>

<notes>
## Additional Context

The user provided clear requirements:
- KRI submission should NOT be granted by having `risks:write`
- Control execution logging should NOT be granted by having `controls:write`
- Department Heads should keep KRI submission but NOT have execution logging
- Control Owners should lose KRI submission unless explicitly granted

</notes>

---

*Phase: 72-risk-hub-resolution*
*Context gathered: 2026-01-05*
