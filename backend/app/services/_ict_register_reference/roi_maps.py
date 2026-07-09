"""CZ->EN RoI closed-list conversion maps, verbatim from the workbook.

Source of truth: docs/dora-ict-register/dora-excel-functional-spec.md section 3.3
(``ROI_MAPS``, ITS 2024/2956 closed lists). The live workbook conversion is
``IFERROR(INDEX(<Map>EN, MATCH(src, <Map>CZ, 0)), src)`` — a source value
without an EN mapping falls back to the raw CZ value, never a blank. That rule
is reproduced by :func:`roi_en_value`.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

from app.core.exceptions import NotFoundError

# Map name -> (CZ source value -> EN RoI value), verbatim and in workbook order.
ROI_CZ_EN_MAPS: Mapping[str, Mapping[str, str]] = MappingProxyType(
    {
        "MapSubst": MappingProxyType(
            {
                "Nenahraditelný": "Not substitutable",
                "Velmi obtížně nahraditelný": "Highly complex substitutability",
                "Středně obtížně nahraditelný": "Medium complexity of substitutability",
                "Snadno nahraditelný": "Easily substitutable",
            }
        ),
        "MapDuvod": MappingProxyType(
            {
                "Omezená nabídka na trhu": "Limited market alternatives",
                "Obtížná migrace": "Migration difficulties",
                "Obojí": "Both",
            }
        ),
        "MapReint": MappingProxyType(
            {
                "Snadná": "Easy",
                "Obtížná": "Difficult",
                "Velmi složitá": "Highly complex",
            }
        ),
        "MapDopad": MappingProxyType(
            {
                "Nízký": "Low",
                "Střední": "Medium",
                "Vysoký": "High",
                "Neposouzeno": "Assessment not performed",
            }
        ),
        "MapCitl": MappingProxyType(
            {
                "Nízká": "Low",
                "Střední": "Medium",
                "Vysoká": "High",
            }
        ),
        "MapRel": MappingProxyType(
            {
                "Nevýznamná": "Not significant",
                "Nízká závislost": "Low reliance",
                "Zásadní závislost": "Material reliance",
                "Úplná závislost": "Full reliance",
            }
        ),
        "MapAlt": MappingProxyType(
            {
                "Ano": "Yes",
                "Ne": "No",
                "Neposouzeno": "Assessment not performed",
            }
        ),
        "MapOsoba": MappingProxyType(
            {
                "Právnická osoba": "Legal person",
                "Fyzická osoba podnikající": "Individual acting in a business capacity",
            }
        ),
        "MapUjedn": MappingProxyType(
            {
                "Samostatné": "standalone arrangement",
                "Rámcové (master)": "overarching (master) arrangement",
                "Navazující": "subsequent or associated arrangement",
            }
        ),
        "MapLic": MappingProxyType(
            {
                "Neživotní pojištění": "non-life insurance activities",
                "Podpůrné funkce": "support functions",
            }
        ),
    }
)


def roi_map_entries(name: str) -> Mapping[str, str]:
    """Return one CZ->EN RoI map verbatim.

    Raises ``NotFoundError`` for a name outside the workbook's 10 maps.
    """
    try:
        return ROI_CZ_EN_MAPS[name]
    except KeyError:
        raise NotFoundError(f"Unknown ICT Register RoI map '{name}'") from None


def roi_en_value(map_name: str, source_value: str) -> str:
    """Translate a CZ closed-list value to its EN RoI value.

    Reproduces the workbook rule ``IFERROR(INDEX/MATCH, src)``: a source value
    without an EN mapping is returned unchanged (never blanked). Unknown map
    names raise ``NotFoundError``.
    """
    return roi_map_entries(map_name).get(source_value, source_value)
