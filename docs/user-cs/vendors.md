---
title: Správa dodavatelů
version: "2.6"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/VendorsPage.tsx + frontend/src/pages/VendorDetailPage.tsx + frontend/src/pages/vendors/*"
summary: "Uživatelský manuál pro sdílený registr dodavatelů: šest pohledů, serverové filtry, odpovědnost vlastníka outsourcingu, vazby na ostatní registry, smlouvy a sub-outsourcing, filtrovaný export, životní cyklus, čekající změny a evidence."
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

Tento manuál použijte, když potřebujete udržovat sdílený registr dodavatelů, chápat příznaky a odvozenou úroveň dodavatele, propojovat dodavatele s procesy, aktivy, riziky, kontrolami, KRI, smlouvami, sub-outsourcingem a nálezy nebo připravovat evidenci třetích stran. Je určen pro uživatele sledující dodavatelská rizika, proto popisuje praktický postup v aplikaci: kde začít, co ověřit před akcí a jak poznat, že je práce dokončená.

Text není technická reference. Vysvětluje běžný provozní postup: otevřít správnou stránku, ověřit správný záznam, provést nejmenší užitečnou změnu a zkontrolovat výsledek v seznamu, detailu, notifikacích nebo aktivitě.

Tuto oblast budete používat hlavně pro:

- pohledy a filtry seznamu dodavatelů
- detail dodavatele a odpovědnost vlastníka outsourcingu
- navázané procesy, aktiva, rizika, kontroly a KRI
- smlouvy a řetězce sub-outsourcingu
- nálezy, standardní export dodavatelů a samostatný export RoI DORA

## Než začnete

Před prací si ověřte tři věci. Zaprvé, že jste přihlášeni rolí, se kterou běžně pracujete. Zadruhé, že očekávaná data neskrývají čipy aktivních filtrů; staré filtry případně odstraňte. Zatřetí, že u záznamu už nečeká změna ve Schvalování, Mých žádostech nebo Notifikacích.

Pokud tlačítko nebo záložka chybí, berte to jako běžný signál přístupu, ne jako chybu. RiskHub zobrazuje akce podle vaší role, rozsahu, ownership a aktuálního stavu záznamu. Když akce není dostupná, požádejte vlastníka záznamu nebo správce přístupů o kontrolu.

Pro podporu mějte připravený název záznamu, kód, vlastníka a oddělení. Tyto údaje výrazně zrychlují komunikaci.

## Kde to najdete

Primární cesta: `/vendors`

Většinou se sem dostanete z levého menu. Detail otevřete výběrem řádku nebo karty s vazbou. Pokud jste přišli z jiného záznamu, použijte návrat nebo odkazy na související záznamy.

Běžný postup navigace:

1. Otevřete seznam.
2. Vyčistěte filtry, pokud si nejste jistí viditelností.
3. Hledejte podle obchodního či právního názvu, registračního identifikátoru, vlastníka, oddělení nebo procesu.
4. Otevřete záznam.
5. Před úpravou zkontrolujte vazby a poslední aktivitu.

## Co můžete vidět a měnit

Viditelnost závisí na roli, rozsahu oddělení a ownership. Uživatel se širší review odpovědností může vidět více záznamů než uživatel jednoho oddělení. Vlastník záznamu může mít možnost jednat i mimo svůj běžný pohled.

Typické informace v této oblasti:

- obchodní a právní název, registrační identifikátor, země a popis služby
- vlastník outsourcingu a vlastnící oddělení
- typ dodavatele, rizikové skóre, odvozená úroveň a příznaky DORA/CIF/významnosti
- nahraditelnost, geografický kontext, úplnost a další odvozené údaje
- navázané procesy, aktiva, rizika, kontroly a KRI
- smlouvy, řetězce sub-outsourcingu a otevřené nálezy
- stav životního cyklu, stav čekající změny a akce povolené backendem

Změny mají být praktické a snadno vysvětlitelné. Životní cyklus a stav schválení jsou oddělené: existující dodavatel může zůstat Aktivní, zatímco navržená změna čeká na rozhodnutí. Seznam i detail používají capabilities z backendu jako autoritu pro vytvoření, export, úpravu, archivaci, obnovení a změny vazeb. Uživatelé jen pro čtení mohou stránku používat pro kontrolu, filtrování a evidenci.

## Jak dokončit běžné úkoly

Pokud váš tým nemá přísnější postup, použijte tento základní workflow:

1. Najděte dodavatele v pohledu Vše a ověřte jeho životní cyklus a případnou čekající změnu.
2. Vytvořte nebo upravte dodavatele a nastavte vlastníka outsourcingu a klasifikaci.
3. Zkontrolujte rizikové skóre, odvozenou úroveň, příznaky, nahraditelnost, smlouvy a sub-outsourcing.
4. Navažte jen procesy, aktiva, rizika, kontroly nebo KRI, které představují skutečný vztah.
5. Pokud navázaný záznam neexistuje, vytvořte ho z kontextu dodavatele pouze dostupnou akcí.
6. Vraťte se do seznamu, zopakujte požadovanou filtrovanou množinu a exportujte evidenci.

### Přiřazení vlastníka outsourcingu

Výběr vlastníka vyhledává aktivní uživatele podle jména nebo e-mailu. Je účelově omezen na vlastnictví dodavatele, takže lze vybrat oprávněného aktivního uživatele z jiného oddělení. Výsledky zobrazují bezpečný business kontext: jméno, e-mail, oddělení a roli. Aplikace nikdy nepoužije číselné ID uživatele jako zobrazovanou náhradu.

Vybraný vlastník získá přístup ke čtení a úpravě konkrétního dodavatele podle capabilities daného řádku. Tím nezískává právo vytvářet či archivovat dodavatele, otevírat Governance ani přístup k navázaným záznamům. Rizika, kontroly, KRI, smlouvy, aktiva, procesy a sub-outsourcing zůstávají chráněné samostatně.

Při deaktivaci vlastníka přejde dodavatel do čekajícího stavu v Governance. Detail zachová důkazy o bývalém vlastníkovi, zakáže změny dodavatele i vazeb a oprávněného uživatele Governance navede k přiřazení aktivní náhrady. Pokud Governance nevidíte, požádejte CRO nebo správce Governance.

### Řízené hodnoty a jazyk

Volby ve formuláři dodavatele se ukládají jako stabilní kódy a zobrazují v aktivním českém nebo anglickém jazyce. Do API neposílejte popisky z workbooku. Stará nebo neznámá hodnota se zobrazí jako neznámá, nikdy jako nepřeložený databázový popisek.

Po uložení nebo odeslání ověřte výsledek. Seznam má ukázat nový stav, detail má odpovídat záměru a očekávaná notifikace nebo schválení má být dohledatelné. Pokud stránka hlásí, že záznam mezitím změnil někdo jiný, obnovte data a znovu posuďte aktuální stav.

Při propojování záznamů vybírejte jen vazby, které dávají smysl dalšímu reviewerovi. Vazba má popsat skutečný business vztah: kontrola snižuje riziko, KRI riziko monitoruje, dodavatel vytváří expozici nebo nález řeší konkrétní problém.

## Schvalování a notifikace

Úpravy dodavatele mohou čekat na kontrolu, pokud mění odpovědnost, chráněného kritického nebo významného dodavatele, archivaci či navázanou governance práci. Akce pro vazby se zobrazí jen tehdy, když je povolena jak akce nad dodavatelem, tak cílový kontext. Odznak Čekající změna není stav archivace: až do rozhodnutí zůstává provozním záznamem schválený dodavatel.

U kritického nebo významného dodavatele může vytvoření, běžná úprava,
archivace, změna smlouvy či sub-outsourcingu a změna vazby na riziko, kontrolu
nebo KRI vytvořit nezávislé schválení místo okamžité změny registru. Vazby na
Assety a Procesy používají příslušnou kompozitní schvalovací cestu, pokud
ovlivňují chráněného dodavatele. Před odesláním vyplňte konkrétní
**Důvod žádosti**. RiskHub poté otevře položku v **Mých žádostech**. Detail
dodavatele zobrazí čekající banner a zablokuje další překrývající se business
změnu. Jste-li žadatel a je-li dostupná akce Zrušit, můžete žádost zrušit přímo
v banneru; jinak počkejte na oprávněného Risk Managera nebo CRO. Ostatní
čtenáři vidí pouze omezený banner bez obsahu návrhu.

Poznámky ke schválení mají vysvětlit business důvod. Dobrá poznámka říká, co se změnilo, proč je to správně a jaký důkaz změnu podporuje. Notifikace jsou připomínky a navigace; detail záznamu zůstává nejlepším místem pro celý kontext.

Pokud je schválení stale nebo zamítnuté, neposílejte hned stejnou změnu znovu. Otevřete záznam, porovnejte aktuální stav se záměrem a odešlete novou úzkou změnu jen tehdy, pokud je stále potřeba.

## Vyhledávání, filtrování a evidence

Pokud URL neobsahuje explicitní stav, registr dodavatelů se otevře v pohledu **Vše**, pouze s aktivními záznamy a bez uživatelsky zvoleného řazení. Zachované pohledy jsou **Vše**, **Podle oddělení**, **Podle procesu**, **Podle typu**, **Podle rizika** a **Podle příznaku**. Seskupený pohled nejdřív zobrazí karty skupin; výběrem karty přejdete na řádky dodavatelů a návratovou akcí se vrátíte ke skupinám.

**Pohled Podle rizika respektuje oprávnění a vícenásobné členství.** Jeden dodavatel se objeví v každé skupině navázaného rizika, které smíte samostatně číst. Skryté riziko nesmí ovlivnit identifikátor, název, počet, volbu vyhledávače, skupinu ani obsah exportu. Pokud vaše role nemá přístup ke kontextu rizik, pohled Podle rizika se nenabízí.

Vyhledávání pokrývá obchodní název, právní název, registrační identifikátor, vlastníka outsourcingu, vlastnící oddělení a proces. Pro kontrolu přidejte relevantní filtry:

- stav životního cyklu, vlastnící oddělení a vlastník outsourcingu;
- typ dodavatele, rizikové skóre a odvozená úroveň;
- DORA relevanci, podporu CIF a významnost dodavatele;
- nahraditelnost, zemi a kategorii země;
- existenci smlouvy v rozsahu RoI, sub-outsourcingu nebo přímé vazby na proces;
- navázaný proces, aktivum, riziko, kontrolu nebo KRI.

Různá pole filtrů používají **AND**. Více hodnot uvnitř jednoho pole používá **OR** a vyhledávání se s filtry dále spojuje pomocí AND. Booleovská pole nabízejí Libovolné, Ano a Ne. Volby a počty počítá backend pouze z množiny dodavatelů a navázaných záznamů, které smíte číst. Řízené hodnoty používají stabilní kódy a lokalizované popisky; navázané záznamy a vlastníci se vybírají z vyhledávatelných adresářů a zvolená oprávněná hodnota zůstává čitelná i mezi stránkami vyhledávače. Platné volby s nulovým výsledkem zůstávají viditelné, ale jsou vypnuté.

Každý aktivní filtr má čip a započítává se do počtu aktivních filtrů. Jedním čipem odstraníte jedno pole; akcí **Vyčistit vše** odeberete přidané filtry, ale zachováte hledaný text. Změna hledání, pohledu, filtru, řazení nebo skupiny resetuje stránkování na první stránku. Hledání, pohled, řazení, filtry a skupinu obnoví Zpět/Vpřed v prohlížeči, obnovení stránky i zkopírovaná URL; číslo stránky se záměrně neukládá.

Standardní export dodavatelů používá aktuální hledání, filtry, řazení a vybranou skupinu, zahrne všechny odpovídající řádky bez ohledu na aktuální stránku a respektuje aktivní jazyk UI. Řízená pole zachovávají stabilní kódy i lokalizované popisky. Formální export Registru informací DORA je samostatná regulatorní akce s předepsanou strukturou a terminologií. Evidenci, která není součástí standardního exportu seznamu, hledejte v detailu dodavatele nebo v příslušném registru.

Pro spolehlivou evidenci začněte dost široce, abyste ověřili existenci dodavatele, zužte požadovanou populaci, otevřením vzorového řádku ověřte význam a teprve potom exportujte. Poznamenejte čas a účel snímku a nesdílejte zbytečné osobní nebo citlivé informace.

## Tipy a časté chyby

- Nevytvářejte duplicitní dodavatele s podobným názvem.
- Pohled Podle rizika nepovažujte za výlučnou kategorii; dodavatel může oprávněně patřit do několika viditelných skupin rizik.
- Dodavatele propojujte s konkrétním procesem, aktivem, rizikem, kontrolou nebo KRI, ne jen s oddělením.
- Nezaměňujte standardní filtrovaný export dodavatelů za formální export RoI DORA.
- Při vytváření KRI z detailu dodavatele zachovejte vazbu na třetí stranu.

Časté chyby vznikají ze starých filtrů, nejasného ownership, duplicitních záznamů nebo příliš široké změny. Pokud něco vypadá špatně, nejdřív stránku obnovte a ověřte stejný výsledek v detailu.

## Troubleshooting

Pokud je stránka prázdná, zkontrolujte stav životního cyklu, odstraňte čipy filtrů a hledejte podle známého obchodního názvu nebo registračního identifikátoru. Po dočasné chybě načtení použijte **Zkusit znovu**. Když backend přístup odmítne, RiskHub odstraní staré řádky a zobrazí Přístup odepřen; filtry nikdy nerozšiřují oprávnění. Pokud stránka chybí v menu, vaše role pravděpodobně tuto oblast nezahrnuje. Pokud uložení selže, přečtěte zprávu, obnovte záznam a zkontrolujte, zda ho mezitím nezměnil někdo jiný.

Pokud chybí navázaný záznam, nemusíte k němu mít přístup. Ptejte se na business název nebo kód, ne na technický identifikátor. Pro podporu uveďte roli, cestu v aplikaci, název záznamu, akci a přesné znění zprávy na obrazovce.

Pokud po odeslání chráněné změny zůstane dodavatel beze změny, zkontrolujte
**Mé žádosti** a čekající banner dříve, než akci zopakujete. Jde o očekávaný
princip čtyř očí: schválené hodnoty platí až do rozhodnutí. Stejnou změnu
neodesílejte znovu, dokud je banner přítomen.

Pokud vyhledání vlastníka nebo navázaného záznamu selže, zopakujte chráněné vyhledání; nenahrazujte ho číselným ID. Pokud dodavatel čeká na přeřazení, vyřešte vlastnictví v Governance před úpravou nebo změnou vazeb. Pokud chybí pohled Podle rizika, ověřte oprávnění ke čtení rizik. Pokud export používá nesprávný jazyk, přepněte jazyk UI a spusťte nový standardní export.

Všechna tlačítka pohledů, filtry, čipy, karty skupin, řaditelné hlavičky, stránkování, opakování načtení a ovládací prvky exportního dialogu lze ovládat klávesnicí a mají přístupný název. Pokud se ztratí fokus nebo ovládací prvek nemá čitelný název, při hlášení uveďte cestu, aktivní filtry, prohlížeč a jazyk.

## Změna odpovědnosti

Změna Outsourcing Ownera se řídí samostatně bez ohledu na stupeň ochrany
dodavatele. Uveďte důvod a ověřte jednu žádost v části Moje žádosti. Schválený
vlastník zůstane beze změny do nezávislého schválení Risk Managerem nebo CRO.
Osiřelá položka zůstává viditelná a dodavatel uzamčený do schválení.

## Související manuály

Začněte s [Risks](./risks.md), [Controls](./controls.md), [Kris](./kris.md), [Issues](./issues.md), [Dashboard](./dashboard.md). Tyto manuály vysvětlují navázaná workflow a pomohou sledovat záznam od signálu přes akci až po evidenci.
