---
title: Správa dodavatelů
version: "2.1"
last_updated: "2026-03-05"
audience: user
source_of_truth: "frontend/src/pages/VendorsPage.tsx + frontend/src/pages/VendorDetailPage.tsx + frontend/src/pages/vendors/* + vendor assessment workflows"
summary: "Kompletní manuál pro third‑party risk: onboarding dodavatelů, ownership, assessmenty, reassessmenty, incidenty, SLA, exporty a notifikace."
tags:
  - vendors
  - workflow
  - approvals
  - notifications
  - exports
  - troubleshooting
---

# Správa dodavatelů

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

Správa dodavatelů v RiskHubu je navržená pro third‑party risk governance. Cíl je mít jasno:

- Kteří dodavatelé jsou důležití a proč?
- Kdo vlastní vztah i riziko (outsourcing owner)?
- Jaká je aktuální risk posture?
- Kdy je další reassessment?
- Jaké incidenty, závislosti a SLA mohou posture změnit?

Hlavní route: `/vendors`

Dodavatel je hub, který propojuje:

- business kontext (process/subprocess, oddělení)
- ownership vztahu
- risk scoring a materialitu
- assessmenty a rozhodnutí
- průběžný monitoring (signály, SLA, incidenty)

## Kde to najdete

- seznam dodavatelů: `/vendors` (vyžaduje `vendors:read`)
- detail: klik na dodavatele
- založení: `/vendors/new` (vyžaduje `vendors:write`)

Pokud **Dodavatele** nevidíte:

- pravděpodobně nemáte `vendors:read`

## Role, scope a viditelnost

Vendor data bývá citlivější než rizika/kontroly (komerční informace, due diligence).

Přístup řídí:

- permissions (`vendors:read`, `vendors:write`, `vendors:delete`)
- scope a oddělení
- ownership: outsourcing owner často může editovat i bez širokého write

Praktické pravidlo:

- Pokud jste outsourcing owner, budete typicky udržovat záznam.
- Pokud nejste, berte dodavatele jako governance objekt a vyhněte se „drive‑by editům“.

## Datový model a klíčová pole

Záznam dodavatele obsahuje identitu i governance metadata.

| Pole | Význam | Poznámky |
|---|---|---|
| Name / legal name | Identita dodavatele | Legal name pro smlouvy, name pro provoz. |
| Registration / country / website | Základní due diligence | Chybějící základy jsou audit pain. |
| Process / subprocess | Business kontext | Konzistence pomáhá reportingu. |
| Department | Routing/reporting kontext | Alignujte s místem, kde se vztah řídí. |
| Outsourcing owner | Odpovědný owner vztahu | Nejklíčovější routing pole. |
| Vendor type | ICT / outsourcing / partner / other | Typ ovlivňuje očekávané assessmenty. |
| Risk score (1–5) | Rychlý posture signál | Skóre musí být vysvětlitelné, ne „pocit“. |
| Important function | Governance klasifikace | Neměňte lehce; řídí review očekávání. |
| DORA relevant | Regul. relevance | Pokud používáte DORA workflow, držte přesné. |
| Significant vendor | Materialita | Řídí cadence a governance. |
| Replaceability / alternatives | Resilience signál | Buďte upřímní; „easy“ když není je riziko. |
| Reassessment cadence / next due | Scheduling | Spouští remindery a overdue tlak. |
| Status | `active` / `inactive` | Inactive funguje jako archiv; restore je permission-gated. |

Taby na detailu (high-level):

- Risk factors: drivery skóre
- Linked risks / controls: napojení na enterprise posture
- Assessments: strukturovaný workflow (draft → submitted → review → decision)
- Schedule: cadence a due dates
- Contract controls / resilience / dependencies: governance hloubka
- Incidents / remediation / SLA / signals: monitoring a reakce

Aktivní tab na detailu je možné linkovat. Pokud potřebujete někoho poslat rovnou do konkrétní sekce, použijte URL ve tvaru `/vendors/<id>?tab=sla`.

## Hlavní workflow

### 1) Onboarding dodavatele (čistý baseline)

1. Založte dodavatele (nebo otevřete existujícího).
2. Doplňte identitu (name, legal info, website).
3. Nastavte business kontext:
   - process/subprocess
   - oddělení
