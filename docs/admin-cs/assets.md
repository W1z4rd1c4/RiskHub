---
title: Podpora registru aktiv (admin runbook)
version: "1.0"
last_updated: "2026-07-31"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md + docs/security/authorization-capability-contract.md + frontend/src/pages/AssetsPage.tsx"
summary: "Provozní podpora vlastnictví aktiv, řízených změn, Composite dopadu a permission-safe evidence."
tags:
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - governance
  - assets
  - departments
  - audit
---

# Podpora registru aktiv (admin runbook)

## Přehled

Tento runbook slouží k diagnostice viditelnosti aktiv, jejich vlastnictví, čekajících změn, vztahů a schvalování. Každé aktivní aktivum vyžaduje aktivního Business vlastníka, aktivního ICT vlastníka a aktivní Vlastnické oddělení. Stejný uživatel může zastávat obě vlastnické role, kterýkoli vlastník může být z jiného oddělení a výběr Business vlastníka smí doplnit pouze prázdné oddělení.

Administrátoři podporují identity, sessions, dostupnost platformy, auditní evidenci a správné předání. Platform role sama nedává business oprávnění k aktivům a nesmí sloužit ke schvalování ani přímým změnám aktiv.

## Kdy to použít

Postup použijte, pokud aktivum chybí v registru nebo tabu oddělení, vlastník jej nemůže číst či upravit, owner label není rozpoznán, relationship action je disabled, pending banner je neočekávaný, Composite návrh je nejasný nebo nepřišla notifikace.

Nepoužívejte jej k rozhodování o kritičnosti, výběru vlastníků, změně oddělení, approval rozhodnutí ani k vynucení cascade výsledku. Jde o business governance.

## Předpoklady a bezpečnost

Zaznamenejte prostředí, čas, jazyk, e-mail, název aktiva, očekávané oddělení, oba očekávané vlastníky, zdrojovou route, vybrané filtry a přesnou chybu. Poznamenejte Active, Archived, orphan a pending change stav.

Chraňte živou schválenou pravdu a vztahovou evidenci. Neměňte přímo Business vlastníka, ICT vlastníka, oddělení, criticality, CIF, linky ani approval rows. Pending Composite může zahrnovat několik resources a částečná oprava by porušila atomické schválení.

## Postup krok za krokem

### 1) Reprodukujte pohled uživatele

Otevřete registr Aktiva s hlášeným URL-backed hledáním, pohledem, filtry, groupingem, řazením a stránkou. Před vymazáním stav zaznamenejte. V detailu oddělení zachovejte uzamčený filtr. Aktivum patří do Vlastnického oddělení, i když jeden nebo oba vlastníci pracují jinde.

### 2) Ověřte přístup k řádku a owner projekce

Určete, zda má uživatel běžný Asset read, je Business vlastník, ICT vlastník nebo vedoucí Vlastnického oddělení. Každý přiřazený vlastník získává record-specific přístup k aktivnímu řádku bez obecného register, report, archive nebo linked-register access. Owner label musí být čitelný; skrytý counterpart se vynechá namísto raw ID.

### 3) Oddělte lifecycle, orphan a pending stav

Active nebo Archived je lifecycle. Čekající změna je stav návrhu. Deaktivace vlastníka zachová historický vztah a vytvoří orphan governance; osobu potichu nevymaže ani nenahradí. Do explicitního reassignment mohou běžné mutace závislé na platné odpovědnosti zůstat zamčené.

### 4) Určete důvod approval

Aktivum je chráněné, pokud je současné nebo navrhované CIF Ano nebo výsledná criticality Critical. Při zapnutém pevném scénáři vyžadují chráněné create, business edit, relationship changes a archive neprázdný důvod a nezávislého nakonfigurovaného Risk Managera nebo CRO. Restore zůstává přímá akce pro oprávněného governance aktéra.

Skutečná změna Business vlastníka, ICT vlastníka nebo Vlastnického oddělení používá pevný scénář změny odpovědnosti i u jinak nechráněného aktiva. Vyhodnocuje se current i proposed stav, aby snížení klasifikace neobešlo kontrolu.

### 5) Interpretujte Composite dopad

