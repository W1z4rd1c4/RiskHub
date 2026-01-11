# Summary: Risk, Control, and KRI Page Translation

## Overview
Extracted hardcoded English strings from Risk, Control, and KRI management pages and replaced with translation keys. Completed Czech translations for all risk management domain terminology.

## Completed Tasks

### 1. ✅ Risk Pages Translation
- `RisksPage.tsx`: Page title, subtitle, "New Risk" button, search placeholder, status/type filter labels, column headers (Name, Category, Description, Type, Gross, Net, Status, Controls, KRIs), error messages, empty states
- Translation keys: `risks.title`, `risks.page_subtitle`, `risks.new_risk`, `risks.filters.*`, `risks.columns.*`, `risks.errors.*`, `risks.empty_state.*`

### 2. ✅ Control Pages Translation
- `ControlsPage.tsx`: Page title, subtitle, "New Control" button, search placeholder, status filter labels, column headers (Name, Department, Frequency, Risk Level, Status), error messages, empty states
- Translation keys: `controls.title`, `controls.page_subtitle`, `controls.new_control`, `controls.filters.*`, `controls.columns.*`, `controls.errors.*`, `controls.empty_state.*`

### 3. ✅ KRI Pages Translation
- `KRIsPage.tsx`: Page title ("Risk Appetite"), subtitle, "New KRI" button, search placeholder, status filter buttons (All, Within, Breach, Overdue), column headers (Metric, Value, Limits, Status, Risk, Description), empty states
- Translation keys: `kris.title`, `kris.page_subtitle`, `kris.new_kri`, `kris.filters.*`, `kris.columns.*`, `kris.empty_state.*`

### 4. ✅ Translation Files Updated

**English (en):**
| File | Keys Added |
|------|-----------|
| `risks.json` | `new_risk`, `filters.all_statuses/all_types/search_placeholder`, `errors.*`, `columns.*` |
| `controls.json` | `new_control`, `filters.all_statuses/search_placeholder`, `errors.*`, `columns.*` |
| `kris.json` | `new_kri`, `filters.all/within/breach/overdue/search_placeholder`, `columns.*` |

**Czech (cs):**
- All matching keys with proper ERM terminology
- Risk: "Registr rizik", "Nové riziko", "Hrubé/Čisté"
- Control: "Katalog kontrol", "Nová kontrola", "Úroveň rizika"
- KRI: "Rizikový apetit", "Nový KRI", "V limitu/Překročení"

## Files Modified

### Components Updated (3 files)
- `frontend/src/pages/RisksPage.tsx`
- `frontend/src/pages/ControlsPage.tsx`
- `frontend/src/pages/KRIsPage.tsx`

### Translation Files Updated (6 files)
- `frontend/src/i18n/locales/en/risks.json`
- `frontend/src/i18n/locales/en/controls.json`
- `frontend/src/i18n/locales/en/kris.json`
- `frontend/src/i18n/locales/cs/risks.json`
- `frontend/src/i18n/locales/cs/controls.json`
- `frontend/src/i18n/locales/cs/kris.json`

## Czech Terminology Applied

| English | Czech |
|---------|-------|
| Risk Register | Registr rizik |
| Control Catalog | Katalog kontrol |
| Risk Appetite | Rizikový apetit |
| Gross Score | Hrubé skóre |
| Net Score | Čisté skóre |
| Risk Level | Úroveň rizika |
| Within Limits | V limitu |
| Breach | Překročení |

## Verification
- ✅ `npm run build` passes with no TypeScript errors
- ✅ All three pages use useTranslation hook correctly
- ✅ Translation keys exist in both EN and CS files
- ✅ Dynamic filter labels work correctly (e.g., `t(\`filters.\${opt}\`)`)

## Not Completed (Deferred)
- Risk/Control/KRI Detail pages (separate plan)
- Risk/Control/KRI Form components (separate plan)
- LinkManagementDialog translation

---
*Completed: 2026-01-11*
