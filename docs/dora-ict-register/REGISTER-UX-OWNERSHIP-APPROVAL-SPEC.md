# ICT Register consistency, accountability, and governed-change specification

_Tracker: [GitHub issue #71](https://github.com/W1z4rd1c4/RiskHub/issues/71) · Status: all in-scope automated remediation and DORA E2E certification complete; human/AT evaluation, C6 reproduction, ultrareview, WCAG-conformance, and the merge decision remain pending and outside this automated closeout._

## Problem Statement

RiskHub's mature Risks, Controls, KRIs, Issues, and Vendors experiences let users narrow, group, sort, export, and revisit operational views with predictable controls. The newer Process, Asset, and Threat registers do not yet meet that standard. Their filters are shallow, their list and form presentation differs from the mature registers, and Department detail does not expose the operational records users need to understand a Department in one place.

Accountability is also inconsistent. Processes and Assets store owners as free text, Threats have no accountable steward, and some Department values are text rather than relationships to RiskHub's User and Department directories. Those values cannot reliably drive access, filtering, workflow, orphan governance, audit evidence, or reassignment. The UI also mixes English and Czech controlled labels, which makes the selected locale unreliable and risks treating presentation text as business meaning.

Critical or important Processes, Assets, and Vendors can also be changed without the governed approval flow users expect from RiskHub. Because Asset Criticality and Vendor tier are derived through the Process-to-Asset-to-Vendor cascade, a local edit can have protected downstream consequences. Approval must understand that complete impact, prevent self-approval and stale application, remain configurable in Risk Hub, and participate in each User's notification preferences.

## Solution

Normalize Risks, Controls, KRIs, Issues, Vendors, Processes, Assets, and Threats on one permission-aware register-list experience based on the mature Risks and Vendors pages. Each register keeps domain-specific views, filters, columns, forms, and details, while sharing the same interaction model for search, facets, active filters, grouping, sorting, pagination, URL state, export, loading, empty, error, archive, and pending-approval states. Department detail becomes an operational workspace with entity tabs and health cards that reuse the same list/query behavior under a locked Department filter.

Replace Process and Asset free-text responsibility data with canonical RiskHub User and Department relationships. Introduce precise responsibility roles: Process Owner, Asset Business Owner, Asset ICT Owner, existing Vendor Outsourcing Owner, and CISO-only Threat Steward. Add the CISO RBAC role and CISO demo persona, producing ten flat demo persona cards in a five-column by two-row desktop grid. Assignment grants record-specific access without broadening general register access, while deactivation and role loss flow through orphan governance and explicit reassignment.

Store controlled register meaning as canonical, locale-independent codes. Render those codes entirely in the active English or Czech locale, map workbook/source terminology during import, and map mandated terminology only for regulatory exports. Rebuild the demo and E2E seed against this clean model; do not preserve or reconcile legacy free-text owner values.

Extend approvals with configurable scenarios for protected Process, Asset, and Vendor mutations and every accountability reassignment. Apply strict requester/approver separation, one pending mutation per impacted record, approval-time authorization and version revalidation, permission-scoped diffs, and atomic Composite approval across all protected cascade impacts. Add two default-on per-User notification preferences for actionable requests and outcomes of a User's own requests. Do not add an approval SLA or timer-driven reminders.

## User Stories

1. As a register user, I want all eight operational registers to use the same search, filter, grouping, table, export, and pagination rhythm, so that I do not relearn the interface on each page.
2. As a register user, I want each register's view buttons and filters to reflect that entity's domain, so that consistency does not add irrelevant controls.
3. As a register user, I want search and lifecycle status always visible and additional filters inline, so that common narrowing remains fast and understandable.
4. As a register user, I want active-filter chips, an active count, individual removal, and Clear all, so that complex views remain visible and reversible.
5. As a register user, I want AND semantics across fields, OR semantics within one multi-valued field, search additionally ANDed, Yes/No/Any Booleans, and inclusive ranges, so that filtering is predictable.
6. As a register user, I want grouping to operate on the full filtered universe and a filter change to reset to page one, so that groups and pages never misrepresent results.
7. As a register user, I want search, view, sort, filters, selected group, and page state in the URL, so that browser navigation and shared links reproduce my view.
8. As a scoped user, I want filter options and counts calculated only from records I may read, so that facets cannot leak hidden names or quantities.
9. As a register user, I want valid zero-result controlled values visible but disabled, so that I understand the taxonomy without selecting impossible values.
10. As a register user, I want remote searchable User and entity filters whose selected values remain resolvable across pages, so that large directories work without raw ID fallbacks.
11. As a register user, I want sortable business columns and deterministic fallback ordering, so that list order is stable and explainable.
12. As a register user, I want export to include every matching filtered row under the same authorization scope, not only the visible page, so that the file faithfully represents the view.
13. As a bilingual user, I want standard exports to contain localized labels and stable codes while formal RoI export stays separate, so that readability does not compromise regulatory structure.
14. As a Process user, I want All, By Department, By Owner, By L0 Area, By Criticality, and By Vendor views, so that I can inspect Processes by organization, continuity, and dependency.
15. As a Process user, I want filters for lifecycle, Department, owner, L0 Area, Criticality class, CIF, completeness, licensed activity, BCM, DR result, MTPD, and linked Asset, Vendor, and Risk, so that Process governance can happen on screen.
16. As a Process user, I want search across F-code, L0/L1/L2 names, owner, and Department, so that common Process identifiers all work.
17. As an Asset user, I want All, By Department, By Business Owner, By Type, By Criticality, By Process, and By Vendor views, so that business and technical dependencies are easy to inspect.
18. As an Asset user, I want filters for lifecycle, Department, both owners, type/level, deployment, resulting criticality, CIF, legacy, SPOF, external dependency, GDPR/AI relevance, internet exposure, data classification, completeness, and linked Process, Asset, Vendor, and Risk, so that Asset review is comprehensive.
19. As an Asset user, I want search across name, alternative names, type, both owners, Department, and location, so that Assets are discoverable by operational language.
20. As a Threat user, I want All, By Category, By Threat Steward, By Relevant Subject, and By Linked Risk views, so that the global Threat catalog is navigable.
21. As a Threat user, I want filters for lifecycle, category, steward, relevant subject, linked-risk presence, linked Risk, linked Risk type, and linked Risk Department, so that Threat-to-Risk context is reviewable.
22. As a Threat user, I want search across name, description, typical weaknesses, relevant subject, and steward, so that narrative Threat knowledge remains discoverable.
23. As a Threat user, I want one Threat placed in every applicable visible Risk group, so that multi-linked Threats are not arbitrarily reduced to one Risk.
24. As a Vendor user, I want to retain All, By Department, By Process, By Type, By Risk, and By Flag views, so that useful existing navigation remains intact.
25. As a Vendor user, I want filters for lifecycle, Department, owner, type, risk score, tier, DORA/CIF/significant flags, Substitutability, country/category, RoI Contract, Sub-outsourcing, direct Process link, and linked Process, Asset, Risk, Control, and KRI, so that third-party governance does not require an export first.
26. As a Vendor user, I want search across trading/legal name, registration identifier, owner, Department, and Process, so that supplier records are discoverable by business context.
27. As a Risk, Control, KRI, or Issue user, I want the shared behavior without losing existing quick filters or capabilities, so that normalization is not a regression.
28. As a Department user, I want Overview, Risks, Controls, KRIs, Issues, Processes, Assets, Vendors, Users, and Activity tabs, so that I can review the Department's operational footprint in one place.
29. As a Department user, I want entity tabs to reuse full register behavior with a locked canonical Department filter, so that Department and top-level results cannot drift.
30. As a Department user, I want records selected by Owning Department even when the accountable User belongs elsewhere, so that organizational ownership remains distinct from personal accountability.
31. As a Department user, I want Threats excluded because they are a global CISO-stewarded catalog, so that the UI does not imply false Department ownership.
32. As a Department user, I want eight clickable Overview cards in a four-column by two-row desktop grid with relevant health counts and filtered drill-down, so that summary signals lead to supporting records.
33. As a Department user, I want Recent Activity full width below those cards, so that change evidence remains visible without crowding the grid.
34. As a bilingual user, I want English mode entirely English and Czech mode entirely Czech for controlled values, so that the UI never mixes presentation languages.
35. As a data steward, I want controlled meaning stored as canonical codes, source/workbook terminology mapped on import, and free text preserved as entered, so that locale never changes business data.
36. As a Process Owner, I want accountability linked to an active RiskHub User, so that it is searchable, auditable, and usable for access decisions.
37. As an Asset user, I want distinct Business Owner and ICT Owner relationships, with the same User allowed in both roles, so that business and technical accountability are explicit without inventing people.
38. As a Vendor user, I want existing Outsourcing Owner preserved and presented consistently, so that Vendor governance uses the same directory experience.
39. As a Threat user, I want one CISO-only Threat Steward rather than a generic Threat owner, so that the responsibility describes stewardship accurately.
40. As a governance user, I want every new active Process, Asset, Vendor, and Threat to have all required responsibilities, so that no new operational record begins orphaned.
41. As a Process or Asset user, I want Owning Department linked to an active RiskHub Department, so that Department views and authorization are reliable.
42. As a form user, I want selecting a Process Owner or Asset Business Owner to fill an empty Department without overwriting a chosen one, so that entry is faster while Department remains independent.
43. As an Asset user, I want either owner permitted from another Department, so that matrix and shared-service organizations are modeled accurately.
44. As an owner picker user, I want any active User eligible for Process, Asset, or Vendor responsibility and results disambiguated by name, email, Department, and roles, so that selection is accurate without artificial RBAC roles.
45. As an accountable User, I want assignment to grant read and approved edit capability for that specific record outside my normal Department, so that I can fulfil the responsibility assigned to me.
46. As a scoped User, I want only permission-safe linked summaries rather than general linked-register access, so that assignment does not over-broaden visibility.
47. As a Department Head, I want Department-scoped Process and Asset access based on Owning Department, so that I can govern my Department's records.
48. As a governance administrator, I want deactivation or CISO-role loss to preserve former responsibility evidence, mark an orphan condition, and require explicit reassignment, so that accountability is not silently erased.
49. As a CISO, I want full Threat lifecycle and Threat-to-Risk management plus read context across Risks, Controls, Issues, Processes, Assets, Vendors, Contracts, Departments, reports, ICT Committee, and history, so that I can steward the Threat catalog.
50. As a security administrator, I want CISO excluded from User/platform administration, approval authority, and broad writes to other registers, so that the role remains least privilege.
51. As a demo user, I want a dedicated CISO persona among ten equal cards in a five-column by two-row desktop grid, so that the role can be tried without changing another account.
52. As a Process Owner, either Asset owner, Outsourcing Owner, or Threat Steward, I want to edit my assigned record, so that accountability is operational rather than descriptive.
53. As a Risk Manager or CRO, I want archive/restore authority retained at governance level, so that record retirement remains controlled.
54. As a governance user, I want a Process protected when CIF is Yes, an Asset protected when CIF is Yes or resulting Criticality is Critical, and a Vendor protected when tier is Critical or Significant, so that important records receive review.
55. As a governance user, I want current and proposed derived state evaluated, so that lowering a classification cannot be used to bypass approval.
56. As a requester, I want protected creation, business updates, relationship changes, and archive submitted for approval while comments/evidence/activity remain direct and restore remains privileged direct, so that material state changes are controlled without blocking collaboration.
57. As a requester, I want every accountable User or Owning Department change approved even for a non-protected record, so that accountability cannot be transferred silently.
58. As an approver, I want one independent configured Risk Manager or CRO approval and no senior-role bypass, so that every governed mutation has a real two-person control.
59. As a requester, I want submission rejected if no independent approver exists, so that the control is never weakened merely to proceed.
60. As a record reader, I want Active/Archived lifecycle shown separately from Pending change, so that current operational truth and proposed work are both clear.
61. As a detail user, I want a pending banner and permission-scoped field/link diff, so that I understand the proposal without exposing hidden records.
62. As an approver, I want entity identity, requester, mandatory reason, timestamp, before/after values, derived impact, and link changes in one review, so that my decision is evidence-based.
63. As a requester, I want rejection to require a reason and cancellation available, so that outcomes are understandable and obsolete work can stop.
64. As a user, I want only one pending mutation per impacted record, business changes locked while pending, and comments/evidence still available, so that proposals cannot race while collaboration continues.
65. As an approver, I want authorization, eligibility, references, scenarios, classifications, and record versions revalidated at decision time, so that stale requests expire without overwriting current truth.
66. As an approver, I want any Process, Asset, Contract, Sub-outsourcing, or link change to show every protected downstream consequence and apply atomically, so that the Criticality cascade is never partially governed.
67. As a requester, I want protected creation visible only to me and eligible approvers as non-operational Pending creation, so that a proposal is reviewable without entering inventory.
68. As a reporting user, I want pending creations excluded from facets, Department counts, exports, and relationships, so that unapproved records never affect operational outputs.
69. As an auditor, I want rejected/cancelled creation proposals retained only in immutable approval and audit history, so that evidence remains without phantom records.
70. As a CRO, I want four fixed settings for protected Process, protected Asset, protected Vendor, and accountability-reassignment approvals, so that runtime policy is explicit.
71. As a CRO, I want each scenario default-on but individually enableable/disableable, with Risk Manager, CRO, or both selectable as approvers, so that the workflow fits the operating model.
72. As a governance user, I want thresholds, covered mutation categories, and no-self-approval fixed, so that settings cannot redefine the core control.
73. As an approver, I want a default-on preference for requests requiring my action, covering submission, cancellation, and stale expiry, so that actionable events can reach me.
74. As a requester, I want a separate default-on preference for outcomes of my requests, covering approval, rejection, cancellation, and stale expiry, so that I can follow my work.
75. As a User, I want notification preferences to suppress event delivery only, never Approvals/My Requests visibility or unread-work counts, so that preferences cannot hide required work.
76. As a User, I do not want approval due dates, overdue states, reminders, or time-driven escalation, so that this workflow remains event-driven.
77. As a Process, Asset, or Threat form/detail user, I want established RiskHub headers, fields, validation, cards, spacing, actions, tabs, dialogs, pickers, links, badges, and async feedback, so that new registers feel native.
78. As a domain user, I want forms grouped around each entity's own meaning rather than forced into the Risk wizard, so that visual consistency does not damage clarity.
79. As an accessibility user, I want normalized filters, dialogs, tables, and validation states keyboard-accessible and correctly labelled, so that consistency includes accessible operation.
80. As a maintainer, I want one rebuilt demo/E2E seed tied to real Users, Departments, and canonical codes with no legacy owner reconciliation, so that pre-release data is clean and deterministic.
81. As a maintainer, I want backend capabilities authoritative and frontend gates derived from them, so that UI visibility cannot replace authorization.
82. As a maintainer, I want full backend, frontend, Postgres, E2E, i18n, visual, authorization, architecture, and documentation verification, so that the change is complete rather than cosmetically similar.
83. As an English or Czech User and administrator, I want complete Process, Asset, Threat, Vendor, Department, approval, notification, Risk Hub, CISO, demo, and support manuals, so that the feature can be operated without source-code knowledge.
84. As a maintainer, I want canonical business, authorization, testing, demo, navigation, screenshot, and ICT Register documentation synchronized, so that documented truth matches runtime truth.

## Implementation Decisions

- This is a follow-on to the original ICT Register specification and existing DORA UX remediation. Reuse delivered register, derivation, authorization, archive, linking, accessibility, and presentation work; ticketing must identify dependencies and avoid duplicating open remediation tickets.
- Normalize eight registers: Risks, Controls, KRIs, Issues, Vendors, Processes, Assets, and Threats. Risks and Vendors are the visual/interaction reference.
- Introduce one shared register-list shell and state/query vocabulary for headers/actions, views, search, lifecycle, addable filters, chips, grouping, sorting, pagination, URL serialization, export, and async/access states. Entity modules provide declarative view/filter/column/export configuration and domain row/detail content.
- When URL state is absent, registers open in All view with active records and no user-selected sort. Backend business-key ordering is deterministic. Department-hosted lists add a locked Department constraint.
- Backend listing services are authoritative for filters, grouping, sorting, pagination, facets, lookups, and visibility. Filter semantics are AND across fields, OR within one field, search additionally ANDed, Yes/No/Any for Booleans, and inclusive ranges.
- Facets and lookups operate on the caller's readable universe. Valid zero-result codes are disabled. Remote User/entity choices remain resolvable across paging and expose safe display metadata, never raw numeric IDs.
- Filtered exports share the normalized query and authorization contract, include all matches independently of pagination, and emit canonical codes plus localized labels. Formal RoI export stays separate.
- Replace Process free-text owner/Department with required Process Owner and Owning Department relationships. Replace Asset free-text owners/Department with required Business Owner, ICT Owner, and Owning Department relationships. Preserve Vendor Outsourcing Owner. Add required Threat Steward.
- Any active User is eligible for non-Threat responsibility. The same User may hold both Asset roles. Threat Steward must be an active CISO. Backend validation is authoritative.
- Process Owner or Asset Business Owner fills an empty Owning Department from the User's Department but never overwrites it. Department remains independently editable and active; owners may belong elsewhere.
- Assignment grants record-specific read/edit outside ordinary Department scope, but not general register or linked-record access. Department Heads receive Department-scoped Process/Asset access based on Owning Department.
- Extend orphan governance to all new responsibility relationships. Deactivation and CISO-role loss preserve former assignee evidence, mark the responsibility orphaned/ineligible, prevent new selection, and require explicit atomic reassignment.
- Add least-privilege CISO: full Threat lifecycle/link management; read Risks, Controls, Issues, Processes, Assets, Vendors, Contracts, Departments, reports, ICT Committee, and history; no User/platform admin, approvals, or broad other-register writes.
- Add a distinct CISO demo User and render ten flat persona cards in a five-by-two desktop grid with responsive reflow and visible role/Department context.
- Store controlled values as canonical codes. Localize at presentation, map source/workbook terms on import, and map mandated terms on regulatory export. Never translate User free text.
- Treat ownership and labels as a pre-release clean reset. Add necessary forward-only schema migrations, but do not map/preserve legacy owner strings, dual-write, or retain legacy-label fallbacks. Rebuild demo/E2E data.
- Protection thresholds are Process CIF Yes; Asset CIF Yes or resulting Criticality Critical; Vendor tier Critical or Significant. Evaluate current and proposed state.
- Protected approval covers creation, every business-data update, relationship add/remove, and archive. Comments/evidence/activity bypass. Restore is privileged direct.
- Every responsibility or Process/Asset Owning Department change uses the accountability scenario even when non-protected and changes atomically.
- Extend approval resource/action contracts for Process, Asset, Vendor, creation, edit, relationship mutation, archive, and reassignment. Pending creation uses proposal identity without creating an operational record.
- Allow one pending business mutation per impacted record. Existing approved state remains effective. Requester may cancel. Pending creation is visible only to requester/approvers and absent from operational queries.
- Review stores immutable scenario/base-version/before-after/relationship/derived-impact data and shows only readable labels/values. Request and rejection reasons are mandatory.
- One configured Risk Manager or CRO who is not the requester must approve. Neither role bypasses its own request; submission fails when no independent approver exists.
- Revalidate authorization, scenario, eligibility, references, versions, protection, and derivation impact at decision time. Invalid/stale requests expire without mutation.
- Cascade-changing mutations create one Composite approval, lock primary and affected resources, and apply atomically in one service-owned transaction. Partial application is forbidden.
- Approval state is separate from lifecycle. Existing rows show Pending change; details show a banner/diff. Pending creation is non-operational.
- Add four fixed Risk Hub scenarios: protected Process, protected Asset, protected Vendor, and accountability reassignment. Defaults enabled; CRO may toggle and select Risk Manager/CRO/both. Thresholds, covered actions, and no-self rule are fixed. Demo/E2E enables all four with both roles.
- Add two default-on per-User notification preferences: requests requiring my action, and updates to my requests. Preferences suppress event notifications only, never queues or unread-work counts.
- Do not add approval SLA, due dates, reminders, overdue status, automatic decisions, or timer-driven escalation.
- Department detail adds Overview, Risks, Controls, KRIs, Issues, Processes, Assets, Vendors, Users, Activity. Threat stays global. Overview has eight four-by-two clickable health cards and full-width Recent Activity.
- Process, Asset, and Threat forms/details adopt established RiskHub primitives and state treatment while retaining domain-appropriate grouping.
- Backend per-row capabilities are authoritative for read/edit/archive/restore/link/request/cancel/approve/reject. Frontend mirrors them.
- Audit every mutation, approval transition, reassignment, stale expiry, scenario change, and orphan event with safe business identifiers.
- Update canonical product/domain, authorization, testing, E2E/demo, ICT Register, navigation, and screenshot documentation. Add Process/Asset/Threat English and Czech manuals and update related User/admin manuals in both languages.

## Testing Decisions

- Test observable behavior at the highest stable seam, not private implementation. Approved seams are backend HTTP/service-owned transactions, the pure derivation engine for cascade impact, the shared frontend register shell/query state, and cross-role browser workflows.
- Backend collection tests cover all eight configurations: filter algebra, search, grouping, sorting, pagination, URL-equivalent parsing, archive, locked Department scope, scoped facets, remote lookup resolution, and non-leakage.
- Export tests prove full filtered output, pagination independence, permission parity, codes/localized labels, and RoI separation.
- Ownership tests prove required relationships, active eligibility, CISO-only Threat Steward, same-User Asset roles, empty-only Department fill, cross-Department assignment, record-specific access, safe linked summaries, and Department Head scope.
- Orphan tests prove deactivation/role loss preserve evidence, remove eligibility, surface governance status, and require approved atomic reassignment.
- RBAC tests prove exact CISO least privilege and owner/Department Head/Risk Manager/CRO/unrelated-User row capabilities. Authorization contract validation and frontend authz invariants are gates.
- Approval tests cover threshold boundaries, current/proposed evaluation, every action, always-governed reassignment, no-self, missing approver, cancellation, rejection reason, immutable scenario snapshots, and disabled-scenario behavior.
- Postgres concurrency/transaction tests prove one pending request per impacted record, Composite locks, version/reference/authorization revalidation, stale expiry, and no partial application.
- Derivation characterization proves Process changes propagate to Asset/Vendor protection and Contract/Sub-outsourcing/link changes produce correct Vendor impacts and review diffs.
- Pending-state tests prove lifecycle separation, effective approved state, permission-scoped proposed values, and pending-creation exclusion from lists/facets/counts/cards/exports/links.
- Settings tests prove four fixed scenarios, defaults, CRO authority, allowed role subsets, immutable thresholds/scope/no-self, and audit.
- Notification tests prove both categories/events/defaults, preference suppression, safe routing, retained queues/unread work, and absence of timers.
- Shared frontend tests cover configuration, visible/addable controls, chips/Clear all, groups, page reset, sort, URL restoration/back-forward, facets/pickers, export, pending badges, and async/access/empty states. Per-register tests assert only domain configuration and rendering.
- Department tests prove ten tabs, locked canonical selection, eight health cards/links, responsive four-by-two layout, full-width activity, owner/Department independence, and Threat exclusion.
- Form/detail tests cover relational payloads, eligibility, localization, auto-fill, required/accessibility feedback, pending lock, safe links, and established primitives.
- Demo tests prove ten personas, desktop/responsive layout, CISO context/login, and both supported demo origins.
- Localization tests prove no mixed controlled labels, code round-trip in both locales, import mapping, and distinct standard/regulatory export mapping.
- E2E covers CISO stewardship; Process/Asset/Vendor ownership; protected create/edit/link/archive; reassignment; no-self; Composite cascade; pending UX; notification settings; Department drill-down; export; and representative filters across all eight registers.
- Visual/accessibility verification covers list/form/detail/Department/approval/notification/demo surfaces at desktop and responsive widths, including filtered, validation, dialog, grouped, pending, empty, and error states.
- Documentation verification covers canonical reachability, bilingual parity, navigation/screenshots, business/authz synchronization, and demo/setup truth.
- Required gates: backend virtual-environment suite, targeted Postgres tests, frontend tests, TypeScript, i18n, authz contract validator, architecture locks, Playwright, docs topology/structure, visual checks, and diff hygiene.
- Prior art: existing Risk/Vendor listing/group tests, approval and stale-context suites, notification preference/visibility tests, User lookup/Department scope tests, authz invariant, derivation characterization, demo E2E, and documentation-tree audit.

## Out of Scope

- Co-owners, additional participants, contributors, watchers, or collaboration roles.
- Owner-data migration, legacy free-text preservation, dual-write, or reconciliation UI.
- Runtime legacy Czech-label fallback or automatic translation of User free text.
- Threat Department ownership or a Threat Department tab.
- CISO User/platform administration, approval authority, or broad non-Threat writes.
- Approval SLA, due dates, reminders, overdue states, automatic decisions, or time escalation.
- Configurable protection thresholds, covered action categories, or requester/approver separation.
- Partial approval/application of cascade consequences.
- A new RoI submission format; only terminology adapters remain consistent.
- Reworking existing derivation formulas, DQ rules, Contract/Sub-outsourcing domain, or regulatory mapping except for governed impact.
- Unrelated application redesign, saved named filters, bulk mutations, or analytics beyond specified Department cards/grouping.
- Production migration of pre-release demo records; schema migration remains required, dataset is rebuilt.

## Further Notes

- Target the existing dora worktree and preserve unrelated uncommitted changes. Do not switch to main or create another branch without explicit maintainer direction.
- This follows original ICT Register issue #38. It extends the delivered register rather than redefining its derivation model.
- The DORA UX remediation epic and form/table tickets remain prior art. Ticket generation must reference live dependencies and avoid duplicating accessibility work; their form scope excluded new product fields, so ownership/governance additions belong here.
- Shared understanding was confirmed after grilling on 2026-07-15. Material discoveries that change a locked decision must return to product review rather than being silently decided in code.
- After publishing, use to-tickets to create tracer-bullet issues with blocking edges, then implement each unblocked issue in a fresh context.
