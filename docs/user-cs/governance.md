---
title: Governance: orphaned položky a hygiena ownership
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "frontend/src/pages/GovernancePage.tsx + frontend/src/components/governance/*"
summary: "Jak používat Governance pro detekci a řešení orphaned Rizik/Kontrol/KRI tak, aby byl správný ownership, scope a reporting."
tags:
  - governance
  - workflow
  - audit
  - troubleshooting
  - access
---

# Governance: orphaned položky a hygiena ownership

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

Governance je „hygienický“ modul. Pomáhá najít a opravit orphaned položky: rizika, kontroly nebo KRI, které ztratily správný ownership nebo vazby.

Orphaned položky typicky vznikají, když:

- odchází uživatel a jeho entity se nepřevezmou
- proběhne reorganizace oddělení
- kontrola nebo KRI se založí bez správného propojení
- proběhne import/migrace a některé reference chybí

Proč je to důležité:

- ownership řídí odpovědnost a routing workflow
- oddělení řídí scope a reporting
- orphaned položky vytváří falešný pocit „máme to“, ale reálně to nikdo nevlastní

Hlavní route: `/governance`

## Kde to najdete

- položka **Governance** v menu → `/governance`

Pokud Governance nevidíte:

- váš účet pravděpodobně nemá přístup (typicky jen CRO / globální governance)
- platform admin nepoužívá business Governance; používá admin tooling

Governance berte jako pravidelnou kontrolu:

- denně v prostředí s častými změnami
- minimálně týdně ve stabilním prostředí
- vždy před finalizací komise/board packu

## Role, scope a viditelnost

Governance je záměrně omezené, protože může odhalovat cross-department ownership data.

Typický access pattern:

- CRO (nebo delegovaný globální vlastník) provádí sweep a řeší orphaned položky
- oddělení dodávají kontext, ale samotná rezoluce se dělá centrálně

Rezoluce má reálný dopad na viditelnost:

- změna ownera může otevřít viditelnost přes ownership výjimku
- změna oddělení může posunout položku do/ze scope

Pracujte podle principu „least surprise“: vyberte ownera a oddělení tak, aby to odpovídalo reálné odpovědnosti.

## Datový model a klíčová pole

Governance pracuje s orphaned položkami, které mají společný tvar.

| Pole | Význam | Poznámky |
|---|---|---|
| Item type | `risk`, `control`, `kri` | Použijte taby pro fokus na jeden typ. |
| Item identifier | Lidsky čitelný kód/identifikátor | Preferujte v komunikaci místo interních ID. |
| Item name | Název položky | Pokud je název nejasný, opravte i pojmenování. |
| Department | Aktuální oddělení (může být prázdné) | Prázdné oddělení je častý zdroj scope zmatku. |
| Previous owner | Poslední známý owner (jméno/email) | Diagnostický kontext, ne nutně cíl přiřazení. |
| Orphaned at | Čas, kdy se položka stala orphaned | Pomáhá rozhodnout urgentnost a možnost „stale“ dat. |
| Status | `pending` nebo `resolved` | `resolved` dávejte až po reálném opravení. |

Rezoluce může požadovat:

- `new_owner_id` (pro rizika/kontroly)
- `department_id` (pro všechny typy)
- `target_risk_id` (pro KRI a pro kontroly bez navázaného rizika)

## Hlavní workflow

### 1) Denní/týdenní sweep

1. Otevřete `/governance`.
2. Zkontrolujte headline counts.
3. Začněte u **rizik** (jsou kořenová entita) a řešte nejdřív vysoký dopad.
4. Přesuňte se na **kontroly** a ověřte, že každá kontrola má smysluplné vazby na rizika.
5. Přesuňte se na **KRI** a ověřte správné linknutí na riziko.
6. Na konci znovu zkontrolujte total a potvrďte, že nic nezůstalo omylem `pending`.

### 2) Rezoluce orphaned rizika

Když je riziko orphaned, obvykle chybí/nesedí owner nebo oddělení.

Postup:

