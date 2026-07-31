---
title: Oddělení a organizační scope
version: "2.5"
last_updated: "2026-07-31"
audience: user
source_of_truth: "frontend/src/pages/DepartmentsPage.tsx + frontend/src/services/departmentApi.ts"
summary: "Jak používat workspace Oddělení napříč riziky, kontrolami, KRI, nálezy, procesy, aktivy, dodavateli, uživateli a aktivitami."
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

Detail Oddělení má vždy přesně deset záložek:

1. Přehled
2. Rizika
3. Kontroly
4. KRI
5. Nálezy
6. Procesy
7. Aktiva
8. Dodavatelé
9. Uživatelé
10. Aktivita

Hrozby zde záměrně nejsou, protože jejich stewardship je globální a není vlastněný Oddělením.

Přehled obsahuje osm karet entit v desktopové mřížce čtyři krát dva a pod nimi aktivitu Oddělení přes celou šířku. Karty ukazují provozní počet a tam, kde je to relevantní, sekundární health signál, například vysoká Rizika, neaktivní Kontroly, KRI breach, overdue Nálezy, mezery v accountability nebo významné Dodavatele. Výběr karty otevře odpovídající záložku.

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

Stránky Oddělení používejte pro ověření scope, ownership a kontextu souvisejících záznamů. Každá záložka entity používá stejný registr jako její hlavní stránka: zůstává vyhledávání, filtry, skupinové pohledy, řazení, stránkování, capability-driven akce, pending badge, práce s archivací a filtrovaný export. Oddělení je uzamčený filtr. **Vyčistit vše** odstraní jen vaše přidané filtry; Oddělení odstranit ani nahradit nemůže.

Pro spolehlivý výsledek postupujte takto:

1. Otevřete detail oddělení.
2. Zkontrolujte souhrnné počty a související záznamy.
3. Otevřete příslušnou záložku Rizik, Kontrol, KRI, Nálezů, Procesů, Aktiv, Dodavatelů nebo Uživatelů.
4. Zapište názvy nebo kódy souvisejících záznamů, které podporují vaše review.

URL uchovává vybranou záložku a povolený stav registru, takže Back a Forward vrátí předchozí hledání, pohled, skupinu, řazení, filtry i stránku. Export ze záložky entity obsahuje všechny odpovídající záznamy Oddělení v rámci vašich oprávnění, ne jen aktuálně viditelnou stránku.

Členství v Oddělení určuje kanonické Owning Department záznamu. Domovské Oddělení Process Ownera, Asset Ownera, Vendor Outsourcing Ownera nebo jiného Accountable Usera záznam mezi záložkami Oddělení nepřesouvá.

Pro evidenci zapište Oddělení, datum, názvy souvisejících záznamů, filtry a použitý pohled.

## Tipy a časté chyby

- Oddělení je pohled odpovědnosti, nenahrazuje jmenovaného vlastníka.
- Když záznam vypadá v jiném Oddělení, otevřete detail a zkontrolujte jeho Owning Department odděleně od domovského Oddělení Accountable ownera.
- Chybějící ownership řešte přes Governance.

Časté chyby vznikají ze starých filtrů, nejasného ownership, duplicitních záznamů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v detailu.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Governance](./governance.md), [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Vendors](./vendors.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
