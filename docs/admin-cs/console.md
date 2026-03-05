---
title: Admin Console (/admin)
version: "2.0"
last_updated: "2026-03-05"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + admin API endpoints"
summary: "Runbook pro platform adminy: Health check, application/audit logy, export evidence, triage session a bezpečná operativní podpora."
tags:
  - overview
  - audit
  - exports
  - troubleshooting
  - settings
---

# Admin Console (/admin)

**Na této stránce**
- [Přehled](#prehled)
- [Kdy to použít](#kdy-to-pouzit)
- [Předpoklady a bezpečnost](#predpoklady-a-bezpecnost)
- [Postup krok za krokem](#postup-krok-za-krokem)
- [Ověření po změně](#overeni-po-zmene)
- [Rollback](#rollback)
- [Troubleshooting](#troubleshooting)
- [Eskalace a předání](#eskalace-a-predani)
- [Související dokumentace](#souvisejici-dokumentace)

## Přehled

Admin Console je provozní cockpit pro platform adminy. Je určený pro:

- validaci health stavu služby
- incident triage (API chyby, auth/session problémy)
- observability přes application logy a audit logy
- vyšetření a revokaci session
- bezpečný export minimální evidence pro podporu a compliance

Hlavní route: `/admin`

Důležitá hranice:

- Platform admin nemá operovat business moduly (Rizika, Kontroly, KRI, Dodavatele, Issues).
- Platform admin má ověřovat platformní chování a podporovat governance bezpečně.
- Přímý business přístup na `/activity-log` a `/governance` je pro `admin` záměrně blokovaný; pro evidenci používejte audit/application logy a admin reports runbook.

## Kdy to použít

Použijte Admin Console, když potřebujete rychle odpovědět:

- „Je backend zdravý a dostupný?“
- „Dějí se teď chyby?“
- „Co se změnilo (audit trail) a kdo akci provedl?“
- „Je session podezřelá nebo zaseknutá?“
- „Umíme vyexportovat malý výřez logů pro vyšetřování?“

Typické scénáře:

- po deployi / změně prostředí
- auth incident (uživatelé se odhlašují, nejde se přihlásit)
- access incident (neočekávané 403 napříč aplikací)
- audit/compliance požadavek na evidence

## Předpoklady a bezpečnost

Než provedete admin akci, potvrďte:

- jste přihlášeni jako `admin`
- jste ve správném prostředí (dev/staging/prod)
- rozumíte pravidlu „least exposure“ pro logy a exporty

Bezpečnostní pravidla:

- nevkládejte raw logy do neautorizovaných kanálů
- neexportujte víc než je nutné (preferujte úzké okno a konkrétní event typ)
- berte user ID, emaily, IP adresy a request ID jako citlivé
- při změně rotace/retence logů zvažte incident response potřeby i storage dopad

Pokud řešíte bezpečnostní incident, postupujte dle security checklistu a zapojte security ownera včas.

## Postup krok za krokem

### 1) Health tab: rychlá kontrola připravenosti

Cíl: ověřit, že platforma běží a závislosti jsou v pořádku.

Postup:

1. Otevřete `/admin`.
2. Vyberte **Health**.
3. Zkontrolujte:
   - database status je OK
   - latency je v očekávaných mezích
   - uptime odpovídá posledním deployům
4. Pokud je health degradovaný:
   - otevřete application logy a hledejte korelaci
   - ověřte DB konektivitu a credy (mimo UI)

### 2) Application logs: vyšetření runtime chyb

Cíl: najít error patterny bez toho, aby se z logů stal data leak.

Postup:

1. Otevřete **Application logs**.
2. Filtrovat podle levelu (začněte ERROR).
3. Zvyšujte počet řádků jen podle potřeby (start small).
4. Identifikujte:
   - časové okno
   - opakující se request ID
   - endpointy/feature, které se objevují
5. Export:
   - JSON pro strukturovanou analýzu
   - CSV pro rychlý lidský review

Heuristiky:

- Jedna chyba je stopa. Opakující se chyba je kandidát na root cause.
- U auth problémů hledejte request ID s 401/403 patterny.

### 3) Audit logs: potvrzení governance akcí

Cíl: vytvořit audit narativ: co se stalo, kdo a kdy.

Postup:

1. Otevřete **Audit logs**.
2. Pokud lze, filtrujte event type.
3. Použijte úzké okno řádků i času.
4. Exportujte pouze řádky nutné pro tvrzení.

Audit logy používejte pro:

- změny přístupu
- konfigurační změny
- schvalovací rozhodnutí (pokud jsou auditované)
- revokace session

### 4) Sessions: vyšetření a revokace

Cíl: snížit riziko ukončením podezřelých nebo rozbitých session.

Postup:

1. Otevřete **Sessions**.
2. Identifikujte uživatele (email/jméno) a potvrďte identitu bezpečným kanálem.
3. Zkontrolujte charakteristiky:
   - last activity
   - last login
   - role a department kontext
4. Pokud je revokace nutná:
   - revoke session
   - informujte uživatele, aby se znovu přihlásil

Poznámky:

- Revokace session je nevratná.
- Použijte při podezření na kompromitaci tokenu, offboarding nebo zaseknutý auth stav.

### 5) Log konfigurace: rotace a retence

Cíl: udržet logy dost dlouho pro incident response bez storage rizika.

Postup:

1. Otevřete panel konfigurace logů.
2. Upravte rotation size a retention count pro:
   - application logy
   - audit logy
3. Uložte.
4. Ověřte:
   - config je po refresh viditelný
   - exporty stále fungují

Disciplína změn:

- dělejte malé změny
- vždy si uložte původní hodnoty pro rollback

## Ověření po změně

Po operativní akci v Admin Console ověřte:

- Health je stabilní (nebo jste zachytili degradaci s timestampy).
- Exporty odpovídají filtrům/oknu a neobsahují zbytečná data.
- Revokovaná session už není aktivní a uživatel se umí znovu autentizovat.
- Po změně log konfigurace jsou nové hodnoty vidět po refresh.

Pokud je to součást support případu, přiložte:

- prostředí
- timestampy
- request ID (pokud existují)
- minimální export výřez uložený bezpečně

## Rollback

- Health check: rollback není (read-only).
- Exporty: rollback není; exporty ukládejte bezpečně a mažte, když nejsou potřeba.
- Revokace session: nelze vrátit. „Rollback“ je re-auth uživatele a follow-up.
- Změna log konfigurace: vraťte původní rotation/retention hodnoty a ověřte stabilitu.

## Troubleshooting

### Nejde otevřít `/admin`

- Ověřte, že jste `admin`.
- Ověřte session (re-auth).
- Pokud to trvá, zkontrolujte backend enforcement a logy.

### Health vypadá OK, ale aplikace padá

- Podívejte se do application logů na 401/403/500 patterny.
- Ověřte auth mode a session chování.
- Ověřte frontend-backend konektivitu (CORS, base URL, proxy).

### Exporty jsou prázdné/nekompletní

- Zjednodušte filtry a zkuste znovu.
- Lehce zvyšte počet řádků.
- Ověřte, že event type filtr není příliš úzký.

### Audit log obsahuje neočekávaná data

- Berte jako potenciální security incident.
- Zastavte další exporty.
- Eskalujte security/engineering s minimální nutnou evidencí.

## Eskalace a předání

Eskalujte, když:

- health ukazuje DB konektivitu problém
- logy ukazují opakující se chyby bez jasné konfigurační příčiny
- audit data naznačují neautorizovaný přístup nebo porušení policy

Dobrý balíček pro předání:

- prostředí + časové okno
- co jste viděli (1 odstavec)
- co jste zkusili (kroky)
- minimální exporty (JSON/CSV výřezy) uložené bezpečně
- relevantní request ID a user emaily (jen v autorizovaných kanálech)

## Související dokumentace

- `./user-management.md`
- `./departments.md`
- `./approvals.md`
- `./reports.md`
- `./riskhub-config.md`
