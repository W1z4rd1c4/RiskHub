---
title: Risk Hub (konfigurační pracovní prostor pro CRO)
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/RiskHubPage.tsx + frontend/src/components/riskhub/*"
summary: "Manuál pro CRO: konfigurace taxonomie, thresholdů, schvalovacích scénářů, rolí, oddělení a hromadné odesílání risk dotazníků."
tags:
  - riskhub
  - settings
  - workflow
  - approvals
  - notifications
  - troubleshooting
---
# Risk Hub (konfigurační pracovní prostor pro CRO)

**Na této stránce**
- [S čím vám tato stránka pomůže](#s-čím-vám-tato-stránka-pomůže)
- [Než začnete](#než-začnete)
- [Kde to najdete](#kde-to-najdete)
- [Co můžete vidět a měnit](#co-můžete-vidět-a-měnit)
- [Jak dokončit běžné úkoly](#jak-dokončit-běžné-úkoly)
- [Schvalování a notifikace](#schvalování-a-notifikace)
- [Vyhledávání, filtrování a evidence](#vyhledávání-filtrování-a-evidence)
- [Tipy a časté chyby](#tipy-a-časté-chyby)
- [Troubleshooting](#troubleshooting)
- [Související manuály](#související-manuály)

## S čím vám tato stránka pomůže

Tento manuál použijte, když potřebujete spravovat business nastavení pro klasifikaci rizik, dotazníky, role, oddělení a provozní očekávání. Je určen pro CRO uživatele nastavující business pravidla risk managementu, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: začít ve správné Risk Hub záložce, ověřit konfiguraci nebo dotazníkovou položku, provést nejmenší užitečnou změnu a zkontrolovat uložený stav v panelu.

Tuto oblast budete používat hlavně pro:

- typy rizik
- dotazníky
- role
- oddělení
- konfigurační panely
- odeslání dotazníku

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/risk-hub`

Většinou se sem dostanete z levého menu. Risk Hub je workspace se záložkami pro konfigurační panely a dotazníková workflow. Práce zůstává v aktivní záložce, řádku, modálu nebo dotazníkové akci.

Běžný postup navigace:

1. Otevřete Risk Hub.
2. Vyberte relevantní záložku: typy rizik, nastavení, schvalovací pravidla, role, oddělení nebo dotazníky.
3. Vyčistěte filtry nebo vyhledávání tam, kde je panel nabízí.
4. Otevřete řádek, modál nebo dotazníkovou akci, kterou panel nabízí.
5. Před odchodem ze záložky ověřte uložený stav.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Risk type labels
- Šablony dotazníků
- Assignee
- Reviewer
- Názvy rolí
- Názvy oddělení
- Stav a termíny

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Zkontrolovat taxonomii rizik.
2. Odeslat dotazníky vlastníkům.
3. Sledovat stav dotazníků.
4. Řešit upřesnění.
5. Udržovat smysl rolí.
6. Čistit ownership oddělení.

Po uložení nebo odeslání ověřte výsledek ve stejném Risk Hub panelu a v očekávané notifikaci nebo stavu dotazníku. Pokud stránka hlásí, že položku mezitím změnil někdo jiný, obnovte panel a znovu posuďte aktuální řádek.

Při nastavování pravidel, rolí, oddělení nebo dotazníků vybírejte změny, které dávají smysl dalšímu reviewerovi a odpovídají skutečnému business vztahu.

## Schvalování a notifikace

Změny v Risk Hubu mohou ovlivnit mnoho lidí. Dělejte soustředěné úpravy, kontrolujte viditelný dopad a sledujte Schvalování nebo Notifikace u citlivých změn.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; Risk Hub panely a Activity Log ukazují aktuální kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Otevřete relevantní Risk Hub panel, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Používejte souhrny Risk Hubu, stavové tabulky a pohledy na dotazníky pro provozní review. Risk Hub je konfigurační workspace a nemá obecné exportní tlačítko.

Pro spolehlivý výsledek postupujte takto:

1. Otevřete relevantní konfigurační panel nebo pohled na dotazníky.
2. Najděte roli, oddělení, typ rizika nebo batch dotazníků, který potřebujete.
3. Před změnou otevřete relevantní řádek, modál nebo dotazníkovou akci.
4. Ověřte uložený stav a případné notifikace vytvořené workflow.

Pro formální evidenci použijte historii dotazníku, uložený stav panelu nebo Activity Log místo očekávání exportu přímo z Risk Hubu.

## Tipy a časté chyby

- Názvy rolí mají být srozumitelné business uživatelům.
- Dotazníky neposílejte bez jasných vlastníků a termínů.
- U neúplné odpovědi žádejte upřesnění místo příliš rychlého zamítnutí.

Časté chyby vznikají ze starých dat panelu, nejasného ownership, podobných názvů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v aktivním panelu.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Risks](./risks.md), [Notifications](./notifications.md), [Governance](./governance.md), [Access Management](./access-management.md), [Departments](./departments.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
