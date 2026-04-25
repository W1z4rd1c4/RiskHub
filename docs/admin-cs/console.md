---
title: Admin Console (/admin)
version: "2.2"
last_updated: "2026-03-15"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + admin API endpoints"
summary: "Operator-safe runbook pro Health, Application logs, Audit logs, Sessions a evidence export workflow."
tags:
  - overview
  - audit
  - exports
  - troubleshooting
  - settings
---

# Admin Console (/admin)

## Přehled

Admin Console je first-line operator surface pro:

- health validaci
- incident triage
- application a audit evidence capture
- vyšetření a revokaci session
- low-risk změny log konfigurace

Hlavní route: `/admin`

Platform admin má používat `/admin` pro rozhodnutí o stavu platformy místo business modulů.

Tento runbook je záměrně psaný pro rychlé operační rozhodnutí. Když admin váhá, zda problém řešit v `/users`, v business modulu nebo v dokumentaci, výchozí bezpečná odpověď je vrátit se do `/admin`, zařadit platform state a teprve potom rozhodnout o další akci.

## Průvodce operator stavem

| Signál | Přijatelný stav | Co udělat, když nesedí |
|---|---|---|
| Health page | načte se bez chyby | zastavte access změny a eskalujte |
| Database | `connected` | zastavte access změny a eskalujte |
| Scheduler | lock je držený a owner vyplněný | zachyťte evidenci a eskalujte jako runtime incident |
| Outbox | dead-letter count `0` | zachyťte failures dřív, než se bude řešit retry/replay |
| Application logs / Audit logs / Sessions | každý tab se načte a jde filtrovat | berte to jako observability outage a eskalujte |
| Exporty | CSV/JSON export doběhne s očekávaným filtrem | jednou zopakujte s užšími filtry, pak eskalujte |

Definice stavů:

- **Healthy**: všechny signály výše jsou přijatelné.
- **Degraded but operable**: `/admin` funguje, ale jedna závislost je degraded a logy/audit/sessions stále fungují.
- **Stop and escalate**: Health failuje, database je disconnected, observability taby failují nebo exporty nefungují.

## Kdy to použít

Použijte Admin Console, když potřebujete odpovědět:

- je platforma teď zdravá?
- dějí se právě teď chyby?
- co se změnilo a kdo to změnil?
- je session podezřelá, stale nebo potřebuje revoke?
- umím zachytit minimální evidence balíček pro podporu nebo audit?

## Předpoklady a bezpečnost

Před admin akcí:

- potvrďte, že jste přihlášeni jako `admin`
- potvrďte správné prostředí
- používejte least-exposure pravidlo pro logy a exporty

Bezpečnostní pravidla:

- nevkládejte raw logy do neautorizovaných kanálů
- exportujte jen minimum potřebných dat
- user ID, emaily, IP adresy a request IDs berte jako citlivé
- pokud je stav konzole degraded, nepokračujte do access změn

## Postup krok za krokem

### 1) Health

1. Otevřete `/admin` -> **Health**.
2. Zařaďte stav:
   - **Healthy**: database connected, scheduler lock držený, outbox dead-letter count `0`
   - **Degraded but operable**: jedna závislost degraded, ale logy/audit/sessions fungují
   - **Stop and escalate**: Health failuje nebo database je disconnected
3. Pokud stav není Healthy, zachyťte ho dřív, než uděláte změnu jinde.

### 2) Application logs

1. Otevřete **Application logs**.
2. Začněte úzkým časovým oknem a při potřebě level `ERROR`.
3. Hledejte:
   - opakující se request IDs
   - opakující se route nebo feature
   - recurring 401/403/500 patterny
4. Exportujte jen minimum řádků nutných pro case.

### 3) Audit logs

1. Otevřete **Audit logs**.
2. Filtrujte podle event type a časového okna.
3. Audit logy použijte pro potvrzení:
   - access změn
   - konfiguračních změn
   - revokace session
   - approval rozhodnutí, pokud jsou auditovaná
4. Exportujte jen evidenci potřebnou pro aktuální case.

### 4) Sessions

1. Otevřete **Sessions**.
2. Najděte uživatele podle emailu nebo jména.
3. Ověřte last activity, last login, roli a department kontext.
   - neaktivní/deprovisioned uživatelé se v active sessions nezobrazují, i když existují starší refresh záznamy
4. Revokujte session jen když je to nutné:
   - podezření na kompromitaci
   - offboarding
   - zaseknutý auth/session stav

Revokace session je nevratná. Backend ji provádí jako jeden workflow: revokuje aktivní refresh záznamy, zvýší target uživateli token version a ve stejné transakci zapíše admin activity entry. Recovery cesta je re-auth uživatele.

### 5) Log konfigurace

1. Otevřete panel log konfigurace.
2. Před změnou si zapište současné hodnoty.
3. Udělejte co nejmenší změnu retention/rotation.
4. Uložte a po refreshi potvrďte persistenci.
5. Ověřte, že exporty stále fungují.

## Ověření po změně

Po operativní akci v Admin Console potvrďte:

- klasifikace stavu stále sedí i po akci
- scheduler ownership je stále viditelný
- outbox dead-letter count je stále nula, nebo je zachycený pro eskalaci
- exporty odpovídají filtrům a neobsahují zbytečná data
- revokované session zmizely a uživatel se umí znovu autentizovat

Pokud si po ověření nejste jistí, zda je problém opravdu uzavřený, neberte to jako hotovo. Stav označte jako otevřený, přiložte evidence balíček a pokračujte eskalací místo dalšího improvizovaného zkoušení.

## Rollback

- Health checky a exporty jsou read-only a nemají rollback
- revoke session nelze vrátit; recovery je re-auth uživatele
- změny log konfigurace vracejte obnovením původních zapsaných hodnot

## Troubleshooting

### `/admin` nejde otevřít

- jednou proveďte re-auth
- potvrďte, že stále máte roli `admin`
- pokud `/admin` stále failuje, eskalujte jako admin-surface incident

### Health je degradovaný

- zastavte access změny
- zachyťte Health stav a timestamp
- otevřete Application logs pro stejné okno
- eskalujte s evidence balíčkem

### Health vypadá healthy, ale route stále failuje

- porovnejte failing route, časové okno a opakující se request IDs v Application logs
- pokud jde o jednoho uživatele, porovnejte role/scope/session stav v `/users` a **Sessions**
- pokud route dál failuje při healthy Health, eskalujte jako platform defect

### Exporty jsou prázdné nebo failují

- jednou zopakujte s menším počtem filtrů a užším časovým oknem
- pokud UI také neukazuje očekávaná data, berte to jako observability outage
- eskalujte s failing tabem, použitými filtry a timestampem

### Audit nebo logy obsahují neočekávaná citlivá data

- zastavte další exporty
- berte to jako security incident
- eskalujte s minimální potřebnou evidencí

## Eskalace a předání

Eskalujte, když:

- database je disconnected
- scheduler ownership chybí
- logy ukazují opakující se nevysvětlené chyby
- observability taby nebo exporty nejsou dostupné
- audit data naznačují neautorizovanou aktivitu

Dobrý handoff balíček:

- prostředí a časové okno
- Health klasifikace
- přesná route nebo tab
- opakující se request IDs
- minimální exporty nebo screenshoty

## Související dokumentace

- [Rychlá reference admin incidentů](./incident-quick-reference.md)
- [Správa uživatelů a přístupů](./user-management.md)
- [Reporty a evidence exporty](./reports.md)
- [Hranice konfigurace Risk Hub](./riskhub-config.md)
