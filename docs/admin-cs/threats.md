---
title: Podpora registru hrozeb (admin runbook)
version: "1.0"
last_updated: "2026-07-31"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md + docs/security/authorization-capability-contract.md + frontend/src/pages/ThreatsPage.tsx"
summary: "Provozní podpora CISO správy hrozeb, scoped kontextu propojených rizik, reassignment a bezpečné evidence."
tags:
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - governance
  - threats
  - access
  - audit
---

# Podpora registru hrozeb (admin runbook)

## Přehled

Hrozby tvoří globální katalog spravovaný rolí CISO. Každá aktivní hrozba vyžaduje jednoho aktivního uživatele v roli Správce hrozby, který drží kanonickou CISO roli. CISO spravuje lifecycle hrozeb a vazby Threat-to-Risk a má read context potřebný pro stewardship, ale nemá User/platform administration, approval authority ani broad writes do jiných registrů.

Tento runbook podporuje případy přihlášení, rolí, viditelnosti, orphan, změny správce, propojených rizik, lokalizace a notifikací. Administrátor nesmí využít platform roli k editaci obsahu, přiřazení správce, schválení žádosti ani odhalení rizik, která oznamující uživatel nesmí číst.

## Kdy to použít

Postup použijte, když CISO nemůže otevřít registr, hrozba chybí, Steward lookup je prázdný, bývalý správce se stále zobrazuje, reassignment čeká, hrozba se objevuje v neočekávaných Risk groups, export se liší od filtrovaného výsledku nebo nepřišla notifikace.

Nepoužívejte jej k výběru správce, klasifikaci hrozby, rozhodnutí o relevant subject, tvorbě Risk linků ani schválení změny odpovědnosti.

## Předpoklady a bezpečnost

Zaznamenejte prostředí, čas, jazyk, e-mail, aktivní role, název hrozby, očekávaného správce, expected linked Risk, route, URL state a přesnou chybu. Potvrďte, zda je uživatel i hrozba aktivní.

Linked Risk context je samostatně permission-scoped. Nikdy nevyžadujte ani neodhalujte hidden Risk ID, label, count, group, lookup option či CSV value. Nepřiřazujte CISO dočasně jen kvůli diagnostice display problému bez samostatně schváleného identity postupu.

## Postup krok za krokem

### 1) Potvrďte kanonickou CISO identitu

Ověřte aktivního uživatele a protected canonical CISO roli. Podobně pojmenovaná custom role není ekvivalent. CISO least privilege úmyslně vylučuje platform administration a approval resolution. Po odebrání role zůstávají stewardship assignments historickou evidencí a vstupují do orphan governance.

### 2) Reprodukujte chování kolekce hrozeb

Otevřete registr v jazyce uživatele a zachovejte URL-backed search, view, filters, group, sort a page. Hledání pokrývá název, popis, typické slabiny, relevantní subjekt a Správce hrozby. Filtry a facets musí odrážet pouze kontext čitelný volajícím.

Hrozby jsou globální a nepatří do tabu oddělení. Chybějící tab Hrozby v detailu oddělení je očekávaný kontrakt, ne navigation defect.

### 3) Ověřte lookup a display správce

Pro nové nebo reassigned aktivní hrozby lookup vrací aktivní kanonické CISO identity. Historický label může po deaktivaci nebo ztrátě role zůstat viditelný, aby nezmizela auditní evidence. UI musí ukázat bezpečný čitelný label, ne numeric ID. Orphan indikátor znamená potřebu explicitního governance reassignment.

### 4) Ověřte scope propojených rizik

Jedna hrozba může být v každé skupině odpovídající propojenému riziku, které caller smí číst. Nesmí být svévolně redukována na jedinou skupinu. Hidden Risk vztahy naopak nesmí ovlivnit viditelné labels, lookup choices, facet counts, group membership ani export cells. Hrozba může zůstat viditelná, i když část linků je redigovaná.

### 5) Klasifikujte lifecycle a reassignment

