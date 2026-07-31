---
title: Podpora registru procesů (admin runbook)
version: "1.0"
last_updated: "2026-07-31"
audience: admin
source_of_truth: "docs/BUSINESS_LOGIC.md + docs/security/authorization-capability-contract.md + frontend/src/pages/ProcessesPage.tsx"
summary: "Provozní podpora přístupů k procesům, odpovědnosti, řízených změn a evidence bez obcházení business oprávnění."
tags:
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - governance
  - processes
  - departments
  - audit
---

# Podpora registru procesů (admin runbook)

## Přehled

Tento runbook použijte, když uživatel hlásí, že proces chybí, nelze jej upravit, má stav čekající změna nebo má neplatný stav odpovědnosti. Proces má dva kanonické vztahy odpovědnosti: aktivního Vlastníka procesu a aktivní Vlastnické oddělení. Vztahy jsou nezávislé. Vlastník procesu může pracovat v jiném oddělení. Jeho výběr smí doplnit pouze prázdné oddělení a nesmí přepsat oddělení, které už žadatel vybral.

Správa platformy nedává business oprávnění k procesům. Administrátor smí ověřit identitu, role, session, dostupnost a auditní evidenci, ale nesmí schválit žádost, změnit data procesu ani obejít řízený workflow přímým zásahem do databáze.

## Kdy to použít

Postup použijte pro hlášení access denied, prázdné výsledky hledání, nerozpoznaný štítek vlastníka, orphan indikátor, zakázanou akci Upravit, neočekávanou čekající změnu nebo proces chybějící ve workspace oddělení. Platí také tehdy, když nepřišla notifikace, ale žádost zůstává v sekci Schvalování nebo Moje žádosti.

Nepoužívejte jej k rozhodování, zda je proces CIF, kdo má být jeho vlastníkem, jaké má mít Vlastnické oddělení nebo zda má být změna schválena. To jsou rozhodnutí business governance.

## Předpoklady a bezpečnost

Zaznamenejte prostředí, čas, e-mail uživatele, aktivní jazyk, F-kód, název procesu, očekávané oddělení, očekávanou akci a přesnou chybu. Ověřte, že uživatel je aktivní a proces je aktivní nebo úmyslně archivovaný. Screenshoty nesmí obsahovat nesouvisející osobní údaje.

Chraňte schválenou provozní pravdu. U chráněné žádosti může živý proces zůstat beze změny, dokud návrh čeká. Nejde o neúspěšné uložení. Nikdy nemažte approval řádek, neodstraňujte orphan indikátor ani přímo nepřepisujte vlastníka.

## Postup krok za krokem

### 1) Potvrďte očekávaný záznam a cestu

Otevřete registr Procesy běžnou navigací. Potvrďte jazyk a reprodukujte stejné hledání, filtry, pohled, řazení, skupinu a stránku z URL. Před smazáním filtrů je zaznamenejte. Workspace oddělení používá uzamčený filtr oddělení; vlastník z jiného oddělení nepřesouvá proces mimo jeho Vlastnické oddělení.

### 2) Odlište scope kolekce od odpovědnosti za řádek

Zjistěte, zda má uživatel běžné čtecí oprávnění, je přiřazený Vlastník procesu nebo aktivní vedoucí Vlastnického oddělení. Přiřazení vlastníka dává record-specific přístup k aktivnímu procesu. Nedává obecnou administraci registru, archive/restore ani neomezený přístup k propojeným záznamům. Platform admin nemá implicitní business access.

### 3) Zkontrolujte stav odpovědnosti

Ověřte, že proces zobrazuje čitelné jméno Vlastníka procesu a Vlastnické oddělení, nikdy raw číselný identifikátor. Po deaktivaci vlastníka zůstává původní vztah jako evidence a proces přejde do orphan governance. Nové přiřazení musí být explicitní. Historickou identitu nelze potichu nahradit jinou osobou.

### 4) Klasifikujte čekající stav

Aktivní proces může mít čekající změnu odděleně od lifecycle Active nebo Archived. Dokud řízená business změna čeká, běžné editace jsou uzamčené, ale schválené hodnoty zůstávají provozní. Žadatel a oprávnění schvalovatelé mohou vidět permission-scoped návrh. Ostatní čtenáři nesmí získat skryté field, link nebo identity details.

