---
title: Začínáme s RiskHub
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §1-§4"
summary: "Onboarding příručka pro ne-admin uživatele: ověření role/scope, orientace na dashboardu a připravenost workflow."
tags:
  - onboarding
  - navigation
  - settings
---

# Začínáme s RiskHub

## Přehled

Tato příručka vás dovede od prvního přihlášení k efektivní denní práci. Zaměřuje se na provozní připravenost: ověření scope, frontu úkolů a základní orientaci.

## Než začnete

Potvrďte si s vlastníkem systému:

- správné přiřazení role
- správné přiřazení oddělení (pokud se používá)
- aktivní účet a funkční přihlášení
- jazykové preference pro UI

## Checklist prvního dne

1. Přihlaste se a ověřte jméno + roli.
2. Otevřete `/settings` a nastavte jazyk/vzhled.
3. Otevřete `/` (Dashboard) a ověřte viditelná data.
4. Otevřete `/notifications` a zkontrolujte čekající položky.
5. Otevřete dokumentaci v Settings a ověřte user-audience obsah.

## Ověřte scope co nejdříve

Scope chyby řešte hned na začátku:

- vidíte entity, které máte spravovat?
- jsou cizí oddělení skrytá (pokud nejste global role)?
- fungují ownership výjimky na přiřazených entitách?

Pokud je viditelnost chybná, připravte konkrétní příklady (ID entity + čas).

## Klíčové navigační cesty

- registr rizik: `/risks`
- katalog kontrol: `/controls`
- KRI přehled: `/kris`
- issues/remediation: `/issues`
- dodavatelé: `/vendors`
- workflow fronta: `/approvals` a `/notifications`

## Editace s vědomím schvalování

Některé změny se ukládají jako žádost o schválení. Je to záměr.

- ověřte, zda měníte citlivé pole
- po uložení zkontrolujte stav žádosti
- přidejte jasné business odůvodnění

## Doporučená denní rutina

1. Začněte na Dashboardu.
2. Projděte notifikace a pending approvals.
3. Zpracujte priority v rizicích/kontrolách/KRI.
4. Ukládejte změny s kvalitními poznámkami.
5. Exportujte jen to, co je potřeba.

## Troubleshooting

### Nevidím očekávané záznamy

Nejprve zkontrolujte roli, scope a ownership.

### Změna se neaplikovala okamžitě

Pravděpodobně se vytvořila žádost o schválení.

### V dokumentaci vidím špatnou cílovou skupinu

U ne-admin účtu má být vždy user dokumentace. Nahlaste mismatch role.

## Related Documentation

- `./risks.md`
- `./controls.md`
- `./kris.md`
- `./notifications.md`
- `./faq.md`
