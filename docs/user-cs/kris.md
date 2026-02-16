---
title: Klíčové indikátory rizik (KRI)
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.3, §5"
summary: "Provozní příručka pro zadávání KRI hodnot, práci s limity, breach scénáře a historické korekce."
tags:
  - kri
  - thresholds
  - reporting
---

# Klíčové indikátory rizik (KRI)

## Přehled

KRI poskytují měřitelný včasný signál rizikové expozice navázané na rizika.

Hlavní route: `/kris`

## Hlavní odpovědnosti

- údržba KRI definic a ownership
- pravidelné zadávání hodnot
- monitoring breach/overdue stavů
- řízené korekce historických hodnot

## Workflow zadání hodnoty

1. Otevřete `/kris` a filtrujte relevantní indikátory.
2. Otevřete detail a ověřte periodu.
3. Zadejte hodnotu s kontextem.
4. Uložte a ověřte timestamp.
5. Zkontrolujte breach/overdue notifikace.

## Reporting owner a fallback

- reporting owner je primární zadavatel
- při chybějícím reporting owner se použije fallback logika podle linked risk ownera
- department kontext se dědí z linked risk

## Práce s breach eskalací

Při překročení limitu:

- nejdříve ověřte správnost hodnoty
- zdokumentujte business důvod odchylky
- sledujte navazující remediation kroky
- hlídejte eskalační stav ve workflow

## Historické korekce

Korekce jsou governance-citlivé:

- vysvětlete důvod korekce
- zachovejte old/new kontext
- připojte důkazní zdroj

Nikdy nepřepisujte historii bez stopy.

## Troubleshooting

### Nelze zadat hodnotu KRI

Ověřte permission a ownership kontext linked risk řetězce.

### KRI má nečekaný department kontext

KRIs dědí kontext z linked risk.

### Breach alert nevypadá správně

Ověřte limity, jednotku metriky a přesnost vstupní hodnoty.

## Related Documentation

- `./risks.md`
- `./notifications.md`
- `./dashboard.md`
- `./faq.md`
