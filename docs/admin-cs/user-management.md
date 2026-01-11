# Správa uživatelů

> **Cílová skupina**: Administrátoři, CRO

---

## Přehled

Správa uživatelů umožňuje přidávat, upravovat a deaktivovat uživatele, přiřazovat role a oddělení, a konfigurovat rozsahy přístupu.

---

## Přidání uživatele

### Ruční vytvoření

1. Přejděte do **Správa přístupu** → **Uživatelé**
2. Klikněte na **Nový uživatel**
3. Vyplňte formulář:
   - **Jméno** (povinné)
   - **E-mail** (povinné)
   - **Role** (povinné)
   - **Oddělení** (volitelné pro privilegované role)
4. Klikněte na **Vytvořit**

### Synchronizace z Active Directory

1. Přejděte do **Správa přístupu** → **Synchronizace AD**
2. Nakonfigurujte připojení k AD
3. Spusťte synchronizaci

---

## Role a oprávnění

### Privilegované role (globální přístup)

| Role | Oprávnění |
|------|-----------|
| CRO | Konfigurace systému, plná autorita |
| CEO | Exekutivní dohled, čtení všeho |
| CFO | Finanční dohled, čtení všeho |
| Risk Manager | Plná správa rizik/kontrol/KRI |
| Compliance | Čtení + schválení |
| Internal Audit | Auditní přístup |

### Neprivilegované role (oddělení)

| Role | Oprávnění |
|------|-----------|
| Department Head | Správa oddělení, schvalování |
| Employee | Čtení oddělení, odesílání hodnot |

### Speciální role

| Role | Oprávnění |
|------|-----------|
| Administrator | Správa platformy, bez business dat |
| Viewer | Pouze čtení |

---

## Rozsahy přístupu

| Rozsah | Popis |
|--------|-------|
| Global | Všechna data napříč organizací |
| Department | Pouze data přiřazeného oddělení |
| Manager | Data oddělení plus řízená oddělení |

---

## Deaktivace uživatele

1. Přejděte do **Správa přístupu** → **Uživatelé**
2. Najděte uživatele
3. Klikněte na **Deaktivovat**

> [!WARNING]
> Deaktivovaní uživatelé se nemohou přihlásit, ale jejich historická data zůstávají zachována.

---

## Matice oprávnění

Podrobná matice oprávnění je dostupná v technické dokumentaci `/docs/BUSINESS_LOGIC.md`.

---

*Pro technické detaily viz dokumentaci API.*
