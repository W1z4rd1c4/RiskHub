---
title: Uživatelský manuál RiskHub
version: "2.4"
last_updated: "2026-04-25"
audience: user
source_of_truth: "docs/BUSINESS_LOGIC.md"
summary: "Produkční manuály pro každodenní práci v RiskHubu: navigace, oprávnění, workflow (schvalování), exporty a troubleshooting."
tags:
  - overview
  - onboarding
  - workflow
  - approvals
  - notifications
  - troubleshooting
  - settings
---
# Uživatelský manuál RiskHub

**Na této stránce**
- [Pro koho je tento manuál](#pro-koho-je-tento-manual)
- [Začněte tady](#zacnete-tady)
- [Manuály podle oblasti](#manualy-podle-oblasti)
- [Manuály podle úkolu](#manualy-podle-ukolu)
- [Jak vaše role ovlivňuje zobrazení](#jak-vase-role-ovlivnuje-zobrazeni)
- [Jak používat čtečku manuálů](#jak-pouzivat-ctecku-manualu)
- [Jak vyhledávat a filtrovat manuály](#jak-vyhledavat-a-filtrovat-manualy)
- [Jak požádat o pomoc](#jak-pozadat-o-pomoc)
- [Co se nedávno změnilo](#co-se-nedavno-zmenilo)
- [Související manuály](#souvisejici-manualy)

## Pro koho je tento manuál

Tento manuál je pro běžné uživatele RiskHubu: vlastníky rizik, vlastníky kontrol, reportery KRI, vedoucí oddělení, CRO týmy, reviewery a uživatele jen pro čtení. Vysvětluje používání produktu, ne jeho technické provedení.

Použijte ho, když potřebujete vědět kam jít, co stisknout, co ověřit před akcí a jak výsledek vysvětlit další osobě. Platform administrátoři mají samostatné admin runbooky.

## Začněte tady

Pokud jste noví, přečtěte [Začínáme](./getting-started.md), potom otevřete [Dashboard](./dashboard.md), [Správa rizik](./risks.md), [Správa kontrol](./controls.md) a [KRI](./kris.md). Potom si projděte [Notifikace a schvalování](./notifications.md), abyste věděli, proč některé změny čekají na review.

Dobrá první session je jednoduchá: ověřte profil, otevřete očekávané oblasti v menu, vyčistěte filtry, otevřete známý záznam a zkontrolujte vazby a aktivitu.

První týden používejte hlavně k vytvoření správných návyků. Při otevření záznamu si před změnou přečtěte vlastníka, oddělení, stav, navázané záznamy a poslední aktivitu. Po uložení zůstaňte na stránce dost dlouho na to, abyste viděli, zda se změna použila hned, nebo šla do review. Tím předejdete většině duplicitních úprav a zbytečných support požadavků.

## Manuály podle oblasti

- [Dashboard](./dashboard.md): aktuální posture a reporting signály.
- [Rizika](./risks.md): registr rizik a evidence.
- [Kontroly](./controls.md): mitigation kontroly a provedení.
- [KRI](./kris.md): indikátory, hodnoty a warning signály.
- [Nálezy](./issues.md): remediation, výjimky a uzavření.
- [Dodavatelé](./vendors.md): třetí strany a navázaná práce.
- [Oddělení](./departments.md): expozice podle organizační oblasti.
- [Governance](./governance.md): chybějící ownership nebo kontext.
- [Správa přístupů](./access-management.md): uživatelé, adresář a lifecycle účtů.
- [Activity Log](./activity-log.md): kdo co změnil a kdy.
- [Risk Hub](./risk-hub.md): business nastavení risk managementu.

## Manuály podle úkolu

Pokud nevidíte stránku, začněte [Začínáme](./getting-started.md) a [Správa přístupů](./access-management.md). Pokud se změna neprojevila, čtěte [Notifikace a schvalování](./notifications.md). Pokud potřebujete evidenci, použijte [Dashboard](./dashboard.md), [Activity Log](./activity-log.md) a manuál pro příslušný typ záznamu.

U dodavatelské práce začněte [Dodavatelé](./vendors.md), potom pokračujte na rizika, kontroly, KRI nebo nálezy. U dotazníků začněte [Risk Hub](./risk-hub.md), pokud je posíláte nebo reviewujete, a [Správa rizik](./risks.md), pokud odpovídáte z detailu rizika.

## Jak vaše role ovlivňuje zobrazení

RiskHub ukazuje stránky, záznamy, tlačítka a záložky podle role, rozsahu oddělení, ownership a aktuálního stavu záznamu. Chybějící tlačítko často znamená, že akce teď není dostupná. Chybějící záznam často znamená, že je potřeba zkontrolovat filtry nebo rozsah.

Nepoužívejte screenshot jiného uživatele jako důkaz, že vaše obrazovka je chybná. Různí uživatelé mohou správně vidět různá data. Vždy porovnejte název záznamu, vlastníka, oddělení, stav a filtry.

Role neovlivňuje jen to, zda stránka existuje v menu. Může ovlivnit také zobrazené řádky, viditelnost navázaných záznamů, dostupnost archivace nebo obnovení a dostupnost workflow akce v daný okamžik. Záznam se také může objevit nebo zmizet, pokud se změní ownership, oddělení, stav nebo navázaný kontext.

## Jak používat čtečku manuálů

Otevřete kartu manuálu, použijte seznam sekcí nahoře a pokračujte odkazy na související manuály. Cesty jako `/risks` jsou uvedené jen tehdy, když pomáhají s navigací. Čtečka je navržená pro pracovní postup: přečíst sekci, provést akci a vrátit se k souvisejícímu manuálu, pokud práce přechází mezi moduly.

Manuály se záměrně vyhýbají implementačním detailům. Pokud potřebujete provozní nebo platform podporu, použijte admin runbooky nebo kontaktujte platform administrátora.

Každý manuál má stejný tvar, abyste se v něm rychle orientovali: s čím stránka pomůže, co ověřit před začátkem, kde ji najít, co můžete vidět nebo měnit, běžné úkoly, schvalování, exporty, časté chyby, troubleshooting a související manuály. Jakmile se naučíte jednu stránku, ostatní budou působit podobně.

## Jak vyhledávat a filtrovat manuály

Tagy používejte pro zúžení knihovny podle tématu. Začněte filtrem All, potom vyberte modul jako risks, controls, vendors nebo access. Pro auditní práci kombinujte modulové manuály s Activity Logem a Notifikacemi.

Na stránce hledejte business slova: owner, approval, export, vendor, questionnaire, break-glass, closure nebo evidence. Technické identifikátory používejte jen tehdy, když si je výslovně vyžádá podpora.

## Jak požádat o pomoc

Užitečný požadavek obsahuje vaši roli, cestu v aplikaci, název nebo kód záznamu, použité filtry, provedenou akci, přesnou zprávu na obrazovce a čas. Pokud se věc týká schvalování, uveďte, zda jste kontrolovali Schvalování a Notifikace.

Sdílejte jen nezbytné důkazy. Pokud screenshot obsahuje osobní nebo citlivé business informace, ořízněte ho na relevantní část a použijte schválený kanál.

U opakovaných problémů si zapište přesné kroky, které jste provedli. Uveďte, zda se chování opakuje po obnově stránky, zda ho vidí i jiný uživatel a zda má záznam čekající schválení nebo notifikace. Podpoře to pomůže rozlišit skutečný produktový problém od starého filtru, chybějícího přístupu nebo rozpracovaného workflow.

Když si nejste jistí, začněte vždy od business otázky: který záznam hledám, proč ho potřebuji změnit, kdo je vlastník a jaký důkaz má po změně zůstat. Tato jednoduchá kontrola funguje napříč riziky, kontrolami, KRI, dodavateli i nálezy.

## Co se nedávno změnilo

Manuály nyní popisují aktuální chování RiskHubu: adresářové lifecycle akce uživatelů, dočasný break-glass pro způsobilé externí účty, vazby mezi riziky/kontrolami/KRI/dodavateli, compare a upřesnění u dotazníků, bezpečné governance řešení, dostupnost snapshotů v quarterly comparison a srozumitelnější chování log settings v admin konzoli.

Změnil se také jazyk. Místo technické reference jde o uživatelský manuál, který pomáhá dokončit práci bez znalosti interní implementace.

## Související manuály

Začněte [Začínáme](./getting-started.md), pokračujte na [Dashboard](./dashboard.md), [Rizika](./risks.md), [Kontroly](./controls.md), [KRI](./kris.md) a [Notifikace](./notifications.md). Při nečekaném chování použijte [FAQ](./faq.md).
