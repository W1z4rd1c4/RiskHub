---
title: Správa procesů
version: "2.5"
last_updated: "2026-07-15"
audience: user
source_of_truth: "frontend/src/pages/ProcessesPage.tsx + frontend/src/pages/ProcessDetailPage.tsx + backend/app/services/_ict_register_lifecycle/lifecycle.py"
summary: "Uživatelský manuál pro vlastnictví procesů, vlastnické útvary, kanonické hodnoty, odvozenou kritičnost, lifecycle, vazby a governance přeřazení."
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

V levém menu otevřete **Procesy**. Registr standardně zobrazuje aktivní záznamy. Hledejte podle F-kódu, L0/L1/L2 názvu, vlastníka nebo vlastnického útvaru. Kliknutí na řádek otevře detail. Tlačítka **Nový proces**, **Upravit**, archivace a obnovení se zobrazí podle capabilities ze serveru.

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

Změny odpovědnosti se auditují. Vytvoření, úpravy, archivace, obnovení, vazby a Governance resolution vytvářejí dohledatelné události.

Tato verze vlastnictví procesů nepřidává samostatnou approval frontu ani notifikační workflow pro procesy. Dodaná cesta při deaktivaci vlastníka vede přes Governance: RiskHub zachová původní vazbu a vytvoří čekající položku Governance. Detail procesu zobrazí governance stav a zablokuje běžné úpravy i změny vazeb Proces–Dodavatel. Uživatel Governance s potřebným oprávněním otevře orphan položku procesu a explicitně přeřadí proces na aktivního vlastníka a aktivní vlastnický útvar. Resolution je atomické: proces po dokončení nesmí zůstat pouze s jednou stranou odpovědnosti.

## Vyhledávání, filtrování a evidence

V registru hledejte podle F-kódu, názvu v hierarchii, jména vlastníka procesu nebo názvu vlastnického útvaru. Před závěrem, že proces chybí, ověřte zahrnutí archivovaných záznamů. Vyhledávání pomáhá záznam najít, ale nemění backendový scope, který určuje, které procesy smíte číst. Seskupené workspaces **Podle útvaru**/**Podle vlastníka** a sdílené filtry napříč registry jsou odložené.

Pro evidenci si poznamenejte F-kód, hierarchii, zobrazené jméno a kontext vlastníka, název a kód vlastnického útvaru, lifecycle, lokalizované zobrazené hodnoty a odvozený výsledek. Activity Log ukáže autora a čas změny. E-mail slouží jako metadata v pickeru pro rozlišení identity; není součástí zobrazení evidence na detailu procesu.

## Tipy a časté chyby

Nezapisujte jméno osoby do poznámky jako náhradu pickeru. Nepřebírejte automaticky domovský útvar vlastníka; organizační vlastnictví může být jiné. Cross-Department přiřazení není samo o sobě chyba.

Neupravujte data kvůli chybnému překladu. Nezaměňujte předběžnou třídu za výslednou kritičnost. Neignorujte vysvětlení vstupů v odvozené sekci. Nezarchivujte celý proces jen kvůli jedné zastaralé vazbě.

## Troubleshooting

Pokud vlastník v pickeru chybí, ověřte aktivitu uživatele, zkuste přesný e-mail a opakujte lookup. Pokud chybí útvar, ověřte jeho aktivitu a hledejte podle názvu nebo kódu. Neaktivní položky nelze nově přiřadit.

Při chybě uložení nejprve zkontrolujte L0, L1, vlastníka a vlastnický útvar, potom řízené hodnoty a číselné rozsahy. Orphan upozornění řešte přes Governance. Když nelze otevřít vazbu, ověřte oprávnění k danému typu záznamu; vlastnictví procesu tento rozsah nerozšiřuje.

## Související manuály

Viz [Oddělení](./departments.md), [Governance](./governance.md), [Rizika](./risks.md), [Dodavatelé](./vendors.md) a [Activity Log](./activity-log.md).
