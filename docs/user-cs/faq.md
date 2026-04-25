---
title: FAQ a provozní podpora
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md + chování workflow v aplikaci"
summary: "Rychlé odpovědi na časté problémy: viditelnost, schvalování, editace, notifikace, exporty a co zkontrolovat před eskalací."
tags:
  - overview
  - troubleshooting
  - workflow
  - approvals
  - notifications
  - exports
---
# FAQ a provozní podpora

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

Tento manuál použijte, když potřebujete rychle odpovědět na otázky o chybějících datech, schvalování, úpravách, exportech, notifikacích a podpoře. Je určen pro uživatele řešící běžné otázky v RiskHubu, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: začít na stránce, kde otázka vznikla, ověřit viditelnou položku nebo zprávu, použít jen podporovanou akci a zkontrolovat výsledek na stejné stránce, v notifikacích nebo aktivitě.

Tuto oblast budete používat hlavně pro:

- kontrola viditelnosti
- stav workflow
- exporty
- notifikace
- čtečka manuálů
- předání podpory

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/settings`

Většinou se sem dostanete z levého menu. Různé moduly používají různé vzory: tabulky, záložky, karty, quick view, modály, drilldowny nebo samostatné stránky. Řiďte se ovládacími prvky, které na dané stránce skutečně vidíte.

Běžný postup navigace:

1. Otevřete seznam.
2. Vyčistěte filtry, pokud si nejste jistí viditelností.
3. Hledejte podle názvu, vlastníka, dodavatele nebo oddělení.
4. Otevřete řádek, kartu, modál, drilldown nebo samostatnou stránku jen tehdy, když to daná stránka nabízí.
5. Před úpravou zkontrolujte vazby a poslední aktivitu.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Vaše role
- Rozsah oddělení
- Použité filtry
- Název nebo kód záznamu
- Text chyby
- Čas akce

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Diagnostikovat chybějící stránku.
2. Diagnostikovat chybějící záznam.
3. Pochopit čekající změnu.
4. Připravit užitečný support request.
5. Najít správný manuál.

Po uložení nebo odeslání ověřte výsledek na stránce, kde práce proběhla, a v případné očekávané notifikaci nebo schválení. Pokud stránka hlásí, že položku mezitím změnil někdo jiný, obnovte data a znovu posuďte aktuální stav.

Při propojování záznamů vybírejte jen vazby, které dávají smysl dalšímu reviewerovi. Vazba má popsat skutečný business vztah: kontrola snižuje riziko, KRI riziko monitoruje, dodavatel vytváří expozici nebo nález řeší konkrétní problém.

## Schvalování a notifikace

Pokud změna čeká, zkontrolujte Schvalování a Notifikace před dalším pokusem. Duplicitní úpravy ztěžují review.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; aktuální stránka a Activity Log pomáhají rekonstruovat kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Vraťte se na stránku, kde práce začala, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Tento FAQ pomáhá řešit otázky okolo exportů, ale sám exportní ovládací prvek nemá. Pokud se otázka týká exportu, nejdřív otevřete stránku, které data patří, a ověřte, že stránka skutečně zobrazuje exportní tlačítko.

Pro spolehlivý výsledek filtrujte v tomto pořadí:

1. Začněte dost široce, abyste ověřili existenci záznamu.
2. Zužte pohled podle oddělení, vlastníka, stavu, dodavatele nebo data.
3. Otevřete vzorek řádku, karty, modálu, drilldownu nebo samostatné stránky jen tehdy, když to daná stránka nabízí.
4. Pokud stránka má exportní tlačítko, zkuste kratší období a méně filtrů.
5. Pokud stránka exportní tlačítko nemá, zaznamenejte viditelné filtry, název záznamu, čas a schválený screenshot nebo poznámku.

Pro podporu uveďte název manuálu, stránku, filtry, čas a přesnou zprávu. Neslibujte export ze stránek, které podporují jen hledání, refresh, stránkování nebo review.

## Tipy a časté chyby

- Před hlášením stale obrazovky jednou obnovte stránku.
- Před závěrem, že data zmizela, vyčistěte filtry.
- Snímky sdílejte opatrně a jen s potřebnými informacemi.

Časté chyby vznikají ze starých filtrů, nejasného ownership, podobných názvů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek ve viditelném seznamu, panelu, modálu, drilldownu nebo stránce.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Getting Started](./getting-started.md), [Access Management](./access-management.md), [Notifications](./notifications.md), [Activity Log](./activity-log.md), [Dashboard](./dashboard.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
