---
title: Správa lifecycle oddělení
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §2.4 a §3"
summary: "Runbook pro zakládání, úpravy a deaktivaci oddělení se zachováním visibility integrity a continuity ownership."
tags:
  - departments
  - structure
  - governance
---

# Správa lifecycle oddělení

## Přehled

Oddělení jsou strukturální bezpečnostní hranice v RiskHub. Změny oddělení přímo ovlivňují viditelnost a fallback schvalování.

## Standard zakládání a úprav

Každý záznam oddělení má mít:

- konzistentní název
- správnou manager vazbu
- validní aktivní stav a hierarchii

## Runbook deaktivace

1. Zmapujte dotčené uživatele a entity.
2. Vyřešte ownership vazby.
3. Ověřte, že aktivní workflow není navázané na staré mapování.
4. Deaktivujte oddělení.
5. Ověřte post-change visibility.

## Kontinuita ownership

Změny oddělení nesmí vytvořit skryté orphan stavy:

- owner rizik musí být resolvable
- owner kontrol musí být akčně dostupný
- KRI reporting odpovědnost musí zůstat přiřazená

## Hierarchie a reporting dopady

Při změně hierarchie ověřte:

- změnu agregací v dashboardu/reportech
- dopad na manager-based visibility
- potřebu poznámky pro historické srovnání

Po změně uzavřete ticket až po potvrzení post-change stavu. Doporučené minimum je záznam data, rozsahu změny a očekávaného dopadu na metriky. Tento krok pomáhá odlišit legitimní strukturální změnu od skutečné produkční regrese.

## Troubleshooting

### Oddělení nelze bezpečně deaktivovat

Nejčastěji nevyřešené ownership vazby nebo aktivní workflow závislosti.

### Uživatelé po restrukturalizaci ztratili viditelnost

Ověřte department assignment + scope + manager chain.

### Nečekaný cross-department access

Prověřte ownership výjimky a inheritance mezi navázanými entitami.

## Related Documentation

- `./user-management.md`
- `./reports.md`
