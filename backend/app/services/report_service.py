"""
Report generation service for PDF and Excel exports.
"""
from io import BytesIO
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from app.services.report_translations import get_report_translator

if TYPE_CHECKING:
    from app.models.control import Control
    from app.models.risk import Risk
    from app.schemas.vendor_reports import VendorAnnualReportData, VendorDoraRegisterRow


# Color scheme matching the frontend
ACCENT_COLOR = colors.HexColor("#00d4aa")
DARK_BG = colors.HexColor("#0f172a")
HEADER_BG = colors.HexColor("#1e293b")


def count_high_risks(risks, high_threshold: int) -> int:
    """Count risks with net_probability * net_impact >= high_threshold.

    Used by threshold propagation tests and report summaries.
    """
    total = 0
    for r in risks:
        prob = getattr(r, "net_probability", 0) or 0
        impact = getattr(r, "net_impact", 0) or 0
        if (prob * impact) >= high_threshold:
            total += 1
    return total


def generate_controls_pdf(controls: list["Control"], locale: str = 'en') -> bytes:
    """Generate a PDF report of controls."""
    t = get_report_translator(locale)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=12,
        textColor=DARK_BG,
        alignment=TA_CENTER
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=20,
        textColor=colors.gray,
        alignment=TA_CENTER
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph(f"RiskHub - {t('control_inventory')}", title_style))
    elements.append(Paragraph(f"{t('generated_on')}: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 12))
    
    if not controls:
        elements.append(Paragraph(t('no_controls_found') if locale == 'cs' else "No controls found.", styles['Normal']))
    else:
        # Table header
        table_data = [[t('name'), t('department'), t('status'), t('control_type'), t('frequency'), t('risk_level')]]
        
        for control in controls:
            dept_name = control.department.name if control.department else "N/A"
            table_data.append([
                control.name[:40] + "..." if len(control.name) > 40 else control.name,
                dept_name[:20] + "..." if len(dept_name) > 20 else dept_name,
                control.status.title(),
                control.control_form.title(),
                control.frequency.title(),
                f"{control.risk_level}/5"
            ])
        
        table = Table(table_data, colWidths=[120, 80, 60, 60, 70, 50])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), DARK_BG),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        elements.append(table)
        
        # Summary
        elements.append(Spacer(1, 24))
        elements.append(Paragraph(f"{t('total')} {t('controls')}: {len(controls)}", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def generate_controls_excel(controls: list["Control"]) -> bytes:
    """Generate an Excel report of controls."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Controls"
    
    # Header styling
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1e293b", end_color="1e293b", fill_type="solid")
    header_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Headers
    headers = [
        "ID", "Name", "Description", "Department", "Status", "Form",
        "Frequency", "Risk Level", "Owner Position", "Executor Position",
        "Data Source", "Methodology Reference", "Created At"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = header_border
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    for row, control in enumerate(controls, 2):
        ws.cell(row=row, column=1, value=control.id)
        ws.cell(row=row, column=2, value=control.name)
        ws.cell(row=row, column=3, value=control.description[:500] if control.description else "")
        ws.cell(row=row, column=4, value=control.department.name if control.department else "N/A")
        ws.cell(row=row, column=5, value=control.status)
        ws.cell(row=row, column=6, value=control.control_form)
        ws.cell(row=row, column=7, value=control.frequency)
        ws.cell(row=row, column=8, value=control.risk_level)
        ws.cell(row=row, column=9, value=control.process_owner_position or "")
        ws.cell(row=row, column=10, value=control.executor_position or "")
        ws.cell(row=row, column=11, value=control.data_source or "")
        ws.cell(row=row, column=12, value=control.methodology_reference or "")
        ws.cell(row=row, column=13, value=control.created_at.strftime('%Y-%m-%d') if control.created_at else "")
    
    # Adjust column widths
    ws.column_dimensions['A'].width = 8
    ws.column_dimensions['B'].width = 30
    ws.column_dimensions['C'].width = 50
    ws.column_dimensions['D'].width = 20
    ws.column_dimensions['E'].width = 12
    ws.column_dimensions['F'].width = 12
    ws.column_dimensions['G'].width = 12
    ws.column_dimensions['H'].width = 12
    ws.column_dimensions['I'].width = 20
    ws.column_dimensions['J'].width = 20
    ws.column_dimensions['K'].width = 25
    ws.column_dimensions['L'].width = 25
    ws.column_dimensions['M'].width = 15
    
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_risks_pdf(risks: list["Risk"], locale: str = 'en') -> bytes:
    """Generate a PDF report of risks."""
    t = get_report_translator(locale)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=12,
        textColor=DARK_BG,
        alignment=TA_CENTER
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=20,
        textColor=colors.gray,
        alignment=TA_CENTER
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph(f"RiskHub - {t('risk_register')}", title_style))
    elements.append(Paragraph(f"{t('generated_on')}: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 12))
    
    if not risks:
        elements.append(Paragraph(t('no_risks_found') if locale == 'cs' else "No risks found.", styles['Normal']))
    else:
        # Table header
        table_data = [[t('process'), t('category'), t('department'), t('gross_score'), t('net_score'), t('status')]]
        
        for risk in risks:
            dept_name = risk.department.name if risk.department else "N/A"
            gross_score = risk.gross_probability * risk.gross_impact
            net_score = risk.net_probability * risk.net_impact
            table_data.append([
                risk.process[:35] + "..." if len(risk.process) > 35 else risk.process,
                risk.category.title() if risk.category else "N/A",
                dept_name[:15] + "..." if len(dept_name) > 15 else dept_name,
                f"{gross_score} (P{risk.gross_probability}×I{risk.gross_impact})",
                f"{net_score} (P{risk.net_probability}×I{risk.net_impact})",
                risk.status.title() if risk.status else "N/A"
            ])
        
        table = Table(table_data, colWidths=[100, 70, 70, 80, 80, 60])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), DARK_BG),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        elements.append(table)
        
        # Summary
        elements.append(Spacer(1, 24))
        from app.models.global_config import ConfigDefaults
        critical_threshold = ConfigDefaults.CRITICAL_RISK_MIN_NET_SCORE
        high_risks = sum(1 for r in risks if r.net_probability * r.net_impact >= critical_threshold)
        critical_label = t('critical_risks') if locale == 'cs' else 'High/Critical'
        elements.append(Paragraph(f"{t('total')} {t('risks')}: {len(risks)} | {critical_label}: {high_risks}", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


# =============================================================================
# Vendor Reports (Phase 18-09)
# =============================================================================


def generate_vendor_annual_report_excel(report: "VendorAnnualReportData") -> bytes:
    wb = Workbook()

    ws = wb.active
    ws.title = "Vendors"

    headers = [
        "Vendor ID",
        "Name",
        "Legal Name",
        "Vendor Type",
        "Department",
        "Owner",
        "Process",
        "Subprocess",
        "Supports Core Function",
        "DORA Relevant",
        "Significant Vendor",
        "Risk Score (1-5)",
        "Last Decision",
        "Next Reassessment Due",
        "Cadence (months)",
        "Major Breaches (count)",
        "Major Incidents (count)",
        "Major Items (preview)",
    ]

    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1e293b", end_color="1e293b", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")

    for v in report.vendors:
        ws.append(
            [
                v.vendor_id,
                v.name,
                v.legal_name or "",
                v.vendor_type,
                v.department_name or "",
                v.outsourcing_owner_name or "",
                v.process,
                v.subprocess or "",
                bool(v.supports_important_core_insurance_function),
                bool(v.dora_relevant),
                bool(v.is_significant_vendor),
                v.risk_score_1_5,
                v.last_decided_at.isoformat() if v.last_decided_at else "",
                v.next_reassessment_due_at.isoformat() if v.next_reassessment_due_at else "",
                v.reassessment_cadence_months,
                v.major_breaches_count,
                v.major_incidents_count,
                "; ".join(v.major_items_preview or []),
            ]
        )

    ws2 = wb.create_sheet("Process Evaluation")
    ws2.append(["Year", report.process_evaluation.year])
    ws2.append(["Generated At", report.generated_at.isoformat()])
    ws2.append(["Total Active Vendors", report.process_evaluation.total_active_vendors])
    ws2.append(["Overdue Reassessments", report.process_evaluation.overdue_reassessments_count])
    ws2.append(["Missing Exit Plans", report.process_evaluation.missing_exit_plans_count])
    ws2.append(["Missing Contingency Plans", report.process_evaluation.missing_contingency_plans_count])
    ws2.append(["Major Breaches (count)", report.process_evaluation.major_breaches_count])
    ws2.append(["Major Incidents (count)", report.process_evaluation.major_incidents_count])

    for row in ws2.iter_rows(min_row=1, max_col=2):
        for cell in row:
            cell.border = Border(
                left=Side(style="thin"),
                right=Side(style="thin"),
                top=Side(style="thin"),
                bottom=Side(style="thin"),
            )

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_vendor_dora_register_excel(rows: list["VendorDoraRegisterRow"]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "DORA Register"

    headers = [
        "vendor_id",
        "name",
        "legal_name",
        "registration_id",
        "vendor_type",
        "dora_relevant",
        "is_significant_vendor",
        "supports_important_core_insurance_function",
        "risk_score_1_5",
        "outsourcing_owner_user_id",
        "outsourcing_owner_name",
        "department_id",
        "department_name",
        "process",
        "subprocess",
        "last_decided_at",
        "next_reassessment_due_at",
        "reassessment_cadence_months",
        "replaceability",
        "has_alternative_providers",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1e293b", end_color="1e293b", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")

    for r in rows:
        ws.append(
            [
                r.vendor_id,
                r.name,
                r.legal_name or "",
                r.registration_id or "",
                r.vendor_type,
                bool(r.dora_relevant),
                bool(r.is_significant_vendor),
                bool(r.supports_important_core_insurance_function),
                r.risk_score_1_5,
                r.outsourcing_owner_user_id or "",
                r.outsourcing_owner_name or "",
                r.department_id or "",
                r.department_name or "",
                r.process,
                r.subprocess or "",
                r.last_decided_at.isoformat() if r.last_decided_at else "",
                r.next_reassessment_due_at.isoformat() if r.next_reassessment_due_at else "",
                r.reassessment_cadence_months,
                r.replaceability or "",
                bool(r.has_alternative_providers),
            ]
        )

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_vendor_annual_report_pdf(report: "VendorAnnualReportData", locale: str = "en") -> bytes:
    t = get_report_translator(locale)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=20,
        spaceAfter=12,
        textColor=DARK_BG,
        alignment=TA_CENTER,
    )
    subtitle_style = ParagraphStyle(
        "CustomSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=16,
        textColor=colors.gray,
        alignment=TA_CENTER,
    )

    elements = []
    elements.append(Paragraph(f"RiskHub - {t('vendor_management_report') if locale == 'cs' else 'Vendor Management Report'}", title_style))
    elements.append(Paragraph(f"{t('generated_on')}: {report.generated_at.strftime('%Y-%m-%d %H:%M')}", subtitle_style))

    pe = report.process_evaluation
    elements.append(Paragraph(f"Year: {pe.year}", styles["Normal"]))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(f"Total active vendors: {pe.total_active_vendors}", styles["Normal"]))
    elements.append(Paragraph(f"Overdue reassessments: {pe.overdue_reassessments_count}", styles["Normal"]))
    elements.append(Paragraph(f"Missing exit plans: {pe.missing_exit_plans_count}", styles["Normal"]))
    elements.append(Paragraph(f"Missing contingency plans: {pe.missing_contingency_plans_count}", styles["Normal"]))
    elements.append(Paragraph(f"Major breaches: {pe.major_breaches_count}", styles["Normal"]))
    elements.append(Paragraph(f"Major incidents: {pe.major_incidents_count}", styles["Normal"]))
    elements.append(Spacer(1, 16))

    table_data = [["Vendor", "Owner", "Risk", "Last Review", "Major Items"]]
    for v in report.vendors[:40]:
        table_data.append(
            [
                v.name,
                v.outsourcing_owner_name or "",
                f"{v.risk_score_1_5}/5",
                v.last_decided_at.strftime("%Y-%m-%d") if v.last_decided_at else "",
                "; ".join(v.major_items_preview or []),
            ]
        )

    table = Table(table_data, colWidths=[120, 90, 40, 70, 140])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("TEXTCOLOR", (0, 1), (-1, -1), DARK_BG),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    elements.append(table)

    if len(report.vendors) > 40:
        elements.append(Spacer(1, 12))
        elements.append(Paragraph(f"Showing first 40 of {len(report.vendors)} vendors.", styles["Normal"]))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def generate_risks_excel(risks: list["Risk"]) -> bytes:
    """Generate an Excel report of risks."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Risks"
    
    # Header styling
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1e293b", end_color="1e293b", fill_type="solid")
    header_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Headers
    headers = [
        "ID", "Risk ID Code", "Process", "Description", "Category", "Department", "Status",
        "Gross Probability", "Gross Impact", "Gross Score",
        "Net Probability", "Net Impact", "Net Score",
        "Owner", "Treatment Strategy", "Created At"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = header_border
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    for row, risk in enumerate(risks, 2):
        ws.cell(row=row, column=1, value=risk.id)
        ws.cell(row=row, column=2, value=risk.risk_id_code)
        ws.cell(row=row, column=3, value=risk.process)
        ws.cell(row=row, column=4, value=risk.description[:500] if risk.description else "")
        ws.cell(row=row, column=5, value=risk.category or "")
        ws.cell(row=row, column=6, value=risk.department.name if risk.department else "N/A")
        ws.cell(row=row, column=7, value=risk.status or "")
        ws.cell(row=row, column=8, value=risk.gross_probability)
        ws.cell(row=row, column=9, value=risk.gross_impact)
        ws.cell(row=row, column=10, value=risk.gross_probability * risk.gross_impact)
        ws.cell(row=row, column=11, value=risk.net_probability)
        ws.cell(row=row, column=12, value=risk.net_impact)
        ws.cell(row=row, column=13, value=risk.net_probability * risk.net_impact)
        ws.cell(row=row, column=14, value=risk.owner.name if hasattr(risk, 'owner') and risk.owner else "")
        ws.cell(row=row, column=15, value="")  # Treatment strategy not in model
        ws.cell(row=row, column=16, value=risk.created_at.strftime('%Y-%m-%d') if risk.created_at else "")
    
    # Adjust column widths
    ws.column_dimensions['A'].width = 8
    ws.column_dimensions['B'].width = 30
    ws.column_dimensions['C'].width = 50
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 20
    ws.column_dimensions['F'].width = 12
    ws.column_dimensions['G'].width = 15
    ws.column_dimensions['H'].width = 12
    ws.column_dimensions['I'].width = 12
    ws.column_dimensions['J'].width = 14
    ws.column_dimensions['K'].width = 12
    ws.column_dimensions['L'].width = 12
    ws.column_dimensions['M'].width = 20
    ws.column_dimensions['N'].width = 18
    ws.column_dimensions['O'].width = 15
    
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def generate_dashboard_summary_pdf(summary: dict) -> bytes:
    """Generate a PDF report of the dashboard summary."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=12,
        textColor=DARK_BG,
        alignment=TA_CENTER
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=20,
        textColor=colors.gray,
        alignment=TA_CENTER
    )
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=16,
        spaceAfter=8,
        textColor=DARK_BG
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph("RiskHub - Executive Dashboard Summary", title_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 12))
    
    # Key Metrics
    elements.append(Paragraph("Key Metrics", section_style))
    
    metrics_data = [
        ["Metric", "Value"],
        ["Total Controls", str(summary.get('total_controls', 0))],
        ["Total Risks", str(summary.get('total_risks', 0))],
        ["Critical Risks", str(summary.get('critical_risks_count', 0))],
        ["Average Net Risk Score", f"{summary.get('average_net_risk_score', 0):.1f}"],
    ]
    
    metrics_table = Table(metrics_data, colWidths=[200, 100])
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('TEXTCOLOR', (0, 1), (-1, -1), DARK_BG),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
    ]))
    elements.append(metrics_table)
    
    # Controls by Status
    if summary.get('controls_by_status'):
        elements.append(Paragraph("Controls by Status", section_style))
        status_data = [["Status", "Count"]]
        for status, count in summary['controls_by_status'].items():
            status_data.append([status.title(), str(count)])
        
        status_table = Table(status_data, colWidths=[150, 80])
        status_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ]))
        elements.append(status_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def generate_audit_trail_pdf(executions: list, locale: str = 'en') -> bytes:
    """Generate a PDF report of control executions for audit trail."""
    t = get_report_translator(locale)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15*mm,
        leftMargin=15*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=12,
        textColor=DARK_BG,
        alignment=TA_CENTER
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=20,
        textColor=colors.gray,
        alignment=TA_CENTER
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph(f"RiskHub - {t('audit_trail')}", title_style))
    elements.append(Paragraph(f"{t('generated_on')}: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 12))
    
    if not executions:
        elements.append(Paragraph(t('no_executions_found') if locale == 'cs' else "No control executions found.", styles['Normal']))
    else:
        # Table header  
        table_data = [[t('execution_date'), t('control'), t('department'), t('executed_by'), t('result'), t('notes'), t('next_due')]]
        
        for exe in executions:
            # Format date
            exe_date = exe.executed_at.strftime('%Y-%m-%d') if exe.executed_at else "N/A"
            
            # Control and department info
            ctrl_name = exe.control.name[:25] + "..." if exe.control and len(exe.control.name) > 25 else (exe.control.name if exe.control else "N/A")
            dept_name = exe.control.department.name[:12] + "..." if exe.control and exe.control.department and len(exe.control.department.name) > 12 else (exe.control.department.name if exe.control and exe.control.department else "N/A")
            
            # Executor
            executor = exe.executed_by.name[:15] + "..." if exe.executed_by and len(exe.executed_by.name) > 15 else (exe.executed_by.name if exe.executed_by else "N/A")
            
            # Truncate findings for PDF
            findings = (exe.findings[:60] + "...") if exe.findings and len(exe.findings) > 60 else (exe.findings or "-")
            
            # Next scheduled
            next_due = exe.next_scheduled.strftime('%Y-%m-%d') if exe.next_scheduled else "-"
            
            table_data.append([
                exe_date,
                ctrl_name,
                dept_name,
                executor,
                exe.result.title() if exe.result else "N/A",
                findings,
                next_due
            ])
        
        table = Table(table_data, colWidths=[55, 90, 55, 60, 50, 110, 55])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), DARK_BG),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ]))
        elements.append(table)
        
        # Summary footer
        elements.append(Spacer(1, 24))
        passed = sum(1 for e in executions if e.result == 'passed')
        failed = sum(1 for e in executions if e.result == 'failed')
        warning = sum(1 for e in executions if e.result == 'warning')
        elements.append(Paragraph(
            f"Total Executions: {len(executions)} | Passed: {passed} | Failed: {failed} | Warning: {warning}",
            styles['Normal']
        ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()


def generate_audit_trail_excel(executions: list) -> bytes:
    """Generate an Excel report of control executions for audit trail."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Audit Trail"
    
    # Header styling
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1e293b", end_color="1e293b", fill_type="solid")
    header_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    wrap_alignment = Alignment(wrap_text=True, vertical='top')
    
    # Headers
    headers = [
        "ID", "Executed At", "Control ID", "Control Name", "Department",
        "Executor", "Result", "Findings", "Evidence Reference", "Notes",
        "Next Scheduled", "Linked Risks"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = header_border
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    for row, exe in enumerate(executions, 2):
        ws.cell(row=row, column=1, value=exe.id)
        ws.cell(row=row, column=2, value=exe.executed_at.strftime('%Y-%m-%d %H:%M') if exe.executed_at else "")
        ws.cell(row=row, column=3, value=exe.control_id)
        ws.cell(row=row, column=4, value=exe.control.name if exe.control else "")
        ws.cell(row=row, column=5, value=exe.control.department.name if exe.control and exe.control.department else "")
        ws.cell(row=row, column=6, value=exe.executed_by.name if exe.executed_by else "")
        ws.cell(row=row, column=7, value=exe.result or "")
        
        # Findings with wrap
        findings_cell = ws.cell(row=row, column=8, value=exe.findings or "")
        findings_cell.alignment = wrap_alignment
        
        # Evidence with wrap
        evidence_cell = ws.cell(row=row, column=9, value=exe.evidence_reference or "")
        evidence_cell.alignment = wrap_alignment
        
        # Notes with wrap
        notes_cell = ws.cell(row=row, column=10, value=exe.notes or "")
        notes_cell.alignment = wrap_alignment
        
        ws.cell(row=row, column=11, value=exe.next_scheduled.strftime('%Y-%m-%d') if exe.next_scheduled else "")
        
        # Linked risks (from control.risk_links -> risk)
        linked_risks = ""
        if exe.control and hasattr(exe.control, 'risk_links'):
            risk_names = []
            for link in exe.control.risk_links:
                if hasattr(link, 'risk') and link.risk:
                    risk_names.append(f"R-{link.risk.id}: {link.risk.process[:30]}")
            linked_risks = "; ".join(risk_names)
        ws.cell(row=row, column=12, value=linked_risks)
    
    # Adjust column widths
    ws.column_dimensions['A'].width = 8
    ws.column_dimensions['B'].width = 18
    ws.column_dimensions['C'].width = 10
    ws.column_dimensions['D'].width = 30
    ws.column_dimensions['E'].width = 20
    ws.column_dimensions['F'].width = 18
    ws.column_dimensions['G'].width = 12
    ws.column_dimensions['H'].width = 40
    ws.column_dimensions['I'].width = 30
    ws.column_dimensions['J'].width = 30
    ws.column_dimensions['K'].width = 15
    ws.column_dimensions['L'].width = 40
    
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()
