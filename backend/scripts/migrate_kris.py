"""
KRI Migration Script

Migrates Key Risk Indicators from placeholder-kri-source.xlsx to the database.
Links KRIs to existing risks by matching descriptions.

Usage: source venv/bin/activate && PYTHONPATH=. python scripts/migrate_kris.py
"""
import asyncio
import openpyxl
from pathlib import Path
from difflib import SequenceMatcher
from sqlalchemy import select, delete
from app.core.config import get_settings
from app.db.session import session_context
from app.models import Risk, KeyRiskIndicator


def normalize_string(s):
    """Normalize string for comparison."""
    if not s:
        return ''
    return s.lower().strip().replace('\n', ' ').replace('  ', ' ')


def similarity_score(a, b):
    """Calculate similarity between two strings."""
    return SequenceMatcher(None, normalize_string(a), normalize_string(b)).ratio()


def safe_float(val, default=0.0):
    """Safely convert value to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


async def migrate_kris():
    """Main migration function."""
    excel_path = Path(__file__).parent.parent.parent / "placeholder-kri-source.xlsx"
    
    if not excel_path.exists():
        print(f"❌ Excel file not found: {excel_path}")
        return
    
    print(f"📂 Loading: {excel_path}")
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    
    # KRI sheets to process
    kri_sheets = [
        'Provozní riziko',
        'Neživotní upisovací riziko',
        'Zdravotní upisovací riziko',
        'Tržní riziko',
        'Riziko selhání protistrany',
    ]
    
    async with session_context(get_settings()) as session:
        # Step 1: Load all risks for matching
        print("\n🔍 Loading risks for matching...")
        risks_result = await session.execute(select(Risk))
        all_risks = list(risks_result.scalars().all())
        print(f"   ✓ Loaded {len(all_risks)} risks")
        
        # Build lookup by description and process
        risk_by_desc = {}
        risk_by_process = {}
        for risk in all_risks:
            key = normalize_string(risk.description)[:100]
            risk_by_desc[key] = risk
            process_key = normalize_string(risk.process)
            if process_key not in risk_by_process:
                risk_by_process[process_key] = []
            risk_by_process[process_key].append(risk)
        
        # Step 2: Clear existing KRIs
        print("\n🗑️  Clearing existing KRIs...")
        await session.execute(delete(KeyRiskIndicator))
        await session.commit()
        print("   ✓ Cleared KRIs")
        
        # Step 3: Process each sheet
        created = 0
        unmatched = []
        
        for sheet_name in kri_sheets:
            if sheet_name not in wb.sheetnames:
                print(f"\n⚠️  Sheet not found: {sheet_name}")
                continue
            
            sheet = wb[sheet_name]
            print(f"\n📊 Processing sheet: {sheet_name} ({sheet.max_row - 1} rows)")
            
            for row_idx in range(2, sheet.max_row + 1):
                # Column mapping for KRI data:
                # 2: Hlavní proces
                # 3: Podproces
                # 6: Klíčová rizika - popis
                # 9: Metrika
                # 10: Hodnota
                # 11: Dolní limit
                # 12: Horní limit
                
                hlavni_proces = str(sheet.cell(row=row_idx, column=2).value or '').strip()
                risk_desc = str(sheet.cell(row=row_idx, column=6).value or '').strip()
                metric = str(sheet.cell(row=row_idx, column=9).value or '').strip()
                value = safe_float(sheet.cell(row=row_idx, column=10).value)
                lower_limit = safe_float(sheet.cell(row=row_idx, column=11).value, 0.0)
                upper_limit = safe_float(sheet.cell(row=row_idx, column=12).value, 100.0)
                
                # Skip if no metric defined
                if not metric:
                    continue
                
                # Determine unit from metric name
                if '%' in metric or 'procent' in metric.lower():
                    unit = '%'
                elif 'dn' in metric.lower() or 'den' in metric.lower():
                    unit = 'days'
                elif 'počet' in metric.lower() or 'count' in metric.lower():
                    unit = 'count'
                else:
                    unit = 'value'
                
                # Match risk
                matched_risk = None
                match_score = 0
                
                # Try exact description match first
                for risk in all_risks:
                    sim = similarity_score(risk_desc, risk.description)
                    if sim > match_score and sim > 0.4:
                        matched_risk = risk
                        match_score = sim
                
                # Fallback: match by process
                if not matched_risk:
                    proc_key = normalize_string(hlavni_proces)
                    if proc_key in risk_by_process and risk_by_process[proc_key]:
                        matched_risk = risk_by_process[proc_key][0]
                        match_score = 0.3
                
                if not matched_risk:
                    # Assign random risk from same process or any risk
                    import random
                    proc_key = normalize_string(hlavni_proces)
                    if proc_key in risk_by_process and risk_by_process[proc_key]:
                        matched_risk = random.choice(risk_by_process[proc_key])
                    else:
                        matched_risk = random.choice(all_risks)
                    unmatched.append(f"{sheet_name} row {row_idx}: {metric} -> random: {matched_risk.risk_id_code}")
                
                # Create KRI
                kri = KeyRiskIndicator(
                    risk_id=matched_risk.id,
                    metric_name=metric[:500],
                    current_value=value,
                    lower_limit=lower_limit,
                    upper_limit=upper_limit,
                    unit=unit,
                )
                session.add(kri)
                created += 1
                
                if created % 20 == 0:
                    print(f"   ... created {created} KRIs")
        
        await session.commit()
        print(f"\n✅ Migration complete!")
        print(f"   Created: {created} KRIs")
        print(f"   Unmatched: {len(unmatched)}")
        
        if unmatched:
            print("\n⚠️  Unmatched KRIs (for manual review):")
            for item in unmatched[:10]:
                print(f"   - {item}")
            if len(unmatched) > 10:
                print(f"   ... and {len(unmatched) - 10} more")


if __name__ == "__main__":
    asyncio.run(migrate_kris())
