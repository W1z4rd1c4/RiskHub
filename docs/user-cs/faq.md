---
title: FAQ a provozní podpora
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md + chování workflow v aplikaci"
summary: "Rychlé odpovědi na časté problémy: viditelnost, schvalování, editace, notifikace, exporty a co zkontrolovat před eskalací."
tags:
  - overview
  - troubleshooting
  - workflow
  - approvals
  - notifications
  - exports
---

# FAQ a provozní podpora

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

Toto FAQ je „rychlá linka“ pro běžné denní problémy. Je psané pro operátory, ne pro adminy.

Před eskalací si uložte:

- route (např. `/risks`)
- identifikátor entity (risk code, název kontroly, dodavatel)
- co jste čekali vs co se stalo
- časové okno (timestampy jsou u workflow klíčové)

## Kde to najdete

- FAQ je dostupné v in‑app dokumentaci (Settings → Help & Docs).
- Mnoho odpovědí odkazuje na routy:
  - `/notifications`
  - `/approvals`
  - `/activity-log` (pokud je povoleno)

## Role, scope a viditelnost

Většina hlášení „aplikace je rozbitá“ je ve skutečnosti nedorozumění ve scope/viditelnosti.

Checklist:

- máte správnou roli?
- scope je global nebo oddělení?
- jste owner (ownership výjimka)?
- není entita archivovaná?
- máte vůbec oprávnění na danou funkcionalitu? (např. `issues:read`, `vendors:read`, `activity_log:read`)

Praktické signály:

- Pokud položka v menu úplně chybí (např. **Nálezy**), bývá to obvykle **oprávnění** (`issues:read`), ne filtry.
- Pokud položka existuje, ale seznamy jsou prázdné, bývá to **scope** + **filtry**.
- Pokud detail otevřete přes odkaz z notifikace, ale v seznamu ho nenajdete, často jde o **ownership výjimku** (owner může vidět/řešit záznam i mimo department scope).

Jedna klíčová věta:

- backend enforcement je autorita
- UI viditelnost je nápověda, ne garance

## Datový model a klíčová pole

Při troubleshootingu mají největší hodnotu tyto fieldy:

| Entita | Klíčová pole | Proč |
|---|---|---|
| Riziko | status, oddělení, owner, net score | Viditelnost, critical filtry, workflow. |
| Kontrola | status, owner, oddělení, frekvence | Proč se objevuje v reportingu a exekuci. |
| KRI | breach status, last period end, reporting owner | Proč chodí breach/overdue remindery. |
| Issue | status, severity, owner, due date | Overdue tlak a review workload. |
| Dodavatel | outsourcing owner, status, cadence | Edit práva a remindery. |

Slovník statusů, který se vyplatí znát:

| Status / koncept | Co to typicky znamená | Časté překvapení |
|---|---|---|
| `active` | má být v běžných pohledech | „nevidím to“ bývá filtr/scope. |
| `archived` | záměrně mimo aktivní provoz | lidé zapomenou zapnout archiv filtr. |
| `pending` (schvalování) | žádost čeká na rozhodnutí | „uložil jsem = je to aplikované“. |
| `approved` / `rejected` | žádost je vyřízená | lidé ignorují resolution notes. |

## Hlavní workflow

### „Kam se podívat jako první?“

1. Čekali jste změnu, ale neprojevila se: `/approvals`.
2. Čekali jste notifikaci: `/notifications`.
3. Změnilo se číslo a nevíte proč: `/activity-log` (pokud máte).
4. Nevidíte entitu: oddělení + owner + archivace.

### „Je to problém přístupu nebo dat?“

Tento postup šetří čas a eliminuje špatné eskalace:

1. **Chybí položka v menu?**
   - Ano: typicky oprávnění (např. `vendors:read`, `issues:read`).
   - Ne: pokračujte.
2. **Jde otevřít detail přes odkaz/notifikaci?**
   - Ano: typicky filtry nebo scope.
   - Ne: pokračujte.
3. **Padá to na forbidden / permission denied?**
   - Ano: mismatch oprávnění nebo stale session.
   - Ne: pokračujte.
4. **Není záznam archivovaný?**
   - Ano: zapněte archiv filtr a ověřte pravidla obnovy.
   - Ne: pokračujte.
5. **Vidí to kolega s širším scope?**
   - Ano: scope hranice / ownership.
   - Ne: záznam možná neexistuje nebo jde o systémový problém.

### „Jak požádat o pomoc bez ztráty času?“

Při eskalaci pošlete:

