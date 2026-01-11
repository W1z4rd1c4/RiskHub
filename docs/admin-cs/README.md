# Příručka administrátora RiskHub

> **Verze**: 1.0  
> **Poslední aktualizace**: 2026-01-11  
> **Cílová skupina**: CRO, Administrátoři, Risk manažeři

---

## Úvod

Vítejte v Příručce administrátora RiskHub. Tato dokumentace poskytuje kompletní návod pro konfiguraci, správu a údržbu vašeho nasazení RiskHub.

RiskHub je platforma pro řízení podnikových rizik navržená pro pojišťovny, která organizacím umožňuje:
- Spravovat rizika, kontroly a klíčové indikátory rizik (KRI)
- Vynucovat řízení přístupu na základě rolí a schvalovací workflow
- Generovat reporty pro regulatorní požadavky
- Udržovat kompletní auditní stopy pro všechny systémové aktivity

---

## Rychlé odkazy

| Příručka | Popis |
|----------|-------|
| [Začínáme](./getting-started.md) | Prvotní nastavení, navigace a úvodní konfigurace |
| [Konfigurace Risk Hubu](./riskhub-config.md) | Systémové prahy, typy rizik, schvalovací pravidla a notifikace |
| [Správa uživatelů](./user-management.md) | Přidávání uživatelů, role, oddělení a rozsahy přístupu |
| [Správa oddělení](./departments.md) | Vytváření oddělení, hierarchie a zpracování osiřelých položek |
| [Schvalování a řízení](./approvals.md) | Pochopení a správa schvalovacích workflow |
| [Zprávy a exporty](./reports.md) | Dostupné zprávy, PDF/Excel exporty a auditní stopy |

---

## Přehled řízení přístupu na základě rolí

RiskHub implementuje sofistikovaný systém řízení přístupu na základě rolí (RBAC):

### Privilegovaní uživatelé (globální přístup)
Uživatelé s celoorganizační viditelností a oprávněním schvalovat:
- **CRO** – Chief Risk Officer (jediná role, která může konfigurovat Risk Hub)
- **CEO, CFO** – Vrcholový management
- **Risk Manager** – Primární řízení rizik
- **Compliance, Legal, Internal Audit, Actuarial** – Governance funkce

### Neprivilegovaní uživatelé (omezení na oddělení)
Uživatelé s přístupem omezeným na přiřazené oddělení:
- **Department Head** – Spravuje rizika oddělení a schválení
- **Employee** – Zobrazení a odesílání dat za své oddělení

### Speciální role
- **Administrator** – Pouze správa platformy (uživatelé, logy, zdraví systému) – **bez přístupu k business datům**
- **Viewer** – Přístup pouze pro čtení v povolených oblastech

---

## Systémové požadavky

RiskHub je nasazen jako kontejnerizovaná aplikace:

| Komponenta | Požadavek |
|------------|-----------|
| **Docker** | Verze 20.10+ |
| **PostgreSQL** | Verze 14+ |
| **Prohlížeč** | Chrome, Firefox, Edge (nejnovější verze) |
| **Síť** | HTTPS (TLS 1.2+) |

---

## Podpora

Pro technickou pomoc kontaktujte svého systémového administrátora nebo nahlédněte do technické dokumentace v hlavním adresáři `/docs`.

---

*© 2026 RiskHub. Všechna práva vyhrazena.*
