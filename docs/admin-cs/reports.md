---
title: Provozní reporty a důkazní exporty
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "report/export endpointy a audit log"
summary: "Runbook pro bezpečné generování provozních exportů pro incident response, kontrolní přezkum a governance evidence."
tags:
  - reports
  - exports
  - audit
---

# Provozní reporty a důkazní exporty

## Přehled

Tato příručka popisuje, jak získat provozní důkazy bez narušení auditní dohledatelnosti.

## Použití exportů

- rekonstrukce incident timeline
- důkazní materiály ke změnám přístupů
- analýza workflow anomálií
- snapshoty provozního stavu systému

## Safe export workflow

1. Definujte přesnou otázku, kterou má export zodpovědět.
2. Zvolte minimální dataset a období.
3. Vygenerujte export standardní cestou.
4. Ověřte scope a úplnost.
5. Uložte/sdílejte jen v schváleném kanálu.

## Pravidla integrity dat

- nikdy needitujte originál před archivací
- zachovejte timestamp a filter kontext
- při předání vždy připojte krátké vysvětlení
- pokud kombinujete více exportů, přidejte manifest se scope a časy generování

## Časté chyby

- příliš široký export “pro jistotu”
- ztráta filtračního kontextu při handoffu
- míchání více exportů bez provenance označení
- sdílení exportu bez vysvětlení účelu a rozhodovací otázky

## Předání exportu dalším týmům

Při předání mimo admin provoz připojte krátké shrnutí: jaká otázka se řeší, jaký je časový rozsah dat, které filtry byly použity a jaké limity interpretace platí. Příjemce tak nebude dělat závěry mimo platný kontext exportu.

## Troubleshooting

### Export neobsahuje očekávané záznamy

Nejprve zkontrolujte autorizační scope a filtry.

### Velký export timeoutuje

Rozdělte export podle období nebo subsetu entit.

### Reporty mají konfliktní čísla

Ověřte stejný as-of kontext a archived režim.

## Related Documentation

- `./approvals.md`
- `./departments.md`
- `./user-management.md`
