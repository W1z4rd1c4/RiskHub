---
title: Správa dodavatelů
version: "2.4"
last_updated: "2026-03-15"
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

## Přehled

Sekce Dodavatelé je nyní základní registr třetích stran. Slouží k tomu, abyste věděli:

- kdo vlastní vztah s dodavatelem
- jaký proces a oddělení dodavatel podporuje
- jaká je klasifikace a risk score dodavatele
- která enterprise rizika, kontroly a KRI jsou na dodavatele navázaná

Hlavní route: `/vendors`

## Kde to najdete

- seznam dodavatelů: `/vendors`
- detail: otevřete řádek dodavatele v registru
- založení: `/vendors/new`

Potřebná oprávnění:

- `vendors:read` pro zobrazení registru a detailu
- `vendors:write` pro vytvoření nebo úpravu záznamu
- `vendors:delete` pro archivaci nebo obnovu, pokud ownership pravidla nepovolí akci i bez něj

### Co obsahuje záznam dodavatele

Základní vendor data zahrnují:

- identitu: název, právní název, registraci, zemi, web
- ownership: oddělení, outsourcing owner, proces, podproces
- klasifikaci: typ dodavatele, risk score, DORA relevance, významnost, nahraditelnost
- lifecycle: aktivní/neaktivní stav, archivace/obnova
- vazby: navázaná rizika, navázané kontroly a navázaná KRI

Detail dodavatele je jeden základní pohled. Obsahuje:

- header a lifecycle akce
- summary surface pro risk score, status, exposure a vendor flags
- summary karty pro klasifikaci, ownership a vazby
- vloženou sekci navázaných KRI se stejným card-grid a archived grouping přístupem jako u navázaných rizik a kontrol
- vloženou sekci navázaných rizik se stejným section chrome a card-grid interakčním modelem jako detail rizika
- vloženou sekci navázaných kontrol se stejným action barem, gauge kartami a archived grouping pattern jako detail rizika
- kontextové založení Issue přímo z detailu dodavatele

## Role, scope a viditelnost

Detail dodavatele je jednodušší než Rizika nebo Nálezy, ale stále respektuje backend RBAC a scope pravidla.

- `vendors:read` je nutné pro otevření registru i detailu dodavatele
- `vendors:write` dovoluje plnou editaci vendor záznamu a vendor vazeb
- ownership pravidla mohou některé mutační akce povolit i bez širšího vendor-admin oprávnění
- nefiltrované scoped pohledy mohou obsahovat dodavatele, které přímo vlastníte napříč odděleními, ale explicitní filtr oddělení je striktní a ukazuje jen dodavatele v daném oddělení
- akční tlačítka používají backend capability metadata, pokud jsou dostupná, takže dostupnost archivace, obnovy, editace a linkování neurčují jen lokální předpoklady o roli
- navázaná rizika jsou dál scope-filtrovaná samostatně, takže uživatel může vidět dodavatele i tehdy, když část navázaných rizik na stránce chybí
- navázané kontroly se také filtrují podle běžných pravidel viditelnosti kontrol ještě před vykreslením card gridu
- navázaná KRI se filtrují podle stejného read scope a ownership pravidel jako registr KRI, takže nečitelná KRI na detailu a v grupovaných pohledech chybí

Na stránce se to projevuje takto:

- `Link Existing` a `Manage Existing Links` se zobrazí jen tehdy, když uživatel může měnit vendor vazby
- `Add Risk` se zobrazí jen tehdy, když uživatel umí upravit vendor kontext a zároveň zakládat rizika
- `Add Control` se zobrazí jen tehdy, když uživatel umí upravit vendor kontext a zároveň zakládat kontroly
- `Add KRI` se zobrazí jen tehdy, když uživatel umí upravit vendor kontext a zároveň zakládat KRI (`risks:write`)
- `Link Existing` pro KRI se zobrazí jen tehdy, když uživatel může měnit vendor vazby a může číst cílová KRI
- detail dodavatele nikdy nesmí prozradit názvy nečitelných rizik, kontrol nebo KRI jen kvůli countům nebo layoutu

## Datový model a klíčová pole

Vendor záznam je nyní základní registr, ne workflow kontejner. Udržujte správně zejména tato pole:

