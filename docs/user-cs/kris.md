---
title: KRI (Key Risk Indicators)
version: "2.2"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/KRIsPage.tsx + frontend/src/pages/KRIDetailPage.tsx + docs/BUSINESS_LOGIC.md"
summary: "Jak navrhovat a provozovat KRI: thresholdy, breach/overdue logika, zápis hodnot, přiřazení dodavatelů, historie, exporty a monitoring přes notifikace."
tags:
  - kri
  - workflow
  - notifications
  - exports
  - troubleshooting
---

# KRI (Key Risk Indicators)

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

KRI (Key Risk Indicators) jsou monitoring vrstva pro rizika. Převádí „myslíme si, že tlak roste“ do měřitelných signálů.

KRI je kvalitní, když má:

- jasné jméno metriky a jednotku
- definovaný normální rozsah (limity)
- konzistentní cadence zapisování
- monitoring stav, který spouští akci

Hlavní route: `/kris`

V RiskHubu jsou KRI brány jako sub-entity rizik:

- jsou linknuté na riziko
- dědí kontext (oddělení, proces, category)
- mohou být také navázané na dodavatele pro third-party monitoring kontext
- napájí dashboard widgety a notifikace

## Kde to najdete

- seznam KRI: `/kris`
- detail KRI: klik na řádek
- KRI u rizika: otevřete detail rizika (`/risks/<id>`) a projděte KRI sekce
- KRI u dodavatele: otevřete detail dodavatele (`/vendors/<id>`) a projděte sekci navázaných KRI

Pokud **KRI** nevidíte v menu:

- pravděpodobně nemáte `risks:read` (KRI jsou sub-entity rizik)

## Role, scope a viditelnost

KRI přístup se často dělí na dvě schopnosti:

1. **design KRI** (create/edit): typicky `risks:write` (protože KRI je součást governance rizik)
2. **zápis hodnot**: `kri:submit` a/nebo reporting owner

Praktická pravidla:

- pokud nemůžete vytvářet/upravovat KRI, můžete stále zapisovat hodnoty, pokud jste reporting owner a policy to dovolí
- pokud KRI vidíte, ale nejde zapisovat, zkontrolujte `kri:submit`

Scope pravidla platí dál:

- oddělení a ownership ovlivňují viditelnost
- backend enforcement je autorita
- historie KRI používá stejná backend pravidla viditelnosti jako detail KRI
- reporting owner může číst/odesílat hodnoty pro své KRI, ale žádost o korekci vyžaduje oprávnění pro korekci (`risks:write`) a viditelnost KRI

## Datový model a klíčová pole

| Pole | Význam | Poznámky |
|---|---|---|
| Metric name | Název KRI | Držte stabilní; změny kazí čitelnost trendu. |
| Description | Co metrika znamená a proč je důležitá | Uveďte data source a interpretaci. |
| Unit | %, počet, měna, … | Jednotka musí sedět na hodnotu. |
| Lower/upper limits | Akceptovatelný rozsah | Limity mají být smysluplné (ne příliš široké/úzké). |
| Current value | Poslední zapsaná hodnota | Má odpovídat definovanému period end. |
| Monitoring status | `new`, `not_submitted`, `breach`, `warning`, `optimal` | Kanonický reporting health stav používaný v kartách, seznamech, filtrech i exportech. |
| Frequency | daily/weekly/monthly/… | Musí odpovídat realitě reportingu. |
| Reporting owner | Odpovědný za zápis hodnot | Může být jiný než risk owner. |
| Last period end | Konec posledního období | Používá se pro required-period submission logiku. |
| Required due date | Due date pro poslední uzavřené období | Používá se pro `not_submitted` a `days_overdue`. |
| History entries | Historie hodnot | Evidence pro trend. |

Pravidla monitoring statusu:

- `new`: neexistuje submission history a required period ještě není po due date
- `not_submitted`: chybí submission za required period po due date
- `breach`: za required period je submission a hodnota je mimo limity
- `warning`: za required period je submission, hodnota je v limitech, ale blízko horního limitu
- `optimal`: za required period je submission, hodnota je v limitech a není v horním warning pásmu

Samostatný timeliness filtr:

- `due_soon`: reporting period se blíží due date, ale ještě nechybí submission

