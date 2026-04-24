---
title: Notifikace a schvalování
version: "2.1"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/ApprovalsPage.tsx + frontend/src/pages/NotificationsPage.tsx + docs/BUSINESS_LOGIC.md"
summary: "Produkční workflow manuál pro schvalování, notifikace, rozhodovací poznámky, triage front a eskalační vzory."
tags:
  - workflow
  - approvals
  - notifications
  - audit
  - troubleshooting
---

# Notifikace a schvalování

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

RiskHub používá workflow jako governance kontrolu. Workflow se projevuje ve dvou místech:

- **Notifikace** (`/notifications`): provozní inbox
- **Schvalování** (`/approvals`): fronta schvalovacích žádostí a risk assessment dotazníků

Mentální model, který funguje v produkci:

- Notifikace říkají *co potřebuje pozornost*.
- Schvalování říká *co potřebuje rozhodnutí*.
- Activity Log (pokud ho máte) říká *co se skutečně změnilo*.

Zdravá workflow kultura není „rychle všechno schválit“. Je to:

- rozhodnutí s jasným odůvodněním
- predikovatelné eskalace
- minimální backlog
- jasný owner další akce

Hlavní routy:

- `/notifications`
- `/approvals`

## Kde to najdete

- položka **Schvalování** → `/approvals`
- položka **Notifikace** → `/notifications`

Pokud routy nevidíte:

- schvalování bývá viditelné pro většinu business uživatelů, ale možnost rozhodovat je permission-gated
- notifikace jsou viditelné, pokud účet dostává workflow eventy

Pokud přístup nesedí, postupujte podle `./access-management.md`.

## Role, scope a viditelnost

### Kdo může schvalovat?

Schvalování má dvě publika:

- **žadatelé**: navrhují změnu a sledují status
- **schvalovatelé**: mohou approve/reject (policy-driven)

V UI je možnost schvalovat permission-gated. Typicky:

- `approvals:write` je potřeba pro approve/reject
- uživatel bez schvalovacích práv stále vidí „My requests“ a může své žádosti cancelovat

### Scope je stále relevantní

Schvalování je navázané na resource (risk/control/kri) a viditelnost řídí scope.

Pokud schvalování nemůžete najít:

- nemusíte vidět podkladový resource
- nebo schvalování nepatří do vašeho scope/role skupiny

### Platform admin vs business

Platform admin je záměrně oddělený od business workflow. Admin má podporovat platformu, ne dělat business schvalovatele.

## Datový model a klíčová pole

### Schvalovací žádosti

| Pole | Význam | Poznámky |
|---|---|---|
| Resource type | `risk`, `control`, `kri` | Které domény se žádost týká. |
| Action type | `edit` nebo `delete` | `delete` může zahrnovat archive/restore-like akce dle policy. |
| Pending changes | Deltá polí (old → new) | Procházejte po polích; neschvalujte „naslepo“. |
| Reason | Odůvodnění žadatele | Má odpovědět „proč teď“ a „proč je to bezpečné“. |
| Status | `pending`, `pending_privileged`, `approved`, `rejected`, `cancelled` | `pending_privileged` značí citlivější gating. |
| Requested by | Kdo žádost založil | Vhodné pro doplňující dotazy. |
| Resolved by / at | Kdo rozhodl a kdy | Audit-kritické. |
| Resolution notes | Narativ rozhodnutí | V UI je obvykle vyžadované. |

### Notifikace

Notifikace jsou typované eventy. Hlavní kategorie:

- approvals: `approval_pending`, `approval_resolved`, `approval_cancelled`
- KRI: due/overdue a breach detekce
- questionnaires: sent/due/overdue/submitted/clarification

Každá notifikace obsahuje:

- title/message pro rychlé skenování
- resource pointer (type/id), pokud je navázaná na entitu
- read/unread
- timestampy

## Hlavní workflow

### 1) Denní triage (doporučený rytmus)

Ve většině prostředí 2x denně (ráno + odpoledne):

1. Otevřete `/notifications`.
2. Přepněte na **Unread**.
3. Zpracujte v prioritě:
   - approval pending
   - overdue KRI / questionnaire
   - breach alerty
4. Otevřete `/approvals` a vyčistěte pending rozhodnutí, za která odpovídáte.
5. Znovu zkontrolujte `/notifications` pro outcome.

### 2) Approve nebo reject žádosti

Schvalování dělejte jako kontrolu:

1. Otevřete žádost.
2. Přečtěte **reason**.
3. Projděte **pending changes** pole po poli.
4. Zeptejte se: „Co by se rozbilo, kdyby to bylo špatně?“ (scope, reporting, routing ownership, thresholds).
5. Rozhodněte approve/reject.
6. Napište resolution notes tak, aby to šlo pochopit i za 6 měsíců.

