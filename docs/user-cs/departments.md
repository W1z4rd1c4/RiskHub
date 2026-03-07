---
title: Oddělení a organizační scope
version: "2.0"
last_updated: "2026-03-07"
audience: user
source_of_truth: "frontend/src/pages/DepartmentsPage.tsx + frontend/src/services/departmentApi.ts"
summary: "Jak používat Oddělení pro pochopení scope, expozice a routování ownership napříč riziky, kontrolami, KRI, uživateli a aktivitami."
tags:
  - departments
  - access
  - workflow
  - exports
  - troubleshooting
---

# Oddělení a organizační scope

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

Oddělení v RiskHubu nejsou jen adresář. Jsou hlavní způsob, jak platforma vyjadřuje organizační scope:

- jaká data můžete vidět
- kam se má routovat práce (remediace, triage)
- jak se skupinuje reporting
- co je „lokální“ vs „cross-funkční“ expozice

Záznam oddělení je také landing page pro metriky expozice. Z jednoho místa rychle zjistíte:

- Kolik rizik a kontrol je v této oblasti?
- Jsou zde KRI v breach stavu?
- Je agregovaná expozice (net score) vysoká a kde jsou hlavní drivery?

Hlavní routy:

- přehled oddělení: `/departments`
- detail oddělení: `/departments/<id>` (otevřete kliknutím na kartu)

## Kde to najdete

- položka **Oddělení** v levém menu → `/departments`
- klik na kartu oddělení otevře detail

Pokud **Oddělení** nevidíte:

- můžete mít nestandardní permission set
- požádejte správce přístupů o ověření role + „effective permissions“

Většinou jsou oddělení čitelná pro většinu rolí, protože na nich stojí scope rozhodnutí.

## Role, scope a viditelnost

Viditelnost oddělení a význam přiřazení závisí na roli a scope.

### Typický model

- **globální scope**: obvykle vidí všechna oddělení a jejich metriky
- **oddělový scope**: typicky vidí kontext svého oddělení a entity k němu přiřazené
- **ownership výjimky**: ownership může zpřístupnit entity i mimo oddělení

### Proč je to důležité

Oddělení se používá v mnoha workflow:

- **routing**: kdo má triage a remedovat nález
- **reporting**: jak se groupuje export a dashboard
- **schvalování**: kdo je přirozený reviewer (i když workflow může být role-based)

Pokud máte špatně nastavené oddělení, mnoho věcí bude vypadat „rozbité“ (chybějící rizika, prázdné dashboardy, schvalování bez oprávnění).

## Datový model a klíčová pole

Detail oddělení agreguje data napříč moduly.

| Pole / metrika | Význam | Poznámky |
|---|---|---|
| Name | Název oddělení | Nezahlcujte zkratkami; na to je `Code`. |
| Code | Krátký identifikátor pro reporting | Kód má být stabilní; změny způsobují chaos v exportech. |
| Description | Volitelný popis scope | Držte se hranic a praktických informací, ne org-historie. |
| User count | Kolik uživatelů je přiřazeno | Neznamená to nutně „kdo všechno vidí“ (ownership může být výjimka). |
| Risk count | Počet rizik v oddělení | Počty mohou záviset na tom, zda jsou zahrnuté archivované položky. |
| Control count | Počet kontrol v oddělení | Kontroly mohou být cross-department, i když jsou linknuté na rizika. |
| KRI count | Počet KRI v této oblasti | KRI jsou sub-entity rizik; kontext dědí z rizika. |
| High risk count | Počet kritických rizik | Signalizace priorit, ne KPI pro výkon. |
| Breaching KRI count | Kolik KRI je mimo limity | Jeden breach může být důležitější než samotný počet. |
| KRI monitoring counts | Rozpad KRI podle `new`, `not_submitted`, `breach`, `warning`, `optimal` | Jsou to kanonické monitoring-status počty použité v KRI tabu i summary kartách. |
| Total net score | Agregovaná net expozice | Je to summary; před prezentací najděte top drivery. |

Detail může obsahovat i:

- distribuci rizik (low/medium/high/critical)
- rizika podle statusu
- statistiky kontrol (active/inactive, breakdown)
- KRI monitoring counts (`new`, `not_submitted`, `breach`, `warning`, `optimal`)
- poslední exekuce kontrol (operational pulse)

## Hlavní workflow

### 1) Rychlé pochopení „kde je tlak“

Na začátku dne nebo před review cyklem:

