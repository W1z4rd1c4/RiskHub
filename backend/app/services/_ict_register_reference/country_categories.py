"""Country -> country-category static reference, verbatim from the workbook.

Source of truth: docs/dora-ict-register/dora-excel-functional-spec.md section 3.4
(``ZEME_KATEGORIE``), paired 1:1 with the ``ZemeList`` closed list order:
CZ->ČR; SK, DE, AT, NL, PL, IE, FR, LU->EU; GB, US->mimo EU.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

# ISO country code -> workbook country category, in ZemeList order.
COUNTRY_CATEGORIES: Mapping[str, str] = MappingProxyType(
    {
        "CZ": "ČR",
        "SK": "EU",
        "DE": "EU",
        "AT": "EU",
        "NL": "EU",
        "PL": "EU",
        "GB": "mimo EU",
        "US": "mimo EU",
        "IE": "EU",
        "FR": "EU",
        "LU": "EU",
    }
)