- identita: název dodavatele, právní název, registrace, země, web
- ownership: outsourcing owner, oddělení, proces, podproces
- klasifikace: typ dodavatele, risk score, DORA relevance, flag významného dodavatele, nahraditelnost, flag alternativních providerů
- lifecycle: aktivní/neaktivní stav a akce archivace nebo obnovy
- vazby: enterprise rizika, mitigující kontroly a monitorovací KRI navázané na dodavatele

Navázané sekce teď používají bohatší summary data:

- karty navázaných rizik ukazují risk code, risk type, gross score, net score, proces, oddělení a priority marker
- karty navázaných kontrol používají stejný gauge-style summary jako detail rizika včetně monitoring status, frequency a risk level
- karty navázaných KRI ukazují monitoring status, due-date kontext, hodnotu a metadata souvisejícího rizika používaná v registru KRI a na detailu dodavatele
- archivované vazby zůstávají viditelné v oddělených sekundárních skupinách, aby se neztratil historický kontext

## Hlavní workflow

### 1. Vytvoření nebo úprava dodavatele

Create/edit použijte pro údržbu vendor master dat:

- nastavte správné oddělení a outsourcing ownera
- zadejte vendor type a risk score
- označte DORA relevanci a významnost, pokud je to potřeba
- udržujte proces a podproces aktuální

### 2. Navázání expozice

Pomocí navázaných rizik, kontrol a KRI propojte dodavatele s enterprise risk posture:

- použijte **Link Existing** pro navázání existujících rizik, kontrol nebo KRI
- použijte **Add Risk**, **Add Control** nebo **Add KRI** pro založení nového záznamu přímo z detailu dodavatele
- aktivní a archivované vazby uvidíte v oddělených vizuálních skupinách
- přes **Manage Existing Links** odstraňujte zastaralé vazby, když už neplatí

### 2a. Grupování dodavatelů podle flagů

Registr dodavatelů nyní podporuje i grupovaný pohled **By Flag**:

- `DORA relevant`
- `Supports core function`
- `Significant vendor`
- `Insignificant vendors` pro dodavatele bez těchto tří flagů

Jde o multi-membership grupování:

- jeden dodavatel může být ve více skupinách současně
- dodavatel bez aktivních flagů se zobrazí jen v `Insignificant vendors`

### 2b. Grupované pohledy podle dodavatele v dalších modulech

Rizika, Kontroly, Issues a KRI nyní podporují grupovaný pohled **By Vendor**.

Použijte ho, když chcete rychle zjistit:

- která rizika se koncentrují kolem jednoho dodavatele
- které kontroly mitigují expozici pro konkrétního dodavatele
- které issues jsou otevřené v kontextu konkrétního dodavatele
- která KRI monitorují vendor-related expozici

### 3. Vytvoření nového rizika, kontroly nebo KRI z detailu dodavatele

Detail dodavatele nyní podporuje routed create-from-vendor flow:

- **Add Risk** otevírá plný formulář pro riziko na `/risks/new?vendor_id=:id&return_to=/vendors/:id`
- **Add Control** otevírá plný formulář pro kontrolu na `/controls/new?vendor_id=:id&return_to=/vendors/:id`
- **Add KRI** otevírá plný formulář pro KRI na `/kris/new?vendor_id=:id&return_to=/vendors/:id`
- po uložení se vrátíte na detail dodavatele a nový záznam už je na dodavatele navázaný
- po vytvoření se vrátíte na detail dodavatele s potvrzovacím bannerem a přímým odkazem na nový záznam
- vendor-context create pro KRI nechává parent risk povinný a ve výchozím stavu filtruje krok výběru rizika jen na rizika navázaná na daného dodavatele
- pokud zvolíte riziko, které navázané není, formulář vás vyzve k navázání rizika nebo k pokračování bez něj
- pokud zvolíte **Navázat riziko a pokračovat**, backend vytvoří chybějící vendor-risk vazbu i KRI v jedné transakci
- pokud přiřazení dodavatele nebo požadované navázání rizika selže, KRI se částečně nevytvoří; formulář zůstane otevřený a ukáže blokující chybu

Create tlačítka respektují běžná oprávnění:

- musíte mít možnost upravit vazby dodavatele
- a zároveň potřebujete `risks:write` nebo `controls:write` pro odpovídající create akci