1. Otevřete řádek orphan.
2. Vyberte ownera, který bude dlouhodobě accountable za lifecycle rizika.
3. Nastavte/ověřte oddělení.
4. Odešlete rezoluci.
5. Ověřte, že riziko se správně zobrazuje v `/risks` a v pohledech oddělení.

Pokud není jasný owner, nehádejte. Přiřaďte dočasného ownera (např. koordinátora) a založte Issue pro dokončení převodu.

### 3) Rezoluce orphaned kontroly

Kontrola je provozně smysluplná, pokud má:

- ownership + oddělení
- vazbu na rizika, která mitigují

Postup:

1. Otevřete orphan kontrolu.
2. Nastavte ownera a oddělení.
3. Zkontrolujte, zda má kontrola navázaná rizika.
4. Pokud nemá žádná navázaná rizika, vyberte **target risk**.
5. Odešlete rezoluci.
6. Ověřte, že kontrola se zobrazuje v `/controls` a je vidět na detailu rizika.

### 4) Rezoluce orphaned KRI

KRI jsou sub-entity rizik. Prakticky:

- KRI bez vazby na riziko není akční

Postup:

1. Otevřete orphan KRI.
2. Vyberte správné **target risk**.
3. Ověřte kontext oddělení.
4. Odešlete rezoluci.
5. Ověřte, že KRI se zobrazuje u rizika a v `/kris`.

### 5) Zapište „proč“ (audit hygiena)

Governance opravy jsou governance rozhodnutí.

Po rezoluci významné položky (kritické riziko, široce používaná kontrola, klíčové KRI) si uložte kontext:

- proč je zvolený owner správný
- proč je oddělení správné
- jaký follow-up je potřeba (popis, kontroly, úprava KRI, apod.)

Pokud používáte Issue pro follow-up, založte ho a odkažte na rezoluci.

## Schvalování a notifikace

Rezoluce v Governance je strukturální změna. Dle prostředí může:

- spustit schvalování (pokud jsou změny ownera/oddělení policy-driven)
- poslat notifikace novému ownerovi nebo stakeholderům
- vytvořit záznam v Activity Logu

Praktické kontroly:

- pokud se změna po odeslání neprojeví, zkontrolujte `/approvals`
- sledujte `/notifications` pro routing eventy
- použijte `/activity-log` (pokud máte přístup) pro potvrzení záznamu

## Filtry, pohledy a exporty

Governance je optimalizované pro akci, ne pro reporting.

Co umí dobře:

- přepnout tab podle typu (risk/control/kri)
- fokus na `pending`
- rychlý náhled kontextu před rezolucí

Co typicky nedělat:

- používat counts jako „performance“ metriku
- exportovat orphan list bez následné rezoluce

Pokud potřebujete audit evidence, čistý postup je:

1. Rezolovat orphaned položky.
2. Použít Activity Log nebo standardní exporty z `/risks` a `/controls` pro prokázání opraveného stavu.

## Časté chyby

- Přiřadit „nejbližšího“ ownera místo *accountable* ownera.
- Nastavit oddělení podle toho, kde se problém našel, ne kde práce patří.
- Linknout kontrolu na riziko jen kvůli „vyčištění seznamu“ (zkreslí reporting).
- Ignorovat orphaned položky jako „data quality“, i když jde o „control quality“.

## Troubleshooting

### Governance ukazuje counts, ale seznam je prázdný

- Proveďte refresh.
- Orphan scan je best-effort; pokud je scan blokovaný, existující položky by měly být stále čitelné.
- Pokud to trvá, pošlete timestamp a požádejte podporu o kontrolu stats vs list.

### Governance vidím, ale nejde rezolovat

- Můžete mít read přístup, ale ne oprávnění na rezoluci.
- Pošlete item identifier a eskalujte správci přístupů.

### Rezoloval(a) jsem orphan, ale stále je `pending`

- Refresh a znovu otevřete položku.
- Pokud je zapnuté schvalování, může rezoluce čekat v `/approvals`.
- Zkontrolujte `/activity-log` pro důkaz změny.

## Související dokumentace

- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./departments.md`
- `./issues.md`
- `./access-management.md`
- `./activity-log.md`
