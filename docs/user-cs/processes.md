---
title: Správa procesů
version: "2.7"
last_updated: "2026-07-16"
audience: user
source_of_truth: "frontend/src/pages/ProcessesPage.tsx + frontend/src/pages/processes/processRegisterConfig.ts + backend/app/services/_register_listings/processes.py + backend/app/services/_ict_register_lifecycle/lifecycle.py"
summary: "Uživatelský manuál pro registr procesů, vlastnictví, odvozenou kritičnost, chráněné změny, lifecycle, vazby, export a governance přeřazení."
tags:
  - workflow
  - governance
  - audit
  - troubleshooting
  - departments
---
# Správa procesů

## S čím vám tato stránka pomůže

Na `/processes` udržujete ICT registr business funkcí v hierarchii L0, L1 a volitelné L2. Proces popisuje, co organizace dělá, kdo za funkci osobně odpovídá, který útvar ji organizačně vlastní, jaké jsou zadané dopady a kontinuita a jakou kritičnost vypočítal RiskHub.

Každý nový aktivní proces má jednoho **vlastníka procesu** a jeden **vlastnický útvar**. Jde o vazby do adresáře, ne o textová pole. Vlastníkem může být libovolný aktivní uživatel RiskHubu a jeho domovský útvar se může lišit od vlastnického útvaru procesu. Osobní odpovědnost a organizační vlastnictví jsou dvě různé informace.

Detail procesu poskytuje přímé vazby na dodavatele a odvozené či tranzitivní souhrny a počty dodavatelů filtrované podle oprávnění. Neobsahuje sekce vazeb na aktiva ani rizika. Tyto dodavatelské vazby nezpřístupní dodavatele, který je mimo vaše samostatná oprávnění a řádkovou viditelnost dodavatelů.

## Než začnete

Připravte L0 oblast, název L1 procesu, volitelný L2 podproces, navrženého vlastníka a vlastnický útvar. Obě položky musí být v adresáři aktivní. Vlastnictví napříč útvary před uložením projednejte s příslušným vedoucím; RiskHub takové uspořádání podporuje, ale nepovažuje domovský útvar uživatele za organizačního vlastníka procesu.

Pokud jsou dostupné, připravte dopady, MTPD, RTO, RPO, BCM evidenci, výsledek DR testu a datum posouzení. Dopadové osy používají stupnici 1–5. RiskHub odvozuje skóre, výslednou třídu, CIF, kontroly kontinuity, datum dalšího posouzení, počty vazeb a úplnost. Tyto hodnoty ručně nezadávejte.

## Kde to najdete

V levém menu otevřete **Procesy**. Pokud URL neobsahuje uložený stav, registr se otevře v pohledu **Vše** s aktivními záznamy a deterministickým pořadím podle F-kódu ze serveru. Hledejte podle F-kódu, L0/L1/L2 názvu, vlastníka nebo vlastnického útvaru. Kliknutí na řádek otevře detail. Tlačítka **Nový proces**, **Upravit**, archivace, obnovení a export se zobrazí podle capabilities ze serveru.

## Co můžete vidět a měnit

Detail ukazuje stabilní F-kód, hierarchii, bezpečný profil vlastníka, vlastnický útvar, vstupní dopady a kontinuitu, lifecycle, vazby a samostatnou odvozenou sekci. Jméno vlastníka zobrazuje odděleně od kontextu vlastníka (domovský útvar a RiskHub role); e-mail vlastníka se na detailu nezobrazuje. Vlastnický útvar je samostatně zobrazen názvem a kódem. Rozhraní nikdy nenahrazuje chybějící jméno interním číselným ID.

Řízené hodnoty se ukládají jako jazykově neutrální kódy. Aktivní jazyk lokalizuje předběžnou kritičnost, CIF override, licencovanou činnost, BCM vazbu, výsledek DR testu a dopad přerušení. Přepnutí jazyka mění pouze zobrazení; názvy a poznámky se nepřekládají.

## Jak dokončit běžné úkoly

### Vytvoření procesu

Vyberte **Nový proces** a vyplňte L0 a L1. Ve vyhledávacím pickeru najděte vlastníka podle jména nebo e-mailu. Výsledky ukazují e-mail, domovský útvar a roli, abyste rozlišili osoby se stejným nebo podobným jménem. Výběr vlastníka doplní vlastnický útvar pouze tehdy, když je dosud prázdný. Navržený útvar zkontrolujte a případně změňte. Pozdější změna vlastníka již vybraný útvar nepřepíše.

Doplňte dostupné vstupy a uložte. Server znovu ověří aktivitu vlastníka i útvaru. V detailu zkontrolujte jméno, útvar, F-kód, lokalizované hodnoty a odvozený výsledek.