Změna Process-to-Asset nebo jiná cascade změna může vytvořit jeden Composite approval, pokud je chráněný proces nebo downstream dopad na aktivum. Návrh bezpečně prezentuje Process a Asset impact, deterministicky zamkne všechny governed resources a aplikuje všechny schválené důsledky atomicky. Během čekání se nesmí změnit živý vztah ani derived Asset value.

Support nesmí Composite rozdělit, přímo opravit pouze jeden resource ani odhalit skryté identity. Autorizovaný viewer vidí permission-scoped labels a diff; redigované resources zůstávají redigované.

### 6) Sledujte queue a notification evidenci

Zaznamenejte request ID, scénář, resource label, requester, status, čas, correlation ID a bezpečné before/after hodnoty. Schvalování nebo Moje žádosti kontrolujte odděleně od delivery. Dvě default-on preference řídí actionable requests a outcomes vlastních žádostí; vypnutí doručení nikdy nemaže queue visibility ani unread work.

### 7) Předejte výsledek

Obsah a relationship choices směrujte na vlastníky aktiva nebo governance tým. Scenario configuration patří CRO. Inactive identity či platform session řeší administrace. Reprodukovatelnou capability, lokalizační, atomicity nebo redaction chybu předejte engineeringu.

## Ověření po změně

- Business vlastník, ICT vlastník a Vlastnické oddělení mají kanonické štítky.
- Stejný uživatel může zastávat obě role bez duplicate-person workaroundu.
- Vlastníci z jiných oddělení nemění Vlastnické oddělení.
- Přístup k řádku nerozšiřuje report nebo linked-register scope.
- Lifecycle, orphan a pending state nejsou zaměněny.
- Živé hodnoty a linky zůstávají během čekání beze změny.
- Composite je jedna atomická governed žádost.
- Requester a eligible approver projekce neodhalují hidden resources.
- Queue visibility je ověřena odděleně od notifications.
- Platform admin nebyl použit jako Asset business authority.

## Rollback

Diagnostika je read-only. Odeberte pouze temporary support access vytvořený autorizovaným administrativním postupem. Pokud je business návrh chybný, žadatel jej může zrušit, případně nezávislý resolver zamítnout s důvodem. Žádost nemažte.

Schválená mutace je provozní pravda. Obrácení vyžaduje příslušnou novou přímou nebo governed akci podle výsledné ochrany a odpovědnosti. Předchozí Composite výsledek nikdy nereprodukujte ručními databázovými změnami.

## Troubleshooting

### Vlastník vidí aktivum, ale ne propojené záznamy

To může být správné. Record-specific Asset access nedává obecný přístup k Vendors, Processes, Risks ani jiným registrům. Ověřte samostatnou viditelnost každého counterpart.

### Aktivum zůstane po Uložit beze změny

Najděte typed queued response a položku v Mých žádostech. Protection, reassignment nebo chráněný cascade impact může změnit Save na governed intake. Live Asset se změní až po resolution.

### Composite obsahuje redigované položky

Je to očekávané, když resolver nemá read scope ke counterpartu. Použijte request IDs a safe labels; kvůli pohodlí nezískávejte raw IDs ani nerozšiřujte role.

### Orphan nelze odstranit

Potvrďte aktivní replacement users a dokončené explicitní reassignment. Evidence deaktivace musí zůstat do úspěšného schválení.

## Eskalace a předání

Uveďte prostředí, user a role, název aktiva, Business vlastníka, ICT vlastníka, Vlastnické oddělení, lifecycle, orphan state, filtry, request ID, scénář, status, impact resources, correlation ID a redigovanou evidenci. Určete kategorii: visibility, ownership, relationship, protected intake, Composite resolution, notification, localization nebo projection.

Okamžitě eskalujte, pokud pending data ovlivní export nebo Department counts, Composite se aplikuje jen částečně, requester se sám schválí, admin-only identita získá Asset writes nebo unikne hidden counterpart label či numeric ID.

## Související dokumentace

- [Podpora schvalování](./approvals.md)
- [Podpora procesů](./processes.md)
- [Podpora oddělení](./departments.md)
- [Konfigurace Risk Hub](./riskhub-config.md)
- [Index admin dokumentace](./README.md)
