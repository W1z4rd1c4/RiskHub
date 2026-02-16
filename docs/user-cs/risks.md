---
title: Správa rizik
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.1, §6, §7"
summary: "Provozní příručka pro tvorbu a správu rizik se schvalováním citlivých změn a pravidly ownership napříč odděleními."
tags:
  - risks
  - workflow
  - approvals
---

# Správa rizik

## Přehled

Registr rizik je hlavní pracovní plocha pro identifikaci, hodnocení a řízení rizikové expozice.

Hlavní route: `/risks`

## Kdo co může dělat

Možnosti závisí na roli a permission sadě:

- čtení: podle role/scope + ownership výjimky
- zápis: podle write oprávnění
- citlivé změny: mohou vyžadovat schválení

Backend je vždy autoritativní zdroj pravdy.

## End-to-end workflow

1. Otevřete `/risks` a nastavte filtry.
2. Vyberte riziko nebo založte nové.
3. Vyplňte povinná pole kvalitním popisem.
4. Ověřte owner/department kontext.
5. Propojte relevantní kontroly.
6. Uložte a zkontrolujte, zda vznikla žádost o schválení.
7. Sledujte navazující stav v notifikacích/workflow.

## Citlivá pole a rozhodovací pravidla

Za governance-citlivé považujte:

- owner
- department
- category
- priority

Při změně očekávejte policy-driven workflow.

## Standard kvality záznamu rizika

Produkční záznam rizika musí obsahovat:

- srozumitelný popis hrozby
- realistickou pravděpodobnost/dopad
- jasného vlastníka odpovědnosti
- smysluplné propojení s kontrolami
- aktuální stav a kontext akcí

## Časté provozní chyby

- více citlivých změn bez vysvětlení
- přiřazení ownera bez potvrzení odpovědnosti
- nepropojené kontroly po zásadní změně rizika
- předpoklad cross-department přístupu bez ownership

## Troubleshooting

### Riziko není vidět očekávanému uživateli

Ověřte scope, potom ownership, potom department mapping.

### Uložení proběhlo, ale hodnoty se nezměnily

Změna pravděpodobně čeká ve schvalování.

### Nejasný cross-department access

Ownership může otevřít viditelnost i mimo oddělení. Ověřte vazby explicitně.

## Related Documentation

- `./controls.md`
- `./kris.md`
- `./notifications.md`
- `./dashboard.md`
