---
title: Správa dodavatelů
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "vendor endpointy a issue/remediation workflow"
summary: "Kompletní provozní příručka pro lifecycle dodavatelů, stavové změny a exporty pro governance reporting."
tags:
  - vendors
  - third-party
  - governance
---

# Správa dodavatelů

## Přehled

Správa dodavatelů podporuje dohled nad third-party rizikem, lifecycle evidenci a reportovací připravenost.

Hlavní route: `/vendors`

## Hlavní workflow

1. Založte nebo otevřete vendor profil.
2. Ověřte ownership a department kontext.
3. Aktualizujte klíčová pole (status, služby, risk factors).
4. Propojte navazující issue/remediation položky.
5. Exportujte scope-filtered pohledy pro governance review.

## Požadavky na kvalitu dat

Každý aktivní vendor záznam má mít:

- jasný popis služby/procesu
- přiřazeného ownera
- aktuální provozní status
- navázaný risk/remediation kontext

Vyhněte se placeholder záznamům bez provozní hodnoty.

## Lifecycle operace

Běžné scénáře:

- onboarding nového dodavatele
- změna statusu (active/inactive)
- archive/restore
- periodická review aktualizace

Každá lifecycle změna má mít jasné poznámky a časový záznam.

## Governance doporučení

- držte vendor data v souladu s issue/remediation stavem
- ověřujte department fallback, pokud vendor department chybí
- pro review meeting používejte exporty, ne screenshoty
- u klíčových dodavatelů držte pravidelnou periodu revize a zaznamenávejte rozhodnutí

## Troubleshooting

### Nelze upravit dodavatele

Ověřte write permission, scope a ownership omezení.

### V exportu chybí část dat

Export je autorizačně omezený. Ověřte filtry + role context.

### Nevidím navázané issues

Zkontrolujte integrity linku a viditelnost issue podle role/scope.

## Related Documentation

- `./dashboard.md`
- `./notifications.md`
- `./faq.md`
