---
title: Správa rizik
version: "2.1"
last_updated: "2026-03-09"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §2.1, §6, §7 + frontend/src/pages/RisksPage.tsx"
summary: "Kompletní manuál pro registr rizik: scoring, ownership, scope pravidla, propojení kontrol, exporty a schvalování citlivých změn."
tags:
  - risks
  - workflow
  - approvals
  - exports
  - troubleshooting
---

# Správa rizik

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

Registr rizik je centrální pracovní plocha pro identifikaci, scoring a governance expozice.

Kvalitní registr není seznam „strašáků“. Je to sada *akčních* záznamů, které řídí:

- odpovědnost (ownership)
- návrh a exekuci kontrol
- monitoring přes KRI
- schvalování citlivých změn
- auditovatelné exporty

Hlavní route: `/risks`

RiskHub podporuje model „gross“ vs „net“:

- **gross**: inherentní riziko před kontrolami
- **net**: reziduální riziko po kontrolách

Scoring je postavený na pravděpodobnosti a dopadu.

## Kde to najdete

- seznam rizik: `/risks`
- detail rizika: klikněte na řádek
- založení rizika: z `/risks` (vyžaduje `risks:write`)

Na detailu rizika horní řada přehledu shrnuje záznam přes:

- Klasifikaci
- Vlastnictví
- Vazby

Karta **Vazby** zobrazuje:

- počet aktivních propojených zmírňujících kontrol
- celkový počet propojených indikátorů rizikového apetitu (KRI)
- celkový počet propojených dodavatelů

Propojené KRI a karty kontrol na detailu rizika nyní také zobrazují kanonický monitoring status z backendem odvozených dat:

- kontroly: `new`, `needs review`, `failed`, `passed`
- KRI: `new`, `not submitted`, `breach`, `warning`, `optimal`

Pokud **Rizika** nevidíte v menu:

- pravděpodobně nemáte `risks:read`
- nebo máte špatně nastavený scope

Začněte `./getting-started.md` a `./access-management.md`.

## Role, scope a viditelnost

Viditelnost rizik je daná třemi věcmi:

1. **Scope** (global vs department vs manager)
2. **Oddělení** (routing + reporting kontext)
3. **Ownership výjimky** (owner může vidět i mimo oddělení)

Praktické důsledky:

- Nepředpokládejte, že „oddělení = vidí“. Ownership může změnit viditelnost.
- Když se změní oddělení nebo owner, riziko se může objevit/zmizet různým uživatelům.
- Backend enforcement je autorita; UI je nápověda.

Zápis a archivace jsou permission-gated:

- `risks:write` pro create/edit
- `risks:delete` pro archive/restore (dle policy)
- ownership výjimky mohou ponechat workflow pro linked controls dostupné i mimo vlastní oddělení
- link/unlink kontroly z rizika ale stále vyžaduje `risks:write` a přístup k cílové kontrole; samotný ownership-based přístup na straně rizika nestačí

## Datový model a klíčová pole

Riziko je strukturovaný záznam. Následující pole nejvíc řídí provoz.

| Pole | Význam | Poznámky |
|---|---|---|
| Risk ID code | Stabilní identifikátor (generuje se) | Používejte v komunikaci a audit packu. |
| Name | Krátké pojmenování rizika | Vyhněte se generice; uveďte failure mód. |
| Process / Subprocess | Klasifikace oblasti | Konzistence je zásadní pro groupování a reporting. |
| Risk type | Taxonomie label (konfigurovatelné v Risk Hubu) | Nevymýšlejte nové typy ad-hoc; taxonomie má být stabilní. |
| Category | Sekundární groupování | Držte slovník pod kontrolou, jinak se fragmentuje. |
| Description | Co se může stát + dopad + kontext | Pokud to nejde pochopit do 60s, je to vágní. |
| Status | `active`, `emerging`, `archived` | Ovlivňuje viditelnost a reporting. |
| Priority | Provozní „must watch“ flag | Používejte střídmě.
| Owner | Odpovědná osoba | Bez ownera nic dlouhodobě neškáluje. |
| Department | Routing/reporting kontext | Oddělení není náhrada za ownera. |
| Gross prob/impact | Inherentní scoring vstupy | Vyberte konzistentně; používejte popisy, ne „pocit“. |
| Net prob/impact | Reziduální scoring vstupy | Má reflektovat kontroly, ne optimismus. |
| Linked controls | Kontroly mitigující riziko | Linky mají být smysluplné a udržované. |
| KRIs | Indikátory pro monitoring | KRI jsou včasné varování. |
| Linked vendors | Navázaní dodavatelé | Slouží pro third-party koncentraci a grouped `By Vendor` review. |

Poznámka k detailu:

- Karta **Vazby** používá počet aktivních propojených kontrol, ne koncepty ani archivované kontroly.
- Počet KRI a dodavatelů odpovídá všem aktuálně propojeným záznamům viditelným na detailu.

Poznámka ke kvalitě scoringu:

- Scoring je užitečný jen když umíte vysvětlit změny.
- Pokud se net score zlepší, musí být jasné „díky čemu“ (kontroly + evidence).

## Hlavní workflow

### 1) Založení rizika (high signal, low noise)

1. Otevřete `/risks` a klikněte **New risk**.
2. Vyplňte identitu:
   - name
   - process/subprocess
   - risk type
   - category
   - description
