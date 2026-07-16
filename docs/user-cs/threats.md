---
title: Správa hrozeb
version: "2.6"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/ThreatsPage.tsx + frontend/src/pages/threats/ThreatRegisterFilterBar.tsx + backend/app/services/_register_listings/threats.py + backend/app/services/_ict_register_lifecycle/threat_lifecycle.py"
summary: "Uživatelský manuál pro sdílený registr hrozeb, správu CISO, filtrované skupiny rizik, export, archivaci a přeřazení osiřelé odpovědnosti."
tags:
  - risks
  - governance
  - workflow
  - audit
  - troubleshooting
  - access
---
# Správa hrozeb

## S čím vám tato stránka pomůže

Na `/threats` spravujete globální katalog hrozeb a propojujete hrozby s riziky, která mohou způsobit. Hrozba nepatří oddělení: každý aktivní záznam má jednoho odpovědného správce hrozby, který musí být aktivním CISO.

Katalog vytváří jednotný popis opakujících se scénářů ICT hrozeb pro celou organizaci. Hrozba popisuje možný zdroj újmy, například ransomware, ztrátu dostupnosti, neoprávněné zveřejnění dat nebo výpadek třetí strany. Riziko popisuje konkrétní business expozici, která vznikne, když hrozba zasáhne určitý proces nebo aktivum. Oddělení těchto pojmů umožňuje navázat jednu hrozbu na více rizik bez kopírování popisu a evidence odpovědnosti.

Stránku použijte při přidání nového scénáře, zpřesnění popisu, ověření odpovědné osoby nebo kontrole navázaných rizik. Nepoužívejte ji pro konkrétní incident či nápravné opatření; takový záznam patří do odpovídajícího workflow incidentu, problému, kontroly nebo rizika.

## Než začnete

Ověřte, že je dostupný aktivní CISO a že rozumíte vazbám na rizika. Hrozby mohou udržovat role CISO, Risk Manager a CRO; ostatní business role mají kontextové čtení podle svých oprávnění.

Před vytvořením nebo významnou změnou si připravte stručný název, srozumitelný popis, nejvhodnější řízenou kategorii, typické zranitelnosti a dotčené systémy či subjekty. Navrženou odpovědnost předem slaďte s CISO. Picker vrací pouze aktivní uživatele s rolí CISO, takže odpovědnost nelze vytvořit neformálním zápisem jména do textu.

Dostupné akce určuje server pomocí capabilities. Pokud nevidíte vytvoření, úpravu, archivaci, obnovení nebo propojení, nemusí jít o chybu stránky. Vaše role může mít pouze čtení, záznam může být archivovaný nebo navazované riziko může být mimo váš povolený rozsah. Požádejte Risk Managera nebo CRO o ověření oprávnění; nepoužívejte relaci jiného uživatele.

## Kde to najdete

V levém menu otevřete **Hrozby**. Řádek otevře detail, **Nová hrozba** vytvoří záznam a **Upravit hrozbu** umožní změnit správce.

Registr se otevře v pohledu **Vše** s aktivními záznamy a bez uživatelského řazení. Další pohledy jsou **Podle kategorie**, **Podle správce hrozby**, **Podle relevantního subjektu** a **Podle navázaného rizika**. Skupinový pohled nejprve zobrazí karty skupin; výběrem karty otevřete její hrozby a ovládacím prvkem zpět se vrátíte ke skupinám. Zpět a Vpřed v prohlížeči, obnovení stránky i zkopírovaná URL obnoví stejné hledání, filtry, pohled, řazení a vybranou skupinu. Číslo stránky se záměrně neuchovává; změna pracovního rozsahu začne znovu na straně 1.

Filtr stavu použijte pro kontrolu nebo obnovení vyřazené položky. Detail obsahuje přehled záznamu a sekci vazeb na rizika. Uživatelé governance najdou mezery v odpovědnosti také v části osiřelých položek, pokud původní CISO přestane být aktivní nebo ztratí roli CISO.

## Co můžete vidět a měnit

Detail ukazuje název, lokalizovanou kategorii, popis, typické zranitelnosti, relevantní subjekt, poznámku, bezpečný kontext jména/e-mailu správce, stav a navázaná rizika. Kategorie se ukládají jako jazykově neutrální kódy a zobrazují se v aktivní češtině nebo angličtině; volný text se nepřekládá.

Řízené kategorie pokrývají dostupnost, integritu, důvěrnost, hodnověrnost, fyzické, personální a třetí strany. Vyberte nejvýstižnější hlavní kategorii a případné sekundární dopady popište v textu. Přepnutí jazyka změní pouze zobrazený název kategorie; neupraví uložený záznam ani nevytvoří druhou překladovou kopii.