Kvalitní notes obsahují:

- proč je to approve/reject
- jaké evidence jste použili
- podmínky nebo follow-up

### 3) Cancel žádosti, které jste založili

Když žádost už nedává smysl:

- cancelujte ji místo toho, aby „hnila“ ve frontě
- napište krátké vysvětlení do interního kanálu/ticketu

Cancel je governance akce: snižuje šum a brání pozdějšímu schválení zastaralé změny.

### 4) Risk assessment dotazníky (tab v Approvals)

Approvals stránka může mít „risk assessment“ pohled založený na dotaznících.

Použití:

- přehled, kdo má otevřené dotazníky
- follow-up na overdue
- tracking clarifications

Praktická disciplína:

- berte dotazníky jako time-boxed request
- follow-up dělejte dřív než je overdue, ať nevznikají low-quality odpovědi na poslední chvíli
- due-soon/overdue reminders pro dotazníky se deduplikují podle instance dotazníku, ne jen podle rizika
- notifikace stále navigují na parent riziko, aby uživatel skončil v provozním kontextu

### 5) Uzavření smyčky po rozhodnutí

Schvalování je užitečné jen když se svět po rozhodnutí skutečně změní.

Po schválení citlivé změny:

- ověřte, že entita má nový stav
- ověřte, že šly notifikace (nebo že je změna viditelná tam, kde má být)
- pokud to ovlivňuje reporting, poznamenejte datum „breakpointu“

## Schvalování a notifikace

### Klíčové chování: 202 „queued changes"

Některé editace se neaplikují okamžitě. Backend místo toho vytvoří schvalovací žádost (UI to často ukazuje jako pending changes).

Důsledky:

- list může ukázat „pending“ indikátor
- stará hodnota zůstává viditelná do schválení
- musíte otevřít `/approvals`, abyste viděli žádost a schvalovatele

### Notifikace jsou signály, ne akce

Notifikace mají snížit náklady na skenování. Vaše práce je převést je na akce:

- vyřešit schvalování
- upravit entitu
- založit Issue
- follow-up s ownerem

Když se notifikace „vrací“, typicky říká, že se neprovádí podkladová policy akce (overdue KRI, opakovaný breach, stuck approval).

Schvalování se při aplikaci znovu validuje. Queued změna může být odmítnuta, pokud se cílový záznam změnil během čekání; před opětovným odesláním čtěte resolution notes.

### Preference tuning

V některých prostředích lze notifikace ladit v Settings. Pokud je to příliš hlučné:

- nemuteujte všechno
- omezte high-volume kategorie, ale nechte governance kritické kategorie (approvals, breaches)

## Filtry, pohledy a exporty

### Filtry v Approvals

Approvals stránka má typicky:

- **Pending**: aktivní fronta
- **My requests**: vaše žádosti
- **All**: historie
- **Risk assessment**: dotazníky

„Pending“ je primární pohled pro provoz.

### Filtry v Notifications

Notifikace typicky podporují:

- **All** vs **Unread**
- stránkování
- mark all as read

„Mark all read“ berte jako rozhodnutí: dělejte to jen když jste konvertovali signály na akce nebo je vědomě odložili.

### Exporty

Schvalování a notifikace nejsou primární export povrchy.

Pro evidence:

- exportujte podkladové entity (rizika, kontroly, nálezy)
- použijte Activity Log pro timestamp důkazy
- do audit packu dejte approval ID a resolution notes

## Časté chyby

- Schválení bez čtení pending changes.
- Jednověté notes („ok“) pro komplexní změny.
- Nechat pending růst, protože nikdo nevlastní disciplínu fronty.
- Brát notifikace jako „FYI“ a neudělat akci.
- Vypnout notifikace pro approvals/breaches kvůli šumu (raději opravte příčinu).

## Troubleshooting

### Nechodí mi notifikace, které čekám

- Ověřte, zda jste owner/requester.
- Ověřte preference (pokud jsou).
- Ověřte, že akce skutečně proběhla (nejlépe přes Activity Log).

### Uložil(a) jsem editaci, ale hodnota se nezměnila

- Pravděpodobně se změna zařadila do schvalování.
- Zkontrolujte `/approvals`.
- Výsledek sledujte v `/notifications`.

### Schvalování vidím, ale nejde rozhodovat

- Pravděpodobně máte `approvals:read`, ale ne `approvals:write`.
- Eskalujte na vlastníka workflow a ověřte přiřazení schvalovací role.

### Žádosti jsou „zaseknuté"

- Ověřte, že existuje schvalovatel.
- Ověřte, že schvalovatelé jsou aktivní.
- Pokud je žádost nevalidní, cancelujte ji a založte znovu s jasným odůvodněním.

## Související dokumentace

- `./getting-started.md`
- `./access-management.md`
- `./activity-log.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./vendors.md`
