---
title: Admin onboarding a runbook prvního dne
version: "2.0"
last_updated: "2026-03-05"
audience: admin
source_of_truth: "frontend/src/pages/AdminConsolePage.tsx + frontend/src/pages/UsersPage.tsx + backend/app/api/v1/endpoints/admin/*"
summary: "Provozní runbook pro první den admina: ověření přístupů, audience split dokumentace, observabilita a připravenost na bezpečné změny."
tags:
  - onboarding
  - overview
  - access
  - audit
  - troubleshooting
  - settings
---

# Admin onboarding a runbook prvního dne

## Přehled

Tento runbook nastaví bezpečný baseline pro správu platformy ještě před prvními produkčními zásahy.

Cíl není „naučit se UI“. Cíl je **provozní jistota**:

- umíte prokázat, jaká role skutečně operuje
- umíte pozorovat health, logy, audit a sessions
- umíte ověřit, že audience split dokumentace funguje
- umíte řešit access incidenty bez hádání
- umíte udělat malou změnu a ověřit výsledek

## Kdy to použít

Použijte tento runbook:

- když přebíráte prostředí jako on-call / operátor
- po deploymentu, který zasahuje auth, sessions nebo admin konzoli
- když máte podezření na regresi admin/non-admin hranice (např. admin vidí business navigaci)

Nepoužívejte jej jako náhradu incident playbooku. Pokud systém aktivně padá, řešte incident jako první.

## Předpoklady a bezpečnost

Než uděláte jakoukoliv admin akci, ověřte:

- jste přihlášen/a pod správnou identitou (ne sdílený účet)
- máte roli `admin` (ne CRO/risk manager)
- znáte eskalační cestu (engineering owner, security owner, business owner)

Bezpečnostní pravidla:

- preferujte nejprve **read-only validaci** (health/logy/audit)
- pokud měníte konfiguraci (např. retention logů), zapište si původní hodnoty pro rollback
- pokud si nejste jistí, zda akce sahá do business dat, zastavte se a ověřte scope/role hranice

## Postup krok za krokem

### 1) Ověřit identitu, roli a očekávanou navigaci

1. Ověřte, že vaše efektivní role je `admin`.
2. Ověřte, že default landing route je `/admin` (admin nemá defaultně dashboard).
3. Ověřte, že sidebar ukazuje pouze admin-safe navigaci (typicky Settings, Users/Access, Admin Console, Documentation).
4. Ověřte, že přímá navigace na `/activity-log` a `/governance` je odmítnutá nebo přesměrovaná. Pro `admin` je to očekávané chování.

Pokud jako `admin` vidíte business moduly (Rizika/Kontroly/Dodavatelé), berte to jako boundary regresi a eskalujte.

### 2) Ověřit baseline Admin Console (/admin)

Otevřete `/admin` a ověřte každý tab:

1. **Health**
   - panel se načte rychle (bez nekonečných spinnerů)
   - metriky dávají smysl (CPU/memory/db jsou přítomné)
2. **Application Logs**
   - feed se načte
   - filtrování je použitelné
   - exporty fungují a neobsahují citlivé údaje
3. **Audit Logs**
   - entries se načtou
   - filtrování podle event type funguje
   - CSV/JSON export vytvoří soubor s timestampy, eventy a request ID
4. **Sessions**
   - seznam se načte
   - revoke akce jsou jasně označené (pokud jsou dostupné)

Pokud některý tab selže, nepokračujte do access změn. Nejprve obnovte observabilitu, jinak budete operovat naslepo.

### 3) Ověřit audience split dokumentace (/admin/docs)

Otevřete `/admin/docs` a ověřte:

- audience label ukazuje **admin dokumentaci**
- knihovna obsahuje admin runbooky (ne user manuály)
- odkazy se chovají deterministicky:
  - `./file.md` otevře jiný dokument ve čtečce
  - `/path` naviguje na route v aplikaci
  - `https://...` otevře nové tab

Boundary tvrzení, které musíte umět říct bez váhání:

- „Admin vidí jen admin dokumentaci.“
- „Ne-admin vidí jen user dokumentaci.“

### 4) Ověřit Access Management (/users)

