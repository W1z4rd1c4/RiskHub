---
title: Uživatelská dokumentace RiskHub
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md"
summary: "Kompletní uživatelská dokumentace pro každodenní práci s riziky, workflow schvalováním, dashboardy a správou dodavatelů."
tags:
  - overview
  - onboarding
  - workflows
---

# Uživatelská dokumentace RiskHub

Tato sada dokumentace je produkční manuál pro všechny ne-admin role. Není to stručný draft, ale provozní příručka pro reálnou práci.

## Pro koho je tato knihovna

Použijte tuto knihovnu, pokud máte některou z těchto rolí:

- CRO
- Risk Manager
- Department Head
- Employee
- Compliance, Legal, Internal Audit, Actuarial
- Viewer (read-only)

Pokud jste platformní administrátor (`admin`), používejte admin dokumentaci: `../admin-cs/README.md`.

## Jak se orientovat rychle

Čtečka dokumentace podporuje přímé odkazy mezi dokumenty. Například:

- onboarding: `./getting-started.md`
- práce s riziky: `./risks.md`
- správa kontrol: `./controls.md`
- KRI monitoring: `./kris.md`
- workflow a notifikace: `./notifications.md`
- dashboard a exporty: `./dashboard.md`
- správa dodavatelů: `./vendors.md`
- rychlá podpora: `./faq.md`

Odkazy mohou vést i na aplikační route:

- registr rizik: `/risks`
- katalog kontrol: `/controls`
- KRI přehled: `/kris`
- dashboard: `/`
- nastavení: `/settings`

## Struktura dokumentů

Každá příručka má stejné produkční členění:

1. **Overview/Přehled**: co funkce řeší a kde ji najdete.
2. **Role a oprávnění**: kdo může číst/zapisovat/schvalovat.
3. **Hlavní workflow**: konkrétní postup krok za krokem.
4. **Decision rules**: policy pravidla a omezení.
5. **Troubleshooting**: co ověřit před eskalací.
6. **Related docs**: navazující manuály.

## Co tato knihovna garantuje

- Obsah je sladěný s backend pravidly autorizace.
- Interní odkazy se validují automatickým kontraktním testem.
- Čeština a angličtina jsou v parity režimu (soubory i workflow).
- Metadata (`version`, `last_updated`, `source_of_truth`) jsou explicitní.
- Každý manuál obsahuje troubleshooting část pro řešení nejčastějších provozních potíží bez čekání na eskalaci.
- Odkazy na aplikaci a odkazy na dokumentaci mají odlišné chování, aby nedocházelo k nechtěnému přesměrování.

## Doporučené pořadí čtení

- Začněte `./getting-started.md`.
- Pokračujte `./risks.md`, `./controls.md`, `./kris.md`.
- Poté `./notifications.md` a `./dashboard.md`.
- Pro third-party governance přidejte `./vendors.md`.
- `./faq.md` používejte jako rychlou provozní referenci.
