"""ICT Register closed lists — the workbook's 45 named lists, verbatim.

Source of truth: docs/dora-ict-register/dora-excel-functional-spec.md section 3.1
(``ENUMS``, seed.py:91-158 of the workbook builder). Values are reproduced
verbatim, in workbook order, and must never be edited independently of that
spec. Later ICT Register slices import these lists to enforce closed-list
fields at the API boundary.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

from app.core.exceptions import NotFoundError

ClosedListValue = str | int

CANONICAL_PROVIDER_IDENTIFIER_TYPES: tuple[str, ...] = (
    "LEI",
    "EUID",
    "CRN",
    "VAT",
    "PNR",
    "NIN",
)
DEPRECATED_PROVIDER_IDENTIFIER_TYPES: tuple[str, ...] = ("IČO (CRN)", "Jiný")

# 45 named closed lists, verbatim from the workbook (spec section 3.1).
CLOSED_LISTS: Mapping[str, tuple[ClosedListValue, ...]] = MappingProxyType(
    {
        "AnoNe": ("Ano", "Ne"),
        "AnoNeNeurceno": ("Ano", "Ne", "Neurčeno"),
        "AnoNeNerel": ("Ano", "Ne", "Nerelevantní"),
        "Skala15": (1, 2, 3, 4, 5),
        "TridyKrit": ("Nízká", "Střední", "Vysoká", "Kritická"),
        "PasmaRizika": ("Nízké", "Střední", "Vysoké", "Kritické"),
        "TypAktiva": (
            "Aplikace",
            "Databáze",
            "Infrastruktura",
            "Síťový prvek",
            "Hardware",
            "Cloud služba",
            "Datové úložiště",
            "Informační aktivum",
            "Bezpečnostní aktivum",
            "BCM/DR aktivum",
            "Jiné",
        ),
        "StavAktiva": ("V provozu", "Ve vývoji", "Utlumováno", "Legacy", "Vyřazeno"),
        "VyznamVazby": (
            "Kritická podpora procesu",
            "Významná podpora procesu",
            "Podpůrná vazba",
            "Nepřímá / sdílená vazba",
            "BCM/DR vazba",
            "Neposouzeno",
        ),
        "RoleDodavatele": (
            "Dodává",
            "Provozuje",
            "Hostuje",
            "Spravuje",
            "Podporuje",
            "Zpracovává data",
            "Zálohuje / obnova",
            "Bezpečnostní služba",
            "Jiné",
        ),
        "TypOsoby": ("Právnická osoba", "Fyzická osoba podnikající"),
        "TypKodu": CANONICAL_PROVIDER_IDENTIFIER_TYPES,
        "TypUjednani": ("Samostatné", "Rámcové (master)", "Navazující"),
        "Substituce": (
            "Nenahraditelný",
            "Velmi obtížně nahraditelný",
            "Středně obtížně nahraditelný",
            "Snadno nahraditelný",
        ),
        "DuvodSubst": ("Omezená nabídka na trhu", "Obtížná migrace", "Obojí"),
        "Reintegrace": ("Snadná", "Obtížná", "Velmi složitá"),
        "DopadSluzby": ("Nízký", "Střední", "Vysoký", "Neposouzeno"),
        "CitlivostDat": ("Nízká", "Střední", "Vysoká"),
        "Reliance": ("Nevýznamná", "Nízká závislost", "Zásadní závislost", "Úplná závislost"),
        "AltPosk": ("Ano", "Ne", "Neposouzeno"),
        "DopadPreruseni": ("Nízký", "Střední", "Vysoký", "Neposouzeno"),
        "Odezvy": ("Akceptace", "Zmírnění kontrolami", "Zmírnění přenosem", "Vyvarování se"),
        "Triggery": ("Periodické", "Velká změna", "Po incidentu", "Legacy"),
        "Faze": ("Ex ante", "Průběžná", "Nerelevantní"),
        "KategorieHrozeb": (
            "Dostupnost",
            "Integrita",
            "Důvěrnost",
            "Hodnověrnost",
            "Fyzická",
            "Personální",
            "Třetí strany",
        ),
        "SubjektTyp": ("Proces", "Aktivum", "Dodavatel"),
        "StavRizika": ("Otevřené", "V řešení", "Uzavřené", "Akceptováno"),
        "VysledekDR": ("Úspěšný", "S výhradami", "Neúspěšný", "Netestováno"),
        "VysledekUcin": ("Účinné", "Částečně účinné", "Neúčinné"),
        "ExAnteHodn": ("OK", "Riziko", "Nerelevantní"),
        "MenaList": ("CZK", "EUR", "USD", "GBP"),
        "ZemeList": ("CZ", "SK", "DE", "AT", "NL", "PL", "GB", "US", "IE", "FR", "LU"),
        "LicCinnost": ("Neživotní pojištění", "Podpůrné funkce"),
        "VerzeMet": ("1.0",),
        "TierDod": ("Kritický dodavatel", "Významný dodavatel", "Standardní dodavatel"),
        "StavRevize": ("K revizi", "Zkontrolováno"),
        "UrovenAktiva": ("A – primární", "B – podpůrné", "C – infrastrukturní"),
        "TypZavislostiAktiv": (
            "Běhová (runtime)",
            "Datová",
            "Síťová / infrastrukturní",
            "Bezpečnostní",
            "Zálohovací / recovery",
            "Provozní",
            "Jiná",
        ),
        "SystemEvidence": ("TAS", "SAP", "Jiné"),
        "VlastnickyUtvar": (
            "Obchodní úsek",
            "UW",
            "LPU",
            "Provoz",
            "Finance",
            "Právní a compliance",
            "Risk management",
            "IT",
            "HR",
            "Marketing",
            "Interní audit",
            "Produkt",
        ),
        "BcmVazba": ("Ano", "Ne", "Neposouzeno", "Nerelevantní"),
        "KlasifikaceDat": (
            "Bez dat / nerelevantní",
            "Veřejná data",
            "Interní data",
            "Důvěrná data",
            "Vysoce důvěrná / regulovaná data",
            "Neposouzeno",
        ),
        "ModelNasazeni": (
            "On-premise",
            "Cloud",
            "SaaS",
            "PaaS",
            "IaaS",
            "Hybrid",
            "Externě hostováno",
            "Neposouzeno",
            "Nerelevantní",
        ),
        "ExitPlanStav": (
            "Není vyžadován",
            "Vyžadován – chybí",
            "Návrh",
            "Schválen",
            "Testován",
            "K revizi",
            "Neposouzen",
        ),
        "DueDiligenceStav": (
            "Nerelevantní",
            "Nezahájeno",
            "Probíhá",
            "Dokončeno bez výhrad",
            "Dokončeno s výhradami",
            "K revizi",
            "Neposouzeno",
        ),
    }
)


def closed_list_values(name: str) -> tuple[ClosedListValue, ...]:
    """Return the verbatim values of one workbook closed list.

    Raises ``NotFoundError`` for a name outside the workbook's 45 lists.
    """
    try:
        return CLOSED_LISTS[name]
    except KeyError:
        raise NotFoundError(f"Unknown ICT Register closed list '{name}'") from None


def is_closed_list_value(name: str, value: ClosedListValue) -> bool:
    """Membership check for closed-list enforcement at the API boundary.

    Values are compared verbatim (case-sensitive, exact workbook strings).
    Raises ``NotFoundError`` for an unknown list name.
    """
    return value in closed_list_values(name)


def is_provider_identifier_type_write_value(value: str) -> bool:
    """Accept the public taxonomy plus transitional aliases on write.

    The aliases remain readable and writable for existing integrations, but
    are deliberately absent from the advertised ``TypKodu`` reference list.
    """
    return value in CANONICAL_PROVIDER_IDENTIFIER_TYPES + DEPRECATED_PROVIDER_IDENTIFIER_TYPES
