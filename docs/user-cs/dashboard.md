---
title: Dashboard a reporting přehled
version: "2.1"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/DashboardPage.tsx + dashboard widgety a report exporty"
summary: "Jak používat Dashboard jako provozní cockpit: filtry, drill-down, committee view, disciplína exportů a správná interpretace trendů."
tags:
  - overview
  - exports
  - workflow
  - audit
  - troubleshooting
---

# Dashboard a reporting přehled

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

Dashboard je provozní cockpit. Shrnuje posture a zvýrazňuje, co je potřeba řešit *dnes*.

Dashboard je užitečný jen když:

- rozumíte filtrům a máte je pod kontrolou
- interpretujete metriky v kontextu scope
- používáte drill-down pro nalezení skutečných driverů

Hlavní route: `/`

Dashboard se průběžně aktualizuje (polling). Berte ho jako „aktuální posture“, ne jako statický report.

## Kde to najdete

- položka **Přehled/Dashboard** → `/`

Drill-down odkazy typicky vedou do:

- `/risks` (včetně critical filtrů)
- `/controls`
- `/kris`
- `/departments`
- `/vendors` (pokud máte `vendors:read`)
- `/issues` (pokud máte `issues:read`)

Widget stavů KRI používá kanonické drill-down routy:

- overdue -> `/kris?monitoring_status=not_submitted`
- upcoming -> `/kris?timeliness_status=due_soon`

## Role, scope a viditelnost

Dashboard respektuje váš scope.

Důsledky:

- uživatel s oddělovým scope uvidí jinou posture než globální reviewer
- některé widgety jsou permission-gated (např. Issues widgety jen pokud máte čtení Issues)

Některé organizace mají i „committee“ view pro určité role/scope, které je více review‑ready.

Praktický příklad:

- Pokud jste Department Head se scope `manager`, dashboard může výrazně záviset na tom, kdo je nastavený jako váš manager chain. Pokud řada není správně, “mizí” lidé i jejich rizika/kontroly.
- Pokud jste globální reviewer, uvidíte širší posture, ale zároveň musíte být opatrní při sdílení čísel: pro týmy se scope `department` mohou být “jiná a přesto správná”.

## Datový model a klíčová pole

Dashboard widgety jsou agregace napříč entitami.

| Widget / metrika | Co reprezentuje | Jak interpretovat |
|---|---|---|
| Total controls | Počet kontrol ve scope | Vysoké číslo není automaticky „dobře“; důležitá je kvalita exekuce. |
| Active departments | Oddělení s reálnou expozicí | Použijte jako navigaci, ne KPI. |
| Critical risks | Net score nad threshold | Thresholdy jsou klíč; ověřte definici „critical“. |
| Average net risk score | Průměr reziduální expozice | Má smysl jen s distribucí (koncentrace high/critical). |
| Vendors | Počet dodavatelů ve scope | Viditelné jen s `vendors:read`. |
| Open issues | Počet nálezů | Viditelné jen s `issues:read`. |
| Risk distribution (gross/net) | Heatmap scoringu | Drill-down použijte pro top drivery. |
| KRI breach widgety | breach/due/overdue signály | Je to monitoring disciplína + tlak na riziko. |
| Trendy | časové řady pro rizika/kontroly/breaches | Hledejte change pointy a ověřujte evidence. |

Poznámka k thresholdům:

- “critical” nebo “breach” není pocit. Je to definice z konfigurace (Risk Hub). Pokud se organizace ptá “proč to je critical”, odpověď je: jak je nastavena taxonomie a limity, ne kdo se hlasitěji ozve.

## Hlavní workflow

### 1) Ranní rutina (5–10 minut)

1. Otevřete `/`.
2. Zkontrolujte, že filtry sedí.
3. Projděte urgentní signály:
   - critical risks
   - KRI breaches a overdue
   - open issues (pokud vidíte)
4. Proklikněte do list stránek a udělejte akci.
5. Před editací zkontrolujte workflow fronty (`/notifications`, `/approvals`).

### 2) Příprava review/committee packu

Dashboard je start, ne finální artefakt.

Doporučený postup:

1. Použijte metriky oddělení pro identifikaci koncentrace.
2. Použijte risk heatmap pro high/critical clustery.
3. Exportujte entity listy s explicitními filtry:
   - `/risks` (critical, priority, breached)
   - `/controls` (status, risk level)
   - `/kris` (breach, overdue)
   - `/issues` (overdue, high/critical)
4. Pište narativ přes „drivery“, ne jen počty.

### 3) Diagnostika skokové změny metriky

Když číslo skokově změní hodnotu:

