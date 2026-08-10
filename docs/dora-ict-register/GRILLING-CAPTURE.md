# ICT Register — grilling capture

_grill-with-docs session, 2026-07-09. Shared understanding reached. This is a capture of
what was decided and what is still open — **not** an implementation plan (per the request:
"dont build the plan yet, just capture everything we discussed"). Domain vocabulary lives
in the root [CONTEXT.md](../../CONTEXT.md)._

## What we're building (destination — locked)

RiskHub becomes the **in-app system of record** for the ICT operational-resilience register —
Processes (L0/L1/L2), Assets, ICT providers, Contracts & Sub-outsourcing, Threats & Risks —
with every value the workbook derives (criticality class, CIF support, RoI field codes)
computed **in-app**, surfaced through RiskHub's UI and culminating in a **CRO / Risk-Committee
page**. The Excel workbook's behaviour is fully reproduced; the workbook is retired as the
source of truth. The regulator RoI **submission file is out of scope**.

## Decisions (locked)

1. **System of record** — RiskHub, in-app. Workbook retired as SoR.
2. **Context** — RiskHubOSS is the current **production** app (not an OSS/slim cut). The
   previous "advanced vendor" domain (13 tables: contracts, SLAs, dependencies, fourth-party
   relationships, services…) shipped in Phase 18 (complete 2026-01-26) then was removed
   wholesale (migration `u1v2w3x4y5z6`, 2026-03-08) **because the user disliked its UI +
   functionality**, to be rebuilt properly. `_reserved_modules.toml` reserves
   `vendor_contracts:*` "until DORA vendor contract governance ships" — so this rebuild is
   sanctioned. Bar: **don't repeat the old implementation's mistakes.**
3. **Entity map & placement**
   - **Processes** — new entity + page.
   - **Assets** — new entity + page.
   - **Threats** — new entity + page (own page, *not* inside Risk).
   - **Vendors** — reuse existing `Vendor`; **Contracts** and **Sub-outsourcing** live *within*
     Vendor (not standalone pages).
   - **Risks** — reuse existing `Risk`; ICT risks are linked in, not a second register.
   - **Links** — first-class typed relations: Process↔Asset, Asset↔Asset, Asset↔Vendor,
     Process↔Vendor.
4. **Behaviour = the workbook, exactly.** The extracted functional spec is the source of
   truth. Confirmed key rule: criticality/CIF is **derived-only** and cascades by **MAX**
   (criticality rank) and **any-true / OR** (CIF); vendor tier is computed from CIF support,
   `h_rank` (MAXIFS over linked assets), substitutability, and S17–S19 service presence.
   Follow faithfully; flag only outright bugs.
5. **Excel generation** stays out of scope — no `.xlsx` emission (respects the repo's
   test-locked "no Excel export" security policy). The submission file, if ever needed, is a
   separate future effort.
6. **Code placement** (delegated to Claude) — extend the `_vendor_governance` context for the
   vendor side (fills the reserved `vendor_contracts` surface); introduce new packages for
   Process/Asset/Threat classified per ADR-007 Amendment 1 (no new top-level context).
   Forward-only migrations (ADR-010), DomainError taxonomy (ADR-003), ArchivableMixin
   (ADR-005), capability contract + catalog, architecture-lock TOMLs kept in sync.
7. **Frontend** — super-nice, in RiskHub's design language (React 19 + Vite + React Router v7
   + TanStack Query + Tailwind + i18next). New pages for Processes/Assets/Threats; Vendor gains
   Contracts/Sub-outsourcing tabs; culminates in the ICT Risk Committee page reproducing the
   workbook's Dashboard + CRO-overview.
8. **Build** — **one consolidated plan, all at once**; internal sequencing delegated to Claude
   (models + extensions + link tables together via forward-only migrations → derivation engine
   as the deep module → pages, wired back-to-front so the committee page opens onto real data).
9. **Working rule** — the workbook is the **base spec**; extract behaviour from it (via agents),
   never ask the user to re-decide functionality it defines; keep questions atomic.

## Open questions (to resolve before / during the plan)

- **Module name** — provisional "ICT Register"; reconfirm after the RoI legal review (Register
  of Information is the *legal report* term, not a module label).
- ~~**RoI legal cross-check**~~ — **resolved 2026-07-09** (see *Resolved since capture* below).
  Legal basis, the 15 RoI templates, the S01–S19 taxonomy and the four join keys are confirmed and
  reconcile with the workbook. Still to design in the plan: the committee "RoI-readiness" element and
  a full field-completeness check against the templates.