- route
- entity ID/název
- screenshot je volitelný; text stačí
- timestamp
- vaše role + scope

## Schvalování a notifikace

### Proč se editace neaplikovala?

Protože změna čeká ve schvalování.

Postup:

- otevřete `/approvals`
- najděte žádost
- přečtěte pending changes
- počkejte na rozhodnutí nebo follow‑up se schvalovatelem

Poznámky, které snižují frustraci:

- I bez `approvals:write` je queue užitečná: typicky uvidíte „my requests“ a vlastní pending položky.
- Některé změny mohou spadnout do citlivějšího stavu (např. `pending_privileged`). Princip je stejný: změna se neaplikuje, dokud není schválená.
- Kvalitní žádost je úzká. Pokud v jednom submitu měníte mnoho citlivých polí, vzniká pomalejší a hůře schvalovatelný request.

### Jde zrušit žádost, kterou jsem založil(a)?

Pokud je žádost stále pending, UI může nabízet cancel. Pokud ne, domluvte se se schvalovatelem na reject s jasnou poznámkou a následně pošlete čistší, užší žádost.

### Proč mi chodí remindery pořád dokola?

Remindery jsou policy signály:

- overdue KRI: monitoring se nevykonává
- overdue dotazník: risk assessment je zablokovaný
- vendor SLA breach: posture dodavatele se změnila

Nemuteujte remindery jako první krok. Opravte podkladový proces.

## Filtry, pohledy a exporty

### „Metriky mi nesedí s kolegou“

Nejčastější důvody:

- jiné filtry
- jiný scope
- archivované položky v jednom pohledu zahrnuté a ve druhém ne

Pravidlo:

- při porovnávání vždy říkejte filtry a as‑of čas

### „Exportu chybí položky“

Zkontrolujte:

- aktivní filtry
- status (archiv je často defaultně venku)
- scope limity

Pro audit evidence:

- exportujte jen co je potřeba
- raw export neměňte
- do poznámky přidejte „as of“ timestamp a filtry (stačí jedna věta)

## Časté chyby

- Editace citlivých polí bez pochopení schvalování.
- Příliš mnoho citlivých změn v jedné žádosti (vznikne složitý request).
- Nechat ownera prázdného („někdo to vezme“).
- Příliš široké tagy/category, které rozbijí vyhledávání.
- Zaměnit oddělení za ownership (oddělení je routing/reporting; owner je accountability).
- Sdílet exporty bez kontextu.

## Troubleshooting

### Nevidím záznam, který bych měl(a) vidět

Checks:

1. Je archivovaný?
2. Jaké má oddělení?
3. Kdo je owner?
4. Dovoluje scope viditelnost?

Next actions:

- scope mismatch: požádejte o změnu přístupu
- owner mismatch: upravte ownership přes governance proces

### Položka v menu existuje, ale seznam je prázdný

Checks:

1. Resetujte filtry (status, oddělení, owner, search).
2. Ověřte, že nejste v archived-only pohledu.
3. Zkontrolujte, zda pohled nefiltruje „mine“ / „pending“.
4. Zkuste otevřít záznam z notifikace (pokud ji máte).

Next actions:

- Pokud kolega vidí, vy ne: scope hranice.
- Pokud nikdo nevidí: ověřte, že záznam existuje a je aktivní.

### Nejde create/edit

- ověřte `<resource>:write` (např. `risks:write`)

### Nejde rozhodovat schvalování

- ověřte `approvals:write`

### Dostávám „Forbidden“ / „Permission denied“

Checks:

- Pokud se vám nedávno změnila role/scope, odhlaste se a znovu přihlaste (stale session).
- Ověřte, že máte očekávané oprávnění (např. `vendors:write`).
- Pokud oprávnění sedí, ale stále to padá, pošlete:
  - route
  - přibližný timestamp
  - entity id/název
  - přesný text chyby

### KRI je stále overdue

- je nastavený reporting owner?
- je frekvence realistická?
- aktualizuje se period end?

### Vendor reassessment remindery jsou hlučné

- ověřte cadence vs significance
- ověřte, zda vendor nebyl nedávno assessed/decided

## Související dokumentace

- [Začínáme](./getting-started.md)
- [Správa přístupů](./access-management.md)
- [Workflow, schvalování, notifikace](./notifications.md)
- [Activity Log](./activity-log.md)
- [Správa rizik](./risks.md)
- [Správa kontrol](./controls.md)
- [Správa KRI](./kris.md)
- [Správa nálezů](./issues.md)
- [Správa dodavatelů](./vendors.md)
