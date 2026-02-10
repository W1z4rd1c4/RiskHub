# Zprávy a exporty

> **Cílová skupina**: CRO, Risk Manager, Compliance, vedoucí oddělení

## Přehled

RiskHub používá pro reporting pouze formáty **Excel** a **CSV**.

Hlavní pravidla:
- Export je vždy omezený oprávněními uživatele.
- Seznamové exporty (Rizika, Kontroly, KRI, Dodavatelé) používají jednotné exportní okno.
- Souhrn dashboardu a auditní stopa jsou pouze v Excelu.
- Roční report dodavatelů a DORA registr jsou pouze v Excelu.

## Kde se exportuje

### Seznamové stránky (Rizika, Kontroly, KRI, Dodavatelé)

1. Otevřete stránku seznamu.
2. Nastavte filtry (stav, hledání, typ...).
3. Klikněte na **Export**.
4. Zvolte **Excel (.xlsx)** nebo **CSV (.csv)**.
5. Nastavte **Stav k datu**.
6. Export se stáhne.

Unified endpointy:
- `/api/v1/reports/risks/export`
- `/api/v1/reports/controls/export`
- `/api/v1/reports/kris/export`
- `/api/v1/reports/vendors/export`

Povinný parametr:
- `format=xlsx|csv`

Volitelné parametry:
- `as_of_date=YYYY-MM-DD`
- filtry stránky (`status`, `search` atd.)

### Souhrn dashboardu

- Endpoint: `/api/v1/reports/summary/excel`
- Formát: pouze Excel
- Scope: stejný jako data dashboardu

### Auditní stopa

- Endpoint: `/api/v1/reports/audit-trail/excel`
- Formát: pouze Excel
- Scope: stejný jako auditní zobrazení

### Reporty dodavatelů

- Roční report: `/api/v1/vendor-reports/annual?year=YYYY&format=xlsx`
- DORA registr: `/api/v1/vendor-reports/dora-register?format=xlsx`

## Přístupová práva

Export respektuje backend RBAC:
- Neprivilegovaní uživatelé vidí pouze vlastní scope.
- Privilegovaní uživatelé mohou exportovat napříč povoleným scope.
- Výjimky pro ownership/reporting-owner se chovají stejně jako v UI.

## Provozní poznámky

- Export je snapshot podle zvoleného `as_of_date` (kde je podporováno).
- Archivované/neaktivní položky se řídí stavovým filtrem.
- CSV je vhodné pro integrace, Excel pro analýzu a reporting.

## Řešení problémů

### Prázdný export

Zkontrolujte:
1. Filtry nejsou příliš omezující.
2. Máte přístup k odpovídajícím datům.
3. `as_of_date` nevylučuje hledané záznamy.

### Odepřený export

- Ověřte oprávnění `reports:read`.
- Ověřte scope oddělení pro zadané filtry.

### Odmítnutý formát

- Podporované formáty pro seznamy jsou pouze `xlsx` a `csv`.