- ověřte filtry
- ověřte změny statusů (active ↔ archived)
- ověřte změny ownership/oddělení (položky se mohly posunout do/ze scope)

Použijte `/activity-log` (pokud máte) pro potvrzení co, kdy a kdo změnil.

### 4) Drill-down s disciplínou

Widgety často podporují drill-down:

- heatmap cell → filtrovaný seznam rizik
- „critical risks“ → `/risks?critical=true`
- KRI overdue → `/kris?monitoring_status=not_submitted`
- KRI upcoming → `/kris?timeliness_status=due_soon`

Při sdílení vždy uveďte:

- aktivní filtry
- as-of čas
- scope (global vs oddělení)

## Schvalování a notifikace

Dashboard je převážně read‑only a sám nevytváří schvalování.

Ale často je důvodem:

- dashboard ukáže tlak → někdo změní scoring/ownership → vznikne schvalovací žádost

Disciplína:

- při změně citlivých polí používejte `/approvals` a pište jasné odůvodnění
- breach/overdue widgety používejte jako trigger pro Issue a remediaci

## Filtry, pohledy a exporty

### Filtry

Dashboard filtry (např. oddělení) mění celý pohled.

Pravidla:

- před interpretací čísla vždy zkontrolujte filter bar
- při přechodu mezi „moje práce“ a „prezentace“ filtry resetujte

### Pohledy

Některé deploymenty mají committee/overview toggle.

- committee view: stabilní, narativní, review‑ready
- overview view: denní routing

Pravidla quarterly comparison v committee view:

- current quarter nesmí být pozdější než skutečný aktuální kvartál
- compare quarter musí být dříve než vybraný current quarter
- live snapshot metriky se používají jen pro skutečný aktuálně probíhající kvartál
- dokončené kvartály používají uložené snapshoty; historická volba nedostane živé dnešní hodnoty pod starým labelem
- uživatelé se scope na oddělení vidí scoped period choices a scoped snapshoty
- pokud chybí vybraný snapshot nebo konkrétní snapshot metrika, widget zobrazí varování, pomlčky pro nedostupné strany a `N/A` pro delta místo toho, aby chybějící hodnoty bral jako nulu

### Exporty

Dashboard podporuje summary export (CSV).

Disciplína exportu:

- exportujte jen pro konkrétní rozhodnutí/audit
- přiložte kontext (filtry + timestamp)
- raw export neměňte

Recept: *audit-ready export v 60 sekundách*

1. Ujistěte se, že filtry odpovídají otázce (oddělení, statusy).
2. Poznamenejte si “as-of” čas (kdy jste export spustil/a).
3. Export stáhněte a uložte originál beze změn.
4. K exportu připojte jednu větu: “Export z `/` (Dashboard), filtry: X, čas: Y”.
5. Pokud posíláte dál, přidejte i scope (“department” vs “global”), aby příjemce neinterpretoval čísla mimo kontext.

## Časté chyby

- Čtení metrik bez kontroly filtrů.
- Brát počty jako KPI (víc kontrol ≠ lepší kontrolní prostředí).
- Sdílet export bez scope/as-of.
- Reagovat na jeden breach bez kontextu trendu.

## Troubleshooting

### Dashboard je prázdný nebo neúplný

- Ověřte, že jste přihlášeni.
- Ověřte permissions (issues/vendors widgety mohou být skryté).
- Zkuste refresh.

Pokud dashboard vypadá “vynulovaný” po restrukturalizaci:

- ověřte, zda se neměnil váš scope nebo manager chain
- ověřte, zda se neměnila oddělení u ownerů (záznamy se přesunuly mimo váš scope)

### Export nefunguje

- Zkuste znovu.
- Ověřte konektivitu.
- Pokud trvá, uložte chybu a eskalujte.

Pokud export selže opakovaně:

- zkuste menší dataset (přejděte na konkrétní seznam `/risks` a exportujte odtud)
- zachyťte přesný text chyby a čas, aby šlo korelovat s logy

### Čísla se liší od kolegy

- Porovnejte filtry.
- Porovnejte scope.
- Ověřte archivované položky (mohou být v jednom pohledu zahrnuté a v druhém ne).

## Související dokumentace

- [Začínáme](./getting-started.md)
- [Správa rizik](./risks.md)
- [Správa kontrol](./controls.md)
- [Správa KRI](./kris.md)
- [Správa nálezů](./issues.md)
- [Správa dodavatelů](./vendors.md)
- [Oddělení](./departments.md)
- [Schvalování a notifikace](./notifications.md)
- [Activity Log](./activity-log.md)
