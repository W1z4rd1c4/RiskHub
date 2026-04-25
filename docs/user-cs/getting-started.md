---
title: Začínáme s RiskHub
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md + frontend onboarding routy"
summary: "Onboarding manuál pro non-admin uživatele: ověření scope, navigace, workflow připravenost a nejčastější chyby na začátku."
tags:
  - onboarding
  - overview
  - workflow
  - notifications
  - troubleshooting
---
# Začínáme s RiskHub

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

Tento manuál použijte, když potřebujete zorientovat se v pracovním prostoru, ověřit co vidíte a naučit se bezpečné první kroky před úpravou záznamů. Je určen pro nové uživatele RiskHubu, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: otevřít správnou stránku, ověřit položku, kterou chcete zkontrolovat nebo změnit, provést nejmenší užitečnou změnu a zkontrolovat výsledek ve viditelném seznamu, panelu, modálu, notifikaci nebo aktivitě.

Tuto oblast budete používat hlavně pro:

- Dashboard
- Rizika
- Kontroly
- KRI
- Dodavatelé
- Schvalování
- Nastavení

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/settings`

Většinou se sem dostanete z levého menu. Různé moduly používají různé vzory: tabulky, záložky, karty, modály, drilldowny nebo samostatné stránky. Řiďte se ovládacími prvky, které na dané stránce skutečně vidíte.

Běžný postup navigace:

1. Otevřete seznam.
2. Vyčistěte filtry, pokud si nejste jistí viditelností.
3. Hledejte podle názvu, vlastníka, dodavatele nebo oddělení.
4. Otevřete řádek, kartu, modál, drilldown nebo samostatnou stránku jen tehdy, když to daný modul nabízí.
5. Před úpravou zkontrolujte vazby a poslední aktivitu.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- Profil
- Jazyk a vzhled
- Moduly v menu
- Manuály pro vaši roli

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Přihlásit se a zkontrolovat profil.
2. Otevřít hlavní oblasti.
3. Rozlišit chybějící stránku od skrytých dat.
4. Najít schvalování a notifikace.

Po uložení nebo odeslání ověřte výsledek na stránce, kterou jste použili: seznam, tabulka, panel, modál, notifikace nebo Activity Log mají ukazovat očekávaný stav. Pokud stránka hlásí, že položku mezitím změnil někdo jiný, obnovte data a znovu posuďte aktuální stav.

Při propojování záznamů vybírejte jen vazby, které dávají smysl dalšímu reviewerovi. Vazba má popsat skutečný business vztah: kontrola snižuje riziko, KRI riziko monitoruje, dodavatel vytváří expozici nebo nález řeší konkrétní problém.

## Schvalování a notifikace

První kroky jsou většinou jen pro čtení. Jakmile budete upravovat rizika, kontroly, KRI, nálezy nebo dodavatele, některé změny mohou čekat na schválení.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; aktuální stránka a Activity Log pomáhají rekonstruovat kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Vraťte se na stránku, kde práce začala, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Tato stránka slouží k naučení hledání informací, čištění filtrů a ověření, zda vaše role zobrazuje očekávaný pohled. Onboarding a Nastavení nemají exportní ovládací prvky.

Pro spolehlivý výsledek postupujte takto:

1. Otevřete modul, který potřebujete, z levého menu.
2. Vyčistěte filtry, než usoudíte, že data chybí.
3. Zužte pohled podle vlastníka, oddělení, stavu, dodavatele nebo data tam, kde takové filtry existují.
4. Ověřte názvy, kódy, vlastníky a stav v seznamu, panelu, modálu, drilldownu nebo samostatné stránce, kterou daný modul nabízí, než provedete akci.

Pro onboarding evidenci zapište cestu v aplikaci, viditelnou roli, použité filtry a název nebo kód kontrolovaného záznamu.

## Tipy a časté chyby

- Používejte názvy, kódy a vlastníky.
- Když modul chybí, nejdřív ověřte roli.
- Nechte manuál otevřený při učení nového postupu.

Časté chyby vznikají ze starých filtrů, nejasného ownership, podobných názvů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek ve viditelném seznamu, panelu nebo modálu.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Dashboard](./dashboard.md), [Risks](./risks.md), [Controls](./controls.md), [Notifications](./notifications.md), [Access Management](./access-management.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
