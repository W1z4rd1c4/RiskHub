---
title: FAQ a provozní podpora pro uživatele
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md a uživatelské manuály"
summary: "Rychlé odpovědi na nejčastější problémy se scope, schvalováním, notifikacemi a navigací dokumentace."
tags:
  - faq
  - support
  - troubleshooting
---

# FAQ a provozní podpora pro uživatele

## Proč nevidím stejné záznamy jako kolega?

Viditelnost je řízená rolí a scope. Dva uživatelé v různých odděleních nebo ownership řetězcích mohou záměrně vidět odlišná data.

Ověřte:

- roli
- department scope
- ownership přiřazení entity

## Proč editace vytvořila žádost o schválení?

Pravděpodobně jste změnili citlivé pole nebo governance-řízenou hodnotu. Je to očekávané chování.

Sledujte stav přes `/notifications` nebo `/approvals`.

## Proč dashboard dnes vypadá jinak než včera?

Nejčastější důvody:

- jiné filtry
- změny scope/role
- archivace/obnova entit
- nové vazby mezi kontrolami a riziky

Nejprve vždy zkontrolujte filtry.

## Klikl jsem na odkaz v dokumentaci a otevřelo se něco jiného

Odkazy v dokumentaci mají 3 režimy:

- `./file.md`: otevře jiný dokument ve čtečce
- `/path`: přejde na route v aplikaci
- `https://...`: otevře externí zdroj v nové záložce

## Zadání KRI proběhlo, ale stále vidím overdue upozornění

Ověřte:

- správnou periodu
- správné limity a jednotky
- zda fronta notifikací není zastaralá

## Nelze logovat kontrolu

Zkontrolujte permission pro execution a ownership/assignment kontext.

## Co poslat do urgentní eskalace?

Pošlete:

- entity ID nebo request ID
- roli a department kontext
- přesný čas
- přesnou akci
- error message/screenshot

Tím výrazně zrychlíte triage.

## Related Documentation

- `./getting-started.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./notifications.md`
