# RiskHub Localization Guide

> **Version**: 1.0  
> **Last Updated**: 2026-01-11

This document describes the internationalization (i18n) system for RiskHub and provides guidelines for adding new translations.

---

## Overview

RiskHub supports multiple languages:
- **English** (`en`) - Default language
- **Czech** (`cs`) - Full support

The i18n system covers:
- Frontend UI components
- Backend API messages
- PDF/Excel report generation
- User and admin documentation

---

## Frontend i18n

### Technology Stack

- **react-i18next** - Translation hooks and components
- **i18next** - Core i18n library
- **i18next-browser-languagedetector** - Auto-detect user language

### Translation Files

Location: `frontend/src/i18n/locales/{lang}/`

```
locales/
├── en/
│   ├── common.json
│   ├── navigation.json
│   ├── risks.json
│   ├── controls.json
│   ├── kri.json
│   ├── dashboard.json
│   ├── approvals.json
│   └── ...
└── cs/
    ├── common.json
    ├── navigation.json
    └── ...
```

### Adding New Translations

1. Add key to English file: `locales/en/{namespace}.json`
2. Add corresponding Czech key: `locales/cs/{namespace}.json`
3. Use in component:

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('namespace');
  return <h1>{t('my.key')}</h1>;
}
```

### Key Naming Conventions

- Use dot notation for hierarchy: `section.subsection.key`
- Use lowercase with underscores: `error_message`, `button_label`
- Group by feature: `form.title`, `form.submit`, `form.cancel`

---

## Backend i18n

### Module Location

`backend/app/i18n/`

### Usage

```python
from app.i18n import t, get_translator

# Direct translation
message = t('errors.not_found', 'cs')  # "Nenalezeno"

# Translator function
tr = get_translator('cs')
tr('approvals.request_approved')  # "Žádost schválena"

# With interpolation
tr('validation.value_range', min=1, max=10)  # "Hodnota musí být mezi 1 a 10"
```

### Translation Files

- `backend/app/i18n/en.py` - English messages
- `backend/app/i18n/cs.py` - Czech messages

### Categories

- `errors.*` - HTTP error messages
- `validation.*` - Form validation messages
- `approvals.*` - Approval workflow messages
- `activity.*` - Activity log descriptions
- `notifications.*` - Push notifications

---

## Report Generation i18n

### Module

`backend/app/services/report_translations.py`

### Usage

```python
from app.services.report_service import generate_risks_pdf

# Generate in Czech
pdf_bytes = generate_risks_pdf(risks, locale='cs')
```

### Supported Reports

All PDF/Excel generators accept `locale` parameter:
- `generate_controls_pdf(controls, locale='en')`
- `generate_risks_pdf(risks, locale='en')`
- `generate_audit_trail_pdf(executions, locale='en')`

---

## Documentation i18n

### Structure

```
docs/
├── admin/      # English admin docs
├── admin-cs/   # Czech admin docs
├── user/       # English user docs
└── user-cs/    # Czech user docs
```

### Adding New Language

1. Create `docs/admin-{langcode}/` directory
2. Create `docs/user-{langcode}/` directory
3. Translate all markdown files
4. Maintain same file structure

---

## Adding a New Language

### Step 1: Frontend

1. Create `frontend/src/i18n/locales/{newlang}/` directory
2. Copy all JSON files from `en/`
3. Translate all values
4. Register in `frontend/src/i18n/index.ts`:

```typescript
import newlangCommon from './locales/newlang/common.json';
// ... import other namespaces

resources: {
  // ... existing
  newlang: {
    common: newlangCommon,
    // ... other namespaces
  }
}
```

### Step 2: Backend

1. Create `backend/app/i18n/{newlang}.py`
2. Copy structure from `en.py`
3. Translate all values
4. Register in `backend/app/i18n/__init__.py`:

```python
from .newlang import MESSAGES as NEWLANG_MESSAGES

SUPPORTED_LOCALES = {'en', 'cs', 'newlang'}

_MESSAGE_REGISTRY = {
    'en': EN_MESSAGES,
    'cs': CS_MESSAGES,
    'newlang': NEWLANG_MESSAGES,
}
```

### Step 3: Reports

1. Add messages to `backend/app/services/report_translations.py`
2. Create new dictionary `REPORT_STRINGS_NEWLANG`
3. Register in `_REPORT_TRANSLATIONS`

### Step 4: Documentation

1. Create `docs/admin-{newlang}/`
2. Create `docs/user-{newlang}/`
3. Translate all files

---

## Running Translation Audit

### Check for Missing Keys

```bash
# Compare en vs cs JSON files
cd frontend/src/i18n/locales
diff <(jq -r 'paths(scalars) | join(".")' en/common.json) \
     <(jq -r 'paths(scalars) | join(".")' cs/common.json)
```

### Verify No Untranslated Strings

1. Run the application in Czech: Set browser language to Czech
2. Check console for missing translation warnings
3. Review all pages for English text that should be translated

---

## Best Practices

1. **Never hardcode text** - All user-visible strings should use i18n
2. **Keep keys semantic** - `form.submit_button` not `button1`
3. **Group by feature** - Not by component
4. **Test both languages** - Verify layout doesn't break with longer text
5. **Use interpolation** - For dynamic values: `{count} items`

---

## Czech Terminology Reference

See `docs/GLOSSARY.md` for the definitive Czech ERM terminology mapping.

---

*For questions, contact the development team.*
