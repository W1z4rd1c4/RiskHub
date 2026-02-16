---
title: Risk Hub (konfigurační pracovní prostor pro CRO)
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "frontend/src/pages/RiskHubPage.tsx + frontend/src/components/riskhub/*"
summary: "Manuál pro CRO: konfigurace taxonomie, thresholdů, schvalovacích scénářů, rolí, oddělení a hromadné odesílání risk dotazníků."
tags:
  - riskhub
  - settings
  - workflow
  - approvals
  - notifications
  - troubleshooting
---

# Risk Hub (konfigurační pracovní prostor pro CRO)

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

Risk Hub je konfigurační pracovní prostor pro CRO. Existuje proto, že některé změny jsou *policy-level* rozhodnutí, ne běžné denní editace záznamů.

V Risk Hubu můžete:

- definovat taxonomii „risk types“, která se používá napříč UI
- spravovat systémová nastavení (thresholdy, approvals, notifications)
- konfigurovat schvalovací scénáře a role schvalovatelů
- spravovat role a balíčky oprávnění
- spravovat oddělení pro routing a reporting
- odesílat risk dotazníky hromadně (risk assessment workflow)

Hlavní route: `/risk-hub`

Berte Risk Hub jako „konfiguraci s blast radius“. I malá změna může ovlivnit dashboardy, scoring a objem workflow žádostí.

## Kde to najdete

- položka **Risk Hub** → `/risk-hub`

Pokud Risk Hub nevidíte:

- Risk Hub je viditelný pouze pro roli CRO
- pokud se považujete za CRO a přístup nemáte, ověřte role assignment a re-authenticate

## Role, scope a viditelnost

Risk Hub je záměrně restriktivní:

- CRO role typicky pracuje cross-department governance
- konfigurační změny mají dopad na mnoho uživatelů a mění chování approvals a notifications

Před změnou si odpovězte:

- Koho to ovlivní?
- Co se změní v jejich workflow zítra ráno?
- Jaké ověření prokáže, že změna udělala přesně to, co chceme?

Pokud konfiguraci delegujete, použijte jasné předání:

- cílový výsledek
- rollback plán
- verification checklist (viz níže)

## Datový model a klíčová pole

Risk Hub je rozdělený do tabů. Následující tabulka je praktická pomůcka.

| Tab | Klíčová pole | Co ovlivňuje | Časté chyby |
|---|---|---|---|
| Risk types | `code`, `display_name`, `description`, `color`, `sort_order`, active/deleted | Taxonomie v registru rizik, groupování, badge | Rename bez komunikace; nekonzistentní code; příliš mnoho typů. |
| System settings | config `key`, `value`, `value_type` (bool/int/string), min/max, editable | Threshold chování, tuning approvals/notifications | „Ladění pocitem“ bez baseline. |
| Approval rules | scénář `key`, `requires_approval`, `approver_roles` (včetně speciální role `risk_owner`) | Objem workflow a kdo schvaluje | Zrušení approvals bez náhrady; špatně nastavené role schvalovatelů. |
| Roles | role `name`, `display_name`, `description`, permissions (`resource:action`) | Enforcement přístupu napříč moduly | Příliš široká oprávnění; role proliferace; nejasný účel. |
| Departments | `name`, `code`, `manager`, active/deleted | Routing, scope, reporting | Změna kódů rozbije kontinuitu; chybí manager. |
| Questionnaires | filtry (department/process/category/status), select all vs selected IDs, výsledky batch-send | Tlak na risk assessment a inbox | Odeslání bez ownerů; příliš široký scope; ignorování „skipped“. |

## Hlavní workflow

### 1) Údržba taxonomie risk typů (Risk Types)

Dobrá taxonomie je stabilní a minimální.

Doporučený proces:

1. Projděte existující typy a ověřte, že každý má jasný význam.
2. Nový typ přidejte jen při reálné reporting/governance potřebě.
3. `code` berte jako stabilní identifikátor (lowercase + underscore).
4. `display_name` je user-facing label.
5. Barvy vybírejte tak, aby pomáhaly kategorii, ne aby simulovaly „severity“.
6. `sort_order` drží UI stabilní.

Při deprecaci typu:

- preferujte delete/inactive místo „přejmenování na něco jiného“
- komunikujte změnu a aktualizujte návody, které používají staré názvy

### 2) Bezpečná změna systémových nastavení (System Settings)

Nastavení jsou často seskupená (např. thresholds, approvals, notifications).

Safe-change protokol:

1. Identifikujte přesný `key`.
2. Zapište si aktuální hodnotu.
3. Definujte cílovou hodnotu a „proč“.
4. Uložte co nejmenší změnu.
5. Ověřte chování v impacted modulu.

Příklady ověření:

- thresholds: riziko/KRI překročí limit a UI to správně reflektuje
- notifications: vznikne očekávaná notifikace (ne 10 navíc)
- approvals: citlivá změna vytvoří žádost a objeví se v `/approvals`

### 3) Konfigurace schvalovacích scénářů (Approval Rules)

Schvalovací scénáře definují:

- zda akce vyžaduje schválení
- které role mohou schválit

Dobrá governance není „schvalování všude“. Je to schvalování pro akce s reálným policy dopadem.

