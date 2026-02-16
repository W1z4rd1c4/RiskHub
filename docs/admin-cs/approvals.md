---
title: Podpora schvalování (admin runbook)
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "frontend/src/pages/ApprovalsPage.tsx + backend/app/api/v1/endpoints/approvals/* + backend/app/core/activity_logger.py"
summary: "Admin runbook pro incidenty schvalování: stuck žádosti, chyby přechodů, chybějící notifikace a evidence-based eskalace."
tags:
  - approvals
  - workflow
  - audit
  - troubleshooting
  - notifications
---

# Podpora schvalování (admin runbook)

## Přehled

Schvalování je guardrail pro governance-citlivé změny. Existuje proto, aby:

- se high-impact změny neaplikovaly potichu
- existovala explicitní stopa rozhodnutí (kdo, kdy a proč schválil/zamítl)
- “rollback” šel řešit novou kontrolovanou změnou, ne ručními zásahy

Jako platformní admin máte u schvalování úkol udržet workflow **spolehlivé a čitelné**. Business rozhodnutí nejste defaultně vy.

Schvalovací incident má typicky jednu z těchto podob:

- žádost existuje, ale nehýbe se (stuck)
- uživatel čeká žádost, ale žádná nevznikne (missing request)
- přechody selhávají (forbidden/validace/500)
- notifikace neodpovídají událostem workflow (missing nebo hlučné)

Pokud problém zredukujete na jeden z těchto tvarů, bývá řešení rychlé.

## Kdy to použít

Použijte tento runbook, když:

- queue schvalování roste neočekávaně nebo obsahuje staré pending položky
- uživatel hlásí „uložil/a jsem, ale nic se nezměnilo“
- schvalovatel hlásí, že nejde approve/reject (nečekané forbidden)
- v organizaci je nejasné chování `pending` vs `pending_privileged`
- notifikace okolo schvalování jsou chybějící, zpožděné nebo spammy

## Předpoklady a bezpečnost

Než zasáhnete:

1. Ověřte prostředí (prod vs staging) a severity incidentu.
2. Zachyťte minimum faktů pro reprodukci:
   - approval request id (ideálně)
   - dotčená entita (risk/control/vendor/…)
   - routy (`/approvals` + route entity)
   - identity žadatele/schvalovatele
   - přibližné timestampy
3. Rozhodněte, zda jste v této org autorizovaný/á schvalování rozhodovat.
   - I když to technicky jde, může to porušit governance. Default je support + evidence + předání.

Bezpečnostní pravidla:

- Neobcházejte schvalování přímou editací business dat.
- Preferujte reverzibilní zásahy:
  - cancel/reject s jasnou poznámkou (pokud policy dovolí)
  - refresh session (re-login)
- Chybějící audit trail berte jako high-severity problém. Bez traceability se nedá bezpečně operovat.

## Postup krok za krokem

### 1) Identifikovat žádost a zamýšlenou změnu

Pokud máte approval request id, začněte tam. Pokud ne, rekonstruujte:

1. Vyžádejte od reportera:
   - co měnil (která pole)
   - kdy klikl na save
   - co očekával jako další krok
2. Otevřete `/approvals` (pokud je to ve vašem prostředí dostupné) a hledejte podle:
   - status (nejdřív `pending`)
   - “my requests” vs queue (podle resolver oprávnění)
3. Zapište:
   - aktuální status
   - requester identitu
   - pending change set (old → new)

Pokud žádost nejde najít, přejděte na troubleshooting „missing request“.

### 2) Klasifikovat incident: technický vs policy vs data quality

Použijte toto dělení:

- **Policy**: spor o ownership/approver chain, „má to být povolené?“, neshoda v rozhodnutí.
- **Data quality**: chybí owner/oddělení/manager mapping, orphans, invalid hodnoty.
- **Technický**: server error, forbidden mismatch, transition chyby, chybějící logy.

Pokud je to policy: rychle vyrobte evidence balíček a předejte. Admin čas je nejcennější na technických a integritních problémech.

### 3) Korelace přes evidenci (Admin Console)

Použijte `/admin` pro evidence:

- **Audit logs**: potvrďte create/resolve/cancel eventy a aktéry.
- **Application logs**: zjistěte, proč backend přechod odmítl (validace vs permission vs exception).

Zachyťte:

- timestampy klíčových událostí
- request IDs (pokud jsou viditelné)
- event typy
- error payloady/hlášky

### 4) Zvolit nejmenší bezpečný zásah

