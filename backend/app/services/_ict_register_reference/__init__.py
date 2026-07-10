"""ICT Register reference data — closed lists, workbook parameters, CZ->EN RoI maps.

Read-shape context (ADR-007): projects the workbook's reference data and the
seeded parameter rows; owns no commits. The functional reproduction spec at
docs/dora-ict-register/dora-excel-functional-spec.md is the source of truth.
"""

from app.services._ict_register_reference.closed_lists import (
    CLOSED_LISTS,
    ClosedListValue,
    closed_list_values,
    is_closed_list_value,
)
from app.services._ict_register_reference.country_categories import COUNTRY_CATEGORIES
from app.services._ict_register_reference.ict_service_taxonomy import (
    CLOUD_SERVICE_S_CODES,
    ICT_SERVICE_TAXONOMY,
)
from app.services._ict_register_reference.parameters import (
    ICT_APP_SCALE_RISK_BAND_DEFAULTS,
    ICT_PARAMETER_CONFIG_CATEGORY,
    ICT_WORKBOOK_PARAMETERS,
    ICT_WORKBOOK_PARAMETERS_BY_NAME,
    IctParameterValue,
    IctWorkbookParameter,
    IctWorkbookParameterSet,
    load_ict_workbook_parameter_set,
)
from app.services._ict_register_reference.roi_maps import (
    ROI_CZ_EN_MAPS,
    roi_en_value,
    roi_map_entries,
)

__all__ = [
    "CLOSED_LISTS",
    "CLOUD_SERVICE_S_CODES",
    "COUNTRY_CATEGORIES",
    "ICT_APP_SCALE_RISK_BAND_DEFAULTS",
    "ICT_PARAMETER_CONFIG_CATEGORY",
    "ICT_SERVICE_TAXONOMY",
    "ICT_WORKBOOK_PARAMETERS",
    "ICT_WORKBOOK_PARAMETERS_BY_NAME",
    "ROI_CZ_EN_MAPS",
    "ClosedListValue",
    "IctParameterValue",
    "IctWorkbookParameter",
    "IctWorkbookParameterSet",
    "closed_list_values",
    "is_closed_list_value",
    "load_ict_workbook_parameter_set",
    "roi_en_value",
    "roi_map_entries",
]
