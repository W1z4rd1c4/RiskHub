---
title: Runbook správy uživatelů a přístupů
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "access-management endpointy a RBAC policy"
summary: "Provozní runbook pro user lifecycle, změny rolí, scope governance a auditovatelnou správu přístupů."
tags:
  - users
  - access
  - rbac
---

# Runbook správy uživatelů a přístupů

## Přehled

Tento runbook pokrývá identity lifecycle a governance přístupů pro platformní administrátory.

Hlavní route: `/users` a navazující access-management plochy.

## Vysoce rizikové operace

Za high-impact považujte:

- změnu role
- rozšíření scope na global
- změnu oddělení aktivního ownera
- změnu manager chain ovlivňující delegated visibility

## Standardní workflow změny

1. Najděte uživatele a zkontrolujte aktuální profil.
2. Potvrďte zdroj požadavku a schválení.
3. Proveďte minimální změnu.
4. Ověřte effective permissions.
5. Ověřte audit záznam.

## Deaktivace uživatele

Před deaktivací:

- identifikujte vlastněné entity a pending workflow
- dokončete ownership handoff
- ověřte, že nezůstávají osiřelé odpovědnosti

Poté deaktivujte účet a zkontrolujte vedlejší dopady.

## Safe rollback

Pokud změna způsobí regresi:

- okamžitě vraťte last-known-good role/scope
- zaznamenejte incident kontext
- proveďte impact review dotčených entit

Po rollbacku vždy napište stručnou handoff poznámku: co se změnilo, co bylo vráceno, jaký byl dopad a jaká preventivní kontrola se přidává. Tento krok snižuje opakování stejné chyby.

## Troubleshooting

### Uživatel po změně role nevidí data

Zkontrolujte scope, poté oddělení, poté ownership výjimky.

### Uživatel vidí příliš mnoho dat

Pravděpodobně scope eskalace nebo role drift.

### Změna není vidět okamžitě

Ověřte uložení a proveďte re-login pro refresh session claims.

## Related Documentation

- `./departments.md`
- `./approvals.md`
- `./reports.md`