### Změna odpovědnosti

V **Upravit proces** vyberte aktivního náhradního vlastníka nebo útvar. Běžné změny mohou podle capabilities provádět Risk Manager/CRO a pro konkrétní záznam také vlastník procesu nebo vedoucí vlastnického útvaru. Tím nezískávají obecný zápis do celého registru ani přístup k navázaným záznamům.

Pokud je původní vlastník neaktivní a detail ukazuje orphan upozornění, běžné business změny jsou uzamčeny. Oprávněný uživatel Governance musí explicitně vyřešit čekající položku. Původní vazba zůstane evidovaná, dokud se atomické přeřazení nepodaří.

### Archivace a obnovení

Archivaci použijte, až když proces nemá zůstat v aktivních provozních pohledech. Archivace a obnovení zůstávají privilegované; samotné vlastnictví procesu ani vedení útvaru je neuděluje. Obnovte původní záznam místo vytvoření duplicity, aby zůstal zachován F-kód a historie.

## Schvalování a notifikace

Odpovědnost i chráněné změny se auditují. Vytvoření, úpravy, archivace, obnovení, vazby, rozhodnutí o návrhu, stale expirace a Governance resolution vytvářejí dohledatelné události.

Proces je chráněný, pokud má aktuální nebo navrhovaný odvozený CIF **Ano**. Když je scénář **Chráněné úpravy procesů** zapnutý, uložení změny business dat vytvoří návrh místo okamžité změny schváleného procesu. Uveďte jasný důvod žádosti. Detail dál zobrazuje schválené hodnoty a přidá samostatný stav **Čekající změna** s before/after rozdílem a dopadem na odvozený CIF v rozsahu vašich oprávnění. Čekající návrh blokuje další business úpravy; nemění lifecycle procesu a nemá termín, reminder, overdue stav ani automatické rozhodnutí.

Schválit nebo zamítnout musí jeden aktivní nakonfigurovaný Risk Manager nebo CRO, který není žadatelem. Risk Manager ani CRO nesmí schválit vlastní návrh. Zamítnutí vyžaduje důvod. Žadatel může čekající žádost zrušit. Při schválení RiskHub znovu ověří verzi procesu, oprávnění, scénář, reference a odvozený výsledek. Stale návrh expiruje bez změny schváleného procesu; obnovte záznam a případně odešlete nový úzký návrh.

Dvě výchozím způsobem zapnuté preference řídí doručení: **Žádosti o schválení vyžadující mou akci** a **Aktualizace mých žádostí o schválení**. Vypnutí potlačí jen odpovídající notifikace. Žádost i počet práce zůstávají viditelné ve Schváleních nebo Mých žádostech. Vypnutý scénář dovolí jinak autorizovanou úpravu aplikovat přímo, ale neoslabí běžná oprávnění ani validace procesu.

Deaktivace vlastníka zůstává samostatnou Governance cestou. RiskHub zachová původní vazbu a vytvoří čekající Governance položku. Detail zobrazí orphan-governance stav a zablokuje běžné úpravy i změny vazeb Proces–Dodavatel. Uživatel Governance explicitně přeřadí proces na aktivního vlastníka a aktivní vlastnický útvar v jedné atomické resolution.

## Vyhledávání, filtrování a evidence

Pohled **Vše** používá běžnou stránkovanou tabulku. Dalších pět pohledů seskupuje stejnou viditelnou množinu jako **Podle útvaru**, **Podle vlastníka**, **Podle L0 oblasti**, **Podle kritičnosti** nebo **Podle dodavatele**. Výběrem karty skupiny zobrazíte její procesy a potom se můžete vrátit na souhrn skupin. Proces se může objevit ve více dodavatelských skupinách, pokud má více viditelných přímých nebo odvozených vazeb. Chybějící přiřazení, klasifikace nebo vazba na dodavatele mají bezpečně pojmenovanou skupinu, nikdy interní číselné ID.

Vyhledávání pokrývá F-kód, L0/L1/L2 názvy, jméno vlastníka procesu a název vlastnického útvaru. Přidat lze filtry lifecycle, vlastnického útvaru, vlastníka procesu, L0 oblasti, třídy kritičnosti, CIF, úplnosti, licencované činnosti, BCM vazby, výsledku DR testu, inkluzivního rozsahu MTPD, navázaného aktiva, dodavatele nebo rizika. Různá pole se skládají pomocí **AND**, více hodnot v jednom poli pomocí **OR** a hledání se k filtrům přidává jako další podmínka. Boolean filtry nabízejí Ano, Ne nebo Libovolné. Aktivní chips ukazují každou podmínku; odeberte jeden chip nebo použijte **Vymazat vše** pro návrat k výchozí aktivní množině.

