---
title: Admin onboarding a runbook prvního dne
version: "2.1"
last_updated: "2026-03-15"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + frontend/src/pages/UsersPage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "Runbook pro day-one readiness admina s explicitními Healthy, Degraded a Stop stavy."
tags:
  - onboarding
  - overview
  - access
  - audit
  - troubleshooting
  - settings
---

# Admin onboarding a runbook prvního dne

## Přehled

Použijte tento runbook k ověření, že je prostředí bezpečné pro admin provoz ještě před access změnami. Je to day-one baseline pro nového operátora a také post-change baseline po releasu, který mohl ovlivnit auth, sessions, logy, audit nebo admin konzoli.

Pro live incidenty začněte raději [Rychlou referencí admin incidentů](./incident-quick-reference.md).

## Kdy to použít

Použijte tento runbook:

- když se stáváte operátorem prostředí
- po deploymentu, který změnil auth, sessions, logy, audit nebo admin konzoli
- když chcete potvrdit, že admin a non-admin hranice stále funguje
- když potřebujete zdokumentovaný baseline ještě před rutinní access prací

## Předpoklady a bezpečnost

Než s onboarding kontrolami začnete:

- potvrďte, že jste přihlášeni pod správným `admin` účtem
- potvrďte, že pracujete ve správném prostředí
- potvrďte, že nejde o live outage, která už vyžaduje symptom-first triage
- držte se read-only kroků kromě výslovného export drillu v tomto runbooku

Bezpečnostní pravidla pro day-one validaci:

- netestujte tím, že si nebo někomu jinému rozšíříte přístup
- vypnutá tlačítka neberte jako pobídku k alternativnímu nebo manual postupu
- pokud prostředí spadne do `Stop and escalate`, nepokračujte
- evidenci zachytávejte průběžně, ať první hodinu nemusíte zpětně rekonstruovat

## Stavy připravenosti

| Stav | Kritéria | Akce operátora |
|---|---|---|
| Healthy | `/admin` se načte, database je connected, scheduler lock je držený, outbox dead-letter count je `0` a Logs, Audit i Sessions se načtou | pokračujte v onboarding a low-risk admin práci |
| Degraded but operable | `/admin` funguje, ale jedna závislost je degraded a Logs, Audit i Sessions stále fungují | zachyťte evidenci, držte se read-only nebo low-risk akcí a při user dopadu eskalujte |
| Stop and escalate | Health page failuje, database je disconnected, Logs, Audit nebo Sessions failují, exporty failují nebo admin hranice vypadají špatně | zastavte access změny a ihned eskalujte |

## Nepokračujte do access změn, pokud platí cokoliv z toho

- Health se nenačte
- database status je `disconnected`
- Logs, Audit nebo Sessions nefungují
- CSV nebo JSON export selže
- `/admin/docs` ukazuje user manuály místo admin manuálů
- admin navigace neočekávaně ukazuje business-only moduly

## Postup krok za krokem

### 1) Ověřte identitu, roli a navigaci

1. Ověřte, že efektivní role je `admin`.
2. Ověřte, že default landing route je `/admin`.
3. Ověřte, že sidebar ukazuje jen admin-safe navigaci.
4. Ověřte, že `/activity-log` a `/governance` jsou pro `admin` odmítnuté nebo přesměrované.

Pokud jako `admin` vidíte business moduly, zastavte se a eskalujte.

### 2) Ověřte baseline Admin Console

Otevřete `/admin` a potvrďte:

- **Health** se načte a ukazuje:
  - database `connected`
  - scheduler lock držený s current ownerem
  - outbox dead-letter count `0`
- **Application logs** se načtou a jdou filtrovat
- **Audit logs** se načtou a jdou filtrovat
- **Sessions** se načtou a ukazují aktivní session záznamy

Pokud něco z toho failuje, prostředí není připravené pro access změny.

### 3) Ověřte audience split dokumentace

Otevřete `/admin/docs` a potvrďte:

- audience label říká admin dokumentace
- jsou přítomné admin runbooky
- interní doc odkazy se otevírají ve čtečce
- app route odkazy navigují v aplikaci
- externí odkazy se otevírají v novém tabu

Musíte být schopni bez váhání říct:

- „Admin vidí jen admin dokumentaci.“
- „Ne-admin vidí jen user dokumentaci.“

### 4) Ověřte access surface

Otevřete `/users` a potvrďte:

- seznam uživatelů se načte
- v access režimu vidíte roli, oddělení, managera a scope
- **Edit access** je dostupné pro admin mutace

Pokud `/users` není použitelné, nepokračujte do access práce.

### 5) Udělejte jeden minimal safe drill

1. V `/admin` -> **Audit logs** vyexportujte posledních 50 řádků do CSV.
2. Ověřte, že soubor existuje a obsahuje timestampy, event názvy a request IDs.
3. Během tohoto drillu neměňte business data.

## Ověření po změně

Jste ready to operate jen pokud platí vše:

- `/admin` se načte a stav je `Healthy`
- `/admin/docs` ukazuje jen admin manuály
- `/users` je použitelné pro admin práci
- exporty v Admin Console fungují
- umíte zachytit request IDs a korelovat je s logy
- víte, komu eskalovat engineering, security a business-policy otázky
- umíte před akcí vysvětlit, které kroky jsou read-only, reverzibilní nebo nevratné

## Rollback

Tento runbook je převážně read-only. Pokud jste během validace něco změnili:

- vraťte log config na původní zapsané hodnoty
- zdokumentujte případnou revokaci session
- okamžitě vraťte jakoukoliv tréninkovou nebo testovací access změnu
- zapište, zda rollback obnovil původní stav, nebo zda je stále nutná eskalace

## Troubleshooting

### `/admin/docs` vypadá jako user dokumentace

1. Udělejte jeden re-login.
2. Znovu otevřete `/admin/docs`.
3. Pokud audience stále nesedí, zachyťte user email, role label, locale a document IDs.
4. Eskalujte jako authorization boundary incident.

### Health je během onboardingu degraded

- zastavte access změny
- zachyťte Health stav a timestamp
- otevřete Application logs a zapište opakující se request IDs
- eskalujte s evidence balíčkem

### `/users` není během onboardingu dostupné

- nepoužívejte alternativní nebo manual access cesty
- zachyťte failing route a request IDs
- eskalujte jako regres admin surface

### Prostředí je degraded, ale stále částečně použitelné

- přestaňte onboarding brát jako checklist, který musíte dokončit za každou cenu
- zařaďte prostředí jako `Degraded but operable`
- dokončete jen evidence-capture kroky, které jsou pořád bezpečné a read-only
- otevřete [Admin Console](./console.md) pro přesný failure mode a pravidla handoffu

## Eskalace a předání

Přiložte:

- co jste pozoroval/a
- route a timestamp
- jaký readiness stav jste určil/a
- request IDs a export evidence
- minimální kroky k reprodukci

## Související dokumentace

- [Rychlá reference admin incidentů](./incident-quick-reference.md)
- [Admin Console](./console.md)
- [Správa uživatelů a přístupů](./user-management.md)
- [Reporty a evidence exporty](./reports.md)