3. Nastavte ownership:
   - vyberte ownera
   - ověřte oddělení (často se auto-doplní z ownera, ale zkontrolujte)
4. Nastavte scoring:
   - gross probability/impact
   - net probability/impact
5. Uložte.

Recept: *založit s minimem schvalovací frikce*

- neměňte mnoho governance-citlivých polí najednou
- napište jasný popis a zvolte realistického ownera
- pokud jsou některá pole schvalovaná, dostanete čistší žádost, když je změna fokusovaná

### 2) Udržujte rizika akční (disciplína údržby)

Riziko aktualizujte, když:

- se mění scoring
- se mění owner
- se zásadně mění sada kontrol
- KRI breache nebo je overdue
- risk assessment dotazník vyžaduje clarification

Kvalitní update:

- říká co se změnilo
- proč se to změnilo
- odkazuje na evidence (pokud je)

### 3) Propojení kontrol na riziko (mitigation integrita)

Propojení kontrol dělá registr operativní.

Na detailu rizika lze typicky:

- připojit existující kontrolu s hodnocením efektivity (high/medium/low)
- přidat poznámku, jak kontrola mitigují daný failure mód
- odpojit kontrolu, pokud už nemitigují

Pravidla kvality linků:

- nelinkujte kontroly jen „protože se to zdá podobné“
- nenechávejte high rizika bez kontrol bez explicitní akceptace
- při unlink uveďte proč (retire, změna scope, nahrazeno)

### 4) Monitoring přes KRI

KRI jsou monitoring vrstva.

Provozní vzor:

- definujte KRI pro rizika, která jsou klíčová
- nastavte thresholdy tak, aby breach byl smysluplný
- overdue KRI berte jako governance selhání (ztratili jste včasné varování)

### 5) Archivace a obnovení

Archivace je governance akce. Použijte, když riziko už není relevantní (proces skončil, riziko eliminováno, merge).

Bezpečný postup:

1. Ověřte, že na riziko nenavazují aktivní remediace.
2. Zkontrolujte vazby na kontroly a KRI.
3. Archivujte.
4. Ověřte, že se riziko vyřadilo z aktivního reportingu.

Pokud backend vyžaduje schválení archivace, akce se zařadí do `/approvals`.

Obnovení použijte, když:

- riziko je znovu relevantní
- archivace byla omylem

## Schvalování a notifikace

Některé editace rizik jsou governance-citlivé.

Typické approval-trigger:

- změna ownera
- změna oddělení
- změna category/type
- archivace

Jak poznáte queued změnu:

- save proběhne, ale hodnota se nezmění
- v listu se objeví „pending changes“ indikátor

Postup:

1. Otevřete `/approvals` a najděte žádost.
2. Sledujte status a resolution notes.
3. Výsledek sledujte v `/notifications`.

Workflow mechanika je detailně v `./notifications.md`.

## Filtry, pohledy a exporty

Seznam rizik podporuje operační pohledy.

### Filtry

Nejpoužívanější:

- status (`active`, `emerging`, `archived`)
- risk type
- priority
- breached (má KRI breach)
- critical (net score nad threshold)

### Pohledy

RiskHub podporuje view módy, které mění interpretaci seznamu:

- all risks (paged)
- grouped views (pro přesné počty musí dotáhnout více dat)

Grouped pohledy nyní zahrnují i **By Vendor**.

`By Vendor` je multi-membership:

- jedno riziko se zobrazí ve všech čitelných bucketech navázaných dodavatelů
- nečitelní dodavatelé se do grupování nezapočítají
- rizika bez čitelných navázaných dodavatelů spadnou do fallback bucketu pro nepropojené záznamy

Použijte ho pro kontrolu third-party koncentrace nebo otevřených rizik kolem konkrétního dodavatele.

Groupované view použijte pro:

- komisi
- analýzu koncentrace expozice

### Řazení

- podle score pro top drivery
- podle procesu/category pro reporting strukturu

### Exporty

Export berte jako evidence.

Disciplína:

- export s „as of“ datem
- konzistentní filtry podle narativu (oddělení, status)
- raw export neměňte; odvozenou analýzu ukládejte zvlášť

## Časté chyby

- Vágní popisy bez dopadového kontextu.
- Scoring jako „dekorace heatmapy“ místo governance kontroly.
- Více citlivých změn bez odůvodnění.
- Linkování kontrol bez ověření, že mitigují daný failure mód.
- Ignorování overdue KRI.

## Troubleshooting

### Nevidím riziko, které čekám

- Zkontrolujte oddělení a ownera.
- Ověřte scope.
- Pokud se ownership měnil, zkontrolujte `/activity-log` (pokud máte).

### Editace se neaplikovala

- Zkontrolujte `/approvals`.
- Výsledek sledujte v `/notifications`.

### „Critical“ filtr nesedí

- Critical je threshold-based (net score).
- Pokud se měnily thresholdy v Risk Hubu, pohled se posune.

### Export selhal

- Zkuste s menším počtem filtrů.
- Ověřte konektivitu.
- Pokud problém trvá, uložte chybu a eskalujte.

## Související dokumentace

- `./getting-started.md`
- `./notifications.md`
- `./controls.md`
- `./kris.md`
- `./issues.md`
- `./vendors.md`
- `./departments.md`
- `./activity-log.md`