4. Nastavte outsourcing ownera.
5. Nastavte governance flagy:
   - vendor type
   - significant / important function / DORA relevance
6. Nastavte počáteční risk score + odůvodnění (v poznámkách/assessmentu).
7. Uložte.

Dodavatel bez outsourcing ownera je orphan, který se časem rozpadne.

### 2) Assessment (decision‑ready posture)

Assessmenty jsou strukturované, aby bylo rozhodnutí auditovatelné.

Typický postup:

1. Detail dodavatele → **Assessments**.
2. Start nový assessment.
3. Vyplňte sekce s evidencí.
4. Ukládejte jako draft, dokud sbíráte vstupy.
5. Submit, až je to kompletní.
6. Review + decision dle vašeho governance modelu.

Status berte vážně:

- draft: nekompletní
- submitted: připravené na review
- in review / committee recommended: pod governance review
- approved/rejected: rozhodnutí zapsané

### 3) Linkování na rizika a kontroly

Linkování propojuje third‑party posture s enterprise posture.

Použijte, když:

- dodavatel je dependency pro kritický proces
- incident dodavatele může změnit net scoring rizika
- existuje kontrola cíleně na vendor risk

Linkujte smysluplně: „všechno na všechno“ zabije signal.

### 4) Schedule a reassessment disciplína

Dodavatelé mají reassessment cadence. Berte to jako kontrolu:

- cadence podle significance a risk score
- sledujte next due
- reagujte na remindery včas

Pokud je vše permanentně overdue, governance je podkapacitovaná (řešte kapacitu, ne remindery).

### 5) Incidenty, SLA a signály

Monitoring povrchy existují proto, abyste reagovali dřív, než posture spadne.

Pattern:

- incidenty: zapište, posuďte dopad, začněte remediaci, napojte na Issues
- SLA: breach berte jako posture změnu
- signály: použijte jako early warning (ale validujte)

Pokud je incident materiální:

- založte Issue (`/issues`) a routujte nápravu
- zvažte dopad na linknutá enterprise rizika

### 6) Archivace/obnovení

Dodavatel může být označen jako inactive (archiv‑like).

Archivujte, když:

- vztah skončil
- dodavatel už není používaný

Obnovte, když:

- vztah pokračuje
- archivace byla omylem

## Schvalování a notifikace

Vendor práce generuje notifikace v několika kategoriích:

- assessment submitted / committee recommended / decided
- reassessment due soon / overdue
- SLA due / overdue / breach detected

Dle policy mohou být některé editace nebo rozhodnutí schvalované.

Praktické kontroly:

- pokud se akce neaplikuje, zkontrolujte `/approvals`
- pokud jsou remindery divné, zkontrolujte cadence a due dates

Queue disciplína je v `./notifications.md`.

## Filtry, pohledy a exporty

### Filtry

Seznam dodavatelů podporuje:

- status (active vs inactive)
- vendor type
- oddělení
- search

### Exporty

Dodavatele exportujte pro:

- periodické oversight packy
- audit evidence

Disciplína:

- export s „as of“ datem
- nejmenší nezbytný scope
- raw export neměnit

## Časté chyby

- Chybí outsourcing owner.
- Risk score bez odůvodnění a evidence.
- Nekonzistentní používání „significant vendor“.
- Reassessment je stále overdue.
- Incidenty/SLA se nepromítají do enterprise risk posture.

## Troubleshooting

### Nevidím `/vendors`

- Ověřte `vendors:read`.

### Vidím dodavatele, ale nejdou editovat

- Nemusíte mít `vendors:write` a nejste outsourcing owner.

### Assessmenty se neposouvají

- Ověřte, že assessment je „submitted“ (drafty nespouští review).
- Ověřte, že review owner ví o pending práci.

### Reassessment remindery nesedí

- Zkontrolujte cadence a next due.
- Ověřte, zda nebyl dodavatel nedávno assessed/decided.

### Export selhal

- Zkuste s menším počtem filtrů.
- Pokud to trvá, uložte chybovou hlášku.

## Související dokumentace

- `./issues.md`
- `./notifications.md`
- `./risks.md`
- `./controls.md`
- `./departments.md`
- `./activity-log.md`
