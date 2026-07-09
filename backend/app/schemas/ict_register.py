"""Schemas for the ICT Register reference-data surface (read-only)."""

from __future__ import annotations

from pydantic import BaseModel

ClosedListValue = str | int


class IctClosedListRead(BaseModel):
    """One workbook closed list, verbatim (spec section 3.1)."""

    name: str
    values: list[ClosedListValue]


class IctClosedListCollectionRead(BaseModel):
    lists: list[IctClosedListRead]


class IctServiceTypeRead(BaseModel):
    """One S-code of the DORA ICT service taxonomy with its workbook label."""

    code: str
    label: str


class IctServiceTaxonomyRead(BaseModel):
    services: list[IctServiceTypeRead]
    cloud_service_codes: list[str]


class IctCountryCategoryRead(BaseModel):
    """One ZemeList country with its workbook country category."""

    country: str
    category: str


class IctCountryCategoryCollectionRead(BaseModel):
    countries: list[IctCountryCategoryRead]


class IctRoiMapRead(BaseModel):
    """One CZ->EN RoI closed-list conversion map, verbatim."""

    name: str
    entries: dict[str, str]


class IctRoiMapCollectionRead(BaseModel):
    maps: list[IctRoiMapRead]


class IctRoiTranslationRead(BaseModel):
    """Result of one CZ->EN RoI lookup, including the workbook fallback rule."""

    map: str
    source: str
    value: str
    mapped: bool


class IctWorkbookParameterRead(BaseModel):
    """One workbook parameter with its effective value (dates as ISO strings)."""

    name: str
    value: int | str
    value_type: str
    meaning: str


class IctWorkbookParameterSetRead(BaseModel):
    """The versioned workbook parameter set (version = P_Verze)."""

    version: str
    parameters: list[IctWorkbookParameterRead]
