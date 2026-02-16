---
title: Správa přístupů a adresář uživatelů
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/authz/policy.ts + backend access APIs"
summary: "Jak používat /users v directory módu a access módu, chápat role a scope a bezpečně žádat/ověřovat změny oprávnění."
tags:
  - access
  - audit
  - workflow
  - troubleshooting
  - settings
---

# Správa přístupů a adresář uživatelů

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

Stránka `/users` má v RiskHubu dvě odlišné funkce podle toho, jaké máte oprávnění:

1. **Adresář uživatelů** (read-only): rychle najdete kolegy a pochopíte, kdo za co odpovídá.
2. **Správa přístupů** (privileged): vidíte role, scope a permissions a (v některých prostředích) je můžete i spravovat.

Tento manuál popisuje obě varianty a hlavně: jak správně *žádat a ověřovat* změny přístupu bez porušení scope hranic.

Hlavní route: `/users`

## Kde to najdete

- položka **Uživatelé** → `/users`

Pokud **Uživatelé** nevidíte:

- účet pravděpodobně nemá `users:read` a nejste v privileged scope
- požádejte správce přístupů o potvrzení, zda máte mít alespoň directory přístup

## Role, scope a viditelnost

Přístup v RiskHubu stojí na třech vrstvách:

- **Role**: jaký typ uživatele jste (odpovědnosti)
- **Scope**: jak širokou viditelnost máte (global vs department vs manager)
- **Permissions**: co můžete dělat nad resource (read/write/delete/submit)

### Directory mód vs access mód

`/users` se přepíná podle autorizace:

- **Access mód** (privileged): vidíte uživatele včetně scope a capability detailů.
  - typicky global-scope uživatelé a vedoucí oddělení
- **Directory mód** (standard): vyhledatelný seznam viditelných uživatelů bez kompletních permission detailů.

### Platform admin je jiný svět

Platform admin je záměrně oddělený:

- nepracuje v business modulech
- používá admin console a admin dokumentaci

Pokud jste platform admin, tento user manuál není váš primární runbook.

## Datový model a klíčová pole

V access módu obvykle uvidíte:

| Pole | Význam | Poznámky |
|---|---|---|
| Name / email | Identita uživatele | Email je stabilní identifikátor; jméno se může změnit. |
| Role | Odpovědnost (např. CRO, risk manager, vedoucí oddělení) | Role sama neurčuje viditelnost; záleží i na scope a permissions. |
| Access scope | `global`, `department`, `manager` | Scope řídí „jak široko“ uživatel vidí. |
| Department | Domovské oddělení | Oddělení je routing kontext, ne nutně ownership. |
| Active status | Zda je účet aktivní | Deaktivace je governance akce; zachovejte audit trail. |
| Permissions | Resource + action (např. `risks:read`, `vendors:write`) | Effective permissions mohou být jiné než očekávání; ověřujte. |

V directory módu je důraz na identitu a dohledatelnost, ne na enforcement detail.

## Hlavní workflow

### 1) Najděte správného člověka (ownership discovery)

Když potřebujete routovat práci:

1. Otevřete `/users`.
2. Hledejte podle jména nebo emailu.
3. Zkontrolujte oddělení.
4. Použijte to pro přiřazení ownera u rizik, kontrol, KRI i nálezů.

Zabráníte tak typickému problému: práce je přiřazená špatné osobě.

### 2) Pochopte „proč nevidím / nejde upravit X“

Access problém je obvykle jedno z:

- chybějící permission (resource/action)
- špatný scope (department vs global)
- špatně nastavené oddělení
- chybí ownership (neplatí ownership výjimka)

Diagnostický loop:

1. Identifikujte entitu a její oddělení + ownera.
2. Potvrďte svůj scope.
3. Potvrďte permissions pro resource:
   - rizika: `risks:read` / `risks:write`
   - kontroly: `controls:read` / `controls:write`
   - dodavatelé: `vendors:read` / `vendors:write`
   - nálezy: `issues:read` / `issues:write`
   - activity log: `activity_log:read`
