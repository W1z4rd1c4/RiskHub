---
title: Oddělení: admin podpora a integrita přístupů
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md (scope/viditelnost) + backend/app/api/v1/endpoints/riskhub/departments.py + frontend/src/pages/UsersPage.tsx"
summary: "Admin runbook pro podporu změn oddělení bez rozbití přístupů: diagnostika scope, změny přiřazení uživatelů a bezpečné předání business ownerovi."
tags:
  - departments
  - access
  - workflow
  - audit
  - troubleshooting
---

# Oddělení: admin podpora a integrita přístupů

## Přehled

Oddělení jsou strukturální hranice v RiskHubu, které ovlivňují:

- defaultní viditelnost (scope + přiřazení oddělení)
- reporting rollupy (dashboardy a exporty po oddělení)
- kontext workflow (jak se vyhodnocuje ownership a schvalování)

Důležitá hranice: **CRUD oddělení je business-governance funkce** (typicky CRO-owned). Platformní admin obvykle nerozhoduje „jaká jsou oddělení“. Odpovědnost admina je držet přístupové chování předvídatelné, držet přiřazení uživatelů konzistentní a dodat evidenci, když změny oddělení způsobí incident.

Tento runbook popisuje admin podporu oddělení: diagnostika scope problémů, bezpečné změny přiřazení uživatelů a koordinace předání business ownerovi pro create/update/archive akce.

## Kdy to použít

Použijte tento runbook, když:

- uživatel nevidí data svého oddělení (nebo vidí špatné oddělení)
- probíhá re-org a je potřeba upravit přiřazení uživatelů
- názvy/kódy oddělení jsou nekonzistentní a rozbíjí výběr v `/users`
- oddělení se „ztratí“ v selectorech nebo dashboardech
- business owner chce oddělení deaktivovat/archivovat a vy chcete předejít access regresím

## Předpoklady a bezpečnost

Než změníte přiřazení uživatelů:

1. Ověřte, že nejde o policy spor převlečený za platformní problém.
   - Příklad policy sporu: „které oddělení má vlastnit tohoto dodavatele?“
2. Zachyťte fakta:
   - dotčení uživatelé
   - aktuální role a access scope (`global`, `department`, `manager`)
   - očekávaná vs pozorovaná viditelnost
   - časové okno
3. Zapište si aktuální přiřazení uživatele před změnou:
   - department id/název
   - manager id/jméno

Bezpečnostní pravidla:

- Měňte jednu dimenzi najednou (oddělení nebo manager). Nemíchejte.
- Pokud je potřeba vytvořit/upravit/deaktivovat oddělení, neimprovizujte. Předejte business ownerovi s evidencí.

## Postup krok za krokem

### A) Diagnostika „uživatel nevidí data oddělení“

1. Ověřte, zda modul není permission-gated:
   - pokud položka v menu chybí, bývá to oprávnění, ne oddělení.
2. Ověřte **access scope** uživatele:
   - `department` = defaultně „jen moje oddělení“
   - `manager` = defaultně „můj reporting strom“
3. Ověřte **přiřazení oddělení** v `/users`.
4. Ověřte **přiřazení managera** v `/users` (kritické pro manager scope).
5. Pokud uživatel vlastní záznamy mimo oddělení, ověřte, zda se neuplatňuje ownership výjimka (může být očekávané chování).

Výsledky:

- Pokud oprávnění sedí, ale oddělení je špatně: opravte přes `/users` (postup B).
- Pokud oddělení sedí, ale viditelnost pořád nesedí: scope mismatch nebo ownership/data mismatch. Zachyťte evidenci a eskalujte.

### B) Bezpečná změna přiřazení oddělení nebo managera

1. Otevřete `/users` a najděte uživatele.
2. Otevřete detail nebo Access Edit modal.
3. Upravte **oddělení** *nebo* **managera** (jedna změna).
4. Uložte.
5. Požádejte uživatele o re-login, pokud změna ovlivňuje session-derived claims (hlavně role/scope).

Ověření:

- řádek uživatele v `/users` ukazuje nové oddělení/managera
- uživatel otevře očekávané routy
- uživatel vidí očekávaná data v rámci svého scope

Rollback:

- vraťte původní oddělení/managera podle poznámek

