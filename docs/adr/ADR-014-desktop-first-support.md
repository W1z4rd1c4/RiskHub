# ADR-014 Desktop-First Client Support Policy

## Status

Accepted

## Context

RiskHub is a data-dense GRC console — wide multi-column registers, committee heatmaps,
derived-value grids. The layout is desktop-oriented, and the sidebar is `hidden` below the
Tailwind `lg` breakpoint with no fallback, so below `lg` the app is currently unnavigable.

Building a responsive/reflowing shell (drawer nav, stacked forms, reflowed tables) so the app
stays fully usable below `lg` — and for desktop users who zoom, since browser zoom shrinks the
effective CSS viewport — is a real initiative in its own right. Weighed against that cost, the
product is desktop-only in practice: risk/compliance officers operate it at a desk on wide
screens.

## Decision

RiskHub is **desktop-only**: designed and supported at `lg` (1024px) and wider.

- We do **not** build a responsive/reflowing shell. (Deferred to a future mobile/zoom-support
  initiative if prioritized.)
- Below `lg` — whether from a narrow viewport or from zoom that drops the effective width below
  the `lg` equivalent — the app shows an **informational notice** with neutral copy: that the
  app is optimized for viewports 1024px and wider, with a path to support for an accessible
  alternative, replacing today's silently-broken layout. The notice must **not** instruct users
  to reduce zoom — that would ask a low-vision user to disable an accessibility aid.

**Accessibility consequence (stated honestly):** this leaves **SC 1.4.10 Reflow (AA)** and
**SC 1.4.4 Resize Text (AA)** unmet. Because WCAG conformance is asserted per full page and
cannot exclude an automatically-presented viewport variation
(<https://www.w3.org/TR/WCAG22/#cc2>), RiskHub **does not claim full WCAG 2.2 AA conformance**
while desktop-only stands. It targets AA on all other criteria ([ADR-013](./ADR-013-frontend-accessibility-standard.md));
these two are **documented, accepted deviations** — a deliberate product trade-off, not a
conformance statement.

## Alternatives Rejected

- **Reflow shell (nav drawer + stacked forms + scoped table scroll):** the conformance-clean
  option, but rejected for now as out-of-scope UI work. It is the path to close the 1.4.4 /
  1.4.10 exceptions when mobile/zoom support is prioritized.
- **Hard gate that blocks the app below `lg` with no acknowledgement:** rejected — it would
  silently fail AA for zooming desktop users and misrepresent conformance.
- **Claim "AA conformant at ≥ lg":** rejected — WCAG conformance cannot be scoped to exclude an
  automatically-presented viewport, so this is not a valid claim; it is a documented deviation.
- **Leave the silent breakage:** rejected — reads as a bug and gives no guidance.

## Consequences

- RiskHub's accessibility posture is "**targets WCAG 2.2 AA; two AA criteria (1.4.4, 1.4.10) are
  documented exceptions under desktop-only**" — not a full AA conformance claim.
- Only an advisory below-`lg` notice is built — minimal work; no drawer nav, no reflow.
- Dense tables/heatmaps still get horizontal-scroll containers at `≥ lg` (fixing the
  `overflow-hidden` clipping from the audit), but no narrow-viewport layout.

## Sources

- SC 1.4.10 Reflow (AA): <https://www.w3.org/WAI/WCAG22/Understanding/reflow>
- SC 1.4.4 Resize Text (AA): <https://www.w3.org/WAI/WCAG22/Understanding/resize-text>
- WCAG 2.2 conformance requirements: <https://www.w3.org/TR/WCAG22/#cc2>

## Rollback Strategy

Superseded by a mobile/zoom-support initiative that builds the reflow shell and closes the
1.4.10 / 1.4.4 exceptions; at that point RiskHub can make a full-viewport AA claim.
