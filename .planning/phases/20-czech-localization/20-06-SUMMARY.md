# Summary: PDF/Excel Report Translation

## Overview
Added internationalization support to PDF and Excel report generation. Reports now accept a `locale` parameter and use translated strings for titles, column headers, and labels.

## Completed Tasks

### 1. ✅ Report Translation Infrastructure
Created `backend/app/services/report_translations.py`:
- Comprehensive EN/CS translation dictionaries
- `get_report_translator(locale)` function for easy access
- Keys for risks, controls, KRIs, audit trail, and common terms

### 2. ✅ PDF Report Functions Updated
Added locale parameter and translations to:
- `generate_controls_pdf(controls, locale='en')`
- `generate_risks_pdf(risks, locale='en')` 
- `generate_audit_trail_pdf(executions, locale='en')`

Translated elements:
- Report titles (Registr rizik, Katalog kontrol, Auditní stopa)
- Column headers (Název, Oddělení, Stav, etc.)
- Summary labels (Celkem, Kritická rizika)
- "Generated on" timestamp label

## Files Created
- `backend/app/services/report_translations.py`

## Files Modified
- `backend/app/services/report_service.py`

## Key Translations Applied
| English | Czech |
|---------|-------|
| Control Inventory | Katalog kontrol |
| Risk Register | Registr rizik |
| Audit Trail | Auditní stopa |
| Generated on | Vygenerováno |
| Department | Oddělení |
| Status | Stav |
| Gross Score | Hrubé skóre |
| Net Score | Čisté skóre |

## Usage
```python
from app.services.report_service import generate_risks_pdf

# Generate in Czech
pdf_bytes = generate_risks_pdf(risks, locale='cs')
```

## Verification
- ✅ Report translations module imports correctly
- ✅ Czech translations return expected values

---
*Completed: 2026-01-11*
