# 16-03 — Reporting (export + Risk detail “Assessment Summary”)

## Risk detail “Assessment Summary”

On the Risk Assessment tab:

- Finds the latest submitted questionnaire for the risk.
- Loads detail with `include_previous=true` to compute:
  - submitted date
  - v2 likelihood (1–5) and worst-case impact (1–5) from answers
  - CZK range for worst-case impact using `useTotalAssetsValue()` + `formatFinancialRange(...)`
  - optional “changed vs last cycle” count (compares only keys in the active template question set).
