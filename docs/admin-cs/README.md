---
title: Dokumentace správy platformy RiskHub
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §1.5 a admin endpointy"
summary: "Produkční runbook knihovna pro platformní administrátory: access governance, správa struktury, observabilita a provozní podpora."
tags:
  - overview
  - administration
  - runbook
---

# Dokumentace správy platformy RiskHub

Toto je kanonický admin manuál pro správce platformy. Není určen pro běžné business workflow.

## Cílová skupina a hranice

Knihovna je určena roli `admin` pro správu integrity platformy, přístupů a provozní podpory.

Neřeší business rozhodování nad obsahem rizik. Uživatelské workflow je v `../user-cs/README.md`.

## Co zde najdete

- správu uživatelů, rolí a scope
- lifecycle správu oddělení
- observabilitu schvalovacích toků
- provozní exporty a důkazní výstupy
- hranice podpory konfigurace Risk Hub

## Doporučené pořadí

1. `./getting-started.md`
2. `./user-management.md`
3. `./departments.md`
4. `./approvals.md`
5. `./reports.md`
6. `./riskhub-config.md`

## Provozní principy

- minimální nutná oprávnění
- auditovatelnost každé admin akce
- žádné skryté manuální override mimo policy
- business rozhodnutí eskalovat vlastníkům domény

## Eskalace a handoff model

Pokud incident překročí hranici platformní správy a vyžaduje business rozhodnutí, předání musí být strukturované. Připojte popis problému, ověřené technické kroky, seznam dotčených entit, časový kontext a konkrétní rozhodovací otázku. Tím se zabrání duplicitnímu šetření a administrátor zůstane v rámci své provozní odpovědnosti. Každý handoff by měl mít jasného vlastníka, termín a očekávaný výsledek.

## Očekávaná kvalita služby

Admin provoz není jen o rychlosti zásahu. Důležitá je předvídatelnost, konzistence a možnost zpětně doložit proč a jak byla změna provedena. Každý zásah do přístupů, struktury oddělení nebo workflow má mít auditní stopu a krátké shrnutí dopadu. Pokud není jisté, že je změna bezpečná, použijte minimální variantu zásahu a nejdříve ověřte výsledek.

## Navigace a odkazy

- `./file.md`: otevře jiný admin dokument ve čtečce
- `/path`: přechod na route v aplikaci
- `https://...`: externí odkaz v nové záložce

## Související dokumentace

- uživatelská dokumentace: `../user-cs/README.md`
- anglický admin set: `../admin/README.md`