Panel správce ukazuje bezpečný business kontext, například jméno, e-mail, roli a oddělení. Uživatelské rozhraní nepoužívá interní číselný identifikátor jako náhradní text. Když přiřazená osoba přestane být způsobilá, detail zobrazí jantarové upozornění a současně zachová historickou vazbu. Dokud je tato mezera otevřená, běžná úprava hrozby je uzamčená, protože API přijímá přeřazení pouze přes explicitní Governance resolution. Upozornění je governance signál, nikoli důkaz smazání či změny samotné hrozby.

## Jak dokončit běžné úkoly

### Vytvoření řízené hrozby

Vyberte **Nová hrozba**, zadejte stručný jednoznačný název a ve vyhledávacím poli **Správce hrozby** zvolte aktivního CISO. Vyberte řízenou kategorii a doplňte popis i typické zranitelnosti tak, aby scénáři rozuměl i další hodnotitel bez neveřejného kontextu. Po uložení ověřte správce a lokalizovanou kategorii v detailu. Chybějící nebo nezpůsobilé přiřazení server odmítne, i kdyby starší stav prohlížeče uživatele dříve nabízel.

### Přeřazení odpovědnosti

Pokud je současný správce způsobilý, otevřete **Upravit hrozbu**, vyhledejte náhradního CISO podle jména nebo e-mailu, vyberte osobu a uložte. Pokud se zobrazuje jantarové upozornění, nepoužívejte běžnou úpravu: CRO otevře frontu hrozeb v **Governance**, vybere **Resolve**, zvolí aktivního CISO a odešle explicitní resolution. Deaktivace původního správce nikdy automaticky nepřevede odpovědnost. Po úspěchu kteréhokoli postupu ověřte nové jméno v detailu a při požadavku na evidenci zkontrolujte Activity Log.

### Propojení nebo odpojení rizika

V detailu hrozby vyhledejte riziko, které smíte číst, a vyberte **Provázat**. Vazba se zobrazí s business kódem a názvem rizika. CISO může spravovat vazbu ze strany hrozby, protože jde o součást správy katalogu, ale bez samostatného práva zápisu nemůže měnit samotné riziko. Vazbu odeberte, pokud byla chybná nebo již není relevantní; nearchivujte celou hrozbu jen kvůli jedné zastaralé vazbě.

### Archivace a obnovení

Hrozbu archivujte až po ověření, že nemá zůstat v aktivním katalogu a že hodnotitelé chápou dopad na propojené záznamy. Archivovaná hrozba odmítá běžné úpravy a nové změny vazeb. Pokud se stejný řízený záznam znovu stane relevantním, použijte archivovaný pohled a **Obnovit**; zachováte historii a nevytvoříte duplicitu.

## Schvalování a notifikace

Práce s hrozbami ani vazbami nedává schvalovací pravomoc. Role CISO nemůže schvalovat nesouvisející workflow ani spravovat uživatele. Přeřazení správce je explicitní auditovaná změna.

Vytvoření, změny polí, archivace, obnovení a změny vazeb na rizika vytvářejí dohledatelné auditní události. Tyto akce nespouštějí obecné schvalování jen proto, že je provedl CISO. Pokud navázané riziko, kontrola, problém nebo dodavatel používá vlastní schvalovací proces, dokončete jej v dané doméně. Správce hrozby nese odpovědnost za katalog hrozeb; nestává se automaticky schvalovatelem všech souvisejících objektů.

## Vyhledávání, filtrování a evidence

Vyhledávání pokrývá název hrozby, popis, typické zranitelnosti, relevantní subjekt a jméno správce. Hledání se kombinuje se všemi vybranými filtry. Různá pole filtrů používají **AND**; více hodnot uvnitř jednoho pole používá **OR**. Každá změna filtru začne znovu na straně 1, takže zúžený výsledek nezůstane skrytý starým číslem stránky.

Filtr stavu zůstává stále viditelný. Pomocí **Filtry** přidejte jen ostatní ovládací prvky potřebné pro danou kontrolu:

- kategorii;
- správce hrozby;
- relevantní subjekt;
- informaci, zda má hrozba navázané riziko;
- konkrétní navázané riziko;
- typ navázaného rizika; a
- oddělení navázaného rizika.

Počet aktivních filtrů a jejich štítky ukazují celý výběr. Odebráním jednoho štítku vymažete jedno pole; **Vymazat vše** odstraní všechny přidané filtry, ale ponechá hledaný text. Možnosti, popisky a počty se počítají pouze ze záznamů a kontextu rizik, které smíte vidět. Řízené kategorie a typy rizik používají stabilní kódy s lokalizovanými popisky; správce a navázané riziko se vybírají z prohledávatelných seznamů omezených oprávněním. Zakázaná možnost s nulovým počtem je informace, ne důvod k rozšíření přístupu.

**Podle navázaného rizika** je vícečetný pohled: hrozba navázaná na tři rizika se objeví ve všech třech čitelných skupinách rizik, nejen u prvního rizika. Rizika mimo rozsah čtení nevytvoří skupinu, možnost, počet, popisek ani nepřímou indicii. Skupina bez vazby znamená, že ve vašem viditelném rozsahu není žádné čitelné navázané riziko; nedokazuje neexistenci skryté vazby.

