---
title: Oznámení a schvalování
version: "2.0"
last_updated: "2026-02-16"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md §5"
summary: "Workflow příručka pro triage notifikací, zpracování schvalování a eskalace při provozních blokacích."
tags:
  - notifications
  - approvals
  - workflow
---

# Oznámení a schvalování

## Přehled

Notifikace jsou provozní inbox pro workflow, schvalování a události okolo kontrol/KRI.

Hlavní route:

- notifikace: `/notifications`
- fronta schvalování: `/approvals`

## Doporučená triage kadence

Minimálně dvakrát denně:

1. Projděte kritické/high-priority notifikace.
2. Zpracujte pending approvals s blížícím se termínem.
3. Ověřte, které požadavky potřebují eskalaci.
4. Zapište rozhodnutí s odůvodněním.
5. Potvrďte finální stav a follow-up.

## Schvalovací rozhodování

Před rozhodnutím vždy ověřte:

- kontext entity a změny
- zda platí self-approval eskalační pravidla
- dostatečné auditní odůvodnění

Vyhněte se jednovětým schválením u složitých změn.

## Typy notifikací

- pending approval požadavky
- výsledky approved/rejected
- KRI due/overdue reminders
- breach upozornění
- workflow transition notifikace

## Jak předcházet backlogu

- schvalujte stručně, ale důkazně
- zamítejte nekompletní žádosti s konkrétními kroky
- eskalujte včas, když je třeba business owner vstup
- neodkládejte bez přiřazeného ownera follow-upu
- každý den uzavřete triage mini-shrnutím, aby navazující směna viděla kontext rozhodnutí

## Troubleshooting

### Nechodí očekávané notifikace

Ověřte preference v Settings, pak role/scope a assignment.

### Žádost je zaseknutá v pending

Prověřte transition history, dostupnost approvera a eskalační cestu.

### Vidím požadavek, ale nemohu rozhodnout

Pravděpodobně máte read přístup bez approval-write capability.

## Related Documentation

- `./getting-started.md`
- `./risks.md`
- `./controls.md`
- `./kris.md`
