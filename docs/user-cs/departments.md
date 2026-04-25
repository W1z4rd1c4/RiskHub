---
title: Oddělení a organizační scope
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/DepartmentsPage.tsx + frontend/src/services/departmentApi.ts"
summary: "Jak používat Oddělení pro pochopení scope, expozice a routování ownership napříč riziky, kontrolami, KRI, uživateli a aktivitami."
tags:
  - departments
  - access
  - overview
  - workflow
  - troubleshooting
---
# Oddělení a organizační scope

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

Tento manuál použijte, když potřebujete pochopit seskupení podle oddělení, kontrolovat mezery v ownership a otevírat související rizika, kontroly, KRI, dodavatele nebo nálezy. Je určen pro uživatele kontrolující ownership a expozici podle organizační oblasti, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: otevřít správnou stránku, ověřit správný záznam, provést nejmenší užitečnou změnu a zkontrolovat výsledek v seznamu, detailu, notifikacích nebo aktivitě.

Tuto oblast budete používat hlavně pro:

- seznam oddělení
- detail oddělení
- vlastníci
- souhrny rizik/kontrol/KRI
- navázané záznamy

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/departments`

Většinou se sem dostanete z levého menu. Detail otevřete výběrem řádku nebo karty s vazbou. Pokud jste přišli z jiného záznamu, použijte návrat nebo odkazy na související záznamy.

Běžný postup navigace:

1. Otevřete seznam.
2. Vyčistěte filtry, pokud si nejste jistí viditelností.
3. Hledejte podle názvu, vlastníka, dodavatele nebo oddělení.
4. Otevřete záznam.
5. Před úpravou zkontrolujte vazby a poslední aktivitu.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Název oddělení
- Manažer
- Počet rizik
- Počet kontrol
- Počet KRI
- Kontext dodavatelů a nálezů

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Otevřít oddělení.
2. Zkontrolovat expozici.
3. Zkontrolovat vlastníky a manažery.
4. Otevřít související záznamy.
5. Připravit evidence set pro oddělení.

Po uložení nebo odeslání ověřte výsledek. Seznam má ukázat nový stav, detail má odpovídat záměru a očekávaná notifikace nebo schválení má být dohledatelné. Pokud stránka hlásí, že záznam mezitím změnil někdo jiný, obnovte data a znovu posuďte aktuální stav.

Při propojování záznamů vybírejte jen vazby, které dávají smysl dalšímu reviewerovi. Vazba má popsat skutečný business vztah: kontrola snižuje riziko, KRI riziko monitoruje, dodavatel vytváří expozici nebo nález řeší konkrétní problém.

## Schvalování a notifikace

Stránky oddělení jsou hlavně pro čtení. Změny ownership nebo přiřazení oddělení se dělají na konkrétním záznamu nebo v governance workflow a mohou čekat na review.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; detail záznamu zůstává nejlepším místem pro celý kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Otevřete záznam, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Stránky oddělení používejte pro ověření scope, ownership a kontextu souvisejících záznamů. Oddělení jsou review a navigační plocha; nemají vlastní exportní tlačítko.

Pro spolehlivý výsledek postupujte takto:

1. Otevřete detail oddělení.
2. Zkontrolujte souhrnné počty a související záznamy.
3. Otevřete příslušný seznam rizik, kontrol, KRI, dodavatelů nebo nálezů se stejným kontextem oddělení.
4. Zapište názvy nebo kódy souvisejících záznamů, které podporují vaše review.

Pro evidenci zapište oddělení, datum, názvy souvisejících záznamů a pohled, který jste použili.

## Tipy a časté chyby

- Oddělení je pohled odpovědnosti, nenahrazuje jmenovaného vlastníka.
- Když záznam vypadá v jiném oddělení, otevřete detail a zkontrolujte ownera.
- Chybějící ownership řešte přes Governance.

Časté chyby vznikají ze starých filtrů, nejasného ownership, duplicitních záznamů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v detailu.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Governance](./governance.md), [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Vendors](./vendors.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
