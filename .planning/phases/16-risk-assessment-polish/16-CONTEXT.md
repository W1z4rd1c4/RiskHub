# Phase 16: Risk Assessment Polish - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the Risk Assessment questionnaire operations (not a new questionnaire system):
- Add a minimal review mode for CRO/Risk Owner to compare answers vs last cycle and request clarifications.
- Add basic reminder scheduling for overdue questionnaires.
- Add reporting/export and a concise “Assessment Summary” block on the Risk detail page.

Template is assumed to be stable/single-template (no branching templates in this phase).
</domain>

<decisions>
## Implementation Decisions

### Review flow (minimal, compare to last cycle)
- Review lives in the existing questionnaire UI (no separate Review tab/page).
- Add a “Compare to last cycle” mode (intended default ON for CRO/Risk Owner).
- Show previous answers only when different, with a subtle “Changed” indication and light visual emphasis.
- Clarification is minimal:
  - one “Request clarification” action per section (not per-question threaded comments)
  - a single response message from Risk Owner (no multi-message chat)
  - does not reopen/modify submitted questionnaires in-place (history remains immutable).

### Questionnaire template updates (vNext)
- Add two new questions:
  1) Likelihood: assess likelihood the risk will materialize within the next 12 months.
  2) Worst-case financial loss: estimate maximum loss in a worst-case scenario.
- Answer types must reuse the existing Risk Register scales:
  - Likelihood uses the existing Probability scale (1–5).
  - Worst-case loss uses the existing Impact/Severity scale (1–5).

### Timeframe
- Likelihood timeframe is the next 12 months.

### Currency (current approach)
- Treat currency as CZK for now (matches existing financial-loss calculations based on total assets).
- Do not introduce organization base currency settings in this phase.

### Reminders (minimal)
- Recipients: Risk Owner only.
- Schedule: send 2 days before due date, then every Monday while overdue until submitted.

### the agent's Discretion
- Exact copy/text for “Compare to last cycle” and changed indicators.
- Exact data shown in “Assessment Summary” (keep it minimal).
- Whether reporting ships as PDF, Excel, or both (prefer the smallest viable set consistent with existing reporting infra; Excel is expected to be the minimal default).
</decisions>

<specifics>
## Specific Ideas

- Review should stay clean/minimal — no “comment bubbles everywhere”.
- Use existing probability/impact definitions (same as Risk creation).
</specifics>

<deferred>
## Deferred Ideas

- “Nudge” button.
- Quiet hours configuration.
- Per-question threaded comments.
- Multiple questionnaire templates / template selection.
</deferred>

---

*Phase: 16-risk-assessment-polish*
*Context gathered: 2026-01-24*
