---
title: Správa přístupů a adresář uživatelů
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/UsersPage.tsx + frontend/src/authz/policy.ts + backend access APIs"
summary: "Jak používat /users v directory módu a access módu, chápat role a scope a bezpečně žádat/ověřovat změny oprávnění."
tags:
  - access
  - audit
  - workflow
  - troubleshooting
  - settings
---
# Správa přístupů a adresář uživatelů

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

Tento manuál použijte, když potřebujete najít uživatele, pochopit rozsah přístupu, ověřit stav v adresáři, provést dostupné lifecycle akce a použít break-glass jen při jasném důvodu. Je určen pro oprávněné uživatele kontrolující přístupy, adresář a lifecycle účtů, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: otevřít stránku Uživatelé, ověřit správnou osobu a aktuální přístup, provést nejmenší užitečnou změnu a zkontrolovat výsledek v řádku, stavové zprávě, notifikacích nebo aktivitě.

Tuto oblast budete používat hlavně pro:

- tabulka uživatelů
- directory mód
- access mód
- Add from AD
- Check AD
- stavové akce
- break-glass dialog

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/users`

Většinou se sem dostanete z levého menu. Stránka Uživatelé je tabulková a workflow plocha: používejte filtry, akce v řádku, modál úpravy přístupu, Add from AD, Check AD a break-glass dialogy. Práce zůstává v tabulce, akčních tlačítkách a modálech.

Běžný postup navigace:

1. Otevřete Uživatelé.
2. Vyčistěte filtry, pokud si nejste jistí viditelností.
3. Hledejte podle jména, emailu, role, oddělení, stavu adresáře nebo aktivity.
4. Zkontrolujte řádek a dostupné akce pro správnou osobu.
5. Po Check AD, úpravě přístupu, lifecycle akci nebo break-glass změně stránku obnovte.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Jméno
- Email
- Role
- Oddělení
- Manažer
- Rozsah přístupu
- Stav adresáře
- Aktivita účtu
- Konec break-glass

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Vyhledat uživatele.
2. Zkontrolovat roli a rozsah.
3. Importovat uživatele z adresáře.
4. Zkontrolovat stav jednoho nebo všech uživatelů.
5. Aktivovat nebo deaktivovat jen pokud je akce dostupná.
6. Dočasně povolit break-glass pro automaticky vypnutý externí účet.

Po uložení nebo odeslání ověřte výsledek v tabulce Uživatelé a ve stavové zprávě adresáře. Očekávaná notifikace nebo schválení má být také dohledatelné. Pokud stránka hlásí, že uživatele mezitím změnil někdo jiný, obnovte data a znovu posuďte aktuální řádek.

Při změně přístupu zvolte nejmenší akci, která odpovídá business potřebě. Široké změny role, scope, lifecycle nebo break-glass musí být později snadno pochopitelné pro review.

## Schvalování a notifikace

Změny přístupů jsou omezené na oprávněné role. Pokud se akce nezobrazuje, neobcházejte ji a požádejte vlastníka přístupů o kontrolu účtu.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; řádek uživatele a Activity Log ukazují aktuální kontext účtu.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Najděte uživatele znovu v tabulce, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Používejte vyhledávání, filtry rolí, stav adresáře, stránkování a refresh pro přípravu access review evidence. Stránka Uživatelé nemá exportní tlačítko, proto ji berte jako review obrazovku a formální soubor připravujte schváleným reporting postupem.

Pro spolehlivý výsledek postupujte takto:

1. Začněte dost široce, abyste ověřili existenci uživatele.
2. Zužte pohled podle jména, emailu, role, oddělení, stavu adresáře nebo aktivity.
3. Ověřte řádek a dostupné akce, že jde o správnou osobu.
4. Po Check AD, lifecycle akci nebo break-glass změně stránku obnovte a teprve potom zaznamenejte výsledek.

Pro evidenci uveďte datum review, jméno nebo email uživatele, viditelnou roli/rozsah a provedenou akci. Úplné seznamy uživatelů nesdílejte, pokud je review proces výslovně nevyžaduje.

## Tipy a časté chyby

- Kontrola adresáře nemá přepsat lokální rozhodnutí jako oddělení nebo manažer.
- Break-glass je dočasný a potřebuje jasný důvod.
- Po Check AD obnovte seznam před reportováním výsledku.

Časté chyby vznikají ze starých filtrů, nejasného ownership, duplicitních účtů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v tabulce Uživatelé.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Getting Started](./getting-started.md), [Activity Log](./activity-log.md), [Governance](./governance.md), [Notifications](./notifications.md), [Risk Hub](./risk-hub.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
