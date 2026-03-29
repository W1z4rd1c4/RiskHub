---
title: Rychlá reference admin incidentů
version: "1.1"
last_updated: "2026-03-29"
audience: admin
source_of_truth: "frontend/src/pages/LoginPage.tsx + frontend/src/pages/UsersPage.tsx + frontend/src/pages/AdminConsolePage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "Použijte jako první, když se něco rozbije. Symptom-first runbook pro auth, access, health a evidenční incidenty."
tags:
  - overview
  - troubleshooting
  - access
  - audit
  - exports
---

# Rychlá reference admin incidentů

Když se něco rozbije, začněte tady.

Pravidlo operátora:

- začněte přesným textem chyby, route, dotčeným uživatelem a timestampem
- než změníte přístup, otevřete `/admin`
- pokud je Health degradovaný, držte se read-only kroků, pokud runbook výslovně neříká jinak

## Přehled

Tento runbook je nejrychlejší vstup pro first-line admin podporu. Je uspořádaný podle přesných symptomů, které admin obvykle uvidí jako první, ne podle backend komponent nebo engineering subsystémů. Použijte ho ve chvíli, kdy vám uživatel pošle banner, vypnuté tlačítko, chybějící modul nebo nečekanou datovou expozici a vy potřebujete bezpečný další krok do jedné minuty.

## Kdy to použít

Použijte tento runbook dřív než hlubší troubleshooting, když:

- uživatel hlásí auth nebo access selhání
- `/admin` ukazuje degraded stav
- `/users` se načte, ale create nebo edit akce chybí
- logy, audit nebo exporty jsou nečekaně prázdné nebo selhávají
- potřebujete rozhodnout, zda retry, opravit access, nebo eskalovat

Pokud už víte, že jde o rutinní access změnu bez live incidentu, jděte rovnou do [Správy uživatelů a přístupů](./user-management.md). Pokud je otázka jen o konkrétním panelu v admin konzoli, použijte [Admin Console](./console.md).

## Předpoklady a bezpečnost

Před použitím symptom card:

- zachyťte přesnou hlášku nebo pozorované chování
- zapište route, dotčeného uživatele, timestamp a prostředí
- než něco změníte v access surface, otevřete `/admin`
- při degraded Health zůstaňte v read-only režimu

Bezpečnostní pravidla:

- když je zamýšlená UI cesta vypnutá, neimprovizujte alternativní create nebo mutate kroky
- nerozšiřujte přístup dočasně jen proto, abyste si něco ověřili
- sessions nerevokujte lehkovážně; je to nevratná akce
- pokud neumíte určit last-known-good stav, eskalujte místo hádání

## Postup krok za krokem

### 1) Vyberte odpovídající symptom card

Zvolte card s nejbližším přesným wordingem. Pokud sedí více card najednou, začněte route, která právě blokuje bezpečný provoz:

- `/login` nebo obnova session patří pod auth card
- `/users` access nebo visibility problémy patří pod access cards
- `/admin` status problémy patří pod degraded-health card
- chybějící exporty nebo prázdná observabilita patří pod export card

### „Authentication service unavailable“ (`/login`, `/users` nebo obnova session)

#### Co to obvykle znamená

- auth nebo session restore selhal
- login akce narazila na degradovanou závislost
- uživatel může držet stale session po nedávné změně

#### Co zkontrolovat jako první

1. Otevřete `/admin` -> **Health**.
2. Ověřte, zda je database status `connected` nebo `disconnected`.
3. Otevřete **Application logs** a hledejte opakující se auth-related 401, 403 nebo 500 eventy s request IDs.
4. Ověřte, zda jde o jednoho uživatele, nebo o více uživatelů.

#### Co může admin bezpečně udělat

- zachytit přesný text banneru a route
- požádat uživatele o jeden čistý re-auth, pokud je Health healthy
- pokud jde o jednoho uživatele, porovnat jeho roli a scope v `/users`
- při degraded Health zůstat read-only

#### Kdy eskalovat

