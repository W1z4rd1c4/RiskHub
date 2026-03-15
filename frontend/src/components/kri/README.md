# frontend/src/components/kri

## Purpose

UI components for `kri` area.

## Contents

- `KRIGaugeCard.tsx`
- `KRIHistoryEditModal.tsx`
- `KRIModal.tsx`
- `KRIValueModal.tsx`

## Notes

`KRIGaugeCard.tsx` renders backend-derived `monitoring_status`
(`new`, `not_submitted`, `breach`, `warning`, `optimal`) and accepts
any KRI-shaped view model that carries the display fields it needs.
It should not recompute reporting-health rules locally.

Keep this README updated when responsibilities or structure in this folder change.