Oprávnění CISO spravují běžný obsah hrozby a Threat-to-Risk linky podle backend capabilities. Governance aktéři drží archive/restore oprávnění definované runtime. Skutečná změna správce používá pevný accountability-reassignment scénář, pokud je zapnutý, vyžaduje důvod a během čekání zachovává současného schváleného správce.

Requester nesmí schválit vlastní žádost. Vypnutí delivery notifications neobchází approval ani neskrývá žádost ze Schvalování nebo Mých žádostí. CISO může vytvořit a číst vlastní stewardship proposal, ale z role CISO nezíská approval-resolution capability.

### 6) Zkontrolujte orphan recovery

Když je Správce hrozby deaktivován nebo ztratí CISO, hrozba zachová původní assignment jako evidenci, označí se jako osiřelá a vyžaduje explicitní změnu na jiné aktivní CISO. Support nesmí field vyčistit, nahradit administrátorem ani přepsat historii. Při rozhodnutí znovu ověřte eligibility replacement uživatele.

### 7) Shromážděte bezpečnou evidenci a předejte

Zaznamenejte Threat label, displayed Steward, orphan status, request ID, scénář, status, requester, safe diff, timestamp, locale, URL filters a correlation ID. Role activation a session faults patří administraci, content choices CISO, approval configuration CRO a reprodukovatelné access/projection defects engineeringu.

## Ověření po změně

- Uživatel je aktivní a tam, kde je to nutné, drží canonical CISO.
- CISO access neobsahuje platform administration ani approval resolution.
- Hrozba je globální a neočekává se v detailu oddělení.
- Správce hrozby má čitelný štítek.
- Steward choices obsahují pouze aktivní canonical CISO identities.
- Historický assignment přežije deaktivaci nebo role loss.
- Osiřelý stav se řeší pouze explicitním reassignment.
- Čitelná linked Risks vytvářejí správné multi-group membership.
- Hidden Risk context neuniká přes facet, label, group, lookup ani export.
- Queue visibility je nezávislá na notification preferences.

## Rollback

Runbook je diagnostický a nemění business data hrozby. Dočasné administrativní session akce vraťte pouze schváleným provozním postupem. Pokud je reassignment proposal chybný, requester jej může oprávněně zrušit nebo nezávislý resolver zamítnout s důvodem; žádost zůstane evidencí.

Pokud je nutné obrátit schválenou změnu, zahajte správnou novou autorizovanou akci. Nikdy nevracejte správce direct database editem, neobnovujte ineligible identitu pouze kvůli řádku a neodstraňujte orphan record ručně.

## Troubleshooting

### Steward picker je prázdný

Potvrďte required Threat write capability a alespoň jednoho active user s canonical CISO rolí. Kontrolujte purpose-scoped lookup správce, ne obecný User directory endpoint.

### Bývalý správce zůstává viditelný

Jde o očekávanou evidenci po deaktivaci nebo role loss. Hledejte orphan state a pending governance reassignment. Historický label má zůstat bezpečný a čitelný.

### Hrozba je v několika Risk groups

To je správné, pokud odkazuje na několik rizik čitelných callerem. Ověřte každý readable relationship a zajistěte, že hidden relationship nevytváří viditelnou skupinu.

### CISO nemůže schválit změnu správce

CISO role úmyslně neposkytuje approval authority. Resolution vyžaduje nezávislého eligible Risk Managera nebo CRO nakonfigurovaného pro scénář.

## Eskalace a předání

Uveďte prostředí, user, canonical roles, název hrozby, Steward label, orphan stav, readable linked-Risk context, view a filtry, request ID, stav, scénář, timestamp, correlation ID a redigované screenshoty. Kategorii označte jako identity, register visibility, Steward lookup, orphan governance, linked-Risk scope, approval, notification, localization nebo export.

Okamžitě eskalujte, pokud se non-CISO stane správcem, CISO administruje uživatele nebo schvaluje jen díky této roli, projde self-approval, unikne hidden Risk context nebo se orphan potichu vyčistí.

## Související dokumentace

- [Podpora schvalování](./approvals.md)
- [Konfigurace Risk Hub](./riskhub-config.md)
- [Podpora oddělení](./departments.md)
- [Admin onboarding](./getting-started.md)
- [Index admin dokumentace](./README.md)
