---
title: Správa aktiv
version: "2.6"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/AssetsPage.tsx + frontend/src/pages/assets/ + backend/app/services/_register_listings/assets.py + backend/app/services/_ict_register_lifecycle/asset_lifecycle.py"
summary: "Uživatelský manuál pro sdílený registr aktiv, odpovědnosti, kanonické hodnoty, odvozené výsledky, vazby, export a řízené přeřazení."
tags:
  - workflow
  - governance
  - audit
  - troubleshooting
  - departments
---
# Správa aktiv

## S čím vám tato stránka pomůže

Na `/assets` spravujete ICT aktiva. Každé nové aktivum vyžaduje aktivního **Business vlastníka**, aktivního **ICT vlastníka** a aktivní **vlastnický útvar**. Jde o adresářové vazby, ne text. Obě role může zastávat stejná osoba a její domovský útvar se může lišit od útvaru aktiva.

## Než začnete

Připravte název, obě odpovědné osoby, organizační útvar, klasifikace, hodnocení, lifecycle evidenci a potřebné vazby na procesy, aktiva a dodavatele. Ověřte aktivitu adresářových položek.

Business vlastník odpovídá za business použití, hodnotu, data a požadavky na kontinuitu. ICT vlastník odpovídá za technický provoz, podporu, koordinaci bezpečnosti a lifecycle. Vlastnický útvar říká, kam aktivum organizačně patří. Tyto tři informace zůstávají oddělené i tehdy, když obě osobní role zastává stejný člověk. Před zápisem přiřazení projednejte s dotčenými týmy.

Připravte hodnocení důvěrnosti, integrity, dostupnosti a autenticity na škále 1–5. Podle relevance také dopad na klienta a regulaci, nahraditelnost, závislost na dodavateli, vystavení internetu, předběžnou kritičnost, model nasazení, konce podpory a stav revize. Jde o vstupy; výsledky počítá registr z aktuálního grafu a parametrů.

## Kde to najdete

V menu otevřete **Aktiva**. Registr se otevře v pohledu **Vše** s aktivními aktivy. Hledejte podle názvu, alternativního názvu, typu, kteréhokoli vlastníka, vlastnického útvaru nebo fyzického umístění. Akce se řídí capabilities z backendu.

Pohled **Vše** zobrazuje běžnou stránkovanou tabulku. Dalších šest pohledů seskupuje stejnou viditelnou množinu jako **Podle útvaru**, **Podle Business vlastníka**, **Podle typu**, **Podle kritičnosti**, **Podle procesu** nebo **Podle dodavatele**. Karta skupiny otevře její aktiva a umožní návrat na souhrn. Aktivum může být ve více skupinách procesů nebo dodavatelů, pokud má více viditelných vazeb. Nepřiřazené, neklasifikované a nepropojené záznamy používají bezpečné pojmenované skupiny, nikdy interní ID.

## Co můžete vidět a měnit

Detail ukazuje jména obou vlastníků a bezpečný kontext role/útvaru, ale skrývá e-maily a interní číselná ID. Vlastnický útvar se zobrazuje samostatně názvem a kódem. Hodnota aktiva, výsledná kritičnost, CIF, SPOF, úplnost a grafové souhrny jsou odvozené a pouze pro čtení.

Registr standardně začíná aktivními aktivy. Historii zobrazíte volbou archivované lifecycle populace. Hledání a filtry zužují pouze záznamy již viditelné vašemu účtu a nikdy scope nerozšiřují. Vazby na procesy, jiná aktiva, dodavatele a rizika respektují samostatná oprávnění protistrany; vlastnictví aktiva nezpřístupní omezeného dodavatele ani riziko.

Backend určuje dostupnost akcí **Nové aktivum**, **Export** i akcí jednotlivých řádků. Business vlastník, ICT vlastník nebo vedoucí vlastnického útvaru může získat přístup ke konkrétnímu záznamu bez obecné správy registru. Export vyžaduje reportovací capability. Archivace a obnovení zůstávají samostatné privilegované akce. Čekající ownership-governance stav se zobrazuje odděleně od aktivního/archivovaného lifecycle a může uzamknout běžné změny bez změny provozního záznamu.

Řízené hodnoty jsou stabilní jazykově neutrální kódy lokalizované v EN/CS. České workbook popisky mapuje pouze import; běžné API zápisy je odmítnou.

## Jak dokončit běžné úkoly

### Vytvoření aktiva

Oba vlastníky hledejte podle jména nebo e-mailu. Business vlastník doplní útvar jen do prázdného pole. ICT vlastník útvar nikdy nemění. Útvar lze upravit samostatně. Stejný aktivní uživatel může zastávat obě role a odpovědnost napříč útvary je podporovaná.

Picker může ukázat e-mail, domovský útvar a RiskHub roli pro rozlišení podobných jmen. Tato metadata slouží pouze k výběru a nekopírují se do aktiva. Před uložením zkontrolujte čtyři povinná pole: název, Business vlastníka, ICT vlastníka a vlastnický útvar. Po uložení ověřte lokalizovaný typ/lifecycle a oba bezpečné owner souhrny.

### Změna odpovědnosti

Risk Manager/CRO mění záznam v rozsahu svých oprávnění. U aktivního přiřazeného záznamu mají oba vlastníci a vedoucí vlastnického útvaru právo číst a upravit konkrétní aktivum, nikoli archivovat/obnovit nebo spravovat celý registr.

Když osiří kterákoli role, běžné úpravy i změny vazeb se uzamknou. V **Governance** otevřete položku aktiva označenou rolí `Business vlastník` nebo `ICT vlastník`, vyberte aktivní náhradu a aktivní útvar. Obě změny se použijí atomicky.

