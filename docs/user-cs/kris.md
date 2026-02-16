---
title: KRI (Key Risk Indicators)
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "frontend/src/pages/KRIsPage.tsx + frontend/src/pages/KRIDetailPage.tsx + docs/BUSINESS_LOGIC.md"
summary: "Jak navrhovat a provozovat KRI: thresholdy, breach/overdue logika, zápis hodnot, historie, exporty a monitoring přes notifikace."
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
- breach stav, který spouští akci

Hlavní route: `/kris`

V RiskHubu jsou KRI brány jako sub-entity rizik:

- jsou linknuté na riziko
- dědí kontext (oddělení, proces, category)
- napájí dashboard widgety a notifikace

## Kde to najdete

- seznam KRI: `/kris`
- detail KRI: klik na řádek
- KRI u rizika: otevřete detail rizika (`/risks/<id>`) a projděte KRI sekce

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

## Datový model a klíčová pole

| Pole | Význam | Poznámky |
|---|---|---|
| Metric name | Název KRI | Držte stabilní; změny kazí čitelnost trendu. |
| Description | Co metrika znamená a proč je důležitá | Uveďte data source a interpretaci. |
| Unit | %, počet, měna, … | Jednotka musí sedět na hodnotu. |
| Lower/upper limits | Akceptovatelný rozsah | Limity mají být smysluplné (ne příliš široké/úzké). |
| Current value | Poslední zapsaná hodnota | Má odpovídat definovanému period end. |
| Breach status | `within`, `above`, `below` | Breach řídí alerty a prioritu. |
| Frequency | daily/weekly/monthly/… | Musí odpovídat realitě reportingu. |
| Reporting owner | Odpovědný za zápis hodnot | Může být jiný než risk owner. |
| Last period end | Konec posledního období | Používá se pro výpočet due/overdue. |
| Overdue logika | Due date = period end + 15 dní | Overdue je signál selhání monitoringu. |
| History entries | Historie hodnot | Evidence pro trend. |

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

### 4) Reakce na breach a overdue

Breach a overdue nejsou totéž:

- **breach**: metrika je mimo limity (tlak na riziko)
- **overdue**: metrika nebyla zapsána včas (selhání monitoringu)

Doporučený pattern:

- breach: založte Issue a routujte nápravu, poté prověřte rizika/kontroly
- overdue: opravte reporting proces (owner, cadence, data source)

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

Praktické signály:

- breach typicky spustí notifikace
- pokud se editace neaplikuje, zkontrolujte `/approvals`

Mechaniku front najdete v [Schvalování a notifikace](./notifications.md).

## Filtry, pohledy a exporty

### Filtry

Seznam KRI podporuje:

- within limits
- breach
- overdue
- archived
- search

„Overdue“ berte jako disciplínu, „Breach“ jako tlak na riziko.

### Pohledy

- paged list (all)
- grouped views (review pack, koncentrace)

### Exporty

KRI lze exportovat ze seznamu.

Disciplína:

- export s „as of“ datem
- explicitní filtry (breach vs within)
- raw export neměnit

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
