# Schvalování a řízení

> **Cílová skupina**: Administrátoři, CRO, Risk Manager

---

## Přehled

RiskHub implementuje princip čtyř očí (four-eyes principle) pro citlivé operace. Tato kapitola vysvětluje schvalovací workflow a pravidla.

---

## Kdy je vyžadováno schválení

### Pro neprivilegované uživatele

| Akce | Vyžaduje schválení |
|------|-------------------|
| Smazání rizika/kontroly/KRI | Vždy |
| Změna vlastníka | Vždy |
| Změna oddělení | Vždy |
| Změna kategorie rizika | Vždy |
| Snížení priority rizika | Vždy |
| Jakákoli úprava prioritního rizika | Vždy |

### Pro privilegované uživatele

Privilegovaní uživatelé (CRO, Risk Manager) provádějí změny okamžitě bez schválení.

---

## Stavy žádostí

```
PENDING ──────────> APPROVED
    │                   
    │──────────────> REJECTED
    │
    └──────────────> CANCELLED
```

### Popis stavů

| Stav | Popis |
|------|-------|
| PENDING | Čeká na schválení |
| PENDING_PRIVILEGED | Vyžaduje privilegované schválení |
| APPROVED | Schváleno a provedeno |
| REJECTED | Zamítnuto, změny neprovedeny |
| CANCELLED | Zrušeno žadatelem |

---

## Dvouúrovňový model schvalování

### Primární schvalovatelé

Pro běžné žádosti:
- Vlastník rizika/kontroly
- Vedoucí oddělení

### Privilegovaní schvalovatelé

Pro citlivé žádosti (vysoké skóre, prioritní rizika):
- CRO
- Risk Manager

### Kdy je vyžadováno privilegované schválení

- Net score rizika ≥ práh (výchozí: 16)
- Prioritní riziko
- Kontrola propojená s vysokým rizikem

---

## Pravidla schvalování

### Zákaz vlastního schválení

Uživatel nemůže schválit vlastní žádost - to je základní princip čtyř očí.

### Zrušení žádosti

Pouze žadatel může zrušit svou čekající žádost.

---

## Monitoring schválení

### Přehled Workflow

1. Přejděte do **Workflow**
2. Zobrazí se tři záložky:
   - **Fronta čekajících** - Žádosti k vašemu schválení
   - **Moje žádosti** - Vaše odeslané žádosti
   - **Historie** - Archiv všech žádostí

### Schválení žádosti

1. Klikněte na žádost
2. Zkontrolujte navrhované změny
3. Klikněte na **Schválit** nebo **Zamítnout**
4. Zadejte poznámky k rozhodnutí (povinné)

---

## Auditní stopa

Všechny akce schvalování jsou zaznamenány v auditní stopě včetně:
- Kdo podal žádost
- Kdo schválil/zamítl
- Kdy bylo rozhodnuto
- Poznámky k rozhodnutí

---

*Pro technické detaily viz `/docs/BUSINESS_LOGIC.md`.*
