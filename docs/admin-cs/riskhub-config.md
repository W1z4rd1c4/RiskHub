---
title: Hranice konfigurace Risk Hub a model podpory
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "role model a kontrakty přístupu Risk Hub"
summary: "Vymezení odpovědností platformního admina při podpoře konfigurace Risk Hub oproti business vlastníkům."
tags:
  - configuration
  - boundaries
  - support
---

# Hranice konfigurace Risk Hub a model podpory

## Přehled

Konfigurace Risk Hub je business-governance agenda. Platformní admin zajišťuje technickou dostupnost a provozní podporu, nikoliv obsahové rozhodnutí.

## Co je ve scope admina

Admin odpovídá za:

- funkčnost přístupových cest
- dostupnost endpointů a auth integritu
- auditovatelnost konfiguračních akcí
- triage incidentů při selhání konfigurace

Admin neodpovídá za business hodnoty thresholdů nebo policy semantiku.

## Support workflow pro incident konfigurace

1. Ověřte roli a scope dotčeného účtu.
2. Ověřte, zda denial není očekávaný podle kontraktu.
3. Zkontrolujte API health/logy na technické chyby.
4. Připravte evidence balíček.
5. Pokud jde o policy problém, předejte business ownerovi.

## Příklady hranic

- "Konfigurační obrazovka nejde otevřít" -> technický support admina.
- "Threshold má být 15 místo 20" -> business owner rozhodnutí.
- "Uložení konfigurační změny padá" -> admin řeší auth/validaci/endpoint.

## Evidence checklist

- identita účtu a role
- request path a kategorie payloadu
- timestamp + request ID
- relevantní logy
- očekávané vs skutečné chování

## Troubleshooting

### Endpoint funguje jednomu účtu, jinému ne

Nejprve ověřte role kontrakt; rozdíl může být záměrný.

### Obrazovka se načte, ale uložení selže

Ověřte permission path, validitu payloadu a backend response.

### Business owner požaduje admin override

Použijte schválenou governance cestu. Nerealizujte neřízené override mimo policy.

## Related Documentation

- `./user-management.md`
- `./approvals.md`
- `./reports.md`