Proces s CIF je chráněný, pokud je CIF současný nebo navrhovaný stav. Je-li pevný scénář zapnutý, chráněné vytvoření, business update, relationship změna a archivace vyžadují důvod a nezávislé schválení nakonfigurovaným Risk Managerem nebo CRO. Restore zůstává privilegovaná přímá akce. Skutečná změna Vlastníka procesu nebo Vlastnického oddělení používá samostatný scénář změny odpovědnosti.

### 5) Shromážděte evidenci beze změny stavu

Zaznamenejte identifikátor žádosti, status, žadatele, čas vytvoření, bezpečný resource label, scenario label a bezpečný before/after náhled. Pokud existuje correlation ID, použijte jej pro activity a notification evidenci. Vypnutá preference potlačí doručení události, ale neodstraní položku ze Schvalování nebo Mých žádostí.

### 6) Předejte správnému vlastníkovi

Otázky k obsahu směrujte na Vlastníka procesu nebo governance tým. Otázky k eligibility schvalovatele či konfiguraci scénáře předávejte CRO. Problémy s aktivací identity a rolí řeší platform administration. Reprodukovatelnou chybu API, UI, lokalizace nebo projekce předejte engineeringu s minimálním balíčkem evidence.

## Ověření po změně

- Uživatel je aktivní a používá očekávaný jazyk a prostředí.
- Hledání a filtry reprodukují hlášený výsledek.
- Vlastník procesu a Vlastnické oddělení odpovídají kanonickým vztahům.
- Vlastník z jiného oddělení nemění Vlastnické oddělení.
- Čekající změna je oddělená od lifecycle stavu.
- Schválené hodnoty procesu zůstávají během čekání beze změny.
- Autorizovaný uživatel najde žádost ve Schvalování nebo Mých žádostech.
- Neuniká raw identifikátor ani skrytý štítek propojeného záznamu.
- Potlačení notifikace není zaměněno za chybějící workflow položku.
- Nebyl použit admin bypass ani účelové zvýšení business role.

## Rollback

Diagnostika nemění business data, takže běžný rollback znamená zavřít diagnostické obrazovky a odebrat pouze dočasný support přístup udělený schváleným administrativním postupem. Pokud administrátor při samostatně autorizovaném recovery změnil session nebo identitu, vraťte jen tuto konkrétní administrativní změnu a evidujte důvod.

Proces nikdy nevracejte přímým přepisem databáze nebo smazáním návrhu. Žadatel může oprávněnou čekající žádost zrušit. Zamítnutá nebo stale žádost zůstává evidencí. Schválenou změnu lze změnit pouze novou odpovídající akcí.

## Troubleshooting

### Proces je nahoře viditelný, ale chybí v oddělení

Porovnejte kanonické Vlastnické oddělení s otevřeným workspace. Výběr vychází z organizačního vlastnictví, ne z domovského oddělení Vlastníka procesu. Uzamčený filtr nelze chápat jako běžný odstranitelný filtr.

### Přiřazený vlastník nemůže upravovat

Ověřte aktivní proces, aktuální assignment, vyřešený orphan stav a absenci čekající změny. Potom ověřte backend-projected row capability. Oprávnění neodvozujte pouze z viditelného tlačítka.

### Uložení vytvoří žádost místo změny

Zjistěte, zda je proces chráněný, mění se odpovědnost nebo existuje chráněný linked dopad. Potvrďte zadaný důvod a najděte žádost v Mých žádostech. To je úspěšný governed intake.

### Nepřišla notifikace

Zkontrolujte dvě preference řízených žádostí a delivery evidenci. Viditelnost ve frontě ověřte zvlášť. Preference nikdy neskryjí required-work count ani approval stav.

## Eskalace a předání

Předejte prostředí, uživatele, role, F-kód a název, Vlastnické oddělení, očekávanou akci, přesné filtry, URL, request ID, stav, scénář, timestamp, correlation ID a redigovaný screenshot. Označte kategorii: access scope, odpovědnost, protected intake, approval resolution, doručení notifikace, lokalizace nebo display.

Okamžitě eskalujte, pokud se schválená pravda změní před approval, funguje self-approval, pending creation vstoupí do exportu či counts, unikne skrytá identita nebo admin může měnit proces jen díky platform roli.

## Související dokumentace

- [Podpora schvalování](./approvals.md)
- [Podpora oddělení](./departments.md)
- [Konfigurace Risk Hub](./riskhub-config.md)
- [Admin onboarding](./getting-started.md)
- [Index admin dokumentace](./README.md)