- Health se nenačte
- database je disconnected
- v logách se opakují 500 chyby
- problém se týká více uživatelů
- login selže i po jednom čistém retry

#### Jakou evidenci zachytit

- přesnou route a text banneru
- email dotčeného uživatele
- timestamp a prostředí
- opakující se request IDs
- Health klasifikaci ve stejný čas

### „Uživatel se přihlásí, ale nevidí očekávaný modul“

#### Co to obvykle znamená

- špatná role
- špatný access scope
- špatné oddělení nebo manager assignment
- stale session po nedávné access změně

#### Co zkontrolovat jako první

1. Otevřete `/users`.
2. Ověřte roli, access scope, oddělení a manager assignment.
3. Ověřte přesnou route a zda problém souvisí s read nebo write akcí.
4. Zeptejte se, zda uživatel po poslední změně provedl re-auth.

#### Co může admin bezpečně udělat

- provést nejmenší access opravu v `/users`
- požádat uživatele o odhlášení a přihlášení po změně
- po refreshi ověřit nové hodnoty v `/users`

#### Kdy eskalovat

- stejný uživatel dostává na stejné route nekonzistentní výsledky
- save proběhne, ale ani po re-auth se chování nezmění
- audit trail neukazuje očekávanou access změnu

#### Jakou evidenci zachytit

- route a failing akci
- before a after access hodnoty
- timestamp poslední změny
- request IDs, pokud route vrací forbidden nebo error

### „Uživatel vidí příliš mnoho dat“

#### Co to obvykle znamená

- drift access scope, často `global`
- nechtěně přiřazená privileged role
- session stále drží starší a širší oprávnění

#### Co zkontrolovat jako první

1. Otevřete `/users`.
2. Porovnejte aktuální roli a scope s last-known-good stavem.
3. Ověřte, zda jde o jednu route, nebo o více modulů.

#### Co může admin bezpečně udělat

- okamžitě vrátit roli nebo scope na last-known-good stav
- při security-sensitive expozici revokovat sessions v `/admin` -> **Sessions**
- ověřit opravu v `/users`

#### Kdy eskalovat

- neumíte určit last-known-good access stav
- expozice trvá i po opravě a re-auth
- audit trail nevysvětluje, jak se access změnil

#### Jakou evidenci zachytit

- exponovanou route nebo route
- email uživatele a aktuální roli a scope
- before a after hodnoty, pokud jste něco vraceli
- timestampy a relevantní audit eventy

### „Add user / Add from AD je vypnuté“

#### Co to obvykle znamená

- `/users` načetl seznam uživatelů, ale identity nebo config část stránky je degraded
- stránka je v bezpečném read-only režimu pro create akce

#### Co zkontrolovat jako první

1. Otevřete `/admin` -> **Health**.
2. Ověřte, zda je Health healthy nebo degraded.
3. Otevřete **Application logs** a hledejte opakující se auth nebo config chyby.
4. Po Health checku jednou obnovte `/users`.
5. Pokud import už proběhl úspěšně, potvrďte, že se aplikace vrátila na `/users` a otevřela access edit modal. Nehledejte samostatnou user detail page.

#### Co může admin bezpečně udělat

- pokračovat v read-only kontrole v `/users`
- po healthy kontrole jednou zopakovat refresh
- pokud import proběhne, ale modal se na `/users` neotevře, zachyťte to jako workflow defect na stránce `/users`
- zastavit se před improvizovanými alternativními create kroky

#### Kdy eskalovat

- create akce zůstávají vypnuté i po healthy refreshi
- Health je degraded
- v Application logs dál běží auth nebo config chyby

#### Jakou evidenci zachytit

- screenshot vypnutého stavu
- timestamp a prostředí
- stav Health
- opakující se request IDs z logů, pokud existují

### „Health v Admin Console je degradovaný“

#### Co to obvykle znamená

- závislost nebo runtime subsystém není zdravý
- admin změny teď nesou vyšší operační riziko

#### Co zkontrolovat jako první

