---
title: Governance: orphaned položky a hygiena ownership
version: "2.5"
last_updated: "2026-07-15"
audience: user
source_of_truth: "frontend/src/pages/GovernancePage.tsx + frontend/src/components/governance/*"
summary: "Jak používat Governance pro detekci a řešení orphaned Rizik/Kontrol/KRI a správy hrozeb tak, aby byl správný ownership, scope a reporting."
tags:
  - governance
  - workflow
  - audit
  - troubleshooting
  - access
---
# Governance: orphaned položky a hygiena ownership

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

Tento manuál použijte, když potřebujete najít záznamy bez vlastníka, oddělení nebo vazby na riziko, bezpečně je vyřešit a nepřepsat novější práci jiného uživatele. Je určen pro CRO a governance uživatele řešící chybějící ownership nebo kontext, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: začít v governance frontě, ověřit orphaned položku v quick view, provést nejmenší bezpečné řešení a zkontrolovat, že položka z fronty zmizela.

Tuto oblast budete používat hlavně pro:

- governance overview
- pending orphaned items
- quick view
- resolution modal
- výběr vlastníka a oddělení

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/governance`

Většinou se sem dostanete z levého menu. Governance je fronta se souhrnnými kartami, záložkami, quick view modálem, refreshem a resolution dialogem. Práce zůstává ve frontě, quick view a resolveru.

Běžný postup navigace:

1. Otevřete Governance.
2. Vyberte frontu rizik, kontrol, KRI nebo hrozeb.
3. Zkontrolujte souhrnné počty a pending řádky.
4. Otevřete quick view, pokud potřebujete více kontextu.
5. Resolve použijte až po ověření chybějícího vlastníka, oddělení, vazby na riziko nebo aktivního CISO jako správce hrozby.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Typ položky
- Aktuální vlastník
- Aktuální oddělení
- Chybějící údaj
- Kandidátní rizika
- Kandidátní vlastníci
- Poznámka řešení

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Zkontrolovat governance frontu.
2. Otevřít quick view nebo Resolve pro orphaned položku.
3. Vybrat správného vlastníka nebo oddělení.
4. Navázat KRI nebo kontrolu na riziko, případně pro osiřelou hrozbu vybrat aktivního CISO.
5. Odeslat řešení. U řízené změny odpovědnosti ověřit žádost v Mých žádostech
   a ponechat položku ve frontě do schválení.

Po přímém řešení ověřte zmizení položky a aktualizaci počtů. U řízené
odpovědnosti procesu, aktiva, dodavatele nebo hrozby musí položka zůstat do
nezávislého schválení; zamítnutí či zrušení ji ponechá čekající. U hrozby
ověřte nového správce až po schválení. Při souběžné změně obnovte frontu.

Při propojování KRI nebo kontroly k riziku vybírejte jen vazby, které dávají smysl dalšímu reviewerovi a odpovídají skutečnému business vztahu.

## Schvalování a notifikace

Řešení se použije jen tehdy, pokud je záznam stále ve stavu, který jste kontrolovali. Pokud ho někdo mezitím změnil, obnovte data a posuďte aktuální stav.

Poznámky k řešení mají vysvětlit business důvod, ne jen tlačítko, které jste použili. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Quick view a Záznam aktivit pomáhají vysvětlit aktuální kontext.

Pokud je řešení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Obnovte frontu, porovnejte aktuální řádek se záměrem a odešlete nové úzké řešení jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Používejte governance seznam, quick view a resolution dialog pro cleanup práci. Governance stránka nemá exportní tlačítko; pomáhá bezpečně řešit mezery v ownership a vazbách.

Pro spolehlivý výsledek postupujte takto:

1. Zkontrolujte typ položky a chybějící údaj.
2. Zužte frontu podle viditelné kategorie nebo ownership kontextu.
3. Otevřete quick view a ověřte, že cílový záznam stále potřebuje zásah.
4. Položku vyřešte, obnovte frontu a ověřte, že zmizela.

Pro formální evidenci použijte záznam na stránce **Záznam aktivit**, který změnu zachycuje, nebo stav governance fronty po obnovení.

## Tipy a časté chyby

- Nepřiřazujte ownership placeholder osobě.
- U vazby KRI nebo kontroly vyberte riziko, které opravdu monitoruje nebo snižuje.
- Starší položky před řešením obnovte.

Časté chyby vznikají ze starých dat fronty, nejasného ownership, podobných názvů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív frontu obnovte a ověřte stejný výsledek v quick view.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Řízené osiřelé odpovědnosti

Změna odpovědnosti procesu, aktiva, dodavatele nebo hrozby vyžaduje důvod a
obvykle vytvoří žádost o schválení. Odeslání neodstraní řádek Governance:
osiřelá položka a zámek běžných úprav zůstanou do nezávislého schválení Risk
Managerem nebo CRO. Zrušení, zamítnutí či zastarání zachová původní důkaz.

## Související manuály

Začněte s [Departments](./departments.md), [Risks](./risks.md), [Controls](./controls.md), [KRI](./kris.md), [Záznam aktivit](./activity-log.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
