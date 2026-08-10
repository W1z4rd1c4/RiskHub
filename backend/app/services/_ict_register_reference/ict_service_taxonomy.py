"""S01-S19 ICT service taxonomy (S-codes), verbatim from the workbook.

Source of truth: docs/dora-ict-register/dora-excel-functional-spec.md section 3.2
(``SCODES``, Annex III ITS 2024/2956). Labels are the workbook's Czech labels;
RoI English values come from the CZ->EN RoI maps, never from this table.
S17-S19 are the three codes checked by the vendor-tier cloud trigger.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

# S-code -> workbook label (CZ), in taxonomy order.
ICT_SERVICE_TAXONOMY: Mapping[str, str] = MappingProxyType(
    {
        "S01": "Řízení projektů v oblasti IKT",
        "S02": "Rozvoj IKT",
        "S03": "Asistenční služby a podpora první úrovně",
        "S04": "Služby řízení bezpečnosti v oblasti IKT",
        "S05": "Poskytování údajů",
        "S06": "Analýza údajů",
        "S07": "IKT, zařízení a hostingové služby",
        "S08": "Počítačové zpracování",
        "S09": "Úložiště dat mimo cloud",
        "S10": "Poskytovatel telekomunikačních služeb",
        "S11": "Síťová infrastruktura",
        "S12": "Hardware a fyzická zařízení",
        "S13": "Licencování softwaru",
        "S14": "Řízení provozu IKT",
        "S15": "Poradenství v oblasti IKT",
        "S16": "Řízení rizika v oblasti IKT",
        "S17": "Cloudové služby: IaaS",
        "S18": "Cloudové služby: PaaS",
        "S19": "Cloudové služby: SaaS",
    }
)

# Codes feeding the vendor-tier "cloud" trigger (IaaS/PaaS/SaaS).
CLOUD_SERVICE_S_CODES: tuple[str, ...] = ("S17", "S18", "S19")
