from __future__ import annotations


def annual_report_rows(report) -> tuple[list[str], list[list[object]]]:
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
        "Report Year",
        "Generated At",
    ]
    rows: list[list[object]] = []
    for vendor in report.vendors:
        rows.append(
            [
                vendor.vendor_id,
                vendor.name,
                vendor.legal_name or "",
                vendor.vendor_type,
                vendor.department_name or "",
                vendor.outsourcing_owner_name or "",
                vendor.process,
                vendor.subprocess or "",
                bool(vendor.supports_important_core_insurance_function),
                bool(vendor.dora_relevant),
                bool(vendor.is_significant_vendor),
                vendor.risk_score_1_5,
                report.process_evaluation.year,
                report.generated_at.isoformat(),
            ]
        )
    return headers, rows


def dora_register_rows(rows) -> tuple[list[str], list[list[object]]]:
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
        "replaceability",
        "has_alternative_providers",
    ]
    data_rows: list[list[object]] = []
    for row in rows:
        data_rows.append(
            [
                row.vendor_id,
                row.name,
                row.legal_name or "",
                row.registration_id or "",
                row.vendor_type,
                bool(row.dora_relevant),
                bool(row.is_significant_vendor),
                bool(row.supports_important_core_insurance_function),
                row.risk_score_1_5,
                row.outsourcing_owner_user_id or "",
                row.outsourcing_owner_name or "",
                row.department_id or "",
                row.department_name or "",
                row.process,
                row.subprocess or "",
                row.replaceability or "",
                bool(row.has_alternative_providers),
            ]
        )
    return headers, data_rows
