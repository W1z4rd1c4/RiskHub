---
title: Runbook správy uživatelů a přístupů
version: "2.0"
last_updated: "2026-03-05"
audience: admin
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/components/access/AccessEditModal.tsx + backend/app/api/v1/endpoints/access.py + backend/app/api/v1/endpoints/users/"
summary: "Provozní runbook pro user lifecycle, role/scope governance, auditovatelné změny přístupů a incident-safe access zásahy."
tags:
  - access
  - workflow
  - audit
  - troubleshooting
  - settings
---

# Runbook správy uživatelů a přístupů

## Přehled

Tento runbook pokrývá identity lifecycle a governance přístupů pro platformní administrátory. Je psaný pro roli `admin` a soustředí se na **bezpečné, auditovatelné a reverzibilní** access operace.

Primární plochy:

- Access Management UI: `/users`
- Admin Console Sessions (pro revoke): `/admin` → Sessions

V RiskHubu je přístup kombinace:

- **Role** (odpovědnost uživatele)
- **Permissions** (`resource:action`)
- **Access scope** (`global`, `department`, `manager`), který určuje defaultní viditelnost
- **Oddělení a manager assignment** (routing a delegated visibility)

Proto většina “access bugů” je ve skutečnosti:

- špatná role
- špatný scope
- špatné oddělení/manager
- stale session (změna proběhla, ale uživatel se znovu neautentizoval)

## Kdy to použít

Použijte tento runbook, když potřebujete:

- přidat nového uživatele (nebo aktivovat/deaktivovat existujícího)
- změnit roli/oddělení/managera
- upravit access scope (admin/CRO-only)
- řešit access incident (nevidí modul, nejde edit, vidí moc)
- udělat emergency containment (deaktivace + revoke sessions)

Nepoužívejte jej pro řešení business ownership sporů. Pokud ticket je ve skutečnosti „kdo má vlastnit riziko/kontrolu“, je to business rozhodnutí. Vaše role je držet přístupy konzistentní s rozhodnutou policy a dodat evidenci, když chování překvapuje. Admin má takové incidenty ověřovat přes `/users` a `/admin`, ne přes business `/governance` nebo `/activity-log`.

## Předpoklady a bezpečnost

Před změnou přístupu:

1. Ověřte identitu (user id + email).
2. Zachyťte kontext požadavku:
   - jaká route nefunguje (např. `/vendors`)
   - jaká akce padá (read vs write)
   - kdy to začalo
3. Určete blast radius:
   - rozšíření scope na `global` mění viditelnost napříč organizací
   - změna role může odemknout write akce
   - změna oddělení může rozbít reporting a routing ownershipu

Bezpečnostní pravidla:

- Preferujte nejmenší změnu, která incident vyřeší.
- Vyhněte se “dočasně global”, pokud nemáte explicitní souhlas; často to zůstane navždy.
- Zapište si *původní* hodnoty (role, scope, oddělení, manager) pro okamžitý rollback.
- Po deaktivaci kvůli containmentu zvažte i revoke sessions (viz postup).

## Postup krok za krokem

### A) Přidat nového uživatele

1. Otevřete `/users`.
2. Klikněte **Add user** a otevřete `/users/new`.
3. Vyplňte:
   - jméno
   - email
   - initial password (podle vaší policy)
   - roli (začněte nejnižším oprávněním, které dává smysl)
   - oddělení (pokud má být uživatel scopingem omezen)
4. Vytvořte uživatele.

Ověření:

- uživatel se objeví v `/users`
- status je aktivní (pokud bylo zvoleno “active immediately”)

Rollback:

- pokud byl vytvořen špatně, deaktivujte účet a revokujte sessions (pokud existují)

### B) Upravit profil uživatele (name/email/role/oddělení)

1. Z `/users` otevřete detail uživatele.
2. Měňte jednu kategorii po druhé:
   - identita (name/email) je nízké riziko, ale stále auditované
   - role/oddělení je high-impact
3. Uložte.

Ověření:

- nové hodnoty jsou vidět po refreshi
- display name role odpovídá záměru

Rollback:

- vraťte původní roli/oddělení a uložte

### C) Upravit přístup přes Access Edit (role/oddělení/manager/scope)

Použijte Access Edit modal pro rychlé operace nad access atributy.

