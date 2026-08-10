from __future__ import annotations

from typing import Literal

from fastapi.responses import StreamingResponse

from app.schemas.vendor import VendorRead
from app.services._ict_register_reference.vendor_values import vendor_value_label
from app.services._reporting.tabular import generate_tabular_csv

VendorExportLocale = Literal["en", "cs"]


def vendor_register_headers() -> list[str]:
    return [
        "name",
        "legal_name",
        "registration_id",
        "outsourcing_owner",
        "department",
        "process",
        "vendor_type_code",
        "vendor_type_label",
        "risk_score",
        "tier_code",
        "tier_label",
        "cif_code",
        "cif_label",
        "dora_relevant",
        "significant_vendor",
        "substitutability_code",
        "substitutability_label",
        "country_code",
        "country_label",
        "country_category_code",
        "country_category_label",
        "lifecycle",
    ]


def _label(field: str, code: str | None, *, locale: VendorExportLocale) -> str:
    return vendor_value_label(field, code, locale=locale) if code else ""


def render_vendor_register_csv(
    rows: list[VendorRead],
    *,
    locale: VendorExportLocale,
) -> StreamingResponse:
    """Render the exact permission-scoped list-plan matches, never the current page."""
    export_rows: list[list[object]] = []
    for row in rows:
        tier = row.derived.tier if row.derived else None
        cif = row.derived.cif if row.derived else None
        country_category = row.derived.country_category if row.derived else None
        export_rows.append(
            [
                row.name,
                row.legal_name or "",
                row.registration_id or "",
                row.outsourcing_owner.name if row.outsourcing_owner else "",
                row.department_name or "",
                row.process,
                row.vendor_type,
                _label("vendor_type", row.vendor_type, locale=locale),
                row.risk_score_1_5,
                tier or "",
                _label("tier", tier, locale=locale),
                cif or "",
                _label("cif", cif, locale=locale),
                str(row.dora_relevant).lower(),
                str(row.is_significant_vendor).lower(),
                row.replaceability or "",
                _label("replaceability", row.replaceability, locale=locale),
                row.country or "",
                _label("country", row.country, locale=locale),
                country_category or "",
                _label("country_category", country_category, locale=locale),
                "archived" if row.is_archived else "active",
            ]
        )
    content = generate_tabular_csv(vendor_register_headers(), export_rows)
    return StreamingResponse(
        iter((content,)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=vendors.csv"},
    )