### 3a. Přiřazení dodavatelů přímo ve formuláři KRI

Formulář KRI nyní podporuje přiřazení dodavatelů i mimo detail dodavatele:

- formulář obsahuje multi-select sekci **Navázaní dodavatelé**
- KRI dál patří přesně jednomu parent riziku
- vazba na dodavatele je sekundární monitoring kontext a může obsahovat více dodavatelů
- při otevření z detailu dodavatele je aktuální dodavatel automaticky zahrnutý do stejného uložení a výběr lze použít pro další dodavatele
- neprivilegované editace KRI, které mění navázané dodavatele, podléhají schvalování jako součást běžného KRI edit requestu

### 4. Založení issue z kontextu dodavatele

Tlačítko **New Issue** na detailu dodavatele použijte tehdy, když vendor problém potřebuje formální tracking.

Issue zůstává součástí domény Issues. Kontext dodavatele slouží jen pro předvyplnění vazby a navigace.

### 5. Archivace a obnova

Archivujte dodavatele, kteří už nemají být v aktivních provozních pohledech, ale mají zůstat historicky dohledatelní.

Typické důvody:

- vztah skončil
- dodavatel už není v scope
- záznam byl nahrazen jiným aktivním vendor záznamem

## Schvalování a notifikace

Samotná vendor stránka už neprovozuje samostatný schvalovací workflow. Je to záměrná produktová hranice.

- create/edit dodavatele používá standardní vendor permission model
- create-from-vendor pro rizika, kontroly a KRI používá běžné routed formuláře
- pokud nově založené riziko, kontrola nebo KRI v dané doméně podléhá schválení, platí to dál v té doméně
- detail dodavatele řeší jen návrat po create, confirmation banner a správu existujících vazeb na rizika, kontroly a KRI

Prakticky to znamená:

- schvalování patří do Rizik, Kontrol, Nálezů nebo Governance, pokud ho daná doména vyžaduje
- detail dodavatele zůstává čistou provozní plochou pro ownership, klasifikaci a vazby na expozici
- vendor problémy, které potřebují formální remediation, mají být založené jako Issues, ne jako vendor-only workflow záznamy
- aktuální core vendor model neposílá vendor-specifické workflow notifikace; pro follow-up kontext používejte Issues, navázaná rizika a navázané kontroly

## Filtry, pohledy a exporty

Registr dodavatelů podporuje:

- vyhledávání
- filtrování podle stavu
- filtrování podle typu dodavatele
- groupované pohledy respektující viditelnost navázaných rizik
- grupovaný pohled `By Flag` pro DORA, core-function, significant a insignificant bucket
- export z registru dodavatelů

Exporty nyní obsahují pouze zachovaná základní vendor pole.
Specializované annual a DORA vendor reporty mohou nabídnout filtr oddělení. Když vyberete oddělení, export je striktní pro toto oddělení; dodavatelé, které vlastníte v jiném oddělení, se do evidence souboru nepřidají. Pokud nelze zjistit jméno ownera, UI zobrazí neznámého uživatele místo číselného user id.

## Časté chyby

- Používat vendor záznam jako workflow engine místo čistého registru.
- Nechat prázdného ownera, oddělení nebo proces.
- Zapomenout, že **Add Risk**, **Add Control** a **Add KRI** vás po vytvoření vrátí zpět na detail dodavatele.
- Nechat zastaralé risk/control vazby po změně vztahu.
- Zakládat duplicity místo úpravy existujícího záznamu.

## Troubleshooting

### Nemohu dodavatele upravit

Zkontrolujte:

- máte `vendors:write`?
- jste outsourcing owner?
- není záznam v oddělení mimo váš scope?

### Nevidím navázaná rizika

Dodavatel může zůstat viditelný i tehdy, když navázaná rizika vidět nejsou. Obvykle to znamená, že můžete číst dodavatele, ale ne tato rizika v daném scope.

### Potřebuji remediation tracking pro vendor problém

Založte Issue z kontextu dodavatele. Nečekejte samostatný remediation workflow přímo v detailu dodavatele.

## Související dokumentace

- [Začínáme](./getting-started.md)
- [Workflow, schvalování, notifikace](./notifications.md)
- [Správa rizik](./risks.md)
- [Správa kontrol](./controls.md)
- [Správa nálezů](./issues.md)
