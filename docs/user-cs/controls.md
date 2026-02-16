---
title: Správa kontrol
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.2, §4, §7 + frontend/src/pages/ControlsPage.tsx"
summary: "Kompletní manuál pro lifecycle kontrol: návrh, ownership, logování exekuce, linkování na rizika, exporty a schvalování citlivých změn."
tags:
  - controls
  - workflow
  - approvals
  - exports
  - troubleshooting
---

# Správa kontrol

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

Kontroly převádí policy do opakovatelné exekuce. V RiskHubu má kontrola hodnotu jen tehdy, když:

- má jasného ownera
- má definovanou frekvenci
- existuje exekuční log s evidencí
- je propojená na rizika, která mitigují

Kontroly jsou také governance objekty: citlivé editace a archivace mohou být schvalované.

Hlavní route: `/controls`

## Kde to najdete

- katalog kontrol: `/controls`
- detail kontroly: klik na řádek
- založení kontroly: z `/controls` (vyžaduje `controls:write`)

Pokud **Kontroly** nevidíte:

- pravděpodobně nemáte `controls:read`

## Role, scope a viditelnost

Kontroly respektují stejný model jako rizika:

- scope a oddělení určují baseline viditelnost
- ownership může vytvořit výjimky
- backend enforcement je autorita

Zápis je permission-gated:

- `controls:write` pro create/edit
- `controls:delete` pro archive/restore (dle policy)

Logování exekuce může být také permission-gated. V praxi:

- owner a delegovaný executor často mohou logovat exekuce
- review role typicky čtou historii exekucí

## Datový model a klíčová pole

Kontroly mají lifecycle, exekuční očekávání a evidence.

| Pole | Význam | Poznámky |
|---|---|---|
| Name | Co kontrola je | Název má být testovatelný, ne slogan. |
| Description | Co se dělá a proč | Uveďte scope hranice a „jak vypadá úspěch“. |
| Control form | `manual` nebo `automatic` | „Automatic“ označte jen když existuje reálná automatizace + evidence. |
| Frequency | daily/weekly/monthly/… | Musí odpovídat realitě. |
| Risk level | 1–5 kritičnost | Pomáhá prioritizovat disciplínu exekuce. |
| Status | `draft`, `active`, `inactive`, `archived` | `draft` při návrhu; `archived` při vyřazení. |
| Owner | Odpovědný za design a efektivitu | Owner není nutně executor. |
| Owner position | Kontext role/titulu | Pomáhá při personálních změnách. |
| Executor position | Kdo exekuuje (pokud jiný) | Pomáhá při předání práce. |
| Department | Routing/reporting kontext | Alignujte s tím, kde se kontrola provádí. |
| Data source | Odkud pochází evidence | Buďte konkrétní (systém/report/log). |
| Methodology reference | Odkaz na policy/proceduru | Ideálně interní ID dokumentu. |
| Output / reporting | Co je výstup a komu jde | Pomáhá hodnotit kvalitu evidence. |
| Documentation location | Kde evidence leží | Držte stabilní a access-controlled. |
| Linked risks | Rizika mitigovaná kontrolou | Linkujte s efektivitou a poznámkou. |
| Execution logs | Historie výsledků + evidence reference | To je audit trail. |

Exekuční log obvykle obsahuje:

- result: `passed`, `failed`, `warning`, `not_applicable`
- findings
- evidence reference
- notes

## Hlavní workflow

### 1) Založení kontroly (designujte pro exekuci)

1. Otevřete `/controls` → **New control**.
2. Napište name a description tak, aby šlo kontrolu otestovat.
3. Nastavte ownership a oddělení.
4. Definujte exekuční vstupy:
   - data source
   - methodology reference
   - frequency
5. Nastavte status:
   - `draft` při iteraci
   - `active` když je připravená k exekuci
6. Volitelně hned propojte na hlavní riziko.
7. Uložte.

Recept: *kontroly bez audit bolesti*

