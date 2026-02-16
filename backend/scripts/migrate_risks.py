"""
Risk Migration Script

Migrates risks from Registr_Rizik_2022.xlsx (Rizika sheet) to the database.
Clears existing sample data and generates unique risk_id_codes.

Usage: PYTHONPATH=backend python backend/scripts/migrate_risks.py
"""
import asyncio
import openpyxl
from pathlib import Path
from collections import defaultdict
from sqlalchemy import select, delete
from app.core.config import get_settings
from app.db.session import session_context
from app.models import Risk, KeyRiskIndicator, Department, User, ControlRiskLink


# Process to Department Code mapping
PROCESS_TO_DEPT_CODE = {
    'Marketing': 'MKT',
    'Vývoj nových produktů': 'DEV',
    'Prodej': 'SAL',
    'Likvidace pojistných událostí': 'CLM',
    'Finance': 'FIN',
    'IT': 'IT',
    'HR': 'HR',
    'Compliance': 'COMP',
    'Underwriting': 'UW',
    'Operations': 'OPS',
}

# Risk type mapping (Czech to enum)
RISK_TYPE_MAP = {
    'strategické': 'strategic',
    'strategicke': 'strategic',
    'marketingové': 'operational',
    'marketingove': 'operational',
    'upisovací': 'operational',
    'upisovaci': 'operational',
    'compliance': 'operational',
    'tržní': 'operational',
    'trzni': 'operational',
    'klienti, produkt': 'operational',
    'transakce, dodávky': 'operational',
    'obchodní': 'operational',
    'obchodni': 'operational',
}


def normalize_string(s):
    """Normalize string for comparison."""
    if not s:
        return ''
    return s.lower().strip().replace('\n', ' ')


def get_process_code(process_name):
    """Generate a 3-letter process code."""
    if not process_name:
        return 'UNK'
    # Remove accents and take first 3 chars
    clean = process_name.upper()[:3]
    # Simple accent removal
    replacements = {'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ý': 'Y', 'Č': 'C', 'Š': 'S', 'Ž': 'Z', 'Ř': 'R', 'Ň': 'N', 'Ť': 'T', 'Ď': 'D'}
    for k, v in replacements.items():
        clean = clean.replace(k, v)
    return clean


