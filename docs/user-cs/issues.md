---
title: Správa nálezů (Issues)
version: "2.3"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/IssuesPage.tsx + frontend/src/pages/issues/* + issue workflows in backend"
summary: "Jak zakládat, třídit, řešit a uzavírat nálezy (Issues) s jasným ownership, termíny, výjimkami a exporty připravenými pro audit."
tags:
  - issues
  - workflow
  - approvals
  - notifications
  - exports
  - troubleshooting
---

# Správa nálezů (Issues)

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

Nálezy (Issues) jsou v RiskHubu základní provozní nástroj pro evidenci problému, jeho nápravu (remediaci), sledování termínů a uložení důkazů. Záměrně nejsou „komplexní ticketing“ systém. Smysl je rychle a auditovatelně popsat „co“, „proč je to důležité“ a „kdo/za kdy“.

Použijte Issue, když:

- selhala nebo byla neúplná exekuce kontroly
- KRI překročilo limit a je potřeba nápravná akce
- audit/review identifikoval gap
- někdo nahlásí opakující se problém, který je potřeba řídit přes status a termín

Issue je kvalitní, když čtenář dokáže bez doplňujících otázek odpovědět:

- Co přesně je špatně?
- Kdo je owner dalšího kroku?
- Jaký je termín a co hrozí při zpoždění?
- Jaký důkaz ukáže, že oprava je hotová?

Hlavní route: `/issues`

## Kde to najdete

- seznam nálezů (register): `/issues`
- detail nálezu: otevřete libovolný řádek ze seznamu
- kontextové odkazy: v některých modulech můžete vidět nálezy navázané na Rizika/Kontroly/KRI/Dodavatele (podle oprávnění)

Pokud **Issues** nevidíte v levém menu:

- pravděpodobně nemáte oprávnění `issues:read` (resource `issues`, action `read`)
- nebo máte role/scope, které neumožňují viditelnost mimo vaše oddělení

Začněte kontrolou přístupu v `/settings` a poté požádejte správce přístupů o ověření „effective permissions“.

## Role, scope a viditelnost

Nálezy respektují stejný model viditelnosti jako další business entity:

- **nejdřív scope**: globální role obvykle vidí více oddělení; oddělové role typicky jen své oddělení
- **ownership výjimky**: ownership může otevřít viditelnost i mimo oddělení
- **backend rozhoduje**: UI může skrývat tlačítka, ale autorita je API

Typické odpovědnosti (popisně, ne jako „policy“):

- **autor nálezu**: založí první verzi s jasným kontextem
- **owner**: odpovídá za aktuální status, termín a koordinaci nápravy
- **reviewer/2nd line**: validuje kvalitu uzavření a rozhoduje o výjimkách

Zápis je vždy permission-gated:

- `issues:write` řídí zakládání a úpravy
- některé přechody statusu mohou být řízené workflow (např. validace uzavření)

## Datový model a klíčová pole

Tabulka níže shrnuje pole, která mají největší dopad na kvalitu řízení.

| Pole | Význam | Poznámky / časté chyby |
|---|---|---|
| Title | Krátký, vyhledatelný popis nálezu | Vyhněte se názvům typu „Issue“ nebo „Problem“. Dejte objekt + failure mód. |
| Description | Co se stalo, co se mělo stát, dopad | Popište minimální reprodukovatelný kontext. Neřešte „vinu“. |
| Severity | Prioritizační signál (low → critical) | Severity má odrážet dopad + urgentnost, ne „kdo tlačí“. |
| Status | Stav (`open`, `triaged`, `in_progress`, `ready_for_validation`, `closed`) | Status je závazek. Neuzavírejte bez důkazů. |
| Department | Kontext pro routing/reporting | Vyberte oddělení, které vlastní nápravu, ne nutně to, které nález našlo. |
| Owner | Osoba odpovědná za další krok | Bez ownera se workflow rozpadá (a některé batch akce mohou přeskočit). |
| Due date | Termín nápravy | Příliš ambiciózní termíny generují šum; příliš vzdálené maskují riziko. |
| Source | Původ (manual, audit, KRI breach, control execution) | Pomáhá interpretovat očekávané důkazy. |
| Remediation plan | Volitelný plán/rychlost nápravy | Udržujte plán v souladu se statusem. |
| Exceptions | Časově omezená výjimka | Výjimka není uzavření. Musí mít expiraci a vlastníka revize. |

Pokud si nejste jistí, optimalizujte pro *auditovatelnost*: i za několik měsíců musí být jasné, proč se rozhodlo tak, jak se rozhodlo.

## Hlavní workflow

### 1) Založení nového nálezu

1. Otevřete `/issues`.
2. Klikněte **New**.
3. Vyplňte `Title` a `Description` tak, aby bylo možné jednat.
4. Nastavte `Severity` a `Due date`.
5. Vyberte `Department` a `Owner`.
6. Uložte.
7. Ověřte, že se nález zobrazuje ve správném scope.

První verze „dost dobrá“ je lepší než perfektní pozdě. Pokud ještě neznáte ownera, napište do popisu explicitní další krok („Určit ownera do 2 dnů“).

### 2) Triage

Triage znamená udělat nález akční:

- potvrdit severity
- doplnit ownera a termín
- rozhodnout, zda jde o quick fix nebo větší nápravu s plánem
- pokud to vaše workflow podporuje, propojit kontext (riziko/kontrola/kri/dodavatel)

Použijte `triaged`, když je jasné „kdo“ a „co dál“.

### 3) Remediace a práce se statusem

Doporučená interpretace statusů:

- `open`: nově založené, ještě neroutované
- `triaged`: přiřazeno + termín, práce je naplánovaná
- `in_progress`: práce běží
- `ready_for_validation`: oprava hotová, čeká na kontrolu
- `closed`: ověřeno a uložené jako důkaz

Pokud používáte remediation plan kartu, držte konzistenci:

- stav plánu `draft/active/blocked/completed` nesmí být v rozporu se statusem nálezu
- remediace je hotová jen když má plán stav `completed`, progress `100%` a existuje completion timestamp
- nastavení stavu na completed nebo progressu na 100 % normalizuje ostatní completion pole
- snížení progressu pod 100 % vrací nález z `ready_for_validation` do `in_progress`
- rozporné aktualizace, například `blocked` s 100 % progressem, se odmítnou

### 4) Uzavření s důkazy

Uzavření je důkazní akt, ne jen klik.

Před přechodem do `closed` zapište:

- co se změnilo
- jak jste ověřili funkčnost
- kde leží důkaz (odkaz, ticket, reference ID)
- jak se zachytí regres (pokud dává smysl)

Pokud validace neprojde, vraťte do `in_progress` a napište konkrétní deficit („chybí důkaz za období X“, „kontrola stále failuje“, apod.).

Uzavření vyžaduje hotovou remediaci. Nález v `ready_for_validation`, kterému byl progress snížen pod complete, nelze zavřít, dokud není remediace znovu kompletní.

### 5) Výjimky (když nejde splnit nápravu včas)

Výjimka je časově omezená akceptace rizika.

Použijte ji, když:

- náprava je blokovaná externí závislostí
- náprava je neúměrná a existuje kompenzační kontrola
- náprava je naplánovaná, ale nelze splnit termín z legitimních důvodů

V Issue uveďte:

- jaký požadavek se „waivuje“
- jaké kompenzační kontroly existují
- expiraci + kdo vlastní obnovu/review

Když schválená výjimka expiruje nebo je revokována, uzavřené nálezy se znovu otevřou jen tehdy, pokud remediace není hotová. Hotová remediace zůstává zavřená.

## Schvalování a notifikace

Nálezy typicky interagují s workflow dvěma způsoby:

1. **Status a výjimky** mohou (podle policy) generovat schvalovací žádosti.
2. **Navázané entity** (rizika/kontroly/kri) mohou generovat schvalování a Issue slouží jako kontext a odůvodnění.

Praktická pravidla:

- Počítejte s notifikacemi při změně statusu, přiřazení ownera nebo při práci s výjimkami.
- Pokud se změna po uložení neprojeví, zkontrolujte `/approvals` a `/notifications`.
- Ke schválení vždy pište „resolution notes“. Je to součást audit trailu.
- Pokud workflow akce vrátí konflikt, obnovte detail nálezu před dalším pokusem; backend mohl normalizovat nebo vrátit remediation stav.

Kompletní mechaniku front a triage najdete v: `./notifications.md`.

## Filtry, pohledy a exporty

Seznam nálezů je navržený jako inbox.

Nejpoužívanější filtry:

- **Status**: `open/triaged` pro routing, `in_progress` pro tlak na exekuci, `ready_for_validation` pro review práci
- **Severity**: izolujte `high` a `critical`
- **Overdue**: rychle najdete porušené závazky
- **Exclude active exceptions**: soustřeďte se na nálezy, které stále vyžadují akci (ne dočasně waived)
- **Search**: používejte stabilní klíčová slova (systém/proces/dodavatel)

Grupované pohledy nyní obsahují i **By Vendor**.

`By Vendor` je multi-membership:

- nález se zobrazí pod každým čitelným vendor kontextem, na který je navázaný
- contextual issues založené z detailu dodavatele se grupují přímo pod daného dodavatele
- issues bez čitelného vendor kontextu spadnou do fallback bucketu pro nepropojené záznamy

Linky z dashboardu a dalších modulů mohou otevřít `/issues` s už přednastavenými filtry. Berte query parametry jako vstupní pohled pro triage, ne jako živě ukládaný view, který se během práce sám přepisuje.

Řazení pomáhá při review:

- `due_at` pro časový tlak
- `updated_at` pro „stále otevřené, ale bez pohybu“

### Exporty

Používejte **Export** pro review balíčky a audit evidence.

Doporučená disciplína:

- exportujte s jasným „as of“ datem
- exportujte co nejmenší nezbytný scope
- zachovejte původní export (pokud transformujete, neztrácejte auditovatelnost)

## Časté chyby

- **chybí owner**: nález bez ownera se stává „poštovní schránkou“.
- **termín bez kapacity**: nereálné termíny naučí organizaci termíny ignorovat.
- **status inflace**: `ready_for_validation` bez důkazů, `closed` bez ověření.
- **zneužití severity**: když je vše „high“, filtr nic neříká.
- **drift v popisu**: měníte problém během remediace bez vysvětlení.

## Troubleshooting

### Nevidím `/issues` v menu

- Ověřte `issues:read`.
- Ověřte, že nejste přihlášeni jako platform admin (admin nepoužívá business moduly).
- Pokud jste dostali oprávnění nedávno, odhlaste/přihlaste pro refresh.

### Vidím nálezy, ale nejdou zakládat nebo upravovat

- Pravděpodobně máte `issues:read`, ale ne `issues:write`.
- Některé přechody mohou být řízené schvalováním; zkontrolujte `/approvals`.

### Uložil(a) jsem změnu, ale neprojevila se

- Pravděpodobně čeká ve schvalování. Otevřete `/approvals`.
- Výsledek sledujte v `/notifications`.

### Export nefunguje nebo je „divný“

- Zkontrolujte aktivní filtry před exportem.
- Zkuste refresh a opakujte. Pokud problém trvá, pošlete podporě chybovou hlášku.

## Související dokumentace

- `./notifications.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./vendors.md`
- `./departments.md`
- `./activity-log.md`
