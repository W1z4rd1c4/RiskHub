---
title: Dokumentace správy platformy RiskHub
version: "2.1"
last_updated: "2026-03-15"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md §1.5 + admin routes + admin docs endpoint"
summary: "Incident-first knihovna dokumentace pro platformní adminy: health triage, access operace, evidence capture a bezpečná eskalace."
tags:
  - overview
  - troubleshooting
  - onboarding
  - access
  - audit
  - exports
---

# Dokumentace správy platformy RiskHub

> **Když něco failuje, začněte tady:** [Rychlá reference admin incidentů](./incident-quick-reference.md)

Tato knihovna je kanonická sada runbooků pro first-line platform adminy. Používejte ji pro obnovu bezpečného provozu, ověření health stavu, správu přístupů, zachycení evidence a čisté předání incidentu dál.

## Přehled

RiskHub platform admin vlastní operační plochu kolem aplikace, ne business rozhodnutí uvnitř aplikace. Tato dokumentace existuje proto, aby byla tato hranice zřejmá a opakovatelná. Cílem není dělat z admina inženýra. Cílem je pomoci adminovi rychle odpovědět na čtyři otázky:

- co tento symptom obvykle znamená
- jaký je první bezpečný check
- co je healthy a co je degraded
- kdy se mám zastavit a eskalovat

Runbooky jsou psané pro reálné incidenty, ne pro ideální demo. Počítají s tím, že admin dostane jen screenshot, zmatený user report nebo route, která náhle přestala fungovat. Proto kladou důraz na přesné route, pass/fail kritéria, evidence capture a nejmenší bezpečné akce.

Čtěte základní runbooky v tomto pořadí:

1. Live incident nebo matoucí user report: [Rychlá reference admin incidentů](./incident-quick-reference.md)
2. Nový operátor nebo post-change baseline check: [Admin onboarding](./getting-started.md)
3. Health, logy, audit, sessions a exporty: [Admin Console](./console.md)
4. Přidání uživatele, změna role, scope, oddělení nebo deaktivace: [Správa uživatelů a přístupů](./user-management.md)

## Cílová skupina a hranice

Tato knihovna je pro platform adminy, kteří mají přístup do `/admin`, `/admin/docs` a `/users`. Není to business-konfigurační příručka a není to engineering deployment guide.

Admin vlastní:

- podporu přístupů a sessions
- ověření platform health
- audit a log evidence capture
- low-risk a reverzibilní admin akce
- kvalitu eskalačního handoffu

Admin nerozhoduje:

- policy ownership
- risk limity
- business approval outcome
- architekturu platformy nebo repair deploymentu

Jakmile se požadavek překlopí z operations do business judgment nebo engineering opravy, správná akce je zachytit evidenci a předat ji tak, aby další tým mohl hned jednat.

## Rychlý start (první hodina)

Použijte tuto sekvenci, když dostanete přístup do prostředí poprvé nebo se vracíte po delší době:

1. Otevřete [Rychlou referenci admin incidentů](./incident-quick-reference.md) a rychle si projeďte symptom cards.
2. Otevřete `/admin` a podle [Admin Console](./console.md) zařaďte prostředí jako **Healthy**, **Degraded but operable** nebo **Stop and escalate**.
3. Otevřete `/admin/docs` a potvrďte, že čtečka ukazuje admin manuály, ne user manuály.
4. Otevřete `/users` a potvrďte, že se načítá admin access surface včetně role, department, manager a scope.
5. Vyexportujte malý audit vzorek, abyste věděli, že evidence capture funguje dřív, než ji budete opravdu potřebovat.
6. Přečtěte si eskalační pravidla v [Správě uživatelů a přístupů](./user-management.md) a v [Admin Console](./console.md), abyste věděli, které akce jsou reverzibilní a které ne.

Na konci první hodiny byste měli být schopní bez váhání říct:

- kde začít, když se něco rozbije
- jak vypadá healthy admin surface
- jakou evidenci zachytit před eskalací
- které admin akce jsou bezpečné a které nevratné

## Mapa knihovny (podle úkolu operátora)

| Úkol operátora | Primární route | Kanonický runbook |
|---|---|---|
| Triagovat live auth, access nebo health incident | `/admin`, `/users`, dotčená route | [Rychlá reference admin incidentů](./incident-quick-reference.md) |
| Prokázat, že prostředí je připravené na bezpečnou admin práci | `/admin`, `/admin/docs`, `/users` | [Admin onboarding](./getting-started.md) |
| Zkontrolovat Health, logy, sessions a exporty | `/admin` | [Admin Console](./console.md) |
| Přidat uživatele nebo změnit roli, scope, oddělení či managera | `/users` | [Správa uživatelů a přístupů](./user-management.md) |
| Podpořit workflow a approval dotazy z operator pohledu | support path plus logy | [Podpora schvalování](./approvals.md) |
| Vyexportovat evidenci pro incident response nebo audit | `/admin` | [Reporty a evidence exporty](./reports.md) |
| Řešit department-scoping otázky | `/users` plus handoff evidence | [Oddělení: admin podpora](./departments.md) |
| Udržet Risk Hub config otázky ve správné ownership hranici | `/risk-hub` jen pro orientaci | [Hranice konfigurace Risk Hub](./riskhub-config.md) |

