"""
Report generation service for Excel and CSV exports.
"""

from app.services._reporting.audit_excel import generate_audit_trail_excel
from app.services._reporting.controls_excel import generate_controls_excel
from app.services._reporting.counts import count_high_risks
from app.services._reporting.risks_excel import generate_risks_excel
from app.services._reporting.tabular import generate_tabular_csv, generate_tabular_excel
from app.services._reporting.vendor_reports import (
    generate_vendor_annual_report_excel,
    generate_vendor_dora_register_excel,
)

__all__ = [
    "count_high_risks",
    "generate_audit_trail_excel",
    "generate_controls_excel",
    "generate_risks_excel",
    "generate_tabular_csv",
    "generate_tabular_excel",
    "generate_vendor_annual_report_excel",
    "generate_vendor_dora_register_excel",
]
