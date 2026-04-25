---
title: Dashboard a reporting přehled
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/DashboardPage.tsx + dashboard widgety a report exporty"
summary: "Jak používat Dashboard jako provozní cockpit: filtry, drill-down, committee view, disciplína exportů a správná interpretace trendů."
tags:
  - overview
  - exports
  - workflow
  - audit
  - troubleshooting
---
# Dashboard a reporting přehled

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

Tento manuál použijte, když potřebujete číst hlavní signály, porovnávat období, otevírat podpůrné záznamy a exportovat podklady bez změny dat. Je určen pro uživatele sledující aktuální stav rizik, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: začít v dashboard pohledu, ověřit metriku nebo widget, použít podpůrné seznamy, pokud jsou dostupné, a exportovat souhrn, když potřebujete evidenci.

Tuto oblast budete používat hlavně pro:

- souhrnné karty
- risk heat map
- KRI widgety
- quarterly comparison
- committee view
- exporty

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/`

Většinou se sem dostanete z levého menu nebo z domovské trasy. Dashboard je souhrnná plocha s filtry, widgety, drilldowny matice, committee pohledem a exportem. Práce zůstává ve widgetech, pohledech, drilldownech a podpůrných seznamech.

Běžný postup navigace:

1. Otevřete Dashboard.
2. Vyčistěte nebo nastavte filtr oddělení.
3. Zkontrolujte widget, graf nebo matici, která vyvolala otázku.
4. Použijte dostupný drilldown k otevření podpůrného seznamu.
5. Dashboard souhrn exportujte až po ověření filtrů.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Počty a skóre rizik
- Stav kontrol
- Stav KRI
- Signály dodavatelů
- Poznámky k porovnání období

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Zkontrolovat dnešní stav.
2. Filtrovat podle oddělení nebo období.
3. Otevřít podpůrné seznamy nebo drilldowny, pokud jsou dostupné.
4. Připravit krátký export.

Po změně filtrů nebo přepnutí pohledu ověřte, že dashboard widgety, grafy a souhrnné počty odpovídají záměru. Pokud se stránka během práce znovu načte, obnovte pohled a před použitím čísel zkontrolujte aktuální filtry.

Při eskalaci dashboard čísla držte pohromadě filtr, čas, metriku a podpůrný seznam, aby jiný reviewer mohl ověřit stejný výsledek.

## Schvalování a notifikace

Dashboard neschvaluje změny. Ukazuje aktuální stav po běžných pravidlech workflow. Čekající schválení může vysvětlit, proč se číslo ještě nezměnilo.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; dashboard widgety a podpůrné seznamy pomáhají vysvětlit aktuální kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Vraťte se na stránku, kde práce začala, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Nejdřív nastavte filtry, potom exportujte. U porovnání období si všimněte, zda má vybrané období úplné historické podklady.

Pro spolehlivý výsledek filtrujte v tomto pořadí:

1. Začněte dost široce, abyste ověřili existenci záznamu.
2. Zužte pohled podle oddělení, vlastníka, stavu, dodavatele nebo data.
3. Otevřete podpůrný seznam nebo drilldown, pokud je dostupný, a ověřte, že filtr odpovídá záměru.
4. Exportujte jen filtrovaný pohled potřebný pro review.

Exporty jsou evidence. Udržujte je malé, popište časové období a nesdílejte zbytečné osobní nebo citlivé informace.

## Tipy a časté chyby

- Chybějící porovnání není nulová hodnota.
- Před eskalací otevřete navázaný záznam.
- Exportujte se stejnými filtry, jaké jste použili při kontrole.

Časté chyby vznikají ze starých filtrů, nejasného department scope nebo čtení souhrnu bez kontroly podpůrného seznamu. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v dashboard widgetech.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Vendors](./vendors.md), [Notifications](./notifications.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
