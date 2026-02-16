---
title: Dashboard a reporty
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "dashboard/report endpointy"
summary: "Příručka pro interpretaci dashboard metrik, správnou práci s filtry a bezpečné sdílení exportů."
tags:
  - dashboard
  - reports
  - exports
---

# Dashboard a reporty

## Přehled

Dashboard je hlavní operační panel pro sledování trendů, priorit a okamžitých signálů.

Hlavní route:

- dashboard: `/`
- exporty entit: na list page (`/risks`, `/controls`, `/kris`, `/vendors`)

## Co sledovat jako první

Při startu session prioritizujte:

- trend změn u prioritních rizik
- overdue signály u kontrol/KRI
- zatížení workflow fronty
- koncentraci rizikových oblastí

## Disciplína filtrů

Před sdílením metrik:

1. Ověřte aktivní filtry.
2. Ověřte časový kontext.
3. Ověřte cílovou skupinu reportu.

Chybná interpretace metrik je často způsobená filtry.

## Best practices exportu

- exportujte jen potřebná data
- vždy připojte kontext filtru a období
- archivujte originální export
- neupravujte export způsobem, který ztrácí auditní stopu

## Jak číst náhlé trend změny

Při náhlé změně:

- ověřte změny ownership/department mapování
- ověřte úplnost vstupních dat
- ověřte vliv archivovaných/obnovených entit

Pokud trendová změna ovlivňuje rozhodnutí vedení, přiložte krátké vysvětlení: jaké filtry byly použity, jaké období je porovnáváno a zda došlo ke strukturálním změnám v datech. Bez tohoto kontextu může být závěr zavádějící.

## Troubleshooting

### Čísla nesedí s očekáváním

Zkontrolujte filtry, as-of kontext a archived režim.

### Export je nekompletní

Exporty jsou scope-aware. Ověřte autorizaci a filtry.

### Dashboard je prázdný

Ověřte správný účet/prostředí a přidělený scope.

## Related Documentation

- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./vendors.md`
