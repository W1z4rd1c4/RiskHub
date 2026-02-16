---
title: Admin onboarding a runbook prvního dne
version: "2.0"
last_updated: "2026-02-16"
audience: admin
source_of_truth: "admin console a access API"
summary: "Checklist prvního dne pro platformní administrátory: ověření přístupů, observability a provozní připravenosti."
tags:
  - onboarding
  - admin
  - operations
---

# Admin onboarding a runbook prvního dne

## Přehled

Tato příručka nastaví bezpečný baseline pro správu platformy ještě před prvními produkčními zásahy.

## Checklist prvního dne

1. Ověřte roli účtu `admin`.
2. Otevřete `/admin` a potvrďte dostupnost konzole.
3. Otevřete `/admin/docs` a ověřte admin audience štítek.
4. Ověřte, že se nezobrazují user dokumenty.
5. Ověřte logy, health a aktivní session.

## Kontrola důvěry v prostředí

Před změnami v produkci:

- ověřte stabilní backend health
- ověřte auth/session chování
- ověřte audit log pipeline
- ověřte dostupnost uživatelů/oddělení

## Minimal Safe Change Protocol

1. definujte cílový výsledek
2. určete blast radius
3. proveďte minimální změnu
4. ověřte post-change stav
5. zaznamenejte kontext změny

## Připravenost na support

Mějte po ruce:

- access governance runbook (`./user-management.md`)
- strukturální změny (`./departments.md`)
- workflow triage (`./approvals.md`)
- důkazní exporty (`./reports.md`)

## Výstup prvního dne

Po dokončení onboarding checklistu by měl admin umět bezpečně provést malou změnu přístupů, ověřit auditní stopu a připravit základní incident evidence balíček. Pokud některý krok selže, neprovádějte produkční zásahy bez doplnění chybějícího kontextu.

## Troubleshooting

### Konzole je dostupná, ale dokumentace vypadá user

Pravděpodobně role mismatch nebo audience regression. Eskalujte okamžitě.

### Health je zelený, ale stránky selhávají

Prověřte auth/session kontext a endpoint permission odpovědi.

### Nevidím očekávané admin sekce

Ověřte effective role a obnovte session (re-login).
