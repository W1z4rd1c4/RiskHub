---
title: Začínáme s RiskHub
version: "2.0"
last_updated: "2026-03-05"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md + frontend onboarding routy"
summary: "Onboarding manuál pro non-admin uživatele: ověření scope, navigace, workflow připravenost a nejčastější chyby na začátku."
tags:
  - onboarding
  - overview
  - workflow
  - notifications
  - troubleshooting
---

# Začínáme s RiskHub

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

Tento průvodce vás dostane od prvního přihlášení k produktivní denní práci. Fokus je na provozní připravenost:

- ověřit, že přístup je správně
- pochopit, jak scope ovlivňuje viditelnost
- osvojit si „workflow mindset“ (approvals + notifikace)
- vytvořit dobré návyky pro filtry a exporty

Nejrychlejší cesta k hodnotě:

- dashboard pro detekci tlaku
- fronty pro workflow
- akční rizika a kontroly (ownership + evidence)

## Kde to najdete

Tyto routy budete používat často:

- dashboard: `/`
- schvalování: `/approvals`
- notifikace: `/notifications`
- rizika: `/risks`
- kontroly: `/controls`
- KRI: `/kris`
- nálezy: `/issues` (pokud je povoleno)
- dodavatelé: `/vendors` (pokud je povoleno)
- oddělení: `/departments`
- governance: `/governance` (jen CRO)
- nastavení (včetně dokumentace): `/settings`

Pokud routu neotevřete, berte to nejdřív jako access/scope problém, ne jako „bug“.

## Role, scope a viditelnost

Chování RiskHubu závisí na:

- roli (odpovědnost)
- scope (global vs department vs manager)
- permissions (resource + action)

Praktické příklady:

- `/vendors` uvidíte jen s `vendors:read`
- `/issues` uvidíte jen s `issues:read`
- `/governance` uvidíte ve výchozím kontraktu jen jako CRO
- `/activity-log` uvidíte jen s `activity_log:read` (a nejste platform admin)

Scope určuje *jak široko* je baseline viditelnost. Ownership může vytvářet výjimky.

Rozdíl, který se vyplatí držet v hlavě:

- **permission** určí, zda vůbec můžete modul otevřít a číst/zapisovat
- **scope** určí, jak velký výřez dat v modulu uvidíte
- **ownership** může vytvořit výjimky (např. uvidíte detail záznamu, který vlastníte, i mimo department scope)

Pokud něco “chybí”, nejdřív si odpovězte: chybí modul (permission), nebo chybí data uvnitř modulu (scope/filtry)?

Pokud první den vidíte „divná“ data (chybí týmová rizika, nebo vidíte nesouvisející oddělení), řešte scope hned. Scope chyby stojí nejvíc času.

## Datový model a klíčová pole

Pro úspěch první den nepotřebujete všechny detaily. Potřebujete „control pointy“, které řídí denní provoz.

| Koncept | Co sledovat | Proč |
|---|---|---|
| Ownership | owner u rizik/kontrol, reporting owner u KRI | Ownership řídí odpovědnost a routing. |
| Department | oddělení u klíčových entit | Oddělení řídí reporting a baseline scope. |
| Status | active/emerging/archived, open/closed | Status ovlivňuje viditelnost a priority. |
| Scoring | net vs gross | Kvantifikace posture a trend. |
| Due/overdue | KRI due date, Issue due date | Overdue je governance signál. |
| Workflow notes | reason + resolution notes | Notes jsou součást audit trailu. |

Praktická rada:

- Pokud se v organizaci nedaří workflow, problém je skoro vždy v ownershipu (není jasné “kdo má udělat další krok”). První týden se vyplatí ownership stabilizovat dřív, než začnete řešit jemné detaily scoringu.

## Hlavní workflow

### 1) Checklist prvního přihlášení (15 minut)

1. Přihlaste se a ověřte jméno + roli.
2. Otevřete `/settings`:
   - nastavte jazyk
   - ověřte přístup do dokumentace
3. Otevřete `/` a ověřte, že data dávají smysl pro váš scope.
4. Otevřete `/notifications` a zkontrolujte unread.
5. Otevřete `/approvals` a ověřte pending žádosti.
6. Otevřete `/departments` a ověřte, že oddělení kontext existuje.

### 2) Denní rutina

Jednoduchá rutina, která škáluje:

1. Dashboard: critical a breach signály.
2. Workflow: vyčistěte approvals a notifikace, které vlastníte.
3. Exekuce:
   - update rizik
   - logování exekuce kontrol
   - zapisování KRI (nebo follow-up na reporting ownera)
4. Dokumentace:
   - pište jasné poznámky
   - zakládejte Issues pro remediaci
5. Exportujte jen když je potřeba evidence.

### 3) Týdenní hygiena

1. Projděte overdue KRI.
2. Projděte open Issues podle severity.
3. Projděte top net rizika po odděleních.
4. Ověřte, že kontroly s vysokým risk levelem mají recent exekuci.

### 4) První týden: stabilizace odpovědností

Pokud onboarding probíhá ve větší organizaci, první týden typicky narazíte na:

- chybějící owner u rizik/kontrol
- reporting owner u KRI nastavený “na nikoho”
- oddělení kontext nedává smysl po reorganizaci

Doporučený postup:

1. U 10 nejkritičtějších rizik ověřte owner + oddělení.
2. U KRI ověřte reporting owner a pravidelnost zápisu.
3. Pokud něco není jasné, vytvořte Issue a přiřaďte vlastníka. “Nejasné” se samo nespraví.

## Schvalování a notifikace

Nejdůležitější chování:

- některé editace se neaplikují hned; zařadí se do schvalování

Jak to vypadá:

- save proběhne
- hodnota se nezmění
- objeví se „pending changes“

Když to uvidíte:

1. Otevřete `/approvals`.
2. Sledujte status.
3. Výsledek v `/notifications`.

Pište kvalitní reason. Špatný reason generuje reject a rework.

Poznámka k statusům:

- Některé prostředí používá i citlivější pending stav (např. `pending_privileged`). Princip je stejný: změna se neaplikuje, dokud není vyřízená.
- Pokud jste omylem poslali špatnou žádost, hledejte možnost cancel (nebo požádejte schvalovatele o reject s jasnou poznámkou).

## Filtry, pohledy a exporty

### Filtry

Většina list stránek má filtry. Dvě pravidla vyřeší 80 % zmatků:

1. Před interpretací čísla vždy zkontrolujte filtry.
2. Při změně úkolu filtry vyčistěte (hlavně před exportem).

### Pohledy

Některé stránky mají grouped view. Používejte pro review packy, ne pro rychlé denní editace.

### Exporty

Exporty jsou evidence.

Disciplína:

- export s „as of“ datem
- raw export neměnit
- odvozenou analýzu držet zvlášť

Při porovnávání čísel mezi lidmi vždy uveďte:

- filtry
- scope
- as-of čas

Bez toho se i “správná čísla” budou jevit jako konflikt.

## Časté chyby

- Brát access problém jako bug bez ověření role/scope.
- Měnit mnoho governance-citlivých polí najednou.
- Ignorovat workflow fronty, dokud nejsou urgentní.
- Sdílet export bez filtrů a as-of.

## Troubleshooting

### Nevidím modul, který vidí kolega

- Porovnejte permissions (`resource:read`).
- Porovnejte scope.
- Ověřte ownership.

### Modul vidím, ale seznam je prázdný

- Resetujte filtry.
- Ověřte, že nejste v archived-only režimu.
- Zkuste otevřít konkrétní záznam z notifikace (pokud existuje).

### Změny se neaplikovaly

- Zkontrolujte `/approvals`.
- Outcome v `/notifications`.

### Dostávám forbidden / permission denied

- Pokud se vám změnila role/scope, udělejte re-login (stale session).
- Ověřte, že máte očekávané oprávnění (`resource:action`).
- Pokud oprávnění sedí, zachyťte čas + route + text chyby a eskalujte.

### Dokumentace v aplikaci vypadá špatně

- Non-admin by měl vidět user dokumentaci.
- Pokud se zobrazuje admin dokumentace, je možné, že je špatně role.

### Jazyk je nekonzistentní

- Nastavte jazyk v `/settings`.
- Refresh a znovu otevřete docs.

## Související dokumentace

- [Uživatelská dokumentace (index)](./README.md)
- [Schvalování a notifikace](./notifications.md)
- [Správa rizik](./risks.md)
- [Správa kontrol](./controls.md)
- [Správa KRI](./kris.md)
- [Správa nálezů](./issues.md)
- [Správa dodavatelů](./vendors.md)
- [Oddělení](./departments.md)
- [Správa přístupů](./access-management.md)
