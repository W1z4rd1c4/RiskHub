"""
Control Migration Script

Migrates controls from placeholder-controls-source.xlsx to the database.
Uses 13-point control structure and creates ControlRiskLink entries.

Usage: source venv/bin/activate && PYTHONPATH=. python scripts/migrate_controls.py
"""
import asyncio
import openpyxl
from pathlib import Path
from difflib import SequenceMatcher
from sqlalchemy import select, delete
from app.db.session import async_session_maker
from app.models import Control, Risk, ControlRiskLink, Department, User, ControlExecution


# Frequency mapping (Czech to English)
FREQ_MAP = {
    'denně': 'daily',
    'denne': 'daily',
    'týdně': 'weekly',
    'tydne': 'weekly',
    'měsíčně': 'monthly',
    'mesicne': 'monthly',
    'čtvrtletně': 'quarterly',
    'ctvrtletne': 'quarterly',
    'ročně': 'annually',
    'rocne': 'annually',
    'ad hoc': 'ad_hoc',
    'adhoc': 'ad_hoc',
}

# Control form mapping
FORM_MAP = {
    'manuální': 'manual',
    'manualni': 'manual',
    'automatická': 'automatic',
    'automaticka': 'automatic',
    'automatic': 'automatic',
    'manual': 'manual',
}


def normalize_string(s):
    """Normalize string for comparison."""
    if not s:
        return ''
    return s.lower().strip().replace('\n', ' ').replace('  ', ' ')


def similarity_score(a, b):
    """Calculate similarity between two strings."""
    return SequenceMatcher(None, normalize_string(a), normalize_string(b)).ratio()


async def migrate_controls():
    """Main migration function."""
    excel_path = Path(__file__).parent.parent.parent / "placeholder-controls-source.xlsx"
    
    if not excel_path.exists():
        print(f"❌ Excel file not found: {excel_path}")
        return
    
    print(f"📂 Loading: {excel_path}")
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    sheet = wb.active
    
    async with async_session_maker() as session:
        # Step 1: Validate prerequisites
        print("\n🔍 Validating prerequisites...")
        
        # Get OPS department
        dept_result = await session.execute(
            select(Department).where(Department.code == 'OPS')
        )
        ops_dept = dept_result.scalar_one_or_none()
        if not ops_dept:
            print("❌ OPS department not found. Please seed base data first.")
            return
        print(f"   ✓ Found OPS department: {ops_dept.name}")
        
        # Get default user
        user_result = await session.execute(select(User).limit(1))
        default_owner = user_result.scalar_one_or_none()
        if not default_owner:
            print("❌ No users found. Please seed base data first.")
            return
        print(f"   ✓ Found default owner: {default_owner.name}")
        
        # Load all risks for matching
        risks_result = await session.execute(select(Risk))
        all_risks = list(risks_result.scalars().all())
        print(f"   ✓ Loaded {len(all_risks)} risks for matching")
        
        # Step 2: Clear existing controls (respecting FK constraints)
        print("\n🗑️  Clearing existing controls...")
        await session.execute(delete(ControlExecution))
        await session.execute(delete(ControlRiskLink))
        await session.execute(delete(Control))
        await session.commit()
        print("   ✓ Cleared ControlExecutions, ControlRiskLinks, and Controls")
        
        # Step 3: Parse controls from Excel (rows 2+)
        print("\n📊 Parsing controls...")
        created = 0
        links_created = 0
        
        for row_idx in range(2, sheet.max_row + 1):
            # Column mapping:
            # 1: Pořadové číslo
            # 2: Název kontroly
            # 3: Popis kontroly
            # 4: Zdroj dat
            # 5: Směrnice
            # 6: Forma
            # 7: Vlastník procesu
            # 8: Vlastník kontroly
            # 9: Pozice vykonávající kontrolu
            # 10: Frekvence
            # 11: Výstup kontroly
            # 12: Reportovací povinnost
            # 13: Dokumentace
            # 14: Která rizika snižuje
            # 15: Nápravné opatření
            
            name = sheet.cell(row=row_idx, column=2).value
            if not name:
                continue
            
            name = str(name).strip()
            description = str(sheet.cell(row=row_idx, column=3).value or '').strip()
            data_source = str(sheet.cell(row=row_idx, column=4).value or '').strip()
            methodology = str(sheet.cell(row=row_idx, column=5).value or '').strip()
            form_raw = str(sheet.cell(row=row_idx, column=6).value or 'Manuální').strip().lower()
            process_owner = str(sheet.cell(row=row_idx, column=7).value or '').strip()
            control_owner = str(sheet.cell(row=row_idx, column=8).value or '').strip()
            executor = str(sheet.cell(row=row_idx, column=9).value or '').strip()
            freq_raw = str(sheet.cell(row=row_idx, column=10).value or 'měsíčně').strip().lower()
            output_desc = str(sheet.cell(row=row_idx, column=11).value or '').strip()
            report_recipient = str(sheet.cell(row=row_idx, column=12).value or '').strip()
            documentation = str(sheet.cell(row=row_idx, column=13).value or '').strip()
            risks_text = str(sheet.cell(row=row_idx, column=14).value or '').strip()
            corrective = str(sheet.cell(row=row_idx, column=15).value or '').strip()
            
            # Map frequency and form
            frequency = FREQ_MAP.get(freq_raw, 'monthly')
            control_form = FORM_MAP.get(form_raw, 'manual')
            
            # Add corrective action to description if present
            if corrective:
                description = f"{description}\n\nNápravné opatření: {corrective}"
            
            # Create control
            control = Control(
                name=name,
                description=description,
                data_source=data_source if data_source else None,
                methodology_reference=methodology if methodology else None,
                control_form=control_form,
                process_owner_position=process_owner if process_owner else None,
                control_owner_id=default_owner.id,
                executor_position=executor if executor else None,
                frequency=frequency,
                risk_level=3,  # Default medium
                output_description=output_desc if output_desc else None,
                report_recipient=report_recipient if report_recipient else None,
                documentation_location=documentation if documentation else None,
                department_id=ops_dept.id,
                status='active',
                created_by_id=default_owner.id,
            )
            session.add(control)
            await session.flush()  # Get the ID
            created += 1
            
            # Match risks by description similarity
            if risks_text:
                best_matches = []
                for risk in all_risks:
                    sim = similarity_score(risks_text, risk.description)
                    if sim > 0.3:  # Threshold for match
                        best_matches.append((risk, sim))
                
                # Sort by similarity and take top matches
                best_matches.sort(key=lambda x: x[1], reverse=True)
                
                # Create links for best matches (up to 3)
                for risk, sim in best_matches[:3]:
                    link = ControlRiskLink(
                        control_id=control.id,
                        risk_id=risk.id,
                        effectiveness='medium',
                        notes=f"Auto-linked: '{risks_text[:100]}' -> '{risk.description[:100]}'",
                    )
                    session.add(link)
                    links_created += 1
                    print(f"   Linked: {name[:30]} -> {risk.risk_id_code} ({sim:.2f})")
            
            print(f"   ✓ Control #{created}: {name[:50]}")
        
        await session.commit()
        print(f"\n✅ Migration complete!")
        print(f"   Created: {created} controls")
        print(f"   Created: {links_created} control-risk links")


if __name__ == "__main__":
    asyncio.run(migrate_controls())
