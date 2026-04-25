---
title: Notifikace a schvalování
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/ApprovalsPage.tsx + frontend/src/pages/NotificationsPage.tsx + docs/BUSINESS_LOGIC.md"
summary: "Produkční workflow manuál pro schvalování, notifikace, rozhodovací poznámky, triage front a eskalační vzory."
tags:
  - workflow
  - approvals
  - notifications
  - audit
  - troubleshooting
---
# Notifikace a schvalování

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

Tento manuál použijte, když potřebujete pochopit co vyžaduje pozornost, rozhodovat žádosti konzistentně, reagovat na reminder a vědět kde hledat čekající změnu. Je určen pro uživatele přijímající úkoly, žádosti o schválení, reminder nebo workflow zprávy, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: začít v Notifikacích nebo Schváleních, zkontrolovat zprávu nebo žádost, jednat jen když je akce jasná a ověřit stav položky.

Tuto oblast budete používat hlavně pro:

- notification bell
- stránka notifikací
- stránka schvalování
- poznámky rozhodnutí
- navázané záznamy

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/notifications`

Většinou se sem dostanete z levého menu nebo z notifikační ikony. Notifikace a Schválení jsou inbox plochy se záložkami, seznamy, rozbalením řádků, rozhodovacími dialogy a stránkováním. Notifikace vás může přesměrovat na podporovanou související stránku; jinak práce zůstává v inboxu.

Běžný postup navigace:

1. Otevřete Notifikace nebo Schválení.
2. Vyberte All, Unread, Pending nebo relevantní schvalovací záložku.
3. Přečtěte zprávu, žadatele, termín a aktuální stav.
4. Rozbalte řádek nebo otevřete rozhodovací dialog, pokud je dostupný.
5. Na související stránku přejděte jen tehdy, když ji notifikace nabízí.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Název notifikace
- Související záznam
- Termín
- Žadatel
- Poznámka rozhodnutí
- Aktuální stav

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Otevřít notifikaci.
2. Přejít na související stránku jen pokud ji notifikace nabízí.
3. Zkontrolovat žádost o schválení.
4. Schválit nebo zamítnout s jasnou poznámkou.
5. Vyřešit reminder dokončením práce.

Po schválení, zamítnutí, zrušení nebo označení jako přečtené ověřte, že se řádek v inboxu aktualizoval a změnil se badge počet. Pokud stránka hlásí, že položku mezitím změnil někdo jiný, obnovte stránku a znovu posuďte aktuální řádek.

Při práci z notifikace rozhodujte podle aktuální zprávy a souvisejícího kontextu, ne podle staršího stavu v paměti.

## Schvalování a notifikace

Schvalování je kontrolní bod pro citlivé změny. Zkontrolujte kontext záznamu, porovnejte žádost s aktuálním stavem a napište srozumitelnou poznámku.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; inbox řádek a Activity Log pomáhají rekonstruovat workflow.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Obnovte inbox, porovnejte aktuální řádek se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Používejte filtry a stavové signály pro triage notifikací a schválení. Stránky Notifikace a Schvalování nemají exportní tlačítko, proto slouží hlavně k rozhodnutí a rekonstrukci workflow kontextu.

Pro spolehlivý výsledek postupujte takto:

1. Začněte nepřečtenými, pending nebo nejnovějšími položkami.
2. Před schválením, zamítnutím nebo eskalací otevřete související stránku, pokud ji notifikace nabízí.
3. Při rozhodnutí napište jasnou poznámku.
4. Pro evidence trail použijte Activity Log a aktuální stav inboxu.

Pro formální evidenci použijte Activity Log záznam a aktuální inbox nebo schvalovací řádek, který rozhodnutí zachycuje.

## Tipy a časté chyby

- Neschvalujte změnu, kterou neumíte vysvětlit.
- Pokud se záznam od vytvoření žádosti změnil, vyžádejte novou žádost.
- Reminder je výzva k práci, ne důkaz sám o sobě.

Časté chyby vznikají ze starých dat inboxu, unread filtrů, nejasného requester kontextu nebo práce ze staré notifikace. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v inbox řádku.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Activity Log](./activity-log.md), [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Issues](./issues.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