1. V `/users` najděte uživatele.
2. Otevřete **Edit access**.
3. Udělejte minimální změny:
   - role: vyberte cílovou roli
   - oddělení: nastavte jen pokud má být uživatel scopingem omezen
   - manager: nastavte pokud má mít manager-scoped delegated visibility
   - scope: měňte jen pokud jste autorizovaný/á; `global` je významná eskalace
4. Uložte.

Ověření:

- seznam ukazuje nové hodnoty
- pokud se měnil scope, je vidět v user řádku (access mode)

Rollback:

- znovu otevřete Access Edit a vraťte původní hodnoty

### D) Deaktivace / reaktivace uživatele (containment)

Použijte deaktivaci, když:

- je potřeba rychle odebrat přístup (security/odchod)
- je podezření na kompromitované credentials
- uživatel nemá operovat, dokud se nevyřeší policy spor

Postup:

1. V `/users` najděte uživatele.
2. Spusťte deactivate a potvrďte dialog.
3. Pokud je případ security-sensitive, revokujte sessions:
   - otevřete `/admin` → Sessions
   - vyhledejte sessions uživatele
   - revokujte sessions

Ověření:

- status je deaktivovaný
- sessions jsou revokované (pokud bylo provedeno)

Rollback:

- reaktivujte pouze s explicitním souhlasem a instruujte uživatele k re-login

## Ověření po změně

Po každé změně ověřte:

- změna je vidět v `/users` po refreshi
- uživatel se dokáže znovu autentizovat (po významné změně role/scope)
- uživatel vidí přesně očekávané moduly (ani víc, ani méně)
- auditovatelnost existuje (audit trail má jasnou stopu)

Pokud outcome neumíte ověřit přímo, zachyťte:

- co jste změnil/a (before/after)
- jakou route má uživatel otestovat
- jaké je očekávané success kritérium (1 věta)

## Rollback

Rollback má být okamžitý a mechanický:

1. Vraťte last-known-good hodnoty (role, oddělení, manager, scope).
2. Pokud proběhl containment:
   - reaktivujte jen se souhlasem
   - pokud je podezření na kompromitaci, řešte reset credentials přes IdP/SSO (mimo scope RiskHub UI)
3. Zdokumentujte:
   - co bylo vráceno
   - proč
   - jaké riziko zůstává

Pokud rollback nejde bez hlubšího šetření, zastavte se a eskalujte.

## Troubleshooting

### “Změnil/a jsem přístup, ale uživatel to pořád nevidí”

Checks:

- byla změna uložena?
- není session stale?
- je modul permission-gated? (např. `vendors:read`, `issues:read`)
- neomezuje scope viditelnost i při správném oprávnění?

Akce:

- požádejte uživatele o re-login
- znovu zkontrolujte roli/scope v `/users`
- pokud stále failuje, zachyťte error (403) a request ID a korelujte s logy

### “Uživatel vidí příliš mnoho dat”

Checks:

- není scope `global`?
- nemá uživatel neočekávaně privileged roli?

Akce:

- okamžitě vraťte roli/scope
- pokud jde o security incident, revokujte sessions
- předání: security nebo business owner podle severity

### “Vidím `/users`, ale nejde editovat access”

To se stane, když uživatel umí otevřít users page, ale není autorizovaný na mutace.

Akce:

- ověřte, že operujete jako `admin` (ne privileged non-admin)
- ověřte, že mutace je pro vaši roli povolená
- pokud by povolená být měla a je forbidden, eskalujte jako auth regres

## Eskalace a předání

Eskalujte na engineering/security, když:

- authorization hranice jsou nekonzistentní (stejný user/route, jiné výsledky)
- audit trail chybí nebo je nekompletní
- session revoke selže během containmentu

Balíček pro předání:

- kdo byl dotčen (user id/email)
- co se změnilo (before/after)
- která route/akce failuje
- timestampy + request IDs (pokud jsou)
- co jste ověřil/a a co zůstává neznámé

## Související dokumentace

- Admin baseline: [Admin onboarding](./getting-started.md)
- Admin Console (sessions/logs/audit): [Admin Console](./console.md)
- Workflow podpora: [Podpora schvalování](./approvals.md)
- Evidence exporty: [Reporty a evidence exporty](./reports.md)