Řazení a stránkování pracují uvnitř aktuálního filtrovaného rozsahu a vybrané skupiny. **Export** stáhne všechny odpovídající hrozby ve stejném oprávněném rozsahu bez ohledu na právě zobrazenou stránku. Standardní export zachová stabilní kódy kategorií a doplní popisky ve zvoleném jazyce exportu. Přenáší hledání, filtry, pohled a vybranou skupinu, nikoli nesouvisející parametry URL nebo stránkování seznamu. Pokud **Export** chybí, server tuto capability neposkytl.

Detail a Activity Log slouží jako evidence správy, lifecycle změn a vazeb na rizika. UI nikdy nenahrazuje chybějící jméno surovým ID uživatele.

Při evidenční kontrole zaznamenejte název hrozby, kategorii, aktuálně způsobilého správce, stav archivace a business identifikátory navázaných rizik. V Activity Logu ověřte, kdo a kdy záznam vytvořil, změnil, archivoval, obnovil, propojil nebo odpojil. Filtrovaný seznam nebo standardní export je snímek registru, nikoli úplná auditní stopa. Pokud evidence musí ukázat, kdo a kdy změnil vazbu nebo pole, použijte Activity Log nebo autorizovaný auditní report.

Jantarové upozornění na osiřelou odpovědnost znamená, že systém po deaktivaci nebo ztrátě role CISO zachoval původní vazbu. Jde o záměrné zachování evidence. Hrozba zůstává čitelná a původní vztah není přepsán vymyšleným náhradníkem. Detail skryje **Upravit hrozbu** a oprávněného CRO nasměruje do fronty hrozeb v Governance; CISO bez přístupu do Governance dostane pokyn požádat CRO. Governance statistiky počítají mezeru, dokud tento uživatel explicitně nepřeřadí záznam na aktivního CISO.

## Tipy a časté chyby

Nezapisujte jméno správce do volného textu; používejte picker. V importu nepřekládejte uložené kódy; názvy z workbooku mapuje importní hranice. Správce hrozby není obecný vlastník ani přiřazení oddělení.

Upřednostněte jednu opakovaně použitelnou hrozbu před několika téměř stejnými záznamy pro jednotlivá rizika. Pravděpodobnost, dopad, vlastník a mitigace patří ke konkrétnímu riziku. Popis hrozby udržujte stabilní a rozpoznatelný napříč organizací. Před archivací vyhledejte podobné názvy a zkontrolujte vazby, abyste nevyřadili sdílenou katalogovou položku v situaci, kdy stačí odebrat jedinou vazbu.

Prázdný picker neobcházejte vložením identifikátoru ani požadavkem na širokou správu uživatelů. Nejprve opakujte načtení, ověřte aktivitu navrženého správce a o změnu jeho role požádejte administrátora jen tehdy, když je takové organizační rozhodnutí skutečně schválené.

## Troubleshooting

Když selže běžná úprava, ověřte aktivitu uživatele a roli CISO. Jantarové upozornění znamená, že bývalé přiřazení zůstalo zachované, ale není způsobilé a formulář úprav je záměrně nedostupný; požádejte CRO, aby ve frontě hrozeb v Governance vyřešil mezeru přiřazením aktivního CISO.

Pokud se seznam správců nenačte, použijte **Opakovat** a ověřte funkčnost jiných seznamů načítaných z API. Trvající problém může znamenat výpadek připojení nebo služby; před obnovením stránky si uchovejte rozepsaný text a podpoře předejte čas a název stránky. Pokud se seznam načte, ale osoba chybí, ověřte aktivní stav a skutečnou RiskHub roli CISO. Podobný pracovní titul z adresáře sám o sobě oprávnění nevytváří.

Když v pickeru vazeb nenajdete riziko, zkontrolujte, že je aktivní a patří do vašeho povoleného rozsahu. Služba záměrně neodhaluje rizika mimo rozsah uživatele. Pokud u archivované hrozby není dostupná změna vazby, nejprve ji oprávněně obnovte. Když se kategorie zobrazí v nesprávném jazyce, ověřte aktivní jazyk a nahlaste přesný text; neupravujte uložená data jako náhradu za opravu lokalizace.

Pokud se registr nenačte, použijte klávesnicí ovladatelnou akci **Opakovat**. Serverem potvrzené odepření přístupu nahradí registr a nenechá na obrazovce staré řádky, skupiny, filtry ani počty. Pokud se skupinová URL otevře bez vybrané skupiny, skupina už nemusí existovat ve vašem filtrovaném a oprávněném rozsahu; vraťte se ke skupinám a zvolte viditelnou kartu. Když selže export, ponechte URL a po obnovení připojení operaci zopakujte; neoslabujte kvůli tomu filtry.

## Související manuály

Viz [Rizika](./risks.md), [Governance](./governance.md), [Activity Log](./activity-log.md) a [Správa přístupů](./access-management.md).
