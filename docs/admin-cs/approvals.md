---
title: Observabilita schvalovacího workflow pro adminy
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "workflow status model a activity log"
summary: "Provozní příručka pro diagnostiku problémů ve frontě schvalování, transition anomálií a eskalačních blokací."
tags:
  - approvals
  - observability
  - workflow
---

# Observabilita schvalovacího workflow pro adminy

## Přehled

Admin role zajišťuje spolehlivost workflow a auditovatelnost. Neřeší business obsah rozhodnutí, pokud není explicitně delegováno.

## Co monitorovat

- rostoucí pending queue bez trendu uzavírání
- opakované chyby transition
- anomálie self-approval eskalace
- chybějící notifikační nebo auditní události

## Triage postup

1. Zachyťte request ID a aktuální stav.
2. Načtěte transition historii.
3. Ověřte stav identit žadatele/schvalovatele.
4. Ověřte permission kontext akce.
5. Určete, zda jde o technický, policy nebo data-quality problém.

## Technický vs policy incident

- **Technický problém**: neplatný transition, chybějící log, mismatch API autorizace
- **Policy problém**: neshoda schvalovatele, business konflikt

Policy konflikty eskalujte business ownerovi.

## Evidence balíček pro eskalaci

- request ID
- časová osa stavů
- relevantní actor ID
- endpoint akce
- log výstupy s časem

## Preventivní provozní rutina

Pro stabilní workflow kontrolujte frontu schvalování průběžně, ne až při incidentu. Sledujte zejména neobvyklé nárůsty pending požadavků, opakované zamítnuté přechody a změny v latenci rozhodování. Včasná detekce trendů výrazně snižuje počet kritických eskalací.

## Troubleshooting

### Request je zamrzlý v pending

Ověřte dostupnost approvera, eskalační pravidla a failed transition pokusy.

### Rozhodnutí vrací nečekané denial

Ověřte endpoint-level permission a visibility scope.

### Chybí log záznam přechodu

Prověřte stav logging pipeline a korelaci přes request ID.

## Related Documentation

- `./reports.md`
- `./riskhub-config.md`