Hledání a filtry nikdy nerozšiřují oprávnění. Počty facetů a vzdálené lookupy útvarů, vlastníků, aktiv, dodavatelů a rizik se počítají jen ze záznamů a vazeb, které smíte číst. Platné řízené kódy bez aktuálního výsledku zůstávají viditelné, ale zakázané. Vybrané lookup položky lze znovu načíst i po stránkování a rozhraní ukazuje bezpečná jména a kontext, ne číselná databázová ID.

URL zachovává hledání, vybraný pohled, řazení, filtry, vybranou skupinu i nesouvisející navigační parametry. Obnovení URL a tlačítka Zpět/Vpřed tento stav obnoví. Aktuální stránka se záměrně neukládá; změna hledání, filtru, pohledu, řazení nebo skupiny vrátí stránkování na stranu 1. Nesouvisející parametry zůstávají pouze navigačním kontextem prohlížeče: neposílají se jako filtry procesů a nemohou změnit lifecycle ani rozšířit export.

Pokud máte oprávnění k exportu, tlačítko **Export** stáhne standardní CSV se všemi odpovídajícími procesy, které smíte číst, ne pouze s aktuální stránkou. Použije současné hledání, filtry, řazení a vybranou skupinu; řádky obsahují kanonické kódy a popisky v aktivní češtině nebo angličtině. Formální DORA Register of Information zůstává samostatným regulatorním výstupem.

Během načítání nechte prohlížeč otevřený a vyčkejte na dokončení progress stavu. Když je to bezpečné, chyba při obnovení ponechá už načtené výsledky viditelné a nabídne chybu s opakováním. Stav prázdného registru a stav bez shody vysvětlují, zda vytvořit záznam, odstranit podmínky nebo změnit hledání. Při zamítnutém právu číst procesy registr ukáže access stav a neodhalí řádky, názvy skupin, počty facetů ani lookup hodnoty. Pohledy, filtry, karty skupin, řazení tabulky, stránkování a opakování jsou ovladatelné klávesnicí a správně popsané pro asistivní technologie.

Pro evidenci si poznamenejte F-kód, hierarchii, zobrazené jméno a kontext vlastníka, název a kód vlastnického útvaru, lifecycle, lokalizované zobrazené hodnoty a odvozený výsledek. Activity Log ukáže autora a čas změny. E-mail slouží jako metadata v pickeru pro rozlišení identity; není součástí zobrazení evidence na detailu procesu.

## Tipy a časté chyby

Nezapisujte jméno osoby do poznámky jako náhradu pickeru. Nepřebírejte automaticky domovský útvar vlastníka; organizační vlastnictví může být jiné. Cross-Department přiřazení není samo o sobě chyba.

Neupravujte data kvůli chybnému překladu. Nezaměňujte předběžnou třídu za výslednou kritičnost. Neignorujte vysvětlení vstupů v odvozené sekci. Nezarchivujte celý proces jen kvůli jedné zastaralé vazbě.

## Troubleshooting

Pokud vlastník v pickeru chybí, ověřte aktivitu uživatele, zkuste přesný e-mail a opakujte lookup. Pokud chybí útvar, ověřte jeho aktivitu a hledejte podle názvu nebo kódu. Neaktivní položky nelze nově přiřadit.

Při chybě uložení nejprve zkontrolujte L0, L1, vlastníka a vlastnický útvar, potom řízené hodnoty a číselné rozsahy. Orphan upozornění řešte přes Governance. Když nelze otevřít vazbu, ověřte oprávnění k danému typu záznamu; vlastnictví procesu tento rozsah nerozšiřuje.

Pokud seznam vypadá nečekaně úzký, zkontrolujte aktivní filter chips, vybranou skupinu a lifecycle před vymazáním stavu. Zakázaná volba s nulovým počtem je platná hodnota bez výsledku v aktuálním čitelném scope, nikoli rozbitý lookup. Pokud export obsahuje méně řádků, než čekáte, porovnejte jej s celkovým počtem shod místo aktuální stránky a ověřte stejné filtry i skupinu.

## Změna odpovědnosti

Skutečná změna vlastníka procesu nebo vlastnícího útvaru vyžaduje důvod a při
zapnutém pevném scénáři vytvoří jednu žádost v části Moje žádosti. Schválené
hodnoty procesu zůstanou beze změny do nezávislého schválení Risk Managerem nebo
CRO. Zrušení, zamítnutí či zastarání zachová původní hodnoty. Stejné pravidlo
platí pro osiřelé položky v Governance, které zůstanou ve frontě do schválení.

## Související manuály

Viz [Oddělení](./departments.md), [Governance](./governance.md), [Rizika](./risks.md), [Dodavatelé](./vendors.md) a [Activity Log](./activity-log.md).
