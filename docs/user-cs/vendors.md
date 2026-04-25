---
title: Správa dodavatelů
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/VendorsPage.tsx + frontend/src/pages/VendorDetailPage.tsx + frontend/src/pages/vendors/*"
summary: "Uživatelský manuál pro základní registr dodavatelů: ownership, klasifikace, vendor flagy, sekce navázaných rizik, kontrol a KRI ve stylu detailu rizika, routed create-from-vendor workflow pro rizika/kontroly/KRI, exporty a issue kontext."
tags:
  - vendors
  - workflow
  - exports
  - troubleshooting
  - controls
  - issues
---
# Správa dodavatelů

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

Tento manuál použijte, když potřebujete udržovat registr dodavatelů, chápat vendor flagy, propojovat dodavatele s riziky, kontrolami, KRI a nálezy a sledovat koncentraci. Je určen pro uživatele sledující třetí strany a dodavatelská rizika, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: otevřít správnou stránku, ověřit správný záznam, provést nejmenší užitečnou změnu a zkontrolovat výsledek v seznamu, detailu, notifikacích nebo aktivitě.

Tuto oblast budete používat hlavně pro:

- seznam dodavatelů
- detail dodavatele
- navázaná rizika
- navázané kontroly
- navázaná KRI
- nálezy
- reporty dodavatelů

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/vendors`

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

- Název
- Vlastník
- Oddělení
- Kritičnost
- Popis služby
- Navázaná rizika
- Navázané kontroly
- Navázaná KRI
- Otevřené nálezy

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Vytvořit nebo upravit dodavatele.
2. Nastavit vlastníka a klasifikaci.
3. Zkontrolovat flagy a kritičnost.
4. Navázat existující rizika, kontroly nebo KRI.
5. Vytvořit nový navázaný záznam z detailu dodavatele.
6. Exportovat evidenci.

Po uložení nebo odeslání ověřte výsledek. Seznam má ukázat nový stav, detail má odpovídat záměru a očekávaná notifikace nebo schválení má být dohledatelné. Pokud stránka hlásí, že záznam mezitím změnil někdo jiný, obnovte data a znovu posuďte aktuální stav.

Při propojování záznamů vybírejte jen vazby, které dávají smysl dalšímu reviewerovi. Vazba má popsat skutečný business vztah: kontrola snižuje riziko, KRI riziko monitoruje, dodavatel vytváří expozici nebo nález řeší konkrétní problém.

## Schvalování a notifikace

Úpravy dodavatele mohou čekat na review, pokud mění ownership, klasifikaci, archivaci nebo navázanou governance práci. Akce pro vazby se zobrazí jen tam, kde je můžete použít.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; detail záznamu zůstává nejlepším místem pro celý kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Otevřete záznam, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Použijte By Flag, By Risk a sekce navázaných záznamů pro výběr správné evidence. Export dodavatelů obsahuje pole ze seznamu dodavatelů: název, právní název, typ, proces, subprocess, oddělení, owner, risk score, DORA relevanci, významnost a stav. Navázaná rizika, kontroly, KRI a otevřené nálezy kontrolujte v záložkách detailu dodavatele nebo na jejich vlastních stránkách; export dodavatelů je neobsahuje.

Pro spolehlivý výsledek filtrujte v tomto pořadí:

1. Začněte dost široce, abyste ověřili existenci záznamu.
2. Zužte pohled podle oddělení, vlastníka, stavu, dodavatele nebo data.
3. Otevřete vzorek záznamu a ověřte, že filtr odpovídá záměru.
4. Exportujte jen filtrovaný pohled potřebný pro review.

Exporty jsou evidence. Udržujte je malé, popište časové období a nesdílejte zbytečné osobní nebo citlivé informace.

## Tipy a časté chyby

- Nevytvářejte duplicitní dodavatele s podobným názvem.
- Dodavatele propojujte s konkrétním rizikem nebo kontrolou.
- Při vytváření KRI z detailu dodavatele zachovejte vazbu na třetí stranu.

Časté chyby vznikají ze starých filtrů, nejasného ownership, duplicitních záznamů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v detailu.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Issues](./issues.md), [Dashboard](./dashboard.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
