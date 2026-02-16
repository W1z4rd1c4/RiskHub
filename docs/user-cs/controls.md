---
title: Správa kontrol
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.2, §4, §7"
summary: "Kompletní příručka pro lifecycle kontrol, vazby na rizika a kvalitní logování exekucí."
tags:
  - controls
  - execution
  - governance
---

# Správa kontrol

## Přehled

Kontroly převádějí policy do opakovatelných operací. Tato příručka pokrývá založení kontroly, ownership, linkování a logování exekucí.

Hlavní route: `/controls`

## Lifecycle kontroly

1. Definujte cíl kontroly a rozsah.
2. Nastavte ownera a department kontext.
3. Určete frekvenci a očekávaný výstup.
4. Propojte kontrolu s relevantními riziky.
5. Provozujte přes execution log.
6. U citlivých změn počítejte se schvalováním.

## Jak zakládat kvalitní kontroly

Při založení kontroly:

- napište testovatelný cíl
- nastavte realistickou frekvenci
- přiřaďte ownera s potvrzenou odpovědností
- propojte jen s reálně mitigovanými riziky

Nekvalitní linkování zkresluje reporting.

## Standard logování exekucí

Každá exekuce by měla obsahovat:

- datum/čas
- výsledek
- podpůrné důkazy (kde relevantní)
- poznámku k výjimkám

Vyhněte se logům bez kontextu.

## Owner pravidla a viditelnost

Owner kontroly může být i v jiném oddělení, ale přístup je stále řízen backend pravidly oprávnění.

## Citlivé změny

Změny ownera nebo oddělení mohou spustit schvalování.

Před uložením citlivé změny:

- přidejte business důvod
- informujte dotčené strany
- ověřte dopad na reporting

## Troubleshooting

### Nelze zalogovat exekuci

Ověřte `controls:execute` permission a přiřazení.

### V detailu chybí navázané riziko

Ověřte scope + ownership inheritance + stav linku.

### Editace vytvořila approval request

Pravděpodobně citlivá změna nebo high-impact scénář.

## Related Documentation

- `./risks.md`
- `./notifications.md`
- `./dashboard.md`
