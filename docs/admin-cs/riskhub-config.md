# Konfigurace Risk Hub

> **Cílová skupina**: CRO (Chief Risk Officer)  
> **Přístup**: Pouze CRO role

---

## Přehled

Sekce konfigurace Risk Hub je přístupná výhradně pro roli CRO. Zde můžete konfigurovat systémové prahy, typy rizik, schvalovací pravidla a notifikace.

---

## Prahy hodnocení rizik

### Minimální hodnoty čistého skóre

| Úroveň | Výchozí hodnota | Popis |
|--------|-----------------|-------|
| Kritické riziko | 20 | Net score ≥ tato hodnota = kritické |
| Vysoké riziko | 10 | Net score ≥ tato hodnota = vysoké |
| Střední riziko | 5 | Net score ≥ tato hodnota = střední |

### Nastavení prahů

1. Přejděte do **Risk Hub** → **Konfigurace**
2. Upravte prahy dle potřeby vaší organizace
3. Klikněte na **Uložit změny**

> [!WARNING]
> Změny prahů ovlivní okamžitě klasifikaci všech existujících rizik.

---

## Typy rizik

Předdefinované typy rizik:
- **Operační** - Operační procesy a postupy
- **Finanční** - Finanční dopady a ztráty
- **Regulatorní** - Soulad s regulací
- **Strategické** - Strategická rozhodnutí
- **Reputační** - Reputace organizace

---

## Pravidla schvalování

### Parametry schvalování

| Parametr | Výchozí | Popis |
|----------|---------|-------|
| Práh privilegovaného schválení | 16 | Net score rizika, nad kterým je vyžadováno privilegované schválení |
| Povolit vlastní schválení | Ne | Zda může uživatel schválit vlastní žádost |

---

## Notifikace

### Typy notifikací

- **KRI termíny** - Upozornění na blížící se odesílání hodnot
- **Schválení** - Nové žádosti o schválení
- **Překročení limitů** - Překročení prahových hodnot KRI

### Nastavení e-mailů

1. Přejděte do **Risk Hub** → **Notifikace**
2. Nakonfigurujte SMTP server
3. Nastavte šablony e-mailů

---

## Rotace logů

### Nastavení pro typy logů

| Log | Velikost rotace | Počet uchování |
|-----|-----------------|----------------|
| Aplikační log | 10 MB | 5 souborů |
| Auditní log | 50 MB | 10 souborů |

---

## Globální konfigurace

### Celková hodnota aktiv

Pro výpočet finančních dopadů u hodnocení rizik:
- Nastavte celkovou hodnotu aktiv vaší organizace
- Dopady Medium a Low budou počítány jako procenta z této hodnoty

---

*Pro technické detaily viz dokumentaci nasazení.*