- napište explicitně, jaká evidence musí po exekuci existovat
- vyhněte se vágním popisům („zajistit compliance“)
- definujte, kdo reviewuje a kam jde výstup

### 2) Linknutí kontroly na rizika (mitigation mapa)

Kontrola bez linku na rizika je reporting šum.

Pattern:

- linkněte na každé riziko, které kontrola reálně mitigují
- zvolte efektivitu (high/medium/low) podle reality
- přidejte notes s mechanismem („preventuje X“, „detekuje Y“, „limituje Z“)

Pokud je kontrola linknutá na příliš mnoho rizik, ověřte, zda to není spíše „program“ nebo „proces“.

### 3) Logování exekuce (evidence loop)

Exekuční log je rozdíl mezi kontrolou, která existuje, a kontrolou, která funguje.

Postup:

1. Otevřete detail kontroly.
2. Klikněte **Log execution**.
3. Vyberte výsledek.
4. Zapište findings:
   - co jste kontrolovali
   - jaké výjimky byly
5. Přidejte evidence reference.
6. Uložte.

Interpretace výsledků:

- `passed`: exekuce OK, evidence existuje
- `warning`: exekuce proběhla, ale je menší problém
- `failed`: exekuce fail (typicky spouští Issue)
- `not_applicable`: exekuce nebyla legitimně potřeba (vysvětlete proč)

Když kontrola failuje:

- založte Issue (`/issues`) a odkažte na exekuci
- zvažte změnu net scoringu rizika

### 4) Bezpečná úprava kontroly

Editace může mít policy dopad (ownership, oddělení, frekvence, status).

Před editací:

- zkontrolujte linknutá rizika (blast radius)
- zkontrolujte historii exekucí (nezneplatněte evidence bez vysvětlení)

Dělejte malé změny a uveďte odůvodnění.

### 5) Archivace a obnovení

Archivujte, když je kontrola vyřazená nebo nahrazená.

Bezpečný postup:

1. Potvrďte, že existuje náhrada (pokud je).
2. Aktualizujte linky u rizik.
3. Archivujte.
4. Ověřte, že se kontrola neobjevuje v aktivním reportingu.

Pokud je archivace schvalovaná, akce se objeví v `/approvals`.

## Schvalování a notifikace

Kontroly často spouští schvalování pro:

- změnu ownera
- změnu oddělení
- status změny s governance dopadem
- archivaci

Signály queued změny:

- save proběhne, ale pole se nezmění
- v listu se objeví „pending changes“

Pak:

- zkontrolujte `/approvals`
- outcome sledujte v `/notifications`

Queue manuál je `./notifications.md`.

## Filtry, pohledy a exporty

### Filtry

Katalog kontrol podporuje:

- search (name/description)
- status filter (včetně archived)
- view mode (all vs grouped)

Grouped view je dobré pro review a koncentraci.

### Exporty

Kontroly lze exportovat pro audit packy a operativní review.

Disciplína exportu:

- jasné filtry (status, search)
- kontext „as of“
- raw export neměnit

## Časté chyby

- Kontrola jako „přání“ místo testovatelné akce.
- Exekuční logy s nulovou informací („done“).
- `not_applicable` jako zkratka bez vysvětlení.
- Široké linkování kontrol na rizika „aby to vypadalo pokryté“.
- Změna frekvence bez posouzení workloadu a evidence dopadu.

## Troubleshooting

### Vidím kontroly, ale nejdou zakládat/upravovat

- Pravděpodobně máte `controls:read`, ale ne `controls:write`.

### Chybí execution historie

- Ověřte, že kontrola byla exekuována a že máte read přístup.
- Pokud začínáte, udělejte první baseline exekuci.

### Editace se neaplikovala

- Zkontrolujte `/approvals`.
- Výsledek v `/notifications`.

### Export selhal

- Zkuste s menším počtem filtrů.
- Pokud to trvá, uložte chybovou hlášku.

## Související dokumentace

- `./risks.md`
- `./kris.md`
- `./issues.md`
- `./notifications.md`
- `./dashboard.md`
- `./activity-log.md`