4. Pokud je potřeba, porovnejte effective permissions s privilegovaným uživatelem.

### 3) Jak správně požádat o změnu přístupu

Aby šlo změnu rychle schválit, pošlete:

- jaký resource+action potřebujete (`vendors:read`, `issues:write`, …)
- proč to potřebujete (role odpovědnost)
- nejmenší scope, který stačí
- jak dlouho (dočasně vs trvale)

Nežádejte `*:*` jako zkratku. Široký přístup zvyšuje audit a privacy riziko.

### 4) Ověření změny (nespoléhejte na „mělo by to být“)

Po aplikaci změny:

1. Odhlaste/přihlaste (refresh effective permissions).
2. Otevřete `/users` a ověřte očekávaný mód (directory vs access), pokud je relevantní.
3. Jděte do modulu a zkuste přesně tu akci, kterou jste potřebovali.
4. Zkontrolujte `/notifications` a `/approvals` pro workflow gating.

Pokud to nefunguje, reportujte:

- email uživatele
- čas testu
- route a akci, která selhala

### 5) Správa uživatelů (jen pokud na to máte mandát)

Některá prostředí umožňují privilegovaným business uživatelům spravovat access.

Používejte „least privilege“ proces:

- zakládejte účty jen při potvrzeném onboardingu
- přiřaďte minimum role a permissions
- nastavte správné oddělení
- ověřte, že dashboardy a listy odpovídají scope

Pokud nemáte práva editovat, berte `/users` jako read povrch a eskalujte změny na platform admin tým.

## Schvalování a notifikace

Změny přístupu jsou governance-citlivé.

Co očekávat:

- některé změny mohou být schvalované
- uživatel může dostat notifikaci při změně přístupu
- access akce často zanechávají stopu v Activity Logu

Pokud si myslíte, že změna čeká:

- zkontrolujte `/approvals`
- zkontrolujte `/notifications`

## Filtry, pohledy a exporty

### Filtry

`/users` obsahuje filtry pro audit a review:

- search (jméno/email)
- role filter
- scope filter (v access módu)
- capability filter (resource + action) v access módu

Hodí se na otázky typu:

- „Kdo má `vendors:write`?“
- „Kteří uživatelé mají global scope?“
- „Kdo je vedoucí oddělení?“

### Pohledy

- directory mód: zjednodušený pro dohledatelnost
- access mód: detailní pro governance/review

### Exporty

Users stránka není primárně export povrch.

Pokud potřebujete audit evidence:

- použijte Activity Log pro důkaz změny
- koordinujte s platform adminy pro formální exporty, pokud jsou vyžadované

## Časté chyby

- Brát roli jako celý příběh (scope a permissions rozhodují).
- Dát široká oprávnění „ať to funguje“ místo opravy ownership/oddělení.
- Zapomenout ověřit změnu po aplikaci.
- Deaktivovat uživatele bez zdokumentování „proč“ a follow-up.

## Troubleshooting

### Čekal(a) jsem access mód, ale vidím jen directory

- Pravděpodobně nemáte global scope ani přístup vedoucího oddělení.
- Ověřte, zda máte mít `users:read` a zda je scope `global`.

### Vidím permissions, ale nejdou upravovat

- View a edit jsou oddělené privilege.
- V mnoha nastaveních může editovat jen CRO nebo platform admin.

### Uživatel stále nevidí modul i po změně

- Ověřte správný resource/action.
- Ověřte, že se uživatel odhlásil/přihlásil.
- Ověřte oddělení a ownership, pokud jsou relevantní.

## Související dokumentace

- `./departments.md`
- `./notifications.md`
- `./activity-log.md`
- `./getting-started.md`
- `./risks.md`
- `./controls.md`
- `./vendors.md`
- `./issues.md`