- **Replicate quirks vs fix** — the workbook has quirks (a "Významný dodavatel" tier unreachable
  under the shipped data; a subcontract chain the display caps at 2 tiers while the math recurses
  deeper; documentary-only materiality thresholds). Default: follow faithfully; decide per item
  when hit.
- **Derivation timing** — compute-on-read vs materialized-on-write (Claude's call; set in plan).
- **Authorization** — who *maintains* the register vs who *views* the committee page
  (CRO/Risk-Committee gating) — Claude's call; set in plan.

## Resolved since capture (RoI legal review, 2026-07-09)

- **Legal basis (confirmed).** DORA Reg. (EU) 2022/2554, **Art. 28(3)** obliges the register at
  entity / sub-consolidated / consolidated level. Templates come from **Commission Implementing Reg.
  (EU) 2024/2956** (adopted 29 Nov 2024, OJ 2 Dec 2024, in force 22 Dec 2024; corrigendum 19 Sept 2025
  renumbered some Annex I field codes). DORA applies from 17 Jan 2025. ICT **subcontracting** is a
  *separate* instrument — Delegated Reg. (EU) 2025/532, from Art. 30(5), not Art. 28.
- **The 15 RoI templates.** B_01.01 entity maintaining register · B_01.02 group entities · B_01.03
  branches · B_02.01 arrangements (general) · B_02.02 arrangements (specific — the main join) ·
  B_02.03 intra-group arrangements · B_03.01/02/03 signatories · B_04.01 consuming entities ·
  B_05.01 provider master data · B_05.02 supply chain / subcontracting (rank; rank 1 = direct) ·
  B_06.01 functions + critical/important flag · B_07.01 criticality / substitutability assessment ·
  B_99.01 glossary.
- **Relational model (ITS Recital 8).** Four join keys: contract reference number, entity/provider
  identifier (LEI/EUID), function identifier, ICT-service-type code. Shape: entity → (signatories) →
  contract → provider (→ subcontract chain) → service (S01–S19) → function (critical/important);
  B_07.01 assesses the service↔function↔provider dependency where critical.
- **Reconciliation with our base.** This matches the workbook (whose own crosswalk cites ITS 2024/2956
  + RTS 2025/532 and uses S01–S19) and our entity map (Vendors + Contracts + Sub-outsourcing;
  Processes-as-functions; Assets; typed links). ✅
- **Caveats before hard-coding.** The research could not parse the primary EUR-Lex / ESMA PDFs
  (returned binary), so template/taxonomy detail rests on strong secondary triangulation, not verbatim
  primary text. One source said "18" service codes (probable miscount vs S01–S19). The corrigendum
  **shifted B_06.01 field codes (−10)** — re-check against the primary annex before implementing any
  RoI-coded output. We build to the **workbook** (the base), so these are cross-check caveats, not
  blockers — but verify against primary annexes before emitting RoI codes.

## Reference material

- **Workbook functional spec (extracted, ~10.7k words):**
  [dora-excel-functional-spec.md](dora-excel-functional-spec.md) — the definitive reproduction
  spec (fields, derived-vs-entered, exact formulas, DQ rules).
- **RoI legal spec:**
  [dora-register-of-information-legal-spec.md](dora-register-of-information-legal-spec.md) — the
  confirmed legal reference (instruments, 15 templates, S01–S19, join keys, caveats).
- **Source workbook:**
  `<external-workbook-export>/DORA_registr_aktiv_a_dodavatelu.xlsx`
  + its `builder/`.
- **Field counts (scale):** Processes 34 · Assets 60 · Vendors 78 · Risks 41 · Contracts 25 ·
  Sub-outsourcing 17 · Threats 7 · + link sheets.
- **Governing ADRs:** 007 (bounded-context taxonomy), 001 (capabilities), 002 (service-owned
  transactions), 003 (domain-exception taxonomy), 005 (archivable mixin), 009 (reserved
  surfaces), 010 (forward-only migrations); capability contract under `docs/security/`.
- **Existing DORA surface:** `GET /vendor-reports/dora-register` (CSV) →
  `_vendor_governance/reports.py::dora_register_rows`; `Vendor` already carries `dora_relevant`,
  `vendor_type: ict`, etc.

## Next step (when ready — not now)

Turn this into one consolidated spec via `/to-spec`, then `/to-tickets` → build. Nothing is
built until that plan is approved.
