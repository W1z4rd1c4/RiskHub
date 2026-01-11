# Začínáme s RiskHub

> **Cílová skupina**: Administrátoři a CRO poprvé  
> **Čas na dokončení**: 15-20 minut

---

## Obsah

1. [První přihlášení](#1-první-přihlášení)
2. [Přehled navigace](#2-přehled-navigace)
3. [Pochopení vaší role](#3-pochopení-vaší-role)
4. [Checklist úvodní konfigurace](#4-checklist-úvodní-konfigurace)
5. [Klíčové koncepty](#5-klíčové-koncepty)

---

## 1. První přihlášení

### Přístup do RiskHub

1. Přejděte na URL vašeho RiskHub (např. `https://riskhub.vasefirma.cz`)
2. Zobrazí se přihlašovací obrazovka s demo účty nebo AD integrací
3. Vyberte svůj účet nebo zadejte přihlašovací údaje

### První nastavení pro CRO

Pokud jste CRO (Chief Risk Officer), máte exkluzivní přístup ke konfiguraci Risk Hub:

1. **Přejděte do Risk Hub** v postranním menu (viditelné pouze pro CRO)
2. **Nakonfigurujte prahy** pro hodnocení rizik:
   - Minimální čisté skóre pro vysoké riziko (výchozí: 10)
   - Minimální čisté skóre pro střední riziko (výchozí: 5)
   - Minimální čisté skóre pro kritické riziko (výchozí: 20)
3. **Nastavte typy rizik** a kategorie
4. **Nakonfigurujte nastavení notifikací**

> [!IMPORTANT]
> Pouze role CRO může přistupovat a upravovat konfiguraci Risk Hub. Tím je zajištěna kontrola nad prahy rizik a business pravidly.

---

## 2. Přehled navigace

### Hlavní navigace (posranní menu)

| Položka menu | Popis | Přístup |
|--------------|-------|---------|
| **Dashboard** | Manažerský přehled s grafy a metrikami | Všichni uživatelé |
| **Workflow** | Čekající úkoly a schválení | Všichni uživatelé |
| **Kontroly** | Správa katalogu kontrol | Dle oprávnění |
| **Rizika** | Registr rizik | Dle oprávnění |
| **Rizikový apetit** | Správa KRI a odesílání hodnot | Dle oprávnění |
| **Oddělení** | Struktura oddělení | Všichni (čtení) |
| **Governance** | Dashboard Výboru pro řízení rizik | Privilegovaní |
| **Auditní stopa** | Systémové auditní logy | Pouze Admin |
| **Log aktivit** | Historie business aktivit | Risk Manager, Compliance, Audit |
| **Nastavení** | Uživatelské preference | Všichni |
| **Správa přístupu** | Oprávnění uživatelů | Admin, CRO |
| **Risk Hub** | Konfigurace systému | Pouze CRO |

---

## 3. Pochopení vaší role

### Kategorie rolí

RiskHub organizuje uživatele do tří kategorií:

#### Privilegovaní uživatelé (globální rozsah přístupu)
Tito uživatelé vidí VŠECHNA data napříč organizací a mohou schvalovat/zamítat žádosti:

| Role | Speciální schopnosti |
|------|---------------------|
| CRO | Konfigurace Risk Hub, plná governance autorita |
| CEO, CFO | Exekutivní dohled |
| Risk Manager | Plná správa rizik/kontrol/KRI |
| Compliance | Čtecí přístup + schvalovací autorita |
| Legal | Dohled nad právními riziky |
| Internal Audit | Auditní přístup a revize |
| Actuarial | Kvantitativní analýza rizik |

#### Neprivilegovaní uživatelé (rozsah oddělení)
Tito uživatelé vidí pouze data svého oddělení a vyžadují schválení pro určité akce:

| Role | Oprávnění |
|------|-----------|
| Department Head | Správa rizik oddělení, primární schvalovatel |
| Employee | Odesílání hodnot KRI, logování exekuce kontrol |

---

## 4. Checklist úvodní konfigurace

### Fáze 1: Nastavení uživatelů (Admin)
- [ ] Vytvořit nebo synchronizovat uživatele z Active Directory
- [ ] Přiřadit odpovídající role každému uživateli
- [ ] Přiřadit uživatele k oddělením
- [ ] Nakonfigurovat rozsahy přístupu

### Fáze 2: Struktura oddělení (Admin/CRO)
- [ ] Vytvořit všechna organizační oddělení
- [ ] Přiřadit vedoucí oddělení
- [ ] Ověřit hierarchii oddělení

### Fáze 3: Konfigurace Risk Hub (pouze CRO)
- [ ] Nakonfigurovat prahy hodnocení rizik
- [ ] Nastavit typy a kategorie rizik
- [ ] Nakonfigurovat schvalovací pravidla
- [ ] Nastavit preference notifikací

### Fáze 4: Zadávání dat (Risk Manager)
- [ ] Vytvořit počáteční registr rizik
- [ ] Vytvořit katalog kontrol
- [ ] Propojit kontroly s riziky
- [ ] Vytvořit KRI propojené s riziky
- [ ] Přiřadit vlastníky všem entitám

---

## 5. Klíčové koncepty

### Entity a vlastnictví

RiskHub spravuje tři hlavní typy entit:

```
┌─────────────────────────────────────────────────────────────┐
│                      ODDĚLENÍ                               │
│  manager_id → Vedoucí oddělení                              │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐         ┌──────────┐         ┌─────────┐
    │UŽIVATELÉ│         │  RIZIKA  │         │KONTROLY │
    │ dept_id │         │ owner_id │         │ owner_id│
    └─────────┘         │ dept_id  │         │ dept_id │
                        └──────────┘         └─────────┘
                              │
                              ▼
                        ┌─────────┐
                        │   KRI   │
                        │ risk_id │ (dědí oddělení z Rizika)
                        └─────────┘
```

### Schvalovací workflow

Neprivilegovaní uživatelé vyžadují schválení pro:
- **Mazání** rizik, kontrol nebo KRI
- **Editaci citlivých polí** (vlastník, oddělení, kategorie, priorita)
- **Jakoukoli editaci** prioritních rizik

---

## Další kroky

- [Konfigurace nastavení Risk Hub](./riskhub-config.md)
- [Nastavení uživatelů](./user-management.md)
- [Vytvoření oddělení](./departments.md)

---

*Pro technické nasazení viz hlavní dokumentaci v `/docs`.*
