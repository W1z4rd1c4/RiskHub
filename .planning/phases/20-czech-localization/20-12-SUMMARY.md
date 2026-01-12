# Phase 20-12 Summary: Core Form Placeholder Localization

## Completed
- [x] Wire RiskForm.tsx placeholders (7)
- [x] Wire ControlForm.tsx placeholders (14)
- [x] Add `form.placeholders` namespace to risks.json
- [x] Add `form.placeholders` namespace to controls.json

## Files Modified
| File | Changes |
|------|---------|
| `RiskForm.tsx` | Added `useTranslation('risks')`, wired 7 placeholders |
| `ControlForm.tsx` | Added `useTranslation('controls')`, wired 14 placeholders |
| `cs/risks.json` | Added `form.placeholders` namespace |
| `en/risks.json` | Added `form.placeholders` namespace |
| `cs/controls.json` | Added `form.placeholders` namespace |
| `en/controls.json` | Added `form.placeholders` namespace |

## Verification
- `npm run build` passes
- Placeholders render correctly in both en/cs locales

## Next Steps
Continue to Phase 20-13 for filter components.