Vyberte nejmenší akci, která odblokuje a neobejde governance.

Časté bezpečné zásahy:

- **Stale session**:
  - požádejte uživatele o re-login
  - zkuste akci jednou zopakovat
- **Duplicitní pending requesty** pro stejný resource:
  - zrušte starší request (pokud policy dovolí) nebo požádejte requestera o cancel
  - ponechte jeden autoritativní pending request
- **Chybí ownership / není jasný approver**:
  - nehádejte ownera
  - předání business ownerovi pro rozhodnutí
  - po rozhodnutí opravte routing data a re-run schvalování

Vyhněte se:

- ručním DB editům
- “admin override” změnám mimo workflow

### 5) Ověřit finální stav

Po zásahu ověřte:

- status žádosti je správný (pending/approved/rejected/canceled)
- pokud approved, entita má nové hodnoty
- nezůstaly duplicitní pending requesty
- notifikace odpovídají workflow (žádné opakované falešné remindery)

## Ověření po změně

Před uzavřením incidentu ověřte:

- žádost existuje a je v očekávaném stavu
- requester a approver identity sedí
- pending změny odpovídají záměru
- každé zamítnutí má resolution notes (jasné vysvětlení)
- audit trail existuje pro create + resolve/cancel pokusy
- pokud approved: entita ukazuje nové hodnoty a nezobrazuje “pending changes”

## Rollback

Schvalování dělá rollback bezpečnější než přímé edity. Rollback záleží na stavu:

- **Pending**:
  - cancel (preferované) nebo reject s poznámkou (pokud policy dovolí)
- **Approved, ale špatně**:
  - vytvořte novou approval žádost, která hodnotu vrátí (audit-safe)
  - vyhněte se tichým přímým zápisům mimo workflow
- **Rejected, ale spor trvá**:
  - eskalujte business rozhodnutí, potom pošlete čistší request

Pokud rollback neumíte vysvětlit v jednom odstavci, zastavte se a eskalujte. Improvizovaný rollback je auditní riziko.

## Troubleshooting

### Žádost “zamrzla” v `pending`

Checks:

- approver je nedostupný (policy/workload), ne technická vada
- request je v “privileged pending” stavu (citlivější změny)
- existuje více pending requestů pro stejný resource

Akce:

- identifikujte autoritativní request
- zrušte duplicity (nebo požádejte requestera o cancel)
- pokud je spor o approver chain, předání business ownerovi

### Approve/reject selže na forbidden

Checks:

- má actor `approvals:write`?
- smí actor vidět podkladový resource ve svém scope?
- nezměnila se role/scope a session je stale?

Akce:

- re-login
- ověřte roli/scope v `/users`
- korelujte s logy pro failing request

### “Uložil/a jsem, ale nic se nezměnilo” a neexistuje žádná žádost

Checks:

- bylo uložení úspěšné, nebo to potichu spadlo?
- má tento typ změny v prostředí vytvářet approval request?

Akce:

- zkuste reprodukci stejné změny a zachyťte timestampy
- v audit/logs hledejte create-request eventy nebo validační chyby
- pokud je tvorba requestů nespolehlivá, eskalujte na engineering

### Notifikace jsou missing nebo spammy

Checks:

- ukazují audit/log feedy odpovídající workflow eventy?
- dívá se uživatel na správné časové okno?
- dávají smysl due dates a frekvence na podkladové entitě?

Akce:

- potvrďte create/resolve eventy
- opravte zjevné data-quality vstupy (s governance) pokud remindery vznikají z invalid cadence

## Eskalace a předání

Eskalujte business ownerům, když:

- je spor o ownership/approver chain
- schvalovací obsah je doménové rozhodnutí

Eskalujte engineeringu, když:

- přechody hází server errors
- audit trail chybí nebo je nekonzistentní
- tvorba schvalovacích žádostí je nespolehlivá

Balíček pro předání:

- approval request id (nebo nejlepší rekonstrukce)
- status timeline
- aktéři (requester/approver)
- co selhalo (akce + error)
- timestampy + request IDs (pokud jsou)
- co jste ověřil/a a co zůstává neznámé

## Související dokumentace

- Evidence exporty a audit kontext: [Reporty a evidence exporty](./reports.md)
- Opravy přístupů/scope: [Správa uživatelů a přístupů](./user-management.md)
- Handoff model hranic Risk Hub: [Hranice konfigurace Risk Hub](./riskhub-config.md)