Náhrada jedné role automaticky neřeší druhou. Pokud deaktivovaná osoba zastávala obě role, mohou vzniknout dvě role-specific orphan položky. Každou vyřešte samostatně. Útvar se při resolution odesílá společně s novým vlastníkem, takže aktivum nezůstane v mezistavu. Zastaralý resolution se odmítne, pokud mezitím cíl změnil jiný správce.

### Archivace a obnovení

Archivace/obnovení jsou privilegované. Vlastnictví ani vedení útvaru tuto pravomoc nedává. Obnovte původní záznam místo duplicity.

## Schvalování a notifikace

Změny odpovědnosti a lifecycle se auditují. Změny odpovědnosti Aktiva a
explicitní přeřazení v Governance používají při zapnutém scénáři schválení.
Původní vazba zůstává schválená a dohledatelná do nezávislého schválení celé
změny.

Na stránce **Záznam aktivit** ověřujte autora vytvoření, změny, archivace, obnovení, vazby nebo přeřazení. Governance resolution je řízená oprava, ne obcházení běžných oprávnění. Pokud upozornění vidíte, ale Governance otevřít nemůžete, požádejte oprávněného Risk Managera nebo CRO.

## Vyhledávání, filtrování a evidence

Přidávat lze filtry pro lifecycle, vlastnický útvar, Business vlastníka, ICT vlastníka, typ a úroveň aktiva, model nasazení, výslednou kritičnost, podporu CIF, lifecycle stav, legacy stav, SPOF, externí závislost, relevanci GDPR a AI, vystavení internetu, klasifikaci dat, úplnost a vazby na proces, aktivum, dodavatele a riziko. Zachován zůstává i rychlý filtr přítomnosti vazby na proces.

Různá pole se kombinují logikou **AND**, více voleb v jednom poli logikou **OR**. Pole Ano/Ne podporují také volbu **Libovolné**. Hledání se navíc kombinuje se zvolenými filtry. Facety a vzdálené lookupy vlastníků a entit respektují oprávnění. Platné řízené kódy bez výsledku zůstávají viditelné, ale disabled; skryté názvy entit ani jejich počty se neprozrazují.

Hledání, pohled, řazení, filtry a vybraná skupina se ukládají do URL, takže sdílený odkaz i Zpět/Vpřed obnoví stejný stav registru. Změna filtru, hledání, pohledu, řazení nebo skupiny vrátí stránkování na první stránku; číslo stránky se do URL neukládá. Nesouvisející navigační parametry mohou v URL prohlížeče zůstat, ale nejsou filtry aktiv a neposílají se do Asset API ani exportu.

**Vymazat vše** odstraní uživatelské filtry bez rozšíření oprávnění. Načítání, prázdný výsledek, opakovatelná chyba a odepřený přístup jsou odlišné stavy. Ovládání pohledů a filtrů má popisky a funguje z klávesnice. Po chybě nebo 403 nezůstávají viditelné staré řádky ani počty skupin.

Je-li dostupný **Export**, používá stejné viditelné hledání, filtry, řazení, pohled a vybranou skupinu jako registr. Obsahuje všechny odpovídající viditelné záznamy bez ohledu na aktuální stránku a uvádí kanonické kódy i lokalizované popisky. Formální DORA Register of Information export je samostatný řízený report.

Pro evidenci zaznamenejte název, lokalizovaný typ/lifecycle, obě jména a bezpečný kontext, vlastnický útvar, aktivní filtry nebo skupinu, hodnocení, odvozený výsledek a vazby. E-mail je pouze metadata pickeru. Uveďte, zda evidence pochází z aktivní nebo archivované populace.

Při analýze odvozené kritičnosti zachyťte explanation inputs, primární proces, počet vazeb, score bands a referenční datum. Pro úplnost použijte zobrazený seznam chybějících vstupů místo odhadu ze screenshotu.

## Tipy a časté chyby

Nezapisujte vlastníky do poznámek, nevyžadujte shodný útvar a neměňte útvar automaticky s ICT vlastníkem. Neukládejte přeložené popisky ani odvozené hodnoty.

## Troubleshooting

Chybějící volba obvykle znamená neaktivního uživatele nebo útvar. Při chybě ověřte název, oba vlastníky, útvar, kanonické hodnoty a rozsah hodnocení. Čekající orphan řešte přes Governance.

Při chybném překladu poznamenejte jazyk, pole, uložený kód, pokud je dostupný supportu, a zobrazený popisek; nenahrazujte kód českou workbook hodnotou. Pokud chybí akce vazby, zkontrolujte stav aktiva, Governance warning, viditelnost protistrany a capabilities řádku. Pokud aktivum nelze najít, vymažte hledání, ověřte aktivní/archivovanou populaci a aktuálnost owner/Department vazby.

Při opakované chybě si připravte čas, název aktiva, použitou roli, očekávanou akci a přesný text upozornění. Support tak rozliší neaktivní adresářovou položku, omezený scope, čekající Governance workflow a chybnou řízenou hodnotu bez požadavku na interní číselná ID.

## Změna odpovědnosti

Změna Business Ownera, ICT Ownera nebo vlastnícího útvaru vyžaduje důvod a při
zapnutém pevném scénáři vytvoří jednu žádost. Schválené Aktivum i stav osiřelé
položky zůstanou beze změny do nezávislého schválení Risk Managerem nebo CRO.
Zrušení, zamítnutí či zastarání zachová původní hodnoty.

## Související manuály

Viz [Procesy](./processes.md), [Oddělení](./departments.md), [Governance](./governance.md), [Dodavatelé](./vendors.md) a [Záznam aktivit](./activity-log.md).
