---
title: Podpora konfigurace Risk Hub a hranice odpovědnosti (admin runbook)
version: "2.1"
last_updated: "2026-04-25"
audience: admin
source_of_truth: "frontend/src/pages/RiskHubPage.tsx + backend/app/api/v1/endpoints/riskhub/* + authz role model"
summary: "Admin runbook vymezující technickou podporu konfigurace Risk Hub vs business rozhodnutí, včetně triage postupů a evidence balíčku."
tags:
  - riskhub
  - settings
  - audit
  - troubleshooting
  - workflow
---

# Podpora konfigurace Risk Hub a hranice odpovědnosti (admin runbook)

## Přehled

Risk Hub je konfigurační plocha pro business governance. Typicky ji používá role CRO pro údržbu:

- taxonomie typů rizik
- systémových nastavení, která ovlivňují governance chování
- schvalovacích scénářů/pravidel
- modelu rolí a oprávnění (kde je to povolené)
- konfigurace oddělení (business-owned)
- konfigurace risk dotazníků

Platformní admin podporuje **technickou dostupnost a integritu platformy**, ne business semantiku. Je to důležité, protože Risk Hub nastavení může měnit způsob, jak organizace operuje, a admin override vytváří auditní riziko.

Tento runbook vysvětluje:

- co má admin podporovat (technicky)
- co nemá admin rozhodovat (policy)
- jak triagovat incidenty, když konfigurace selže
- jak sestavit evidence balíček pro předání

## Kdy to použít

Použijte tento runbook, když:

- CRO hlásí, že nejde otevřít `/risk-hub` (nečekaný redirect/denial)
- taby Risk Hubu padají při loadu (risk types/settings/approvals/roles/departments/questionnaires)
- uložení konfigurace selhává (validace, forbidden, server error)
- změny se “neaplikují” nebo se chovají nekonzistentně
- vznikne spor, jaká konfigurační hodnota má být (otázka hranic odpovědnosti)

## Předpoklady a bezpečnost

Než něco uděláte:

1. Ověřte identitu reportera a efektivní roli.
   - Risk Hub je CRO-only. Pokud reporter není CRO, denial může být správně.
2. Zachyťte minimum faktů pro reprodukci:
   - který tab selhal (risk types vs settings vs approvals vs roles vs departments vs questionnaires)
   - jaká akce (load vs save)
   - přibližný timestamp
   - text UI chyby
3. Rozhodněte, zda jde o technický, data-integrity nebo policy problém.

Bezpečnostní pravidla:

- Nevymýšlejte konfigurační hodnoty. Pokud je otázka “jaká má být?”, předejte business ownerovi.
- Preferujte nejdřív read-only šetření (logs/audit).
- Pokud musíte měnit přístup (např. roli CRO účtu), zapište before/after a mějte rollback připravený.

## Postup krok za krokem

### 1) Ověřit access kontrakt (role gating)

Risk Hub route:

- `/risk-hub` má být dostupný pouze roli CRO.

Postup:

1. Ověřte roli reportera v `/users`.
2. Pokud reporter není CRO:
   - nezkoušejte Risk Hub “otevřít násilím”
   - vyjasněte access kontrakt s business ownerem
   - pokud má být CRO, změňte roli přes podporovaný access workflow (viz user-management runbook)

### 2) Pokud role sedí, ale stránka padá: sebrat technickou evidenci

Použijte Admin Console (`/admin`) a zachyťte:

- audit logy okolo timestampu (pokusy o config změny a denied requesty)
- application logy okolo timestampu (error, validace, výjimky)

Zachyťte request IDs, pokud jsou. Je to nejrychlejší most k engineering analýze.

### 3) Klasifikovat selhání a zvolit minimální fix

Časté failure modes:

- **Forbidden / permission denied**:
  - role mismatch, stale session nebo backend permission regres
- **Validation error**:
  - konfigurace input je odmítnutý (data-quality nebo rule mismatch)
- **Server error (500)**:
  - technická vada nebo integrační problém
- **“Uloženo”, ale neaplikuje se**:
  - změna je approval-gated, UI ukazuje cache, nebo save nikdy nedoběhl
- **Questionnaire send přeskočil rizika**:
  - chybí owner, existuje otevřený dotazník nebo výběr obsahoval out-of-scope riziko
- **Role permission save byl odmítnut**:
  - jedno nebo více permission ID už neexistuje; backend odmítne celou náhradu dřív, než smaže aktuální permissions
- **Department save/delete byl odmítnut**:
  - manager chybí/je inactive, existuje duplicitní name/code, nebo oddělení stále obsahuje users, risks, controls, KRIs, vendors či pending orphans

Minimální zásahy admina:

- session refresh:
  - po role změně požádejte CRO o re-login
- access korekce:
  - upravte roli/scope jen pokud je to autorizované a jasně požadované
- evidence-driven eskalace:
  - pokud jde o 500 nebo nekonzistentní enforcement, eskalujte engineeringu s request IDs

Podpora dotazníků:

- jedno riziko může mít jen jeden otevřený dotazník (`sent` nebo `in_progress`)
- batch send i single send mají reportovat stejné skip reasons pro chybějícího ownera a otevřený dotazník
- owner display má ukazovat lidský label nebo `Unknown user`; raw numerické owner ID v UI berte jako display regresi
- deadline reminder dedupe je per questionnaire instance, ale notifikace stále naviguje na riziko

Podpora rolí a oddělení:

- řádky rolí a oddělení v Risk Hubu poskytují backend capability metadata pro update/delete/restore; pokud akce po refreshi zmizí, backend je autorita
- kolekční akce v Risk Hubu (vytvoření typu rizika, oddělení nebo role, konfigurace schvalování, systémová nastavení a batch send dotazníků) jsou řízené backend capability metadata
- schvalovací scénáře jsou runtime politika: vypnutý scénář může nechat autorizovanou změnu proběhnout přímo a `approver_roles` omezuje, kdo smí nově vytvořený approval schválit nebo odmítnout
- department manager musí být active user; bezpečnější je usera nahradit nebo řízeně reaktivovat než validaci obcházet
- department delete je záměrně konzervativní, protože department scope ovlivňuje RBAC, reporty, vendory, KRIs a orphan governance

### 4) Hranice: technické vs policy

Použijte tuto hranici:

- “Screen nejde načíst / save vrací 500” je technické (admin + engineering).
- “Threshold má být 15 ne 20” je policy (business owner).
- “Save je denied neočekávaně” je technické, dokud neprokážete opak (admin prověřuje auth path).

Při policy předání:

- přiložte evidenci, co systém aktuálně dělá
- popište, co by se změnilo, když se policy rozhodnutí změní
- neproponujte hodnoty, pokud si to business owner explicitně nevyžádá

## Ověření po změně

Po podpůrných akcích ověřte:

- CRO umí načíst `/risk-hub` a problémový tab se načte
- pokud šlo o save, save akce je úspěšná a změna je pozorovatelná
- audit trail existuje pro všechny config změny, které proběhly
- ticket obsahuje:
  - co selhalo
  - co jste ověřil/a
  - co jste změnil/a (pokud něco)
  - co zůstává business rozhodnutí (pokud relevantní)

## Rollback

Rollback záleží na tom, co se měnilo:

- Pokud jste měnil/a **access** (role/scope/oddělení):
  - vraťte původní hodnoty, pokud to způsobilo regresi
  - revokujte sessions, pokud vznikla nechtěná expozice
- Pokud CRO změnil **konfiguraci** a způsobilo to škodu:
  - preferujte revert přes stejný Risk Hub mechanismus (business-owned)
  - neprovádějte “tichý admin rollback” mimo governovanou plochu

Pokud neumíte rollback bezpečně, eskalujte. Risk Hub konfigurace sahá do governance chování a vyžaduje explicitní ownership.

## Troubleshooting

### CRO nejde otevřít `/risk-hub` a je redirect

Checks:

- role CRO v `/users`
- refresh session po role změně

Akce:

- pokud je role špatně, opravte (se souhlasem)
- požádejte o re-login
- pokud stále failuje, eskalujte jako auth regres

### Risk Hub jde otevřít, ale jeden tab selhává

Checks:

- zachyťte tab a akci
- korelujte s logy/auditem v `/admin`

Akce:

- pokud 500: eskalujte engineeringu s request ID
- pokud validace: zachyťte přesnou hlášku a předejte business ownerovi, pokud jde o policy input

### Questionnaire batch send přeskočil více řádků, než se čekalo

Checks:

- vybraná rizika mají ownery
- vybraná rizika už nemají otevřený dotazník
- filtry nezahrnuly out-of-scope nebo neaktivní záznamy

Akce:

- předejte CRO summary created/skipped/error
- missing owner data opravujte běžným governance/access workflow
- nevytvářejte ručně duplicitní otevřené dotazníky

### Business owner chce “admin override”

To je governance smell. Default reakce:

- neoverrideujte bez explicitní policy
- nabídněte podporovanou a auditovatelnou cestu (Risk Hub změna + schvalování, kde je)

## Eskalace a předání

Eskalujte engineeringu, když:

- requesty padají na 500 nebo se chovají nekonzistentně napříč účty
- audit trail chybí pro config změny
- permission enforcement je protichůdný

Eskalujte business ownerovi, když:

- je spor o správné hodnoty/limity/taxonomii
- jsou potřeba rozhodnutí o struktuře oddělení

Balíček pro předání:

- kdo to hlásil (role/scope)
- který tab/akce selhala
- timestamp okno
- request IDs + log snippety
- co jste ověřil/a a co jste změnil/a
- jaké rozhodnutí je potřeba a kdo je owner

## Související dokumentace

- Opravy přístupů: [Správa uživatelů a přístupů](./user-management.md)
- Evidence exporty: [Reporty a evidence exporty](./reports.md)
- Schvalovací podpora: [Podpora schvalování](./approvals.md)
