# Správa oddělení

> **Cílová skupina**: Administrátoři, CRO

---

## Přehled

Oddělení jsou základní organizační jednotkou v RiskHub. Každé riziko, kontrola a uživatel je přiřazen k oddělení.

---

## Vytvoření oddělení

1. Přejděte do **Oddělení**
2. Klikněte na **Nové oddělení**
3. Vyplňte:
   - **Název** (povinné)
   - **Popis** (volitelné)
   - **Vedoucí** (doporučeno)
4. Klikněte na **Vytvořit**

---

## Vedoucí oddělení

### Přiřazení vedoucího

Vedoucí oddělení (Department Head) má speciální oprávnění:
- Vidí všechna data svého oddělení
- Je primárním schvalovatelem pro žádosti oddělení
- Může delegovat úkoly na zaměstnance

### Změna vedoucího

1. Přejděte do **Oddělení** → vyberte oddělení
2. Klikněte na **Upravit**
3. Vyberte nového vedoucího
4. Klikněte na **Uložit**

---

## Osiřelé položky

### Co jsou osiřelé položky?

Když je oddělení deaktivováno nebo když jsou uživatelé odstraněni, mohou vzniknout osiřelé položky:
- Rizika bez vlastníka
- Kontroly bez vlastníka
- KRI bez vlastníka

### Zpracování osiřelých položek

1. Přejděte do **Správa přístupu** → **Osiřelé položky**
2. Zobrazí se seznam položek bez vlastníka
3. Pro každou položku:
   - Přiřaďte nového vlastníka, nebo
   - Archivujte položku

> [!WARNING]
> Osiřelé položky mohou představovat governance riziko. Pravidelně kontrolujte a řešte.

---

## Deaktivace oddělení

### Prerekvizity

Před deaktivací oddělení:
1. Přesuňte nebo archivujte všechna rizika
2. Přesuňte nebo archivujte všechny kontroly
3. Přeřaďte nebo deaktivujte všechny uživatele

### Proces

1. Přejděte do **Oddělení** → vyberte oddělení
2. Klikněte na **Deaktivovat**
3. Potvrďte akci

---

## Hierarchie oddělení

RiskHub podporuje plochou strukturu oddělení. Pro organizační hierarchii použijte:
- Pojmenování oddělení (např. "Finance - Účetnictví")
- Múltiple Department Head role pro jednoho manažera

---

*Pro technické detaily viz dokumentaci datového modelu.*
