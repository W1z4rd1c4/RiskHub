---
title: Dokumentace správy platformy RiskHub
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §1.5 a admin endpointy"
summary: "Produkční runbook knihovna pro platformní administrátory: správa přístupů, bezpečné změny, observabilita, exporty evidence a provozní podpora."
tags:
  - overview
  - onboarding
  - access
  - audit
  - exports
  - troubleshooting
  - settings
---

# Dokumentace správy platformy RiskHub

Zpět na strom dokumentace: <a href="../DOCUMENTATION_TREE.md">docs/DOCUMENTATION_TREE.md</a>

Tato knihovna je kanonická sada runbooků pro provozní správu platformy. Je napsaná pro roli `admin` a soustředí se na stabilitu, přístupy a podpůrné provozní plochy.

Záměrně to není business manuál. Pokud se ticket změní na policy rozhodnutí („máme akceptovat toto riziko?“, „jaký má být limit?“), správný výsledek je strukturované předání vlastníkovi domény, ne admin override.

**Na této stránce**
- [Přehled](#prehled)
- [Cílová skupina a hranice](#cilova-skupina-a-hranice)
- [Rychlý start (první hodina)](#rychly-start-prvni-hodina)
- [Mapa knihovny (podle úkolu operátora)](#mapa-knihovny-podle-ukolu-operatora)
- [Principy přístupů a bezpečnosti](#principy-pristupu-a-bezpecnosti)
- [Triage provozní podpory](#triage-provozni-podpory)
- [Observabilita a evidence](#observabilita-a-evidence)
- [Očekávání pro change management](#ocekavani-pro-change-management)
- [Eskalace a předání](#eskalace-a-predani)
- [Související dokumentace](#souvisejici-dokumentace)

## Přehled

Platformní admin v RiskHubu má úzký účel:

- udržet authentication a authorization spolehlivé
- udržet auditovatelnost (admin akce musí být dohledatelné)
- držet uživatele neblokované (přístupy, sessions, podpůrné plochy)
- umět vyexportovat evidenci pro incidenty a audity

Knihovna je strukturovaná jako produkční runbooky. Každý runbook obsahuje předpoklady, postup krok za krokem, ověření po změně a rollback strategii.

## Cílová skupina a hranice

Tato knihovna je pro roli `admin`, která obsluhuje platformní plochy:

- `/users` (Access Management)
- `/admin` (Admin Console: health/logs/audit/sessions)
- `/admin/docs` (knihovna dokumentace)
- `/settings` (lokální preference admina)

Hranice odpovědnosti:

- Admin zajišťuje přístup a stabilitu. Neřeší business semantiku.
- Business role se mohou objevit pouze jako **handoff kontext** (koho kontaktovat), ne jako „návod pro business uživatele“.
- Pokud je workflow blokované schvalováním, role admina je doložit, co je blokované a proč, ne schvalování obcházet.

## Rychlý start (první hodina)

Použijte tento checklist, když přebíráte prostředí jako operátor:

1. Ověřte, že váš účet je opravdu role `admin`.
2. Otevřete `/admin` a ověřte:
   - Health panel se načte a dává smysl
   - Logs a Audit feed se načtou
   - Sessions panel se načte
3. Otevřete `/admin/docs` a ověřte:
   - Audience label odpovídá admin knihovně
   - Odkazy v dokumentaci fungují správně (doc odkazy zůstávají ve čtečce)
4. Otevřete `/users` a ověřte, že můžete:
   - zobrazit seznam uživatelů v access režimu (pokud to scope dovoluje)
   - otevřít access edit modal pro uživatele (mutace jsou admin-only)
5. Proveďte jednu bezpečnou, reverzibilní operaci pro ověření “end-to-end”:
   - vyexportujte krátký vzorek audit logů (CSV/JSON)
   - ověřte, že evidence tok funguje

Pokud něco selže, zastavte se. Nejprve opravte baseline spolehlivost, až potom dělejte změny s dopadem na produkční uživatele.

## Mapa knihovny (podle úkolu operátora)

| Úkol operátora | Kde v aplikaci | Kanonický runbook |
|---|---|---|
| Admin baseline (day-one checks) | `/admin`, `/admin/docs` | [Admin onboarding](./getting-started.md) |
| Přidat/upravit/deaktivovat uživatele bezpečně | `/users` | [Správa uživatelů a přístupů](./user-management.md) |
| Triage workflow incidentů (stuck requesty, podivné stavy) | podpora + logy | [Podpora schvalování](./approvals.md) |
| Vyexportovat evidenci pro audit/incident | `/admin` + exporty | [Reporty a evidence exporty](./reports.md) |
| Řešit department scoping/strukturu z admin pohledu | `/users` + handoff | [Oddělení: admin podpora](./departments.md) |
| Podpora hranic konfigurace Risk Hub (technické vs policy) | `/risk-hub` (business-owned) | [Hranice konfigurace Risk Hub](./riskhub-config.md) |
| Provoz Admin Console | `/admin` | [Admin Console](./console.md) |

## Principy přístupů a bezpečnosti

Admin práce má vysoký “blast radius”. Berte ji jako safety-critical.

Nepoužívejte sdílené účty. Každý zásah musí mít jednoznačného aktéra, aby byla auditní stopa věrohodná.

Principy:

- **Least privilege**: dejte jen minimum, které uživatele odblokuje; neřešte to „dočasně global scope“.
- **Dvou-krokové myšlení**: oddělte „co jsem pozoroval“ od „co z toho vyvozuji“.
- **Reverzibilita**: preferujte změny, které můžete rychle vrátit (přístupy, sessions).
- **Evidence-first**: před změnou si uložte:
  - koho se to týká (uživatel, email)
  - čeho se to týká (route/entita)
  - kdy to začalo
  - zda je problém reprodukovatelný
- **Jedna změna na jeden zásah**: nemíchejte nesouvisející opravy; zničí to traceability.

## Triage provozní podpory

Většina admin incidentů spadá do tří košů:

1. **Access incident**: uživatel nevidí modul, nemůže editovat, padá forbidden.
2. **Workflow incident**: schvalování/notifikace jsou stuck nebo matoucí.
3. **Platform incident**: health degradace, zvýšené chyby, session/auth nestabilita.

Doporučené pořadí:

1. Ověřit identitu uživatele a efektivní roli/scope.
2. Reprodukovat na stejné route, ideálně s konkrétním entity id.
3. Podívat se do Admin Console (logs/audit) na korelaci a request ID.
4. Rozhodnout: technická vada vs očekávané policy chování.
5. Udělat nejmenší bezpečný fix a ověřit výsledek.

## Observabilita a evidence

Admin závěr musí být reprodukovatelný. „Myslím, že je to ok“ není validní closure.

Checklist evidence balíčku:

- přesná route a časové okno
- dotčení uživatelé + role/scope
- relevantní audit eventy (co se změnilo, kým)
- relevantní logy (error, request ID)
- exporty (CSV/JSON), pokud byly použité

Risk poznámka: vyexportujte jen minimum dat, které je potřeba. Evidence exporty mají být co nejúžeji scoped k otázce incidentu/auditu.

Praktická pravidla provenance:

- pokud předáváte evidenci mimo admin tým, přiložte 1 odstavec “co to je” (čas, filtry, otázka)
- raw export neměňte; jakoukoliv analýzu dělejte jako samostatný soubor
- pokud máte request ID, vždy ho uložte do ticketu (je to nejrychlejší korelace do logů)

## Očekávání pro change management

Když měníte přístupy nebo provozní nastavení:

- komunikujte intent předem (co se změní, koho se to dotkne)
- ověřte po změně (co je teď pravda)
- zapište výsledek (co jste pozorovali a jaké riziko zůstává)

Pokud nedokážete vysvětlit změnu ve třech větách, pravděpodobně jste změnil/a příliš mnoho věcí najednou.

## Eskalace a předání

Eskalujte, když:

- jde o **policy** spor (ownership, limity, akceptace)
- jde o **data rozhodnutí** (kdo má vlastnit oddělení/entitu)
- jde o **produktovou vadu**, která vyžaduje engineering

Formát předání (stručně, ale kompletně):

- co uživatel hlásil
- co jste ověřili (kroky + výsledky)
- co ukazují logy/audit
- co jste změnili (pokud něco)
- jaké rozhodnutí je potřeba a kdo je owner

## Související dokumentace

- Baseline a confidence checks: [Admin onboarding](./getting-started.md)
- Přístupy uživatelů: [Správa uživatelů a přístupů](./user-management.md)
- Provoz konzole: [Admin Console](./console.md)
- Workflow podpora: [Podpora schvalování](./approvals.md)
- Evidence exporty: [Reporty a evidence exporty](./reports.md)