Doporučení:

1. Nechte approvals zapnuté pro změny ownership/oddělení/scoringu, pokud nemáte zdokumentovanou alternativní kontrolu.
2. Používejte approver role, které odpovídají odpovědnosti.
3. Speciální dynamickou roli `risk_owner` používejte, když má schvalovat owner rizika (a dovolují to pravidla konfliktu zájmů).
4. Vyhněte se stavu „žádní schvalovatelé“: generuje zaseknuté žádosti.

Po změně scénáře vždy otestujte end-to-end (vytvořte žádost a schvalte/odmítněte).

### 4) Správa rolí a oprávnění (Roles)

Role jsou balíčky oprávnění.

Doporučený model:

- držte počet rolí nízký
- každá role musí mít jasný popis (k čemu je a k čemu není)
- dávejte minimum oprávnění

Permissions jsou ve tvaru `resource:action` (např. `vendors:read`, `issues:write`).

Před uložením změny role:

- sepište, které moduly budou nově viditelné
- sepište, které write akce budou možné
- ověřte, zda se tím mění governance povrchy (risk hub, governance, users access mód)

Při odebrání oprávnění:

- komunikujte to (uživatelé to vnímají jako „aplikace se rozbila“)
- nabídněte alternativní workflow, pokud je potřeba

### 5) Správa oddělení (Departments)

Oddělení ovlivňují reporting a routing.

Safe proces:

1. Vytvořte oddělení se stabilním `code`.
2. Nastavte managera, pokud to dává smysl.
3. Neměňte kódy bez migračního plánu.
4. Pokud oddělení deaktivujete, ověřte dopad na:
   - rizika/kontroly přiřazené do oddělení
   - uživatele přiřazené do oddělení
   - groupování dashboardu

### 6) Hromadné odesílání risk dotazníků (Questionnaires)

Dotazníky jsou strukturovaný „risk assessment request“ workflow.

Batch send má dva módy:

- **Select all**: odešle všem rizikům odpovídajícím filtrům
- **Selected IDs**: odešle jen vybraným rizikům

Doporučený postup:

1. Nastavte filtry (department/process/category/status).
2. Ověřte, že rizika mají ownera (jinak uvidíte `skipped_no_owner`).
3. Pro high-stakes cykly preferujte „Selected IDs“ (méně rizika spamu).
4. Odešlete.
5. Projděte výsledky:
   - created count
   - skipped (no owner)
   - skipped (open exists)
   - errors
6. Udělejte follow-up na skipped položky (nastavte ownera nebo zavřete existující dotazník).

Dotazníky se promítají do workflow badge a do `/approvals` (risk assessment tab).

## Schvalování a notifikace

Změny v Risk Hubu jsou governance změny.

Očekávejte:

- rychlý dopad na UI chování (taxonomie, thresholds)
- dopad na workflow (více/méně schvalovacích žádostí)
- notifikace a audit trail pro významné změny

Když se změna nechová podle očekávání:

- zkontrolujte `/activity-log` pro záznam konfigurace
- ověřte scénář reálnou uživatelskou akcí, která má spustit očekávané chování
- pokud se approvals nevytváří, prověřte konfiguraci scénářů

Fronty jsou detailně popsané v: `./notifications.md`.

## Filtry, pohledy a exporty

Risk Hub používá „show deleted/inactive“ přepínače v některých tabech.

Doporučení:

- běžně nechávejte deleted položky skryté (méně omylů)
- zapínejte je jen při obnově nebo vyšetřování

Exporty nejsou primární povrch. Pro evidence:

- použijte Activity Log pro důkaz změny konfigurace
- exportujte dotčené entity z jejich modulů (rizika, kontroly, nálezy)

## Časté chyby

- Změna taxonomie (risk types) během aktivního reportovacího cyklu bez komunikace.
- Vypnutí approvals pro „snížení frikce“ a ztráta klíčové kontroly.
- Přidávání rolí pro jednorázové případy místo promyšlené změny permissions.
- Hromadné odeslání dotazníků příliš široce (inbox spam a ztráta důvěry).
- Nastavení jako „experiment playground“ bez baseline a rollback.

## Troubleshooting

### Nemám přístup do `/risk-hub`

- Risk Hub je CRO-only. Ověřte roli.
- Odhlaste/přihlaste pro refresh role.

### Změna se neprojevuje

- Udělejte refresh.
- Ověřte, zda není síťová chyba.
- Použijte `/activity-log` (pokud máte přístup) pro potvrzení záznamu.

### Dotazníky se „skippují"

- `skipped_no_owner`: přiřaďte ownera rizikům a odešlete znovu.
- `skipped_open_exists`: uzavřete nebo vyřešte existující otevřené dotazníky.

### Schvalování je po změně scénáře zaseknuté

- Ověřte, že jsou nastavené approver role.
- Ověřte, že existuje uživatel s touto rolí a potřebnými oprávněními.
- Pokud je to zaseknuté, vraťte scénář zpět a znovu otestujte.

## Související dokumentace

- `./notifications.md`
- `./risks.md`
- `./kris.md`
- `./controls.md`
- `./issues.md`
- `./departments.md`
- `./access-management.md`
- `./activity-log.md`
