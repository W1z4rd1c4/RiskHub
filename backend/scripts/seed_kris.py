import asyncio
import re
import openpyxl
from pathlib import Path
from collections import defaultdict
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.db.session import async_session_maker
from app.models import KeyRiskIndicator, Risk

# Mapping sheet names to database categories
SHEET_TO_CATEGORY = {
    "Neživotní upisovací riziko": "Upisovací riziko",
    "Zdravotní upisovací riziko": "Upisovací riziko",
    "Tržní riziko": "Tržní riziko",
    "Riziko selhání protistrany": "Selhání protistrany",
    "Provozní riziko": "Operační riziko",
}

# General keyword mapping for fallback
KEYWORD_TO_PROCESS = {
    "marketing": "Marketing",
    "it": "IT",
    "finance": "Finance",
    "hr": "Lidské zdroje",
    "personální": "Lidské zdroje",
    "likvidace": "Likvidace pojistných událostí",
}

def safe_float(val, default=0.0):
    if val is None: return default
    try:
        if isinstance(val, (int, float)): return float(val)
        match = re.search(r"[-+]?\d*[\.,]?\d+", str(val))
        if match: return float(match.group().replace(',', '.'))
        return default
    except: return default

async def seed_kris():
    excel_path = Path(__file__).parent.parent.parent / "Register rizik - limity - Q3.xlsx"
    if not excel_path.exists():
        print(f"❌ Excel file not found: {excel_path}")
        return
    
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    
    async with async_session_maker() as session:
        await session.execute(delete(KeyRiskIndicator))
        await session.commit()
        print("   ✓ Cleared existing KRIs")
        
        result = await session.execute(select(Risk))
        risks = list(result.scalars().all())
        
        if not risks:
            print("❌ No risks found.")
            return

        # Group risks by category and process for better matching
        risks_by_cat = defaultdict(list)
        risks_by_proc = defaultdict(list)
        for r in risks:
            if r.category: risks_by_cat[r.category].append(r)
            if r.process: risks_by_proc[r.process].append(r)
        
        # Counters for round-robin distribution
        cat_index = defaultdict(int)
        proc_index = defaultdict(int)
        
        created = 0
        skipped = 0
        
        for sheet_name, db_cat in SHEET_TO_CATEGORY.items():
            if sheet_name not in wb.sheetnames: continue
            
            print(f"📊 Processing: {sheet_name} -> {db_cat}")
            sheet = wb[sheet_name]
            target_risks = risks_by_cat.get(db_cat, [])
            
            for row_idx in range(2, sheet.max_row + 1):
                row = list(sheet.iter_rows(min_row=row_idx, max_row=row_idx, values_only=True))[0]
                if not row or len(row) < 12: continue
                
                risk_desc_raw = str(row[5]) if row[5] else ""
                metric_name = str(row[8]) if row[8] else None
                if not metric_name or metric_name.lower() in ('none', 'metrika'):
                    skipped += 1
                    continue
                
                current_value = safe_float(row[9])
                lower_limit = safe_float(row[10])
                upper_limit = safe_float(row[11], 999999)
                
                # Match strategy:
                # 1. Try to find a risk within the specific category
                # 2. Try to match by process keyword if category lookup failed
                # 3. Use round-robin within category if many risks exist
                # 4. Fallback to a global round-robin if all else fails
                
                matched_risk = None
                
                # Attempt keyword match within target category
                if target_risks:
                    words = risk_desc_raw.lower().split()
                    for word in words:
                        if len(word) > 4:
                            for r in target_risks:
                                if word in r.description.lower():
                                    matched_risk = r
                                    break
                            if matched_risk: break
                    
                    # If no keyword match, use round-robin within category
                    if not matched_risk:
                        idx = cat_index[db_cat] % len(target_risks)
                        matched_risk = target_risks[idx]
                        cat_index[db_cat] += 1
                
                # If still no match, try process keywords
                if not matched_risk:
                    for kw, proc in KEYWORD_TO_PROCESS.items():
                        if kw in risk_desc_raw.lower() or kw in metric_name.lower():
                            proc_risks = risks_by_proc.get(proc)
                            if proc_risks:
                                idx = proc_index[proc] % len(proc_risks)
                                matched_risk = proc_risks[idx]
                                proc_index[proc] += 1
                                break
                
                # Final fallback: global round-robin with tracking
                if not matched_risk:
                    if risks:  # Guard against empty risks list
                        matched_risk = risks[created % len(risks)]
                        print(f"   ⚠ Fallback: KRI '{metric_name[:30]}...' assigned to {matched_risk.risk_id_code}")
                    else:
                        print(f"   ❌ Cannot assign KRI '{metric_name[:30]}...' - no risks available")
                        skipped += 1
                        continue
                
                unit = "%" if (current_value < 2 or "%" in metric_name) else ""
                
                kri = KeyRiskIndicator(
                    risk_id=matched_risk.id,
                    metric_name=metric_name[:200],
                    current_value=current_value,
                    lower_limit=lower_limit,
                    upper_limit=upper_limit,
                    unit=unit,
                )
                session.add(kri)
                created += 1
        
        await session.commit()
        print(f"\n✅ Created: {created} KRIs (distributed across risks)")

if __name__ == "__main__":
    asyncio.run(seed_kris())