1. Otevřete `/admin` -> **Health**.
2. Určete, který signál failuje:
   - database connectivity
   - scheduler lock nebo owner
   - outbox dead-letter count
   - nedávné dispatch nebo run failures
3. Otevřete **Application logs** pro stejné časové okno.

#### Co může admin bezpečně udělat

- zachytit stav Health a request IDs
- dělat read-only evidence capture
- pozastavit non-essential access změny

#### Kdy eskalovat

- database je disconnected
- Health se nenačte
- chybí scheduler lock
- existují dead-letter nebo opakované runtime failures

#### Jakou evidenci zachytit

- screenshot nebo export Health stavu
- timestampy
- opakující se request IDs
- související log výřezy

### „Audit/log exporty jsou prázdné nebo selhávají“

#### Co to obvykle znamená

- filtry jsou příliš úzké
- export surface je degraded
- observabilita není dost spolehlivá pro incident práci

#### Co zkontrolovat jako první

1. Zopakujte export s menším časovým oknem a menším počtem filtrů.
2. Ověřte, že relevantní tab stále ukazuje data v UI.
3. Ověřte, zda je problém jen v exportu, nebo i v on-screen datech.

#### Co může admin bezpečně udělat

- jednou zopakovat export s jednodušším filtrem
- pokud export padá, zachytit on-screen stav
- brát chybějící observabilitu jako blokující faktor pro riskantní admin zásahy

#### Kdy eskalovat

- export selže i po jednom retry
- log nebo audit tab je prázdný, i když nemá být
- u aktivního incidentu nejde zachytit request IDs nebo timestampy

#### Jakou evidenci zachytit

- použité filtry
- screenshot prázdného nebo selhaného exportu
- dotčený tab (`Health`, `Application logs`, `Audit logs`, `Sessions`)
- timestamp a prostředí

## Ověření po změně

Po použití symptom card potvrďte:

- zařadili jste platformu jako Healthy, Degraded but operable nebo Stop and escalate
- provedli jste jen admin-safe akci popsanou v card
- zachytili jste evidenci pro další krok
- umíte vysvětlit, proč jste retry provedli, access opravili nebo eskalovali

## Rollback

Tato rychlá reference je hlavně routing a evidence guide. Rollback závisí na akci, kterou jste opravdu provedli:

- read-only checky a exporty nemají rollback
- access opravy vracíte obnovením last-known-good hodnot v [Správě uživatelů a přístupů](./user-management.md)
- revoke session je nevratný; recovery je re-auth uživatele

Pokud rollback cestu neumíte určit ještě před akcí, zastavte se a eskalujte místo improvizace.

## Troubleshooting

Použijte tuto sekci, když symptom nesedí čistě do jedné card:

- pokud selhává `/login` a zároveň je degraded `/admin`, po zachycení login symptomu přejděte na degraded-health card
- pokud se `/users` načte, ale akce jsou vypnuté a Health je healthy, berte to jako platform defect a eskalujte s request IDs
- pokud starý query string stále ukazuje auth banner i poté, co je platforma healthy, zachyťte current route a current Health stav dřív, než budete předpokládat, že incident stále trvá

Když váháte, vyberte card podle surface, která právě blokuje bezpečný provoz, ne podle původní formulace user reportu.

## Eskalace a předání

Každá eskalace má obsahovat:

- přesné znění symptomu
- route a časové okno
- dotčeného uživatele nebo skupinu
- Health klasifikaci
- request IDs nebo screenshoty
- akce, které už proběhly
- důvod, proč jste se zastavili místo pokračování

Na engineering eskalujte, když je platform state degraded nebo nekonzistentní. Na business ownery eskalujte, když jsou fakta jasná, ale požadovaný výsledek je policy rozhodnutí.

## Související dokumentace

- [Admin onboarding](./getting-started.md)
- [Admin Console](./console.md)
- [Správa uživatelů a přístupů](./user-management.md)
- [Reporty a evidence exporty](./reports.md)