Otevřete `/users` a ověřte, v jakém režimu jste:

- **Access režim** (privileged seznam):
  - vidíte roli, oddělení, managera a access scope
  - umíte otevřít access edit modal (admin-only mutace)
- **Directory režim** (read-only):
  - vidíte identity uživatelů, ale ne privileged ovládání

Jako `admin` máte podporovat access incidenty. Pokud `/users` není použitelné, chybí vám kritická provozní plocha.

### 5) Drill “minimal safe change” (volitelné, ale doporučené)

Udělejte jednu nízkorizikovou, reverzibilní operaci:

1. V `/admin` audit logu vyexportujte posledních 50 řádků do CSV.
2. Ověřte, že soubor existuje a obsahuje očekávané sloupce (timestamp, event, request ID).
3. Neprovádějte business změny během tohoto drillu.

## Ověření po změně

Checklist pro “ready to operate”:

- `/admin` funguje, všechny taby použitelné (Health, Logs, Audit, Sessions)
- `/admin/docs` zobrazuje admin manuály (žádné user docs)
- `/users` funguje a admin vidí access režim
- exporty (CSV/JSON) fungují v admin konzoli
- umíte zachytit request ID a korelovat s chybami
- víte, koho eskalovat pro:
  - engineering defekty
  - business policy rozhodnutí
  - security/severity

Pokud některý bod neplatí, vaše “první oprava” je obnovit tuto schopnost, ne tlačit dopředu s rizikovými zásahy.

## Rollback

Onboarding je převážně read-only. Rollback se týká pouze změn, které jste udělal/a během ověřování.

Rollback pravidla:

- Pokud jste změnil/a log retention/rotation, vraťte hodnoty na původní (které jste si zapsal/a).
- Pokud jste v rámci drillu revokoval/a session, zdokumentujte kterou a proč.
- Pokud jste při školení změnil/a přístup uživatele, ihned vraťte a zapište kontext.

Pokud neumíte změnu bezpečně vrátit, nedělejte ji.

## Troubleshooting

### `/admin` jde otevřít, ale `/admin/docs` vypadá jako user dokumentace

Typické příčiny:

- role mismatch (nejste skutečně `admin`)
- audience split endpoint regres
- stale session (role se změnila, session ne)

Postup:

1. Odhlaste/přihlaste (vyčistěte stale auth).
2. Znovu otevřete `/admin/docs` a ověřte audience label.
3. Pokud je to stále špatně, zachyťte:
   - user id/email
   - aktuální role label
   - locale
   - seznam dokumentů (ids)
4. Eskalujte jako authorization boundary incident.

### Health je zelený, ale taby selhávají nebo jsou prázdné

Co ověřit:

- network/API chyby v browser konzoli
- zda backend vrací 401/403/500
- zda je problém izolovaný na jeden tab (logs vs audit vs sessions)

Co dělat:

- použijte request ID (z logů/auditu) pro korelaci
- pokud nefungují exporty, berte to jako observability outage (blokuje incident práci)

### `/users` nejde nebo access edit selhává

Co ověřit:

- zobrazí se alespoň seznam? (routing/session problém)
- vrací mutace forbidden? (role mismatch)

Co dělat:

- nedělejte “ruční opravy” jinde; `/users` je podporovaná admin plocha
- zachyťte failing request a eskalujte jako permissions regres, pokud to dává smysl

## Eskalace a předání

Eskalujte okamžitě, pokud pozorujete:

- promíchané admin/non-admin hranice (audience leakage)
- audit logy chybí nebo exporty nefungují
- sessions nejdou pozorovat/revokovat, když je to potřeba

Balíček pro předání:

- co jste pozoroval/a (route + timestamp)
- co jste čekal/a (1 věta)
- relevantní exporty (audit/logs)
- request ID a chybové hlášky
- minimální kroky k reprodukci

## Související dokumentace

- Přístupy uživatelů: [Správa uživatelů a přístupů](./user-management.md)
- Workflow podpora: [Podpora schvalování](./approvals.md)
- Evidence exporty: [Reporty a evidence exporty](./reports.md)
- Provoz konzole: [Admin Console](./console.md)
