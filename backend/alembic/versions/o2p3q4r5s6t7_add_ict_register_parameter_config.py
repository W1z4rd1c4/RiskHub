"""add ict register parameter config

Seeds the 23 ICT Register workbook parameters (issue #41) into global_config
as a read-only, versioned parameter set (category ``ict_register_parameters``,
version parameter ``P_Verze``). Values are the verbatim workbook defaults from
docs/dora-ict-register/dora-excel-functional-spec.md section 6, kept in parity
with app/services/_ict_register_reference/parameters.py by
tests/backend/pytest/test_ict_register_reference.py.

Revision ID: o2p3q4r5s6t7
Revises: n9o0p1q2r3s5
Create Date: 2026-07-09 19:15:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "o2p3q4r5s6t7"
down_revision: Union[str, Sequence[str], None] = "n9o0p1q2r3s5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _row(key: str, value: str, value_type: str, display_name: str, description: str) -> dict[str, str]:
    return {
        "key": key,
        "value": value,
        "value_type": value_type,
        "category": "ict_register_parameters",
        "display_name": display_name,
        "description": description,
    }


ICT_PARAMETER_CONFIG_ROWS: tuple[dict[str, str], ...] = (
    _row("ict_register_krit_skore", "16", "int", "P_KritSkore", 'Process class "Kritická": score >='),
    _row("ict_register_vys_skore", "12", "int", "P_VysSkore", 'Process class "Vysoká": score >='),
    _row("ict_register_str_skore", "8", "int", "P_StrSkore", 'Process class "Střední": score >='),
    _row("ict_register_mtpd_krit", "4", "int", "P_MTPDKrit", "MTPD (h) <= for critical speed-bonus"),
    _row("ict_register_mtpd_str", "24", "int", "P_MTPDStr", "MTPD (h) <= for medium speed-bonus"),
    _row("ict_register_bonus_krit", "5", "int", "P_BonusKrit", "MTPD bonus, critical"),
    _row("ict_register_bonus_str", "3", "int", "P_BonusStr", "MTPD bonus, medium"),
    _row("ict_register_bonus_def", "1", "int", "P_BonusDef", "MTPD bonus, default"),
    _row("ict_register_akt_nizka", "2", "int", "P_AktNizka", "Asset score <= for Nízká"),
    _row("ict_register_akt_stredni", "3", "int", "P_AktStredni", "Asset score <= for Střední"),
    _row("ict_register_akt_vysoka", "4", "int", "P_AktVysoka", "Asset score <= for Vysoká (else Kritická)"),
    _row("ict_register_riz_str", "15", "int", "P_RizStr", "Risk band Střední from (gross/net >=)"),
    _row("ict_register_riz_vys", "40", "int", "P_RizVys", "Risk band Vysoké from"),
    _row("ict_register_riz_krit", "80", "int", "P_RizKrit", "Risk band Kritické from"),
    _row(
        "ict_register_tolerance",
        "39",
        "int",
        "P_Tolerance",
        "Net-risk tolerance ceiling (default; board approval per DORA art. 6(8)(b))",
    ),
    _row(
        "ict_register_vk_proc",
        "4",
        "int",
        "P_VKProc",
        "Materiality: equity-capital impact > (%), documentary only",
    ),
    _row("ict_register_vypadek", "24", "int", "P_Vypadek", "Materiality: outage > (h), documentary only"),
    _row("ict_register_gdpr_min_c", "3", "int", "P_GdprMinC", "GDPR asset: minimum confidentiality (C) >="),
    _row("ict_register_verze", "1.0", "string", "P_Verze", "Methodology version"),
    _row("ict_register_entita", "Slavia pojišťovna a.s.", "string", "P_Entita", "Entity legal name"),
    _row("ict_register_lei", "LEI-DOPLNIT", "string", "P_LEI", "Entity LEI (placeholder until filled)"),
    _row("ict_register_ref_datum", "2026-07-03", "string", "P_RefDatum", "Reference date for EOL/deadline checks"),
    _row("ict_register_roi_datum", "2026-12-31", "string", "P_RoIDatum", "RoI as-of date"),
)

_INSERT_IF_MISSING = sa.text(
    """
    INSERT INTO global_config (key, value, value_type, category, display_name, description, is_editable)
    SELECT :key, :value, :value_type, :category, :display_name, :description, false
    WHERE NOT EXISTS (SELECT 1 FROM global_config WHERE key = :key)
    """
)


def upgrade() -> None:
    """Seed the ICT Register workbook parameter set; idempotent by key."""
    connection = op.get_bind()
    for row in ICT_PARAMETER_CONFIG_ROWS:
        connection.execute(_INSERT_IF_MISSING, row)


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError("Forward-only migration. Restore from snapshot per ADR-010.")
