---
title: Activity Log (audit trail pro business změny)
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/ActivityLogPage.tsx + backend activity log endpoints"
summary: "Jak používat Activity Log pro vyšetřování změn, potvrzení schválení a vytvoření auditovatelné historie bez úniku citlivých dat."
tags:
  - activity-log
  - audit
  - overview
  - troubleshooting
  - workflow
---
# Activity Log (audit trail pro business změny)

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

Tento manuál použijte, když potřebujete zjistit kdo co změnil, kdy se to stalo, kterého záznamu se změna týkala a jak souvisí se schvalováním nebo follow-up prací. Je určen pro uživatele, kteří potřebují rekonstruovat změny, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: otevřít Activity Log, zúžit timeline, zkontrolovat kartu události a souhrn změny a zapsat potřebnou evidenci.

Tuto oblast budete používat hlavně pro:

- seznam aktivit
- filtry
- odkazy na záznamy
- karty událostí

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/activity-log`

Většinou se sem dostanete z levého menu. Activity Log je timeline plocha se záložkami, filtry, kartami událostí, refreshem a stránkováním. Práce zůstává ve filtrované timeline.

Běžný postup navigace:

1. Otevřete Activity Log.
2. Vyberte správnou záložku pro typ aktivity, který hledáte.
3. Vyčistěte filtry, pokud si nejste jistí viditelností.
4. Hledejte podle osoby, akce, typu záznamu, názvu záznamu, oddělení nebo data.
5. Zkontrolujte odpovídající karty událostí a souhrny změn.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Čas události
- Osoba
- Akce
- Typ záznamu
- Název nebo kód záznamu
- Souhrn změny
- Související schválení

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Hledat podle data, osoby, záznamu nebo akce.
2. Zkontrolovat odpovídající karty událostí.
3. Porovnat čas aktivity se schvalováním.
4. Zaznamenat detaily cílené timeline pro auditní poznámky nebo podporu.

Po filtrování nebo obnovení ověřte, že timeline ukazuje očekávanou událost, osobu, akci a souhrn změny. Pokud se stránka během práce znovu načte, před zapsáním výsledku zkontrolujte aktuální filtry.

Při použití Activity Logu jako evidence držte pohromadě časové okno, osobu, akci, typ záznamu a souhrn změny, aby jiný reviewer mohl rekonstruovat pořadí událostí.

## Schvalování a notifikace

Schválené změny se mohou objevit jako žádost i jako aplikovaná změna. Čas a jména osob použijte pro vysvětlení pořadí.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; Activity Log ukazuje časovou osu toho, co se stalo.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Porovnejte čas schválení s Activity Logem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Používejte časové okno, osobu, akci a typ záznamu pro zúžení timeline. Business Activity Log slouží k vyšetřování a review; nemá uživatelské exportní tlačítko.

Pro spolehlivý výsledek postupujte takto:

1. Začněte nejmenším časovým oknem, které může událost obsahovat.
2. Zužte pohled podle osoby, akce, typu záznamu nebo názvu záznamu.
3. Zkontrolujte popis události a souhrn změn, pokud potřebujete business kontext.
4. Detaily filtrovaného pohledu zapište do auditních poznámek nebo support handoffu.

Pro formální evidenci zapište filtrované časové okno, osobu, akci a název souvisejícího záznamu do auditních poznámek nebo support handoffu.

## Tipy a časté chyby

- Do poznámek používejte business názvy nebo kódy.
- Pokud se název změnil, hledejte okolo času změny.
- Chybějící přístup k navázanému záznamu neznamená, že aktivita je chybná.

Časté chyby vznikají ze starých filtrů, špatných záložek, nejasných jmen osob nebo příliš úzkého časového okna. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek ve filtrované timeline.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Notifications](./notifications.md), [Risks](./risks.md), [Controls](./controls.md), [Issues](./issues.md), [Access Management](./access-management.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
