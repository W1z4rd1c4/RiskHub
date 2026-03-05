---
title: Reporty a evidence exporty (admin runbook)
version: "2.0"
last_updated: "2026-03-05"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "Admin runbook pro audit-ready exporty: co exportovat, jak správně omezit scope, jak zachovat provenance a jak bezpečně předat evidenci."
tags:
  - exports
  - audit
  - troubleshooting
  - workflow
  - settings
---

# Reporty a evidence exporty (admin runbook)

## Přehled

“Reporting” pro platformního admina nejsou business dashboardy. Je to **produkce evidence**: vytváření dohledatelných exportů, které odpoví na konkrétní otázku při incidentu, auditu nebo podpůrné investigaci.

Admin nepoužívá business `/activity-log` ani `/governance` jako evidence plochu. Tyto routy jsou business-facing a pro `admin` záměrně blokované; podporovaná cesta evidence vede přes `/admin`.

Admin evidence musí být:

- scoped (minimum potřebných dat)
- reprodukovatelná (jasné filtry a časové okno)
- auditovatelná (zachovaná provenance)
- bezpečná (žádný zbytečný leak citlivých údajů)

RiskHub poskytuje exportní plochy primárně přes Admin Console audit feed (CSV/JSON). Application logy jsou také užitečné, ale vyžadují opatrnost, aby nedošlo k úniku citlivých payloadů.

## Kdy to použít

Použijte tento runbook, když potřebujete:

- rekonstruovat incident timeline (“co se stalo a kdy?”)
- doložit změnu přístupu (“co se změnilo uživateli X?”)
- podložit workflow/schvalovací anomálie (“žádost vznikla, ale nerozhodla se”)
- předat reprodukovatelný defect report engineeringu
- dodat audit artefakty se zachovanou provenance (exporty + cover note)

Nepoužívejte to jako náhradu business exportů (rizika/kontroly/dodavatelé). Pokud business owner potřebuje business data, koordinujte to a využijte user exportní flow.

## Předpoklady a bezpečnost

Než exportujete:

1. Definujte přesnou otázku, kterou má export zodpovědět.
   - Dobře: “Ukaž všechny audit eventy pro user 123 mezi 10:00 a 11:00 UTC.”
   - Špatně: “Vyexportuj všechno pro jistotu.”
2. Určete minimální zdroj:
   - audit logy pro “kdo změnil co”
   - application logy pro “proč request selhal”
   - sessions view pro “kdo je přihlášen / revoke akce”
3. Zvolte minimální časové okno.
4. Ověřte, kde smíte evidenci ukládat/sdílet (schválený kanál).

Bezpečnostní pravidla:

- Počítejte s tím, že export může obsahovat citlivé detaily. Neposílejte raw logy do neřízených kanálů.
- Zachovejte originální export soubor. Pokud ho transformujete, držte raw export nezměněný a přidejte manifest.
- Preferujte JSON, když potřebujete strukturované detaily; CSV pro rychlý review/spreadsheet práci.

## Postup krok za krokem

### 1) Vybrat typ evidence a časové okno

Začněte krátkou “evidence hlavičkou”, kterou přiložíte k ticketu:

- incident/ticket id
- prostředí
- otázka, kterou řešíte
- časové okno (včetně timezone)
- zdroj (`/admin` → Audit Logs, atd.)

Pak zvolte:

- **Audit logs** pro stopu akcí (kdo/co/kdy).
- **Application logs** pro kontext selhání (error/validace/stack).
- **Sessions** pro session stav a revoke.

### 2) Export audit logů (CSV/JSON)

1. Otevřete `/admin` → Audit Logs.
2. Nastavte line limit (začněte malým: 50–200).
3. Použijte event filtering (pokud je) pro zúžení datasetu.
4. Exportujte:
   - CSV pro rychlý přehled
   - JSON pro strukturované šetření a handoff engineeringu

Ihned po exportu:

- ověřte, že timestamp v názvu souboru odpovídá času exportu
- otevřete soubor a vzorkově zkontrolujte:
  - timestampy
  - event pole
  - user_id (kde dává smysl)
  - request_id (kritické pro korelaci)

### 3) Získat application log evidence (opatrně)

Application logy mohou obsahovat payload-like detaily.

Doporučený postup:

1. Zúžte časové okno na minimum okolo selhání.
2. Zachyťte jen řádky, které ukazují:
   - error class/message
   - request id (pokud je)
   - kontext endpointu/route
3. Pokud musíte vložit snippet do ticketu:
   - vložte jen relevantní řádky
   - vyhněte se secretům a tokenům
   - uveďte časové okno a použitý filtr

### 4) Sestavit evidence balíček (provenance)

Evidence balíček má obsahovat:

- raw export soubor(y) (CSV/JSON)
- krátký cover note (1 odstavec):
  - “as of” timestamp
  - použité filtry (event type, line count)
  - co export dokazuje (1 věta)

Pokud kombinujete více exportů:

- přidejte manifest tabulku:
  - filename
  - generated_at
  - source
  - filter/time window

To udrží evidenci použitelnou i po týdnech.

### 5) Bezpečné předání

Při předání engineeringu nebo business ownerovi:

- nepřikládejte “všechno”
- přiložte jen minimum, které dokazuje tvrzení
- přidejte reproduction kroky, pokud jde o defect
- přidejte request IDs pro korelaci v backend trasách

## Ověření po změně

Před uzavřením úkolu ověřte:

- exporty existují a jdou otevřít
- timestampy a filtry jsou zapsané (cover note/manifest)
- request IDs (pokud relevantní) sedí na incident okno
- export neobsahuje zbytečné citlivé informace
- čtenář pochopí, co evidence dokazuje, bez follow-up dotazů

## Rollback

Export nejde “od-poslat”, rollback je o containmentu:

- Pokud jste vyexportoval/a příliš široký dataset:
  - okamžitě zastavte distribuci
  - smažte soubor z míst, kde to policy dovoluje
  - znovu exportujte s korektním scope a nahraďte v ticketu
- Pokud jste během šetření změnil/a admin nastavení (např. log rotation):
  - vraťte původní hodnoty
  - zapište proč jste změnil/a a proč jste vrátil/a

Pokud jde o potenciální data leak, eskalujte na security okamžitě.

## Troubleshooting

### Export je hotový, ale chybí očekávané záznamy

Checks:

- příliš úzké časové okno
- špatný event filtr
- akce se nikdy nestala (mismatch reportu)

Akce:

- rozšiřte okno (např. ±10 minut)
- zrušte filtry a exportujte malý vzorek
- potvrďte přes application logy nebo další audit události

### Export akce selhává nebo soubor stáhne prázdný

Checks:

- restrikce browser downloadů
- API fail v admin konzoli

Akce:

- zachyťte chybu a timestamp
- zkuste menší line limit
- pokud je to perzistentní, eskalujte jako observability outage (blokuje incident response)

### Evidence obsahuje citlivé informace

Akce:

- okamžitě zastavte sdílení
- přesuňte evidenci do schváleného secure kanálu
- vygenerujte redacted/minimal export, pokud je potřeba
- zdokumentujte co bylo exponované a komu (pro incident response)

## Eskalace a předání

Eskalujte engineeringu, když:

- admin exporty selhávají (audit feed není dostupný)
- request IDs nejdou korelovat kvůli chybějícímu kontextu

Eskalujte security, když:

- evidence obsahuje secrety/PII mimo povolený rozsah
- exporty byly distribuované nesprávně

Minimum pro předání:

- co jste exportoval/a a proč (1 odstavec)
- filenames + generated_at
- filtry/časové okno
- request IDs a klíčové eventy

## Související dokumentace

- Provoz Admin Console: [Admin Console](./console.md)
- Schvalovací incidenty: [Podpora schvalování](./approvals.md)
- Evidence pro access změny: [Správa uživatelů a přístupů](./user-management.md)
