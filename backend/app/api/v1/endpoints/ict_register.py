"""ICT Register reference-data endpoints (read-only).

Serves the workbook's closed lists, ICT service taxonomy, country categories,
CZ->EN RoI maps, and the versioned workbook parameter set to later ICT
Register slices and the frontend. The surface is read-only; reference data is
maintained in the reference registry, never through the API.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_permission
from app.db.session import get_db
from app.models import User
from app.schemas.ict_register import (
    IctClosedListCollectionRead,
    IctClosedListRead,
    IctCountryCategoryCollectionRead,
    IctCountryCategoryRead,
    IctRoiMapCollectionRead,
    IctRoiMapRead,
    IctRoiTranslationRead,
    IctServiceTaxonomyRead,
    IctServiceTypeRead,
    IctWorkbookParameterRead,
    IctWorkbookParameterSetRead,
)
from app.services._ict_register_reference.closed_lists import CLOSED_LISTS, closed_list_values
from app.services._ict_register_reference.country_categories import COUNTRY_CATEGORIES
from app.services._ict_register_reference.ict_service_taxonomy import (
    CLOUD_SERVICE_S_CODES,
    ICT_SERVICE_TAXONOMY,
)
from app.services._ict_register_reference.parameters import (
    ICT_WORKBOOK_PARAMETERS,
    IctParameterValue,
    load_ict_workbook_parameter_set,
)
from app.services._ict_register_reference.roi_maps import ROI_CZ_EN_MAPS, roi_map_entries

router = APIRouter()


@router.get("/reference/closed-lists", response_model=IctClosedListCollectionRead)
async def list_closed_lists(
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctClosedListCollectionRead:
    """Return all 45 workbook closed lists, verbatim and in workbook order."""
    return IctClosedListCollectionRead(
        lists=[IctClosedListRead(name=name, values=list(values)) for name, values in CLOSED_LISTS.items()]
    )


@router.get("/reference/closed-lists/{list_name}", response_model=IctClosedListRead)
async def get_closed_list(
    list_name: str,
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctClosedListRead:
    """Return one workbook closed list; unknown names are rejected with 404."""
    return IctClosedListRead(name=list_name, values=list(closed_list_values(list_name)))


@router.get("/reference/ict-service-taxonomy", response_model=IctServiceTaxonomyRead)
async def get_ict_service_taxonomy(
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctServiceTaxonomyRead:
    """Return the S01-S19 ICT service taxonomy with the S17-S19 cloud trigger codes."""
    return IctServiceTaxonomyRead(
        services=[IctServiceTypeRead(code=code, label=label) for code, label in ICT_SERVICE_TAXONOMY.items()],
        cloud_service_codes=list(CLOUD_SERVICE_S_CODES),
    )


@router.get("/reference/country-categories", response_model=IctCountryCategoryCollectionRead)
async def list_country_categories(
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctCountryCategoryCollectionRead:
    """Return the workbook country categories paired 1:1 with ZemeList order."""
    return IctCountryCategoryCollectionRead(
        countries=[
            IctCountryCategoryRead(country=country, category=category)
            for country, category in COUNTRY_CATEGORIES.items()
        ]
    )


@router.get("/reference/roi-maps", response_model=IctRoiMapCollectionRead)
async def list_roi_maps(
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctRoiMapCollectionRead:
    """Return all 10 CZ->EN RoI closed-list conversion maps, verbatim."""
    return IctRoiMapCollectionRead(
        maps=[IctRoiMapRead(name=name, entries=dict(entries)) for name, entries in ROI_CZ_EN_MAPS.items()]
    )


@router.get("/reference/roi-maps/{map_name}", response_model=IctRoiMapRead)
async def get_roi_map(
    map_name: str,
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctRoiMapRead:
    """Return one CZ->EN RoI map; unknown names are rejected with 404."""
    return IctRoiMapRead(name=map_name, entries=dict(roi_map_entries(map_name)))


@router.get("/reference/roi-maps/{map_name}/translation", response_model=IctRoiTranslationRead)
async def get_roi_translation(
    map_name: str,
    value: str = Query(..., description="CZ closed-list value to translate"),
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctRoiTranslationRead:
    """Translate one CZ value to its EN RoI value.

    Reproduces the workbook rule verbatim: values without an EN mapping fall
    back to the source value (never blank).
    """
    entries = roi_map_entries(map_name)
    return IctRoiTranslationRead(
        map=map_name,
        source=value,
        value=entries.get(value, value),
        mapped=value in entries,
    )


def _serialize_parameter_value(value: IctParameterValue) -> int | str:
    return value.isoformat() if isinstance(value, date) else value


@router.get("/parameters", response_model=IctWorkbookParameterSetRead)
async def get_workbook_parameter_set(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("vendors", "read")),
) -> IctWorkbookParameterSetRead:
    """Return the versioned workbook parameter set (23 parameters, read-only).

    Effective values follow the ADR-008 SSOT: seeded global_config rows are
    authoritative when present, verbatim workbook defaults otherwise.
    """
    parameter_set = await load_ict_workbook_parameter_set(db)
    return IctWorkbookParameterSetRead(
        version=parameter_set.version,
        parameters=[
            IctWorkbookParameterRead(
                name=parameter.name,
                value=_serialize_parameter_value(parameter_set.value(parameter.name)),
                value_type=parameter.value_type,
                meaning=parameter.meaning,
            )
            for parameter in ICT_WORKBOOK_PARAMETERS
        ],
    )