async def migrate_risks():
    """Main migration function."""
    excel_path = Path(__file__).parent.parent.parent / "Registr_Rizik_2022.xlsx"
    
    if not excel_path.exists():
        print(f"❌ Excel file not found: {excel_path}")
        return
    
    print(f"📂 Loading: {excel_path}")
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    sheet = wb['Rizika']
    
    async with session_context(get_settings()) as session:
        # Step 1: Validate prerequisites FIRST (before any destructive operations)
        print("\n🔍 Validating prerequisites...")
        user_result = await session.execute(select(User).limit(1))
        default_owner = user_result.scalar_one_or_none()
        
        if not default_owner:
            print("❌ No users found. Please seed base data first.")
            print("   Run: PYTHONPATH=backend python backend/scripts/seed.py")
            return
        print(f"   ✓ Found default owner: {default_owner.name}")
        
        # Step 2: Clear existing data (respect FK constraints) - ONLY after user validation
        print("\n🗑️  Clearing existing data...")
        await session.execute(delete(ControlRiskLink))
        await session.execute(delete(KeyRiskIndicator))
        await session.execute(delete(Risk))
        await session.commit()
        print("   ✓ Cleared ControlRiskLinks, KRIs, and Risks")
        
        # Step 3: Build department lookup (create if needed)
        print("\n🏢 Setting up departments...")
        dept_result = await session.execute(select(Department))
        all_depts = list(dept_result.scalars().all())
        existing_depts = {d.name.lower(): d for d in all_depts}
        existing_codes = {d.code.upper(): d for d in all_depts}
        dept_cache = {}  # process name -> department
        
        # Step 4: Parse risks from Excel (rows 9+)
        print("\n📊 Parsing risks...")
        process_counters = defaultdict(int)
        created = 0
        skipped = 0
        depts_created = 0
        
        for row_idx in range(9, sheet.max_row + 1):
            row = list(sheet.iter_rows(min_row=row_idx, max_row=row_idx, values_only=True))[0]
            
            # Column mapping (0-indexed):
            # A=0: P.č., B=1: Hlavní proces, C=2: Podproces, D=3: Druh rizika
            # E=4: Solvency II, F=5: Popis, G=6: Dopad rizika
            # H=7: Dopad/Význam (gross), I=8: Pravděpodobnost (gross)
            # L=11: Dopad/Význam (net), M=12: Pravděpodobnost (net)
            
            hlavni_proces = str(row[1]).strip() if row[1] else None
            podproces = str(row[2]).strip() if row[2] else None
            druh_rizika = str(row[3]).strip() if row[3] else 'Operační riziko'
            solvency_cat = str(row[4]).strip() if row[4] else None
            popis = str(row[5]).strip() if row[5] else None
            
            # Skip empty rows
            if not hlavni_proces or not popis:
                skipped += 1
                continue
            
            # Parse scores (safely handle non-numeric values)
            def safe_int(val, default=3):
                try:
                    return int(val) if val else default
                except (ValueError, TypeError):
                    return default
            
            gross_impact = safe_int(row[7], 3)
            gross_probability = safe_int(row[8], 3)
            net_impact = safe_int(row[11], 2)
            net_probability = safe_int(row[12], 2)
            
            # Generate unique risk_id_code
            proc_code = get_process_code(hlavni_proces)
            process_counters[proc_code] += 1
            risk_id_code = f"{proc_code}-R{process_counters[proc_code]:02d}"
            
            # Map risk type (strategic if explicitly named, otherwise operational)
            risk_type_lower = normalize_string(druh_rizika)
            if 'strateg' in risk_type_lower:
                risk_type = 'strategic'
            else:
                risk_type = 'operational'
            
            # Use Druh rizika (Column D) as the category for grouping
            category = druh_rizika
            
            # Get or create department based on process name
            if hlavni_proces not in dept_cache:
                # Look up existing or create new department
                dept_key = hlavni_proces.lower()
                if dept_key in existing_depts:
                    dept_cache[hlavni_proces] = existing_depts[dept_key]
                elif proc_code.upper() in existing_codes:
                    # Code collision - use existing department with that code
                    dept_cache[hlavni_proces] = existing_codes[proc_code.upper()]
                else:
                    # Create new department with unique code
                    unique_code = proc_code
                    suffix = 1
                    while unique_code.upper() in existing_codes:
                        unique_code = f"{proc_code}{suffix}"
                        suffix += 1
                    
                    new_dept = Department(
                        name=hlavni_proces,
                        code=unique_code,
                        description=f"Department for {hlavni_proces}"
                    )
                    session.add(new_dept)
                    await session.flush()  # Get the ID
                    dept_cache[hlavni_proces] = new_dept
                    existing_depts[dept_key] = new_dept
                    existing_codes[unique_code.upper()] = new_dept
                    depts_created += 1
                    print(f"   ✓ Created department: {hlavni_proces} ({unique_code})")
            
            department = dept_cache[hlavni_proces]
            
            # Create risk
            risk = Risk(
                risk_id_code=risk_id_code,
                process=hlavni_proces,
                subprocess=podproces,
                risk_type=risk_type,
                category=category,
                description=popis[:500] if popis else '',
                department_id=department.id,
                owner_id=default_owner.id,
                gross_probability=max(1, min(5, gross_probability)),
                gross_impact=max(1, min(5, gross_impact)),
                gross_score=gross_probability * gross_impact,
                net_probability=max(1, min(5, net_probability)),
                net_impact=max(1, min(5, net_impact)),
                net_score=net_probability * net_impact,
                status='active',
                is_priority=(gross_probability * gross_impact >= 15),
            )
            session.add(risk)
            created += 1
            
            if created % 20 == 0:
                print(f"   ... processed {created} risks")
        
        await session.commit()
        print(f"\n✅ Migration complete!")
        print(f"   Created: {created} risks")
        print(f"   Skipped: {skipped} empty rows")
        print(f"   Process codes: {dict(process_counters)}")


if __name__ == "__main__":
    asyncio.run(migrate_risks())
