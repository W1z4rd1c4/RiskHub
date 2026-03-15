---
title: Runbook správy uživatelů a přístupů
version: "2.1"
last_updated: "2026-03-15"
audience: admin
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/components/access/AccessEditModal.tsx + backend/app/api/v1/endpoints/access.py + backend/app/api/v1/endpoints/users/"
summary: "Operator-safe runbook pro přidání uživatele, access změny, deaktivaci účtu a řešení běžných access incidentů."
tags:
  - access
  - workflow
  - audit
  - troubleshooting
  - settings
---

# Runbook správy uživatelů a přístupů

## Přehled

Použijte tento runbook pro bezpečnou, auditovatelnou a reverzibilní admin práci v `/users`.

Primární plochy:

- `/users`
- `/admin` -> **Sessions**
- `/admin` -> **Audit logs**

Většina access incidentů má jednu ze čtyř příčin:

- špatná role
- špatný access scope
- špatné oddělení nebo manager assignment
- stale session po změně

Tento runbook má adminovi pomoci udělat přesnou změnu bez zbytečného rozšiřování přístupu. Pokud je potřeba dlouhé vysvětlování, improvizovaný workaround nebo business rozhodnutí, nejde už o standardní access operaci a správný další krok je evidence capture a handoff.

## Kdy to použít

Použijte tento runbook, když potřebujete:

- přidat nového uživatele
- upravit profil nebo identity fields
- změnit roli, scope, oddělení nebo manager assignment
- deaktivovat nebo reaktivovat uživatele
- řešit incident „nevidí modul“ nebo „vidí příliš mnoho dat“

Nepoužívejte tento runbook pro business ownership nebo policy rozhodnutí. Zachyťte fakta a předejte je dál.

## Předpoklady a bezpečnost

Před změnou přístupu:

1. Ověřte identitu uživatele.
2. Zachyťte route, akci a čas začátku incidentu nebo požadavku.
3. Zapište aktuální roli, scope, oddělení a manager hodnoty.

Bezpečnostní pravidla:

- udělejte nejmenší změnu, která incident řeší
- nepoužívejte `global` scope jako zkratku
- měňte jednu věc v jednom kroku
- pokud je incident security-sensitive, buďte připraveni revokovat sessions

## Postup krok za krokem

### Standardní workflow access změny

1. Otevřete `/users` a zkontrolujte aktuální access profil.
2. Potvrďte požadovanou změnu a očekávaný výsledek.
3. Proveďte nejmenší bezpečnou změnu.
4. Obnovte stránku a ověřte nové hodnoty.
5. Pokud se měnila role nebo scope, požádejte uživatele o re-auth.
6. Potvrďte, že existuje audit trail.

### Přidat uživatele

1. Otevřete `/users`.
2. Vyberte **Add user**.
3. Použijte create flow, který UI právě nabízí:
   - import nebo external-identity flow
   - direct-entry flow
4. Před prvním použitím potvrďte roli, oddělení a active status.
5. Uložte a ověřte, že se uživatel objeví v `/users`.

Pokud create akce chybí nebo jsou vypnuté, zastavte se a použijte [Rychlou referenci admin incidentů](./incident-quick-reference.md). Neimprovizujte alternativní create postupy.

### Upravit profil

1. Z `/users` otevřete detail uživatele.
2. Měňte vždy jen jednu kategorii:
   - identity fields
   - role nebo oddělení
3. Uložte.
4. Po refreshi potvrďte nové hodnoty.

### Upravit access

1. V `/users` otevřete **Edit access**.
2. Změňte jen pole, která jsou opravdu nutná:
   - role
   - oddělení
   - manager
   - scope
3. Uložte.
4. Po refreshi potvrďte hodnoty v řádku nebo detailu uživatele.

Změna scope na `global` je významná eskalace. Před uložením si zapište důvod.

### Deaktivovat nebo reaktivovat uživatele

Použijte deaktivaci pro offboarding, containment nebo urgentní odebrání přístupu.

1. Najděte uživatele v `/users`.
2. Deaktivujte nebo reaktivujte účet.
3. Pokud je případ security-sensitive, otevřete `/admin` -> **Sessions** a revokujte aktivní sessions.
4. Ověřte nový account status a případnou revokaci sessions.

## Ověření po změně

Po každé access změně potvrďte:

- nové hodnoty zůstaly po refreshi
- uživatel se po změně role nebo scope umí znovu autentizovat
- uživatel nyní vidí přesně očekávané route
- audit trail změnu zachytil
- umíte bez hádání popsat current state i zamýšlený rollback

Když některý z těchto bodů neumíte potvrdit, berte změnu jako neuzavřenou. Nepřidávejte druhou změnu jen proto, abyste “to dorovnali”. Nejprve vraťte stav nebo eskalujte.

## Rollback

Rollback použijte tehdy, když se změna sice uložila správně, ale provozní výsledek je špatný.

1. Vraťte last-known-good roli, scope, oddělení a manager hodnoty.
2. Pokud potřebujete hned vyčistit stale claims, revokujte sessions.
3. Zdokumentujte, co jste vrátili a proč.

Pokud rollback neumíte popsat jednou větou předem, zastavte se a eskalujte.

## Troubleshooting

### „Změnil/a jsem přístup, ale uživatel to pořád nevidí“

Co to obvykle znamená:

- stale session
- špatný scope
- špatné oddělení nebo manager assignment

Co dělat:

1. Ověřte uložené hodnoty v `/users`.
2. Požádejte uživatele o odhlášení a znovu přihlášení.
3. Znovu zkontrolujte roli, scope, oddělení a manager assignment.
4. Pokud route stále failuje, zachyťte přesný error a request ID a eskalujte.

### „Uživatel vidí příliš mnoho dat“

Co to obvykle znamená:

- scope je příliš široký
- role je privilegovanější, než má být

Co dělat:

1. Okamžitě vraťte last-known-good roli nebo scope.
2. Pokud je expozice security-sensitive, revokujte sessions.
3. Ověřte opravu a incident zdokumentujte.

### „Vidím `/users`, ale nejde editovat access“

Co to obvykle znamená:

- session ve skutečnosti neběží jako `admin`
- mutation path failuje nebo vrací forbidden

Co dělat:

1. Udělejte jeden re-auth.
2. Ověřte, že stále máte roli `admin`.
3. Pokud mutace povolená být má a stále failuje, eskalujte jako authorization defect.

### „Add user / Add from AD je vypnuté“

Co to obvykle znamená:

- stránka načetla user list, ale create path je v safe degraded stavu

Co dělat:

1. Otevřete `/admin` a potvrďte Health stav.
2. Jednou obnovte `/users`.
3. Pokud create akce zůstávají vypnuté i po healthy refreshi, eskalujte jako admin-surface nebo auth/config incident.

## Eskalace a předání

Eskalujte, když:

- access chování je nekonzistentní i po potvrzeném save a re-auth
- audit trail chybí
- revoke session selže
- neumíte určit last-known-good access stav

Balíček pro předání:

- dotčený uživatel
- route a failing akce
- before a after access hodnoty
- timestamp a request IDs
- co jste ověřil/a a co zůstává neznámé

## Související dokumentace

- [Rychlá reference admin incidentů](./incident-quick-reference.md)
- [Admin onboarding](./getting-started.md)
- [Admin Console](./console.md)
- [Reporty a evidence exporty](./reports.md)
