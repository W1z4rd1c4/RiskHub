---
title: KRI (Key Risk Indicators)
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "frontend/src/pages/KRIsPage.tsx + frontend/src/pages/KRIDetailPage.tsx + docs/BUSINESS_LOGIC.md"
summary: "Jak navrhovat a provozovat KRI: thresholdy, breach/overdue logika, zápis hodnot, přiřazení dodavatelů, historie, exporty a monitoring přes notifikace."
tags:
  - kri
  - workflow
  - notifications
  - exports
  - troubleshooting
---
# KRI (Key Risk Indicators)

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

Tento manuál použijte, když potřebujete vytvářet smysluplná KRI, nastavovat hranice, zadávat hodnoty včas, rozumět breach a warning signálům a žádat opravy. Je určen pro uživatele, kteří definují, zadávají nebo kontrolují indikátory rizik, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: otevřít správnou stránku, ověřit správný záznam, provést nejmenší užitečnou změnu a zkontrolovat výsledek v seznamu, detailu, notifikacích nebo aktivitě.

Tuto oblast budete používat hlavně pro:

- seznam KRI
- detail KRI
- zadání hodnoty
- historie
- hranice
- přiřazení dodavatele
- kontext rizika

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že staré filtry neskrývají očekávaná data. Zatřetí, že na záznamu už nečeká práce ve Schvalování nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/kris`

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

- Název metriky
- Směr zhoršení
- Vlastník
- Cadence
- Hranice
- Poslední hodnota
- Stav
- Navázané riziko a dodavatel

Změny mají být praktické a snadno vysvětlitelné. Pokud změna ovlivňuje ownership, scoring, uzavření, archivaci nebo jiné citlivé údaje, počítejte v některých prostředích s review krokem. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Vytvořit nebo upravit KRI.
2. Navázat ho na riziko.
3. Nastavit warning a breach hranice.
4. Zadat hodnotu za období.
5. Zkontrolovat historii.
6. Požádat o opravu chybné hodnoty.

Po uložení nebo odeslání ověřte výsledek. Seznam má ukázat nový stav, detail má odpovídat záměru a očekávaná notifikace nebo schválení má být dohledatelné. Pokud stránka hlásí, že záznam mezitím změnil někdo jiný, obnovte data a znovu posuďte aktuální stav.

Při propojování záznamů vybírejte jen vazby, které dávají smysl dalšímu reviewerovi. Vazba má popsat skutečný business vztah: kontrola snižuje riziko, KRI riziko monitoruje, dodavatel vytváří expozici nebo nález řeší konkrétní problém.

## Schvalování a notifikace

Nové hodnoty, opravy a citlivé úpravy mohou čekat na review podle role a pravidel organizace. Pokud oprava čeká, počkejte na rozhodnutí.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; detail záznamu zůstává nejlepším místem pro celý kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Otevřete záznam, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Filtrujte podle vlastníka, stavu, včasnosti a monitoringu. Tlačítko exportu vytvoří filtrovaný seznam KRI s poli jako metrika, navázané riziko, aktuální hodnota, limity, breach stav, frekvence, stav, monitoring, termín, reporting owner a poslední report. Pro evidenci historie hodnot použijte history záložku v detailu KRI nebo Activity Log; samostatný export detailu nebo historie neexistuje.

Pro spolehlivý výsledek filtrujte v tomto pořadí:

1. Začněte dost široce, abyste ověřili existenci záznamu.
2. Zužte pohled podle oddělení, vlastníka, stavu, dodavatele nebo data.
3. Otevřete vzorek záznamu a ověřte, že filtr odpovídá záměru.
4. Exportujte jen filtrovaný pohled potřebný pro review.

Exporty jsou evidence. Udržujte je malé, popište časové období a nesdílejte zbytečné osobní nebo citlivé informace.

## Tipy a časté chyby

- Nastavte hranice tak, aby varovaly dostatečně brzy.
- Nezadávejte placeholder hodnoty jen kvůli splnění termínu.
- U dodavatele ověřte také navázané riziko.

Časté chyby vznikají ze starých filtrů, nejasného ownership, duplicitních záznamů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v detailu.

## Troubleshooting

Pokud je stránka prázdná, vyčistěte filtry a hledejte známý název záznamu. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

## Související manuály

Začněte s [Risks](./risks.md), [Dashboard](./dashboard.md), [Vendors](./vendors.md), [Notifications](./notifications.md), [Activity Log](./activity-log.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
