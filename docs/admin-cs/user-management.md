---
title: Runbook správy uživatelů a přístupů
version: "2.3"
last_updated: "2026-03-29"
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

Poznámka ke kontraktu:

- `/users` zůstává jedinou operátorskou route
- access-management pohledy na této route běží nad `/access/users*`
- `/users/lookup` je jen picker/search primitivum a není kontraktem operátorské stránky
- `/users` už nepoužívá samostatnou detailní route uživatele; identity i access editace zůstávají na `/users` v access edit modalu
- manuální user lifecycle akce na `/users` jsou Admin-only
- access-management role data teď přichází z `/access/roles`; starší lifecycle role/detail endpointy zůstávají Admin-only
- role filtry v directory módu teď přichází z facet metadat `/users/directory`, ne z frontend hardcoded seznamu rolí
- pořadí módů na `/users` je explicitní: nejdřív global access view, pak department access view a teprve potom read-only directory view pro uživatele s `users:read`, kteří nemají access-management oprávnění

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

Pokud uživatel nemá mít žádný `/users` entitlement, očekávejte redirect pryč z route místo vykreslení částečného seznamu.

Stejné route-level pravidlo teď platí i pro `/users/new`. Session bez lifecycle oprávnění má být přesměrovaná dřív, než stránka začne načítat onboarding data.

### Přidat uživatele

1. Otevřete `/users`.
2. Vyberte CTA podle aktuálního auth módu na `/users`:
   - **Add from AD** v directory-first auth módech (`microsoft_sso`, `hybrid_dev`)
   - **Add user** v password módu
3. Použijte create flow, který UI právě nabízí:
   - import nebo external-identity flow
   - direct-entry flow
4. Pokud uživatele importujete z adresáře, RiskHub vás vrátí na `/users` a otevře access edit modal, kde dokončíte onboarding bez opuštění route.
5. Před prvním použitím potvrďte roli, oddělení, active status a případné opravy identity.
6. Uložte a ověřte, že se uživatel objeví v `/users`.

Pokud create akce chybí nebo jsou vypnuté, nejdřív potvrďte, že aktuální session opravdu běží jako platform `admin`. Create a import jsou least-privilege lifecycle akce a nemají se improvizovat z non-admin session. Pokud akce přítomné být mají a stále chybí, zastavte se a použijte [Rychlou referenci admin incidentů](./incident-quick-reference.md).

### Upravit profil

1. Z `/users` otevřete access edit modal.
2. Měňte vždy jen jednu kategorii:
   - identity fields
   - role nebo oddělení
3. Uložte jedním save. `/users` teď pro modal posílá jednu transakční `PATCH /api/v1/access/users/{id}`, takže se buď aplikuje celá změna, nebo se celý save odmítne.
4. Po refreshi potvrďte nové hodnoty.

Identity fields jsou Admin-only lifecycle akce. CRO ani jiní privileged review uživatelé nemají očekávat samostatné lifecycle/detail endpointy mimo access-management část modalu. Pokud validační chyba selže na identity poli, berte celý save jako neprovedený a nejdřív opravte validaci.

### Upravit access

1. V `/users` otevřete **Edit access**.
2. Změňte jen pole, která jsou opravdu nutná:
   - role
   - oddělení
   - manager
   - scope
3. Uložte jedním save.
4. Po refreshi potvrďte hodnoty v řádku nebo access panelu.

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
- session má directory nebo review viditelnost, ale ne lifecycle oprávnění

Co dělat:

1. Udělejte jeden re-auth.
2. Ověřte, že stále máte roli `admin`.
3. Pokud mutace povolená být má a stále failuje, eskalujte jako authorization defect.

### „Add user / Add from AD je vypnuté“

Co to obvykle znamená:

- stránka načetla user list, ale auth-mode-specific create path je v safe degraded stavu
- viditelné CTA závisí na auth módu:
  - `Add from AD` v directory-first režimech
  - `Add User` v password režimu

Co dělat:

1. Potvrďte aktivní auth mód, aby bylo jasné, zda očekávaná CTA je **Add from AD** nebo **Add user**.
2. Otevřete `/admin` a potvrďte Health stav.
3. Jednou obnovte `/users`.
4. Pokud očekávaná create akce zůstává vypnutá i po healthy refreshi, eskalujte jako admin-surface nebo auth/config incident.

### „`/users` nevypadá prázdně, ale spíš rozbitě“

Co to obvykle znamená:

- request pro `/users` selhal dřív, než se stihla načíst tabulka
- stránka ukazuje retry banner místo falešného empty stavu

Co dělat:

1. Přečtěte error banner dřív, než budete předpokládat prázdný výsledek.
2. Jednou použijte **Retry**.
3. Pokud se stejný load failure vrátí, zachyťte route, čas a request failure a eskalujte místo toho, abyste předpokládali, že žádní matching users neexistují.

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