Důležitá pravidla:

- monitoring status KRI vychází z **posledního uzavřeného required reporting period**
- warning pásmo je řízené konfigurací (`kri_warning_upper_margin_ratio`, default `0.10`)
- warning pásmo sleduje jen blízkost **horního** limitu
- `monitoring_status` a `timeliness_status` jsou v seznamech a exportech oddělené filtry; pro v1 se nekombinují

Governance historie:

- pro jedno KRI může existovat jen jedna hodnota pro konkrétní period end
- pokud už hodnota pro období existuje, použijte korekci historie místo dalšího zápisu
- duplicitní přímé zápisy se odmítnou; queued zápisy, které během čekání zastarají, se při schválení automaticky odmítnou
- viditelnost akce korekce vychází z backend capabilities, takže tlačítko může být skryté i pro uživatele, který KRI vidí nebo zapisuje

Poznámka k period end:

- Period end je to, co z KRI dělá “měření v čase”. Pokud period end vyplňujete nekonzistentně, trend a overdue logika přestanou být důvěryhodné.
- Pokud musíte hodnotu backfillovat, připojte krátkou poznámku (proč a za jaké období). Jinak příjemce trendu nebude umět interpretovat “skok”.

## Hlavní workflow

### 1) Vytvoření KRI pro riziko

Kvalitní KRI vychází z failure módu rizika.

1. Vyberte riziko, které chcete monitorovat.
2. Definujte metriku, která se mění dřív, než se riziko materializuje.
3. Vytvořte KRI:
   - metric name
   - unit
   - limity (lower/upper)
   - frequency
   - reporting owner
4. Uložte.
5. Zapište první hodnotu jako baseline.

Při create/edit nyní můžete rovnou přidat vendor kontext:

- použijte ve formuláři KRI sekci **Navázaní dodavatelé** pro přiřazení jednoho nebo více dodavatelů
- parent risk zůstává povinný
- vendor linkage je sekundární monitoring kontext, ne náhrada parent rizika
- přiřazení dodavatelů se ukládá atomicky spolu s KRI; pokud validace dodavatele selže, KRI se nevytvoří ani neupraví
- hledání dodavatelů je server-backed, takže výběr není omezený jen na první stránku vendorů

Když KRI zakládáte z detailu dodavatele:

- použije se route `/kris/new?vendor_id=:id&return_to=/vendors/:id`
- aktuální dodavatel je zobrazený jako aktivní kontext a je zahrnutý automaticky do stejného uložení
- výběr rizika se ve výchozím stavu filtruje na rizika navázaná na daného dodavatele
- podle potřeby lze přepnout i na všechna čitelná rizika
- pokud zvolíte riziko, které na dodavatele navázané není, formulář nabídne navázání rizika nebo pokračování bez této vazby
- volba **Navázat riziko a pokračovat** požádá backend o vytvoření chybějící vendor-risk vazby i KRI v jedné transakci
- pokud přiřazení dodavatele nebo požadované navázání rizika selže, formulář zůstane otevřený a nic se částečně neuloží

Recept: *KRI, které se nestanou šumem*

- vybírejte metriky, které umíte získat včas
- vyhněte se čistě subjektivním metrikám
- nastavte limity tak, aby breach znamenal akci

### 2) Zápis hodnoty

Zápis je provozní heartbeat.

1. Otevřete detail KRI.
2. Klikněte **Record value**.
3. Zadejte hodnotu a případně period end.
4. Uložte.
5. Ověřte breach/within status.

Period end je rozhodující. Druhá hodnota pro stejné KRI a stejný period end se nepřijímá jako nový zápis; pro opravu použijte korekci historie.

Pokud nejde zapisovat:

- ověřte `kri:submit`
- ověřte, zda jste reporting owner (některá prostředí dovolují reporting ownerům zapisovat)

### 3) Použití historie pro vysvětlení trendu

History tab je evidence povrch.

Použijte pro:

- kdy začala driftovat metrika
- korelaci se selháním kontrol
- podporu změny net scoringu

Když měníte limity, napište „proč“, jinak bude interpretace trendu nejasná.

Korekce historie:

- používejte ji jen pro opravu existující zapsané hodnoty
- podle role a policy se korekce může aplikovat rovnou nebo vytvořit schvalovací žádost
- pokud někdo během čekání zapíše nebo opraví stejné období, stale žádost se může automaticky odmítnout
- current value se určuje podle posledního řádku historie: period end, recorded timestamp a nakonec id jako tie-breaker

### 4) Reakce na breach a overdue

Monitoring stavy popisují různé typy problémů:

- `breach`: metrika je mimo limity (tlak na riziko)
- `warning`: metrika je stále v limitech, ale blíží se horní hranici
- `not_submitted`: metrika nebyla včas odevzdaná za required period

Doporučený pattern:

- breach: založte Issue a routujte nápravu, poté prověřte rizika/kontroly
- not submitted: opravte reporting proces (owner, cadence, data source)

### 5) Archivace a obnovení

Archivujte KRI, která už nedávají smysl (metrika nahrazena, riziko ukončeno).

Před archivací:

- ověřte dopad na dashboard
- ověřte, zda audit období neočekává trend

Obnovte, pokud bylo archivováno omylem.

## Schvalování a notifikace

KRI interagují s workflow dvěma způsoby:

- **notifikace**: due soon, overdue, near breach, breach detected
- **schvalování**: citlivé změny mohou být schvalované dle policy

Změny vendor vazeb jsou součástí stejného KRI edit workflow:

- neprivilegované editace KRI, včetně změn sekce **Navázaní dodavatelé**, se odesílají ke schválení místo okamžité aplikace
- detail KRI po takovém uložení zobrazí banner o schválení a ponechá aktuální KRI i vendor vazby beze změny, dokud se schválení nevyřeší
- stale schválené změny KRI se při aplikaci odmítnou, pokud se podkladové KRI nebo historie období změnily během čekání

Praktické signály:

- breach typicky spustí notifikace
- pokud se editace neaplikuje, zkontrolujte `/approvals`

Mechaniku front najdete v [Schvalování a notifikace](./notifications.md).

## Filtry, pohledy a exporty

### Filtry

Seznam KRI podporuje:

- monitoring status (`new`, `not submitted`, `breach`, `warning`, `optimal`)
- timeliness status (`due soon`)
- archived
- search

`Not submitted` berte jako disciplínu, `breach` jako tlak na riziko.

### Pohledy

- paged list (all)
- grouped views (review pack, koncentrace)

Grouped pohledy nyní zahrnují i **By Vendor**.

`By Vendor` je multi-membership:

- jedno KRI se zobrazí ve všech čitelných bucketech navázaných dodavatelů
- nečitelní dodavatelé jsou z grupování vynechaní
- KRI bez čitelných navázaných dodavatelů spadnou do fallback bucketu pro nepropojené záznamy

Použijte ho pro přehled, které vendor vztahy jsou monitorované přes KRI a kde se vendor-linked signály koncentrují.

### Exporty

KRI lze exportovat ze seznamu.

Disciplína:

- export s „as of“ datem
- explicitní filtry (monitoring status vs archived)
- raw export neměnit

Exporty KRI nově obsahují monitoring sloupce:

- monitoring status
- required due date
- days overdue

Exporty „due soon“ používají query parametr `timeliness_status=due_soon`.

## Časté chyby

- KRI, která nejdou spolehlivě reportovat.
- Limity, které jsou pořád breach nebo nikdy breach.
- Overdue jako „data admin práce“ místo governance selhání.
- Změna limitů bez odůvodnění.
- Zápis hodnot bez jasného reporting období.

## Troubleshooting

### Vidím KRI, ale nejdou zapisovat hodnoty

- Ověřte `kri:submit`.
- Ověřte, že jste reporting owner.

### Breach status vypadá špatně

- Ověřte jednotku a limity.
- Ověřte, že hodnota je pro správné období.

### Overdue se spouští neočekávaně

- Overdue závisí na `last_period_end`.
- Pokud je period end špatně, upravte ho přes governance proces.

### Export selhal

- Zkuste s menším počtem filtrů.
- Pokud to trvá, uložte chybu.

## Související dokumentace

- [Správa rizik](./risks.md)
- [Správa nálezů](./issues.md)
- [Správa kontrol](./controls.md)
- [Schvalování a notifikace](./notifications.md)
- [Dashboard](./dashboard.md)
- [Activity Log](./activity-log.md)
