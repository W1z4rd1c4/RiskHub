"""canonicalize Vendor controlled values

Revision ID: j1e2f3g4h5i6
Revises: i0d1e2f3g4h5
Create Date: 2026-07-16 10:00:00.000000

Known Czech workbook labels and retired application aliases are translated to
locale-independent codes. Unknown nullable values are cleared rather than
guessed; the non-null Vendor type falls back to ``other``.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j1e2f3g4h5i6"
down_revision: Union[str, Sequence[str], None] = "i0d1e2f3g4h5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COUNTRIES = ("CZ", "SK", "DE", "AT", "NL", "PL", "GB", "US", "IE", "FR", "LU")
_IDENTIFIER_TYPES = ("LEI", "EUID", "CRN", "VAT", "PNR", "NIN")

_FIELD_MAPS: dict[str, dict[str, str]] = {
    "vendor_type": {value: value for value in ("ict", "outsourcing", "professional_services", "partner", "other")},
    "country": {value: value for value in _COUNTRIES},
    "person_type": {
        "Právnická osoba": "legal_person",
        "Fyzická osoba podnikající": "individual_acting_in_business_capacity",
    },
    "identifier_type": {
        **{value: value for value in _IDENTIFIER_TYPES},
        "IČO (CRN)": "CRN",
    },
    "data_sensitivity": {"Nízká": "low", "Střední": "medium", "Vysoká": "high"},
    "replaceability": {
        "Nenahraditelný": "not_substitutable",
        "Velmi obtížně nahraditelný": "highly_complex",
        "Středně obtížně nahraditelný": "medium_complexity",
        "Snadno nahraditelný": "easily_substitutable",
        "hard": "highly_complex",
        "medium": "medium_complexity",
        "easy": "easily_substitutable",
    },
    "substitutability_reason": {
        "Omezená nabídka na trhu": "limited_market_alternatives",
        "Obtížná migrace": "migration_difficulties",
        "Obojí": "both",
    },
    "exit_plan_state": {
        "Není vyžadován": "not_required",
        "Vyžadován – chybí": "required_missing",
        "Návrh": "draft",
        "Schválen": "approved",
        "Testován": "tested",
        "K revizi": "review_required",
        "Neposouzen": "not_assessed",
    },
    "reintegration": {"Snadná": "easy", "Obtížná": "difficult", "Velmi složitá": "highly_complex"},
    "service_disruption_impact": {"Nízký": "low", "Střední": "medium", "Vysoký": "high", "Neposouzeno": "not_assessed"},
    "alternative_providers": {"Ano": "yes", "Ne": "no", "Neposouzeno": "not_assessed"},
    "ctpp_designation": {"Ano": "yes", "Ne": "no", "Neurčeno": "undetermined"},
    "assessment_phase": {"Ex ante": "ex_ante", "Průběžná": "ongoing", "Nerelevantní": "not_applicable"},
    "due_diligence_state": {
        "Nerelevantní": "not_applicable",
        "Nezahájeno": "not_started",
        "Probíhá": "in_progress",
        "Dokončeno bez výhrad": "completed_without_reservations",
        "Dokončeno s výhradami": "completed_with_reservations",
        "K revizi": "review_required",
        "Neposouzeno": "not_assessed",
    },
}

for _field in (
    "ex_ante_operational",
    "ex_ante_legal",
    "ex_ante_ict",
    "ex_ante_reputational",
    "ex_ante_data_confidentiality",
    "ex_ante_data_availability",
    "ex_ante_data_location",
    "ex_ante_provider_location",
    "ex_ante_ict_concentration",
):
    _FIELD_MAPS[_field] = {"OK": "ok", "Riziko": "risk", "Nerelevantní": "not_applicable"}

for _field in (
    "significance_authorization_conditions",
    "significance_regulatory_requirements",
    "significance_service_quality",
    "significance_financial_impact",
    "significance_reputation_continuity",
    "significance_cumulative_impact",
):
    _FIELD_MAPS[_field] = {"Ano": "yes", "Ne": "no", "Nerelevantní": "not_applicable"}

# Include the target codes so repeated upgrades are no-ops.
for _mapping in _FIELD_MAPS.values():
    _mapping.update({code: code for code in tuple(_mapping.values())})


def upgrade() -> None:
    conn = op.get_bind()
    vendors = sa.table("vendors", *(sa.column(field, sa.String()) for field in _FIELD_MAPS))

    for field, mapping in _FIELD_MAPS.items():
        column = vendors.c[field]
        for source, target in mapping.items():
            if source != target:
                conn.execute(sa.update(vendors).where(column == source).values({field: target}))

        canonical_codes = tuple(dict.fromkeys(mapping.values()))
        unknown_value = "other" if field == "vendor_type" else None
        conn.execute(
            sa.update(vendors).where(column.is_not(None), column.not_in(canonical_codes)).values({field: unknown_value})
        )


def downgrade() -> None:
    """Forward-only migration. Restore from snapshot per ADR-010."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