1. Otevřete `/departments`.
2. Najděte oddělení s breaching KRI nebo vysokým počtem high rizik.
3. Otevřete detail a projděte top rizika a aktivní kontroly.
4. Rozhodněte, kde je potřeba akce: update rizik, follow-up exekucí kontrol, nebo nový Issue.

Je to dobrá příprava na komisi: rychle přejdete z „kde je problém“ na „co ho způsobuje“.

### 2) Diagnostika viditelnosti („Proč nevidím X?“)

Oddělení je první zastávka pro většinu access otázek.

Když uživatel nevidí entitu, kterou očekává:

1. Zjistěte, do jakého oddělení entita patří.
2. Ověřte, zda má uživatel global nebo department scope.
3. Ověřte ownership výjimky (je owner?).
4. Pokud máte přístup, otevřete Activity Log pro poslední změny ownership/oddělení.

### 3) Příprava exportu pro oddělový review

Exporty se dělají z list stránek (Rizika/Kontroly/KRI/Issues/Dodavatelé). Oddělení vám pomůže udržet scope čistý.

Doporučený postup:

1. V `/departments` vyberte oddělení, o kterém reportujete.
2. Přejděte do `/risks` a nastavte filtry dle oddělení.
3. Exportujte s jasným „as of“ datem.
4. Opakujte pro `/controls`, `/kris` a `/issues` dle potřeby.

Když porovnáváte oddělení detail s hlavní KRI stránkou, držte stejné kanonické názvy filtrů, jinak nebudou sedět totaly.

### 4) Zarovnání ownership a routingu

Oddělení není ownership.

Oddělení používejte pro:

- kam se má routovat práce
- kde se reportuje expozice

Ownership používejte pro:

- kdo je accountable
- kdo dostává notifikace/schvalování (dle policy)

Když se to rozjede (oddělení říká „tým A“, owner je „tým B“), workflow začne vytvářet šum. Řešte drift co nejdřív.

## Schvalování a notifikace

Většina uživatelů oddělení používá primárně jako read povrch; strukturální změny jsou obvykle omezené.

Co očekávat:

- pokud *můžete* měnit strukturu oddělení (name/code/manager), může to být governance-citlivé a může to spouštět schvalování
- i bez editace oddělení budete vidět schvalování/notifikace, když se entity přesouvají mezi odděleními nebo mění ownership

Praktický návyk:

- při změně oddělení u entity přidejte jasnou poznámku „proč“ (pomáhá review a auditu)

Mechaniku front najdete v: `./notifications.md`.

## Filtry, pohledy a exporty

Oddělení jsou záměrně „lehká“:

- přehled je sada karet s metrikami
- detail je drill-down hub

Pro filtry a exporty typicky:

- použijete Oddělení pro rozhodnutí *kde* hledat
- použijete entity stránky pro filtrování/export:
  - rizika: `/risks`
  - kontroly: `/controls`
  - KRI: `/kris`
  - nálezy: `/issues`
  - dodavatelé: `/vendors` (pokud máte `vendors:read`)

Detail oddělení nyní používá server-side KRI filtry podle kanonického monitoring statusu:

- `all`
- `new`
- `not_submitted`
- `breach`
- `warning`
- `optimal`

Stránkování KRI tabu používá filtrovaný server total, ne nefiltrovaný počet KRI v oddělení.

## Časté chyby

- Brát metriky oddělení jako KPI bez kontextu. Jsou to signály expozice.
- Míchat oddělení a ownership (měníte oddělení místo ownera).
- Prezentovat „total net score“ bez seznamu top driverů.
- Zapomenout, že archivované položky nemusí být v počtech bez explicitního zahrnutí.

## Troubleshooting

### Metriky oddělení vypadají špatně

- Udělejte refresh a otevřete detail znovu.
- Ověřte, zda porovnáváte s exporty, které zahrnují/nezahrnují archiv.
- Zkontrolujte, zda mají rizika/kontroly správně nastavené oddělení.

### Vidím `/departments`, ale nejde otevřít detail

- Můžete mít právo na list, ale ne na detail.
- Pošlete ID oddělení a chybovou hlášku správci přístupů.

### Uživatelé jsou v „nesprávném“ oddělení

- Je to access/governance téma.
- Použijte stránku `/users`, pokud k ní máte přístup; jinak požádejte privilegovaného uživatele o validaci.

## Související dokumentace

- `./access-management.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./governance.md`
- `./activity-log.md`