### C) Podpora re-orgu (disciplína bulk změn)

Riziko re-orgu není samotná změna, ale **tichý drift** a nejasný ownership.

Doporučený admin postup:

1. Vyžádejte od business ownera zdrojový seznam:
   - kdo přechází z oddělení A do B
   - kdo bude manager koho (pro manager scope)
2. Aplikujte změny v malých batchích.
3. Po každém batchi udělejte vzorkové ověření s alespoň jedním uživatelem:
   - očekávané moduly jsou vidět
   - dashboardy oddělení mají plausibilní metriky
4. Zapište krátkou “re-org window” poznámku (datum/čas, dotčená oddělení, očekávané side efekty).

Tím předejdete falešným incidentům při porovnávání trendů přes restrukturalizační okno.

### D) Předání pro CRUD oddělení (create/update/archive/restore)

Pokud je úkol „vytvořit oddělení“ nebo „přejmenovat/deaktivovat oddělení“, berte to jako business-governance.

Admin odpovědnost pro předání:

1. Ověřte, co přesně se má změnit:
   - name
   - code
   - manager
   - active/inactive stav
2. Dodejte evidence o dopadu:
   - kteří uživatelé jsou přiřazení
   - které routy/funkce jsou blokované kvůli stavu oddělení
   - chyby (timestampy)
3. Buďte připraveni aplikovat navazující změny přiřazení uživatelů po provedení změny oddělení.

## Ověření po změně

Po dokončení podpory ověřte:

- žádný uživatel nepřišel o přístup neočekávaně (vzorek rolí/scope)
- dotčený uživatel vidí očekávaná data oddělení
- dashboardy oddělení mají plausibilní počty (nemusí být stejné jako předtím, ale nesmí být “vynulované” omylem)
- ticket obsahuje:
  - fakta o přiřazení before/after
  - kdo schválil re-org rozhodnutí (business owner)
  - co bylo ověřeno po změně

## Rollback

Rollback u podpory oddělení je typicky **rollback přiřazení uživatelů**, ne rollback objektu oddělení.

1. Vraťte původní oddělení/managera.
2. Požádejte dotčené uživatele o re-login.
3. Pokud business owner provedl rename/deaktivaci a způsobilo to plošné rozbití:
   - eskalujte okamžitě
   - navrhněte dočasný containment (reaktivace oddělení) jen se souhlasem business ownera

Nedělejte “kreativní fixy”, které přepisují business strukturu bez ownership souhlasu.

## Troubleshooting

### Oddělení je „missing“ v selectorech

Typické příčiny:

- oddělení je inactive/archived
- konflikt kódů/názvů (duplicitní code)
- scope/oprávnění brání načtení podpůrných dat

Akce:

- ověřte, že oddělení existuje a je aktivní (business owner může potřebovat restore)
- zachyťte chybu a timestamp
- předání business ownerovi pro CRUD akce

### Uživatelé ztratili viditelnost po re-orgu

Checks:

- ověřte oddělení v `/users`
- ověřte manager chain pro manager scope
- ověřte re-login po změnách role/scope

Pokud šlo o větší změnu, hledejte “partial batch” (část uživatelů přesunuta, část ne).

### Nečekaný cross-department access po změně

Checks:

- scope omylem eskalovaný (`global`)
- ownership výjimky (owner viditelnost) fungují podle návrhu

Akce:

- pokud je to scope eskalace: okamžitě vraťte a případně revokujte sessions
- pokud je to ownership: zdokumentujte jako očekávané chování a předání, pokud policy má být změněná

## Eskalace a předání

Eskalujte, když:

- se promíchají boundary pravidla (uživatel vidí data mimo očekávaný scope bez ownership důvodu)
- dochází k masivnímu výpadku viditelnosti po re-orgu
- CRUD oddělení selhává s chybami, které vypadají jako systémové (500/validation drift)

Balíček pro předání:

- dotčení uživatelé + scope
- před/po přiřazení
- kroky k reprodukci
- timestampy + error text + request IDs (pokud jsou)

## Související dokumentace

- Správa přístupů: [Správa uživatelů a přístupů](./user-management.md)
- Podpora workflow: [Podpora schvalování](./approvals.md)
- Evidence exporty: [Reporty a evidence exporty](./reports.md)
