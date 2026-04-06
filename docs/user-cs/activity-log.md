---
title: Activity Log (audit trail pro business změny)
version: "2.0"
last_updated: "2026-03-05"
audience: user
source_of_truth: "frontend/src/pages/ActivityLogPage.tsx + backend activity log endpoints"
summary: "Jak používat Activity Log pro vyšetřování změn, potvrzení schválení a vytvoření auditovatelné historie bez úniku citlivých dat."
tags:
  - activity-log
  - audit
  - troubleshooting
  - workflow
  - exports
---

# Activity Log (audit trail pro business změny)

**Na této stránce**
- [Přehled](#prehled)
- [Kde to najdete](#kde-to-najdete)
- [Role, scope a viditelnost](#role-scope-a-viditelnost)
- [Datový model a klíčová pole](#datovy-model-a-klicova-pole)
- [Hlavní workflow](#hlavni-workflow)
- [Schvalování a notifikace](#schvalovani-a-notifikace)
- [Filtry, pohledy a exporty](#filtry-pohledy-a-exporty)
- [Časté chyby](#caste-chyby)
- [Troubleshooting](#troubleshooting)
- [Související dokumentace](#souvisejici-dokumentace)

## Přehled

Activity Log je business audit trail změn v RiskHubu. Odpovídá na otázky typu:

- Kdo změnil toto riziko a co přesně se změnilo?
- Kdy byla kontrola archivována nebo obnovena?
- Prošlo schválení, nebo je stále pending?
- Proč se změnila viditelnost v oddělení?

Activity Log není „report“. Je to forenzní nástroj. Používejte ho pro potvrzení faktů, snížení ping-pongu a přípravu čistých důkazů pro review.

Hlavní route: `/activity-log`

## Kde to najdete

- položka **Activity Log** v menu → `/activity-log`

Pokud Activity Log nevidíte:

- pravděpodobně nemáte `activity_log:read` (resource `activity_log`, action `read`)
- platform admin je záměrně blokovaný z business Activity Logu, včetně přímého route/API přístupu (admin má používat admin console logy)

## Role, scope a viditelnost

Přístup do Activity Logu bývá omezený, protože může odhalovat:

- cross-department aktivitu
- citlivá workflow rozhodnutí (approve/reject)
- změny uživatelů a ownership

Typické použití:

- risk management / 2nd line: validace změn a konzistence policy
- compliance/audit: spot-check evidence a kvalita change control
- vedoucí oddělení (pokud je povoleno): vyšetření „proč se změnilo číslo“

Log je důkaz, ne autorita. Pokud je změna špatně, musíte opravit podkladovou entitu.

## Datový model a klíčová pole

Každý záznam Activity Logu reprezentuje jednu akci.

| Pole | Význam | Jak to používat |
|---|---|---|
| Entity type | Co se měnilo (risk/control/kri/user/…) | Přepněte taby, ať hledáte ve správné doméně. |
| Entity name | Bezpečný identifikátor nebo obecný label entity | Preferujte stabilní kódy/labely, ne raw názvy. |
| Action | `create`, `update`, `archive`, `approve`, `reject`, `link`, … | Říká, jaký typ události to je. |
| Actor | Kdo akci provedl (může být null) | Null často znamená systémovou akci. |
| Department | Kontext pro routing | Pomáhá vysvětlit, proč se něco objevilo/zmizelo ve scope. |
| Changes | Deltá `old` → `new` | Důkaz konkrétní editace bez otevírání entity. |
| Description | Sanitizovaný krátký popis | Vhodné pro rychlé skenování, u citlivých událostí je záměrně šablonový. |
| Timestamp | Čas (`created_at`) | Používejte úzký date range při vyšetřování. |

Změny mohou obsahovat strukturované hodnoty. UI je formátované „defenzivně“:

- prázdno se ukazuje jako `(empty)`
- objekty se zobrazují jako zkrácené JSON
- dlouhé diffy jsou záměrně kondenzované

## Hlavní workflow

### 1) Potvrzení, zda se editace aplikovala

Když jste něco změnili, ale vypadá to beze změny:

1. Otevřete `/activity-log`.
2. Přepněte na tab podle entity (Risk / Control / KRI / User).
3. Vyhledejte podle stabilního identifikátoru, safe labelu nebo jména aktéra.
4. Najděte `update` nebo `status_change`.
5. Pokud nic nevidíte, zkontrolujte `/approvals` (může čekat workflow).

### 2) Vysvětlení změny metrik při review

Když dashboard metrika skokově změní hodnotu:

1. Najděte relevantní změny v Activity Logu.
2. Omezte date range na okno review.
3. Hledejte editace, které posunuly položku do/ze scope:
   - změna statusu (např. archivace)
   - změna oddělení
   - změna ownership
   - změna thresholdů (u KRI)
4. Sepište krátkou narativní osu s timestampy.

### 3) Vyšetření „Proč to už nevidím?“

Viditelnost se často mění kvůli oddělení nebo ownership.

Použijte Activity Log pro:

- nalezení záznamu, který změnil oddělení/ownera
- potvrzení kdo a kdy to udělal
- rozhodnutí, zda je to policy-correct nebo omyl

Pak opravte root cause v entitě a zdokumentujte „proč“.

### 4) Validace governance akcí

Po rezoluci orphaned položky nebo po schválení citlivé změny:

1. Najděte odpovídající záznam v Activity Logu.
2. Ověřte, že existuje `approve` / `update` event.
3. Uložte timestamp a delta jako evidence pro pack.

## Schvalování a notifikace

Activity Log je úzce spojený s workflow, ale není to workflow fronta.

Pravidla:

- `approve`/`reject` typicky znamená workflow rozhodnutí.
- Pokud je změna aplikovaná, ale stakeholder tvrdí, že nedostal notifikaci, zkontrolujte `/notifications`.
- Pokud nevidíte očekávaný update, zkontrolujte `/approvals`.

Dobrá praxe je korelovat:

- Activity Log (co se změnilo)
- Approvals (proč a kdo rozhodl)
- Notifications (koho to informovalo)

## Filtry, pohledy a exporty

Activity Log podporuje dvě dimenze vyšetřování: *co* a *jak to chcete seskupit*.

### Taby (co)

Horní taby vás přepnou podle entity:

- KRI
- Risk
- Control
- User

### View módy (jak)

Můžete přepnout view mód:

- **Chronological**: timeline
- **By person**: jeden actor
- **By department**: jedno oddělení
- **By risk**: kontext jednoho rizika

### Filtry

Pro kontrolu šumu:

- search (safe labely, jména aktérů, sanitizované popisy)
- action (create/update/archive/link…)
- date range (from/to)

### Exporty

Business Activity Log UI nemá nativní export tlačítko.

Pokud potřebujete exportovatelnou evidenci:

- exportujte podkladové entity (rizika/kontroly/nálezy) a odkažte na timestampy z Activity Logu
- pro platform-level audit exporty použije platform admin admin console audit logy

Nevkládejte celé diffy do neautorizovaných kanálů.

## Časté chyby

- Používat Activity Log místo opravy podkladové entity.
- Hledat podle nestabilních termínů (přezdívky, neformální zkratky).
- Nastavit příliš široký date range a „utopit se“ v šumu.
- Sdílet log výřezy s citlivými daty mimo autorizovanou skupinu.

## Troubleshooting

### Nemám přístup do `/activity-log`

- Ověřte `activity_log:read`.
- Ověřte, že nejste platform admin.
- Pokud přístup mít máte, požádejte o revizi role a effective permissions.

### Log se načte, ale nevidím událost

- Přepněte na správný tab.
- Zkuste jiné search slovo (kód / safe label entity, jméno aktéra).
- Rozšiřte date range o pár dní.
- Pokud šlo o workflow, hledejte approval eventy místo entity update.

### Vidím „network error“

- Udělejte refresh.
- Pokud problém trvá, uložte čas a chybovou hlášku a eskalujte na podporu.

## Související dokumentace

- `./notifications.md`
- `./governance.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./departments.md`
