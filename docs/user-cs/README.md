---
title: Uživatelská dokumentace RiskHub
version: "2.1"
last_updated: "2026-03-07"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md"
summary: "Produkční manuály pro každodenní práci v RiskHubu: navigace, oprávnění, workflow (schvalování), exporty a troubleshooting."
tags:
  - overview
  - onboarding
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - settings
---

# Uživatelská dokumentace RiskHub

Zpět na strom dokumentace: <a href="../DOCUMENTATION_TREE.md">docs/DOCUMENTATION_TREE.md</a>

Tato knihovna je produkční manuál pro všechny ne-admin role. Je napsaná pro reálnou práci: co dělat, kde to dělat a jak rychle diagnostikovat situace typu „nic se nezměnilo“, „nevidím modul“ nebo „nevím, kdo to upravil“.

**Na této stránce**
- [Kdo má tuto knihovnu používat](#kdo-ma-tuto-knihovnu-pouzivat)
- [Co můžete od manuálů čekat](#co-muzete-od-manualu-cekat)
- [Rychlý start (30 minut)](#rychly-start-30-minut)
- [Mapa dokumentace (podle modulu v menu)](#mapa-dokumentace-podle-modulu-v-menu)
- [Mapa dokumentace (podle workflow)](#mapa-dokumentace-podle-workflow)
- [Jak fungují oprávnění a scope](#jak-funguji-opravneni-a-scope)
- [Jak fungují odkazy v manuálech](#jak-funguji-odkazy-v-manualech)
- [Tagy a rychlé filtrování v knihovně](#tagy-a-rychle-filtrovani-v-knihovne)
- [Jak hlásit problém v dokumentaci](#jak-hlasit-problem-v-dokumentaci)
- [Politika změn a zdroj pravdy](#politika-zmen-a-zdroj-pravdy)
- [Související dokumentace](#souvisejici-dokumentace)

## Kdo má tuto knihovnu používat

Použijte tuto knihovnu, pokud máte některou z těchto rolí:

- CRO
- Risk Manager
- Department Head
- Employee
- Compliance, Legal, Internal Audit, Actuarial
- Viewer (pouze čtení)

Pokud jste platformní administrátor (role `admin`), v in-app čtečce uvidíte jinou knihovnu. Tato sada je záměrně zaměřená na business provoz, ne na správu platformy. U admina je očekávané, že business routy jako `/governance` a `/activity-log` zůstanou nedostupné.

## Co můžete od manuálů čekat

Každý modulový manuál v `docs/user/*.md` je navržený tak, aby odpověděl na stejné provozní otázky:

- **K čemu to je?** (proč modul existuje)
- **Kde to najdu?** (route a navigace)
- **Proč to nevidím?** (oprávnění a scope)
- **Která pole jsou klíčová?** (co je v praxi důležité)
- **Jak udělám nejčastější úkoly end-to-end?** (postupy krok za krokem)
- **Co se děje, když je potřeba schválení?** (a kde to sledovat)
- **Jak exportovat důkazy bezpečně?**
- **Jaké jsou typické chyby a rychlé opravy?**

Manuály jsou **text-first** (bez screenshotů), aby byly udržitelné a přesné v čase i napříč jazyky.

## Rychlý start (30 minut)

Pokud jste v RiskHubu nový/á, toto pořadí vás rychle dostane do provozu:

1. Začněte [Začínáme](./getting-started.md) a projděte checklist prvního přihlášení.
2. Otevřete tři hlavní provozní moduly:
   - [Dashboard](./dashboard.md) (signály a souhrn)
   - [Rizika](./risks.md) (registr)
   - [Kontroly](./controls.md) (mitigace a evidence exekuce)
3. Pochopte workflow:
   - [Workflow, schvalování, notifikace](./notifications.md)
4. Pokud monitorujete metriky:
   - [KRI](./kris.md)
5. Pokud sledujete nálezy/remediace:
   - [Nálezy (Issues)](./issues.md)
6. Pokud řešíte third-party:
   - [Dodavatelé](./vendors.md)

[FAQ](./faq.md) držte otevřené jako rychlou referenci pro nejčastější blokery.

## Mapa dokumentace (podle modulu v menu)

Tato tabulka mapuje položky v menu na kanonický manuál.

| Modul / oblast | Route | Kanonický manuál | Co se naučíte | Tagy |
|---|---:|---|---|---|
| Dashboard | `/` | [Dashboard](./dashboard.md) | Trendy, signály tlaku a exportovatelné pohledy | `overview`, `exports`, `audit` |
| Schvalování + Notifikace | `/approvals`, `/notifications` | [Workflow, schvalování, notifikace](./notifications.md) | Životní cyklus schválení, „pending change“ chování a jak se neblokovat | `workflow`, `approvals`, `notifications` |
| Kontroly | `/controls` | [Správa kontrol](./controls.md) | Návrh kontroly, ownership, evidence exekuce, export | `controls`, `workflow`, `exports` |
| Rizika | `/risks` | [Správa rizik](./risks.md) | Hygiena registru, scoring, ownership a vazby | `risks`, `workflow`, `approvals` |
| Nálezy (pokud jsou zapnuté) | `/issues` | [Správa nálezů](./issues.md) | Remediace, vazby na rizika/kontroly a disciplína uzavírání | `issues`, `workflow`, `exports` |
| KRI | `/kris` | [Správa KRI](./kris.md) | Limity, zápis hodnot, breach signály | `kri`, `notifications`, `exports` |
| Dodavatelé (pokud jsou zapnutí) | `/vendors` | [Správa dodavatelů](./vendors.md) | Third-party governance, grouped drill-down pohledy, assessmenty, incidenty, exporty | `vendors`, `approvals`, `exports` |
| Oddělení | `/departments` | [Oddělení](./departments.md) | Expozice podle org jednotek, drill-down a odpovědnosti | `departments`, `workflow`, `exports` |
| Governance (jen CRO, ne-admin) | `/governance` | [Governance](./governance.md) | Orphans, ownership mezery a jejich řešení | `governance`, `audit`, `troubleshooting` |
| Activity Log (permission-gated, ne-admin) | `/activity-log` | [Activity Log](./activity-log.md) | „Kdo změnil co“, časová osa, auditní evidence | `activity-log`, `audit`, `exports` |
| Uživatelé / přístupy (role-gated) | `/users` | [Správa přístupů](./access-management.md) | Interpretace rolí/scope a kontrola přístupů | `access`, `audit`, `settings` |
| Risk Hub (CRO only) | `/risk-hub` | [Risk Hub](./risk-hub.md) | Konfigurační koncepty a bezpečné provozní vzory | `riskhub`, `settings`, `approvals` |
| Nastavení | `/settings` | [Začínáme](./getting-started.md) | Preference (jazyk/téma) a navigace v dokumentaci | `settings`, `onboarding`, `workflow` |

## Mapa dokumentace (podle workflow)

Pokud se chcete učit podle úkolů, použijte tento index:

- „Nevidím modul / route, kterou mám mít“:
  - začněte [Začínáme](./getting-started.md#role-scope-a-viditelnost)
  - pak [Správa přístupů](./access-management.md#troubleshooting)
- „Uložil/a jsem změnu, ale neprojevila se“:
  - [Workflow, schvalování, notifikace](./notifications.md#schvalovani-a-notifikace)
- „Založit kvalitní riziko rychle“:
  - [Správa rizik](./risks.md#hlavni-workflow)
- „Zapsat evidence exekuce kontroly“:
  - [Správa kontrol](./controls.md#hlavni-workflow)
- „Zapsat hodnotu KRI a pochopit schvalování“:
  - [Správa KRI](./kris.md#hlavni-workflow)
- „Založit nález provázaný s rizikem/kontrolou“:
  - [Správa nálezů](./issues.md#hlavni-workflow)
- „Vyexportovat auditní balíček“:
  - [Dashboard](./dashboard.md#filtry-pohledy-a-exporty)
  - [Správa dodavatelů](./vendors.md#filtry-pohledy-a-exporty)
  - [Activity Log](./activity-log.md#filtry-pohledy-a-exporty)
- „Zjistit, kdo a kdy něco změnil“:
  - [Activity Log](./activity-log.md)

## Jak fungují oprávnění a scope

Většina problémů typu „chybí mi funkcionalita“ je způsobená jedním z těchto faktorů:

1. **Oprávnění**: chybí `resource:action` (např. `vendors:read`).
2. **Scope**: omezuje defaultní viditelnost (`global`, `department`, `manager`).
3. **Ownership výjimka**: ownership může rozšířit viditelnost mimo department scope pro konkrétní záznam.

Praktická pravidla:

- Pokud položka v menu úplně chybí (např. Nálezy), ověřte oprávnění.
- Pokud položka existuje, ale seznam je prázdný, ověřte scope a filtry.
- Pokud detail otevřete přes odkaz, ale záznam nemůžete najít v seznamu, je to často scope hranice + ownership výjimka.
- Pokud jste přihlášení jako platform admin, chybějící business moduly jsou očekávané. Používejte admin knihovnu dokumentace a plochy pod `/admin`.

## Jak fungují odkazy v manuálech

Manuály používají deterministická pravidla, aby se odkazy chovaly předvídatelně:

- [Začínáme](./getting-started.md) otevře jiný manuál v rámci čtečky.
- Příklady aplikačních route zapisujte jako kód, například: `` `/approvals` ``.
- `[#anchor](#heading-id)` posune v rámci aktuální stránky.
- Externí odkazy jsou `https://...` a otevřou se v novém tabu.

Pokud odkaz vede jinam, než čekáte, berte to jako bug v dokumentaci a nahlaste jej (viz níže).

## Tagy a rychlé filtrování v knihovně

Knihovna dokumentace podporuje rychlé filtrování přes tagy.

Doporučený postup:

1. začněte `All` a podívejte se, co existuje,
2. filtrujte podle modulu (např. `risks`, `controls`, `vendors`),
3. přidejte workflow tag (např. `approvals`, `exports`) pro zúžení na konkrétní typ úkolu.

Pokud řešíte audit/evidence, často funguje nejlépe:

- filtrovat `audit`
- a pak přidat `exports` nebo konkrétní modul

## Jak hlásit problém v dokumentaci

Při hlášení problému přidejte kontext pro reprodukci:

- název manuálu + sekce (nebo URL hash, pokud je vidět)
- target odkazu, na který jste klikli
- vaše role a scope (global/department/manager)
- zda jste měli angličtinu nebo češtinu

Pokud je problém „chování je špatně“, doplňte:

- očekávané chování (1 věta)
- pozorované chování
- text chybové hlášky (pokud je)

## Politika změn a zdroj pravdy

Dokumentace je produktová plocha:

- Manuály jsou verzované a mají timestamp (`version`, `last_updated`).
- `source_of_truth` ukazuje na kanonický kód nebo kapitolu business logiky.
- Čeština a angličtina se drží v parity (názvy souborů i intent).

Pokud manuál neodpovídá reálnému chování, berte aplikaci jako pravdivou a manuál jako zastaralý, a nahlaste problém s kroky pro reprodukci.

## Související dokumentace

- První přihlášení a správné návyky: [Začínáme](./getting-started.md)
- Hlavní provozní moduly: [Rizika](./risks.md), [Kontroly](./controls.md), [KRI](./kris.md)
- Workflow: [Schvalování a notifikace](./notifications.md)
- Admin-only dokumentace se sem záměrně nelinkuje (jiné publikum).