Berete to jako routing tabulku. Nečtěte všechno před akcí. Vyberte úkol, otevřete runbook a držte se nejmenší bezpečné cesty.

## Principy přístupů a bezpečnosti

Tyto principy platí napříč všemi admin runbooky:

- používejte nejmenší možnou změnu
- měňte jednu věc po druhé
- při degraded Health zůstávejte read-only, pokud runbook výslovně neříká jinak
- nikdy nerozšiřujte přístup dočasně jen proto, abyste „zkusili, jestli to funguje“
- když je UI akce vypnutá, neimprovizujte alternativní admin cestu
- před významnou změnou si zapište before-state
- request IDs, emaily, exportované řádky a session detaily berte jako citlivou evidenci

Pokud neumíte jednou větou popsat očekávaný výsledek a rollback ještě před akcí, nemáte zatím bezpečnou admin akci. Zastavte se, zachyťte evidenci a eskalujte.

## Triage provozní podpory

Veškerá first-line admin podpora má jít stejným vzorem:

1. Zachyťte přesný text symptomu, route, dotčeného uživatele a timestamp.
2. Otevřete `/admin` a zařaďte prostředí.
3. Rozhodněte, zda jde o jednoho uživatele, jednu route, nebo více uživatelů či route.
4. Udělejte nejmenší bezpečnou admin akci jen tehdy, když ji runbook dovoluje.
5. Znovu ověřte výsledek a zapište, co se změnilo.

Používejte konzistentně tyto definice stavů:

- **Healthy**: Health se načte, database je connected, scheduler lock je držený, outbox dead-letter count je `0` a logy, audit, sessions i exporty fungují.
- **Degraded but operable**: `/admin` funguje, ale jedna závislost nebo subsystém je degraded a observabilita stále funguje.
- **Stop and escalate**: `/admin` failuje, database je disconnected, observability taby failují, exporty failují nebo je špatně admin/user hranice dokumentace.

Ve stavu `Stop and escalate` nepokračujte do access změn. Ve stavu `Degraded but operable` preferujte read-only vyšetřování a jen ty nejnižší-risk kroky popsané v odpovídajícím runbooku.

## Observabilita a evidence

Kvalita evidence rozhoduje, jestli je eskalace užitečná. Dobrá evidence je přesná, minimální a časově ukotvená. Má pomoct dalšímu týmu problém reprodukovat nebo diagnostikovat bez toho, aby se admin musel vracet a všechno znovu popisovat.

Pro většinu případů kvalitní evidence balíček obsahuje:

- dotčeného uživatele nebo dotčenou skupinu
- přesnou route a akci
- časové okno a prostředí
- Health klasifikaci v tom samém čase
- opakující se request IDs, pokud existují
- jeden export nebo screenshot, který symptom potvrzuje
- poznámku, jakou admin akci jste už provedli

Admin se má opírat o `/admin` jako o zdroj pravdy pro platform-state otázky. Pokud samotná observabilita failuje, je to součást incidentu. Zachyťte failing tab, použité filtry a časové okno, pak eskalujte místo obcházení problému.

## Očekávání pro change management

RiskHub admin práce je bezpečná jen tehdy, když zůstává kontrolovaná a auditovatelná. Každou access nebo session akci berte jako něco, co později možná budete vysvětlovat engineeringu, compliance, security nebo managementu.

Před změnou:

- potvrďte identitu a dotčenou route
- potvrďte očekávaný výsledek
- zapište aktuální stav

Během změny:

- měňte jednu proměnnou najednou
- nekombinujte access edit a revoke session, pokud to případ skutečně nevyžaduje
- degraded UI stav neberte jako pobídku k manual workaroundům

Po změně:

- po refreshi ověřte nový stav
- kde je to vhodné, ověřte i user outcome
- potvrďte existenci audit trailu nebo jiné evidence
- pokud incident zůstává otevřený, zapište rollback cestu

Tato knihovna záměrně zůstává uvnitř admin operating boundary. Engineering repair kroky patří do engineering runbooků, ne do admin manuálů.

## Eskalace a předání

Eskalujte, pokud platí cokoliv z toho:

- Health je ve stavu `Stop and escalate`
- stejný symptom se neočekávaně týká více uživatelů nebo route
- neumíte určit last-known-good access stav
- save vypadá úspěšně, ale po re-auth se chování nezmění
- audit, log nebo export evidence chybí, i když má existovat
- problém vyžaduje business rozhodnutí místo operating akce

Minimum pro handoff:

- jednověté shrnutí symptomu
- přesná route a časové okno
- dotčený uživatel nebo dotčená skupina
- Health klasifikace
- relevantní request IDs
- zachycená evidence
- akce, které už jste provedli
- jasné pojmenování toho, co zůstává neznámé nebo blokované

## Související dokumentace

- [Rychlá reference admin incidentů](./incident-quick-reference.md)
- [Admin onboarding](./getting-started.md)
- [Admin Console](./console.md)
- [Správa uživatelů a přístupů](./user-management.md)
- [Reporty a evidence exporty](./reports.md)
